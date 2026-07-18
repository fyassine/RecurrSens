"""
Unit tests for Celery tasks (patients.tasks).

External HTTP (the inference service) and time are mocked; tasks are invoked
synchronously via ``.run()`` so no broker is required.
"""

import base64
import os
from unittest import mock

import requests
from celery.exceptions import MaxRetriesExceededError
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone

from patients.models import AudioFile, Patient
from patients.tasks import (
    backup_database_snapshot,
    check_data_expiry,
    run_inference_task,
)


class RunInferenceTaskTest(TestCase):
    def setUp(self):
        self.patient = Patient.objects.create(patient_id='INF-001')

    def _make_response(self, payload):
        resp = mock.Mock()
        resp.raise_for_status = mock.Mock()
        resp.json = mock.Mock(return_value=payload)
        return resp

    def test_no_audio_files_skips_inference(self):
        """With no audio for the phase, the task returns without calling out."""
        with mock.patch('patients.tasks.requests.post') as post:
            run_inference_task.run(str(self.patient.id), 'PRE_OP')
        post.assert_not_called()
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.prediction_pre, Patient.PredictionStatus.TODO)

    def test_success_stores_predictions(self):
        AudioFile.objects.create(
            patient=self.patient,
            exercise_id='a_n',
            phase='PRE_OP',
            storage_key=f'{self.patient.id}/pre/a_n.webm',
        )
        predict = self._make_response(
            {
                'film_classifier': {'prediction': 'INFECTED', 'percentage': 87.5},
                'gradcam_pro': {'prediction': 'INFECTED', 'percentage': 80.0},
            }
        )
        reasoning = self._make_response({'text': 'Begründung.'})

        with mock.patch('patients.tasks.requests.post', side_effect=[predict, reasoning]):
            run_inference_task.run(str(self.patient.id), 'PRE_OP')

        self.patient.refresh_from_db()
        self.assertEqual(self.patient.prediction_pre, 'INFECTED')
        self.assertEqual(self.patient.ai_percentage_rp_pre, 87.5)
        self.assertEqual(self.patient.ai_reasoning_pre, 'Begründung.')

    def test_max_retries_marks_prediction_failed(self):
        """When the prediction call exhausts retries, the field is set to FAILED."""
        AudioFile.objects.create(
            patient=self.patient,
            exercise_id='a_n',
            phase='PRE_OP',
            storage_key=f'{self.patient.id}/pre/a_n.webm',
        )
        with (
            mock.patch(
                'patients.tasks.requests.post',
                side_effect=requests.RequestException('boom'),
            ),
            mock.patch.object(
                run_inference_task,
                'retry',
                side_effect=MaxRetriesExceededError(),
            ),
        ):
            run_inference_task.run(str(self.patient.id), 'PRE_OP')

        self.patient.refresh_from_db()
        self.assertEqual(self.patient.prediction_pre, Patient.PredictionStatus.FAILED)


class CheckDataExpiryTest(TestCase):
    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        ADMIN_NOTIFICATION_EMAIL='admin@example.com',
    )
    def test_expiring_patient_emails_admin_and_marks_notified(self):
        patient = Patient.objects.create(
            patient_id='EXP-001',
            expires_at=timezone.now() + timezone.timedelta(hours=12),
        )
        check_data_expiry()

        patient.refresh_from_db()
        self.assertIsNotNone(patient.notification_sent_at)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('EXP-001', mail.outbox[0].subject)

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_email_failure_still_marks_notified(self):
        """A send failure must not crash the task nor block the notified flag."""
        patient = Patient.objects.create(
            patient_id='EXP-002',
            expires_at=timezone.now() + timezone.timedelta(hours=12),
        )
        with mock.patch('django.core.mail.send_mail', side_effect=Exception('smtp down')):
            check_data_expiry()

        patient.refresh_from_db()
        self.assertIsNotNone(patient.notification_sent_at)


class BackupDatabaseSnapshotTest(TestCase):
    """Tests for patients.tasks.backup_database_snapshot."""

    def test_disabled_is_noop(self):
        """DB_BACKUP_ENABLED=False (the default) skips the task entirely."""
        with (
            mock.patch('patients.tasks.subprocess.run') as mock_run,
            mock.patch('patients.tasks.boto3.client') as mock_boto,
        ):
            backup_database_snapshot.run()

        mock_run.assert_not_called()
        mock_boto.assert_not_called()
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(
        DB_BACKUP_ENABLED=True,
        DB_BACKUP_ENV_LABEL='test',
        DB_BACKUP_RETENTION=2,
        DB_BACKUP_S3_PREFIX='backups',
        DB_BACKUP_GPG_RECIPIENT='backup@example.com',
        DB_BACKUP_GPG_PUBLIC_KEY=base64.b64encode(b'fake-public-key').decode(),
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        ADMIN_NOTIFICATION_EMAIL='admin@example.com',
    )
    def test_success_uploads_prunes_and_emails(self):
        """A successful run uploads the encrypted dump, prunes backups beyond
        the retention limit, and emails the admin a success summary."""
        existing_keys = [
            'backups/test/db_2024-01-01_00-00-00.dump.gpg',
            'backups/test/db_2024-01-02_00-00-00.dump.gpg',
            'backups/test/db_2024-01-03_00-00-00.dump.gpg',
        ]
        client = mock.MagicMock()
        paginator = mock.MagicMock()
        paginator.paginate.return_value = [
            {'Contents': [{'Key': key} for key in existing_keys]},
        ]
        client.get_paginator.return_value = paginator

        def fake_gpg_encrypt(dump_path, enc_path, work_dir):
            with open(enc_path, 'wb') as f:
                f.write(b'encrypted-dump')

        with (
            mock.patch('patients.tasks._run_pg_dump') as mock_pg_dump,
            mock.patch('patients.tasks._gpg_encrypt', side_effect=fake_gpg_encrypt) as mock_gpg,
            mock.patch('patients.tasks._s3_client', return_value=client),
        ):
            backup_database_snapshot.run()

        mock_pg_dump.assert_called_once()
        mock_gpg.assert_called_once()

        client.upload_file.assert_called_once()
        enc_path, bucket, s3_key = client.upload_file.call_args[0]
        self.assertTrue(enc_path.endswith('.dump.gpg'))
        self.assertEqual(s3_key, f'backups/test/{os.path.basename(enc_path)}')

        # 3 existing backups, retention=2 -> oldest one pruned.
        client.delete_object.assert_called_once_with(
            Bucket=bucket,
            Key=existing_keys[0],
        )

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Succeeded', mail.outbox[0].subject)

    @override_settings(
        DB_BACKUP_ENABLED=True,
        DB_BACKUP_ENV_LABEL='test',
        DB_BACKUP_GPG_RECIPIENT='backup@example.com',
        DB_BACKUP_GPG_PUBLIC_KEY=base64.b64encode(b'fake-public-key').decode(),
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        ADMIN_NOTIFICATION_EMAIL='admin@example.com',
    )
    def test_pg_dump_failure_emails_after_max_retries(self):
        """When pg_dump fails and retries are exhausted, an admin failure
        email is sent."""
        with (
            mock.patch(
                'patients.tasks._run_pg_dump',
                side_effect=RuntimeError('pg_dump exploded'),
            ),
            mock.patch.object(
                backup_database_snapshot,
                'retry',
                side_effect=MaxRetriesExceededError(),
            ),
        ):
            backup_database_snapshot.run()

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('FAILED', mail.outbox[0].subject)
        self.assertIn('pg_dump exploded', mail.outbox[0].body)
