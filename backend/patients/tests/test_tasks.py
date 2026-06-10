"""
Unit tests for Celery tasks (patients.tasks).

External HTTP (the inference service) and time are mocked; tasks are invoked
synchronously via ``.run()`` so no broker is required.
"""
from unittest import mock

import requests
from celery.exceptions import MaxRetriesExceededError
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone

from patients.models import Patient, AudioFile
from patients.tasks import run_inference_task, check_data_expiry


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
            patient=self.patient, exercise_id='a_n', phase='PRE_OP',
            storage_key=f'{self.patient.id}/pre/a_n.webm',
        )
        predict = self._make_response({
            'film_classifier': {'prediction': 'INFECTED', 'percentage': 87.5},
            'gradcam_pro': {'prediction': 'INFECTED', 'percentage': 80.0},
        })
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
            patient=self.patient, exercise_id='a_n', phase='PRE_OP',
            storage_key=f'{self.patient.id}/pre/a_n.webm',
        )
        with mock.patch(
            'patients.tasks.requests.post',
            side_effect=requests.RequestException('boom'),
        ), mock.patch.object(
            run_inference_task, 'retry', side_effect=MaxRetriesExceededError(),
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
