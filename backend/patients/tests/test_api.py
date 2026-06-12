"""
API integration tests for the patients app.
Tests cover all major endpoints, authentication, and business logic flows.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from patients.models import (
    AudioFile,
    Exercise,
    ExerciseSkip,
    Patient,
    PatientFeedback,
    RecordingSession,
)


class BaseAPITest(TestCase):
    """Base test class with common setup."""

    def setUp(self):
        self.client = APIClient()
        # Create admin user
        self.admin_user = User.objects.create_superuser(
            username='testadmin',
            password='testpass123',
            email='admin@test.com',
        )
        # Get JWT token
        response = self.client.post('/api/auth/token/', {
            'username': 'testadmin',
            'password': 'testpass123',
        })
        self.token = response.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')

        # Create test exercises
        Exercise.objects.create(
            exercise_id='a_n', title='Vokal A',
            description='Test', order=1,
        )
        Exercise.objects.create(
            exercise_id='i_n', title='Vokal I',
            description='Test', order=2,
        )

    def create_test_patient(self, patient_id='TEST-001', **kwargs):
        """Helper to create a test patient."""
        return Patient.objects.create(patient_id=patient_id, **kwargs)


class JWTAuthTest(BaseAPITest):
    """Tests for JWT authentication."""

    def test_obtain_token(self):
        client = APIClient()
        response = client.post('/api/auth/token/', {
            'username': 'testadmin',
            'password': 'testpass123',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_invalid_token(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION='Bearer invalid-token')
        response = client.get('/api/patients/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_admin_endpoint(self):
        client = APIClient()
        response = client.get('/api/patients/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class PatientCRUDTest(BaseAPITest):
    """Tests for patient CRUD operations (admin endpoints)."""

    def test_create_patient(self):
        response = self.client.post('/api/patients/', {
            'patient_id': 'NEW-001',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['patient_id'], 'NEW-001')

    def test_create_duplicate_patient(self):
        self.create_test_patient('DUP-001')
        response = self.client.post('/api/patients/', {
            'patient_id': 'DUP-001',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_patient_empty_id(self):
        response = self.client.post('/api/patients/', {
            'patient_id': '',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_patient_auto_numbered(self):
        self.create_test_patient('0019')
        response = self.client.post('/api/patients/', {
            'patient_id': '',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['patient_id'], '0020')

    def test_create_patient_auto_numbered_skips_occupied(self):
        self.create_test_patient('0019')
        self.create_test_patient('0020')
        response = self.client.post('/api/patients/', {
            'patient_id': '',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['patient_id'], '0021')

    def test_create_patient_auto_numbered_width_rollover(self):
        self.create_test_patient('0099')
        response = self.client.post('/api/patients/', {
            'patient_id': '',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['patient_id'], '0100')

    def test_create_patient_auto_numbered_blocked_by_non_numeric(self):
        self.create_test_patient('ProbeLara2')
        response = self.client.post('/api/patients/', {
            'patient_id': '',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_patients(self):
        self.create_test_patient('LIST-001')
        self.create_test_patient('LIST-002')
        response = self.client.get('/api/patients/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_get_patient_detail(self):
        patient = self.create_test_patient('DET-001')
        response = self.client.get(f'/api/patients/{patient.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['patient_id'], 'DET-001')
        self.assertIn('audio_files', response.data)
        self.assertIn('sessions', response.data)
        self.assertIn('deleted_at', response.data)
        self.assertIsNone(response.data['deleted_at'])

    def test_update_patient(self):
        patient = self.create_test_patient('UPD-001')
        response = self.client.patch(f'/api/patients/{patient.id}/', {
            'patient_id': 'UPD-001-renamed',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        patient.refresh_from_db()
        self.assertEqual(patient.patient_id, 'UPD-001-renamed')

    def test_delete_patient(self):
        """Delete via API performs soft delete — patient still exists but is marked deleted."""
        patient = self.create_test_patient('DEL-001')
        response = self.client.delete(f'/api/patients/{patient.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        patient.refresh_from_db()
        self.assertTrue(patient.is_deleted)


class PatientWorkflowTest(BaseAPITest):
    """Tests for the patient workflow state machine."""

    def test_advance_from_new(self):
        patient = self.create_test_patient('WF-001')
        response = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'CONSENT_GIVEN')
        # Should auto-create a PRE_OP session
        self.assertEqual(
            RecordingSession.objects.filter(
                patient=patient, phase='PRE_OP'
            ).count(), 1
        )

    def test_advance_full_workflow(self):
        """Test advancing through all workflow steps."""
        patient = self.create_test_patient('WF-002')
        # NEW → CONSENT_GIVEN
        r = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(r.data['status'], 'CONSENT_GIVEN')

        # CONSENT_GIVEN → PRE_OP_DONE
        r = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(r.data['status'], 'PRE_OP_DONE')

        # PRE_OP_DONE → POST_OP_STARTED
        r = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(r.data['status'], 'POST_OP_STARTED')

        # POST_OP_STARTED → POST_OP_DONE
        r = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(r.data['status'], 'POST_OP_DONE')

    def test_advance_beyond_post_op_done(self):
        """Cannot advance beyond POST_OP_DONE."""
        patient = self.create_test_patient('WF-003')
        patient.status = Patient.Status.POST_OP_DONE
        patient.save()

        response = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_advance_legacy_completed_status(self):
        """Legacy COMPLETED status is treated as non-advancable."""
        patient = self.create_test_patient('WF-004')
        patient.status = 'COMPLETED'
        patient.save()

        response = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class CompletenessTest(BaseAPITest):
    """Tests for the completeness check endpoint."""

    def test_new_patient_incomplete(self):
        patient = self.create_test_patient('CMP-001')
        response = self.client.get(f'/api/patients/{patient.id}/completeness/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['complete'])
        # Missing entries include exercise IDs, e.g. 'preOpAudio:a_n,i_n'
        self.assertTrue(
            any(m.startswith('preOpAudio') for m in response.data['missing'])
        )

    def test_complete_patient(self):
        patient = self.create_test_patient('CMP-002')
        # Create audio files for all active exercises, both phases
        for exercise in Exercise.objects.filter(is_active=True):
            AudioFile.objects.create(
                patient=patient, exercise_id=exercise.exercise_id,
                phase='PRE_OP', storage_key=f'{patient.id}/pre/{exercise.exercise_id}.webm',
            )
            AudioFile.objects.create(
                patient=patient, exercise_id=exercise.exercise_id,
                phase='POST_OP', storage_key=f'{patient.id}/post/{exercise.exercise_id}.webm',
            )

        response = self.client.get(f'/api/patients/{patient.id}/completeness/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['complete'])
        self.assertEqual(len(response.data['missing']), 0)

    def test_complete_patient_with_skips(self):
        patient = self.create_test_patient('CMP-003')

        # Create audio files for only one exercise per phase
        AudioFile.objects.create(
            patient=patient, exercise_id='a_n',
            phase='PRE_OP', storage_key=f'{patient.id}/pre/a_n.webm',
        )
        AudioFile.objects.create(
            patient=patient, exercise_id='a_n',
            phase='POST_OP', storage_key=f'{patient.id}/post/a_n.webm',
        )

        # Skip the remaining exercise
        ExerciseSkip.objects.create(patient=patient, phase='PRE_OP', exercise_id='i_n')
        ExerciseSkip.objects.create(patient=patient, phase='POST_OP', exercise_id='i_n')

        response = self.client.get(f'/api/patients/{patient.id}/completeness/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['complete'])
        self.assertEqual(len(response.data['missing']), 0)


class PatientPublicTest(BaseAPITest):
    """Tests for patient-facing (UUID token) endpoints."""

    def test_get_public_patient(self):
        patient = self.create_test_patient('PUB-001')
        client = APIClient()  # No JWT
        response = client.get(f'/api/p/{patient.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['patient_id'], 'PUB-001')
        # Should NOT include sensitive fields
        self.assertNotIn('ai_reasoning_pre', response.data)
        self.assertNotIn('prediction_pre', response.data)

    def test_invalid_token_rejected(self):
        client = APIClient()
        response = client.get('/api/p/00000000-0000-0000-0000-000000000000/')
        # DRF returns 403 when IsPatientTokenValid denies access
        self.assertIn(response.status_code, [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ])

    def test_advance_via_token(self):
        patient = self.create_test_patient('PUB-003')
        client = APIClient()
        response = client.post(f'/api/p/{patient.id}/advance/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'CONSENT_GIVEN')

    def test_submit_feedback(self):
        patient = self.create_test_patient('PUB-004')
        client = APIClient()
        response = client.post(f'/api/p/{patient.id}/feedback/', {
            'phase': 'PRE_OP',
            'rating': 4,
            'comment': 'Alles klar',
        })
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertEqual(PatientFeedback.objects.filter(patient=patient, phase='PRE_OP').count(), 1)

        # GET should indicate feedback exists
        response = client.get(f'/api/p/{patient.id}/feedback/?phase=PRE_OP')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['exists'])

    def test_submit_feedback_skip(self):
        patient = self.create_test_patient('PUB-005')
        client = APIClient()
        response = client.post(f'/api/p/{patient.id}/feedback/', {
            'phase': 'POST_OP',
            'skipped': True,
        })
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        feedback = PatientFeedback.objects.get(patient=patient, phase='POST_OP')
        self.assertTrue(feedback.skipped)

    def test_skip_exercise(self):
        patient = self.create_test_patient('PUB-006')
        client = APIClient()
        response = client.post(f'/api/p/{patient.id}/skips/', {
            'phase': 'PRE_OP',
            'exercise_id': 'a_n',
        })
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertEqual(
            ExerciseSkip.objects.filter(patient=patient, phase='PRE_OP', exercise_id='a_n').count(),
            1,
        )


class ExerciseListTest(BaseAPITest):
    """Tests for the exercise list endpoint."""

    def test_list_exercises(self):
        client = APIClient()  # Public, no auth
        response = client.get('/api/exercises/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)  # a_n and i_n

    def test_only_active_exercises(self):
        Exercise.objects.create(
            exercise_id='inactive', title='Inactive',
            description='Test', order=99, is_active=False,
        )
        client = APIClient()
        response = client.get('/api/exercises/')
        self.assertEqual(len(response.data), 2)  # inactive excluded


class ExportTest(BaseAPITest):
    """Tests for the data export endpoint."""

    def test_export_requires_auth(self):
        client = APIClient()
        response = client.get('/api/export/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_export_empty(self):
        response = self.client.get('/api/export/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/zip')


class SessionCreationTest(BaseAPITest):
    """Tests for the recording session creation endpoint."""

    def test_create_postop_session(self):
        patient = self.create_test_patient('SES-001')
        response = self.client.post(
            f'/api/patients/{patient.id}/sessions/',
            {'phase': 'POST_OP'},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['phase'], 'POST_OP')
        self.assertEqual(response.data['session_number'], 1)

    def test_create_multiple_sessions(self):
        patient = self.create_test_patient('SES-002')
        self.client.post(
            f'/api/patients/{patient.id}/sessions/',
            {'phase': 'POST_OP'},
        )
        response = self.client.post(
            f'/api/patients/{patient.id}/sessions/',
            {'phase': 'POST_OP'},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['session_number'], 2)

    def test_create_session_missing_phase(self):
        patient = self.create_test_patient('SES-003')
        response = self.client.post(
            f'/api/patients/{patient.id}/sessions/',
            {},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_session_requires_auth(self):
        patient = self.create_test_patient('SES-004')
        client = APIClient()
        response = client.post(
            f'/api/patients/{patient.id}/sessions/',
            {'phase': 'POST_OP'},
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ExerciseSerializerTest(BaseAPITest):
    """Tests that exercise serializer returns single example_audio_url."""

    def test_exercise_has_single_example_url(self):
        Exercise.objects.all().delete()
        Exercise.objects.create(
            exercise_id='i_h', title='Vokal I hoch',
            description='Test', order=1,
            example_audio_url='/examples/i_h.flac',
        )
        client = APIClient()
        response = client.get('/api/exercises/')
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['example_audio_url'], '/examples/i_h.flac')


class AudioFileReassignTest(BaseAPITest):
    """
    Tests for PATCH /api/audio/<file_id>/reassign/.

    Verifies that reassigning an audio file between phases/sessions:
    - Updates the DB phase, session, AND storage_key fields.
    - Calls move_audio_in_s3 with the correct old/new S3 keys.
    - Returns 404 for unknown files and 400 for invalid phase values.
    """

    def setUp(self):
        super().setUp()
        self.patient = self.create_test_patient('RSG-001')
        self.pre_op_session = RecordingSession.objects.create(
            patient=self.patient, phase='PRE_OP', session_number=1,
        )
        self.post_op_session = RecordingSession.objects.create(
            patient=self.patient, phase='POST_OP', session_number=1,
        )
        # Create an audio file that is currently in PRE_OP
        self.audio = AudioFile.objects.create(
            patient=self.patient,
            session=self.pre_op_session,
            exercise_id='a_n',
            phase='PRE_OP',
            storage_key=f'{self.patient.id}/pre_1/a_n.webm',
        )

    def _patch_reassign(self, file_id, phase, session_id):
        return self.client.patch(
            f'/api/audio/{file_id}/reassign/',
            {'phase': phase, 'session': session_id},
            format='json',
        )

    def test_reassign_updates_db_and_storage_key(self):
        """Reassigning PRE_OP → POST_OP must update phase, session, AND storage_key."""
        from unittest.mock import patch as mock_patch

        with mock_patch('patients.services.move_audio_in_s3', return_value=True) as mock_move:
            response = self._patch_reassign(
                self.audio.id, 'POST_OP', str(self.post_op_session.id)
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.audio.refresh_from_db()
        self.assertEqual(self.audio.phase, 'POST_OP')
        self.assertEqual(self.audio.session_id, self.post_op_session.id)

        expected_new_key = f'{self.patient.id}/post_1/a_n.webm'
        self.assertEqual(self.audio.storage_key, expected_new_key)

        # Confirm move was called with old → new key
        mock_move.assert_called_once_with(
            f'{self.patient.id}/pre_1/a_n.webm',
            expected_new_key,
        )

    def test_reassign_without_session(self):
        """Reassigning without a session should use bare phase folder (no session suffix)."""
        from unittest.mock import patch as mock_patch

        with mock_patch('patients.services.move_audio_in_s3', return_value=True) as mock_move:
            response = self._patch_reassign(self.audio.id, 'POST_OP', None)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.audio.refresh_from_db()
        expected_new_key = f'{self.patient.id}/post/a_n.webm'
        self.assertEqual(self.audio.storage_key, expected_new_key)
        mock_move.assert_called_once_with(
            f'{self.patient.id}/pre_1/a_n.webm',
            expected_new_key,
        )

    def test_reassign_same_key_skips_s3_move(self):
        """If old_key == new_key, move_audio_in_s3 should not be called."""
        from unittest.mock import patch as mock_patch

        # Set up audio already at the target path
        self.audio.storage_key = f'{self.patient.id}/pre/a_n.webm'
        self.audio.session = None
        self.audio.save()

        with mock_patch('patients.services.move_audio_in_s3', return_value=True) as mock_move:
            response = self._patch_reassign(self.audio.id, 'PRE_OP', None)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_move.assert_not_called()

    def test_reassign_s3_failure_returns_500(self):
        """If move_audio_in_s3 returns False, the endpoint should return 500."""
        from unittest.mock import patch as mock_patch

        with mock_patch('patients.services.move_audio_in_s3', return_value=False):
            response = self._patch_reassign(
                self.audio.id, 'POST_OP', str(self.post_op_session.id)
            )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)

        # DB must NOT have been changed
        self.audio.refresh_from_db()
        self.assertEqual(self.audio.phase, 'PRE_OP')
        self.assertEqual(self.audio.storage_key, f'{self.patient.id}/pre_1/a_n.webm')

    def test_reassign_unknown_file_returns_404(self):
        import uuid
        response = self._patch_reassign(str(uuid.uuid4()), 'POST_OP', None)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_reassign_invalid_phase_returns_400(self):
        response = self._patch_reassign(self.audio.id, 'INVALID_PHASE', None)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reassign_requires_auth(self):
        client = APIClient()
        response = client.patch(
            f'/api/audio/{self.audio.id}/reassign/',
            {'phase': 'POST_OP', 'session': None},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class PatientActivityAPITest(BaseAPITest):
    """Tests for the Patient activity endpoint and legacy merging logic."""

    def test_patient_activity_empty_db_logs_synthesised(self):
        """If there are no PatientAuditLog entries, the view synthesises legacy timeline."""
        patient = self.create_test_patient('ACT-001')
        response = self.client.get(f'/api/patients/{patient.id}/activity/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should include creation and scheduled expiry (synthesised)
        types = [e['type'] for e in response.data]
        self.assertIn('create', types)
        self.assertIn('expiry', types)

    def test_patient_activity_merged_with_legacy_logs(self):
        """If database logs exist, legacy events preceding earliest DB log are merged."""
        from datetime import timedelta

        from django.utils import timezone

        from patients.models import PatientAuditLog

        patient = self.create_test_patient('ACT-002')
        # Simulate patient creation happening in the past
        patient.created_at = timezone.now() - timedelta(days=2)
        patient.save()

        # Database log written now
        PatientAuditLog.objects.create(
            patient=patient,
            event_type='edit',
            event='Status geändert',
            detail='Neu → Einwilligung erteilt',
            actor='admin',
            actor_name='admin',
        )

        response = self.client.get(f'/api/patients/{patient.id}/activity/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        types = [e['type'] for e in response.data]
        # Should include both DB logs (edit) and synthesised legacy logs (create, expiry)
        self.assertIn('edit', types)
        self.assertIn('create', types)
        self.assertIn('expiry', types)

    def test_audit_log_created_at_and_patient_id_edit(self):
        """Updating patient_id and created_at writes PatientAuditLog entries."""
        from datetime import timedelta

        from patients.models import PatientAuditLog

        patient = self.create_test_patient('ACT-EDIT-001')
        old_created = patient.created_at
        new_created = old_created - timedelta(days=5)

        response = self.client.patch(f'/api/patients/{patient.id}/', {
            'patient_id': 'ACT-EDIT-001-renamed',
            'created_at': new_created.isoformat(),
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        patient.refresh_from_db()
        self.assertEqual(patient.patient_id, 'ACT-EDIT-001-renamed')
        self.assertEqual(patient.created_at.date(), new_created.date())

        # Check logs
        edit_logs = PatientAuditLog.objects.filter(patient=patient, event_type='edit')
        self.assertTrue(edit_logs.exists())
        # It should contain details about patient_id change and created_at change
        detail = edit_logs.first().detail
        self.assertIn('Patienten-ID', detail)
        self.assertIn('Erstellungsdatum', detail)

    def test_audit_log_skip_exercise(self):
        """Skipping an exercise creates a PatientAuditLog entry."""
        from patients.models import PatientAuditLog, RecordingSession
        patient = self.create_test_patient('ACT-SKIP-001', status='CONSENT_GIVEN')
        # Create session
        RecordingSession.objects.create(patient=patient, phase='PRE_OP', session_number=1)

        # Skip a_n
        response = self.client.post(f'/api/p/{patient.id}/skips/', {
            'phase': 'PRE_OP',
            'exercise_id': 'a_n',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Check audit log
        logs = PatientAuditLog.objects.filter(patient=patient, event_type='edit', event='Übung übersprungen')
        self.assertEqual(logs.count(), 1)
        self.assertIn('Vokal A', logs.first().detail)

    def test_audit_log_feedback(self):
        """Submitting feedback creates/updates a PatientAuditLog entry."""
        from patients.models import PatientAuditLog
        patient = self.create_test_patient('ACT-FEEDBACK-001', status='POST_OP_STARTED')

        response = self.client.post(f'/api/p/{patient.id}/feedback/', {
            'phase': 'POST_OP',
            'rating': 4,
            'comment': 'Good session',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        logs = PatientAuditLog.objects.filter(patient=patient, event_type='edit', event='Feedback eingereicht')
        self.assertEqual(logs.count(), 1)
        self.assertIn('4/5 Sterne', logs.first().detail)
        self.assertIn('Good session', logs.first().detail)

    def test_audit_log_advance(self):
        """Advancing the patient workflow step creates a PatientAuditLog entry."""
        from patients.models import PatientAuditLog
        patient = self.create_test_patient('ACT-ADV-001', status='NEW')

        # Advance NEW -> CONSENT_GIVEN
        response = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        logs = PatientAuditLog.objects.filter(patient=patient, event_type='edit', event='Status geändert')
        self.assertEqual(logs.count(), 1)
        self.assertIn('Neu → Einwilligung erteilt', logs.first().detail)


class RecordingSessionVisitDateTest(BaseAPITest):
    """Tests for PATCH /api/patients/<id>/sessions/<session_id>/ (visit_date)."""

    def setUp(self):
        super().setUp()
        self.patient = self.create_test_patient('VD-001', status='POST_OP_STARTED')
        self.session1 = RecordingSession.objects.create(
            patient=self.patient, phase='POST_OP', session_number=1,
        )
        self.followup = RecordingSession.objects.create(
            patient=self.patient, phase='POST_OP', session_number=2,
        )

    def test_update_visit_date(self):
        response = self.client.patch(
            f'/api/patients/{self.patient.id}/sessions/{self.followup.id}/',
            {'visit_date': '2026-07-01T10:00:00Z'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.followup.refresh_from_db()
        self.assertIsNotNone(self.followup.visit_date)
        self.assertEqual(self.followup.visit_date.year, 2026)
        self.assertEqual(self.followup.visit_date.month, 7)

    def test_update_visit_date_writes_audit_log(self):
        from patients.models import PatientAuditLog

        response = self.client.patch(
            f'/api/patients/{self.patient.id}/sessions/{self.followup.id}/',
            {'visit_date': '2026-07-01T10:00:00Z'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        logs = PatientAuditLog.objects.filter(
            patient=self.patient, event_type='edit', event='Besuchsdatum bearbeitet',
        )
        self.assertEqual(logs.count(), 1)
        self.assertIn('Follow-up 1', logs.first().detail)

    def test_update_visit_date_unknown_session_returns_404(self):
        import uuid

        response = self.client.patch(
            f'/api/patients/{self.patient.id}/sessions/{uuid.uuid4()}/',
            {'visit_date': '2026-07-01T10:00:00Z'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_visit_date_requires_auth(self):
        client = APIClient()
        response = client.patch(
            f'/api/patients/{self.patient.id}/sessions/{self.followup.id}/',
            {'visit_date': '2026-07-01T10:00:00Z'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class AudioUploadSessionTargetingTest(BaseAPITest):
    """
    Tests for POST /api/p/<token>/audio/upload/ with an explicit session_id.

    Covers the fix that lets every follow-up section upload into its own
    RecordingSession, and the corresponding session-scoped replace-on-upload
    filter that keeps other sessions' recordings intact.
    """

    # Minimal valid WEBM header (magic bytes only).
    WEBM = b'\x1a\x45\xdf\xa3' + b'\x00' * 28

    def setUp(self):
        super().setUp()
        self.patient = self.create_test_patient('UP-001', status='POST_OP_STARTED')
        self.session1 = RecordingSession.objects.create(
            patient=self.patient, phase='POST_OP', session_number=1,
        )
        self.followup = RecordingSession.objects.create(
            patient=self.patient, phase='POST_OP', session_number=2,
        )

    def _upload(self, session_id=None, exercise_id='a_n'):
        from django.core.files.uploadedfile import SimpleUploadedFile

        file = SimpleUploadedFile('recording.webm', self.WEBM, content_type='audio/webm')
        payload = {'file': file, 'exercise_id': exercise_id}
        if session_id is not None:
            payload['session_id'] = str(session_id)
        return self.client.post(
            f'/api/p/{self.patient.id}/audio/upload/',
            payload,
            format='multipart',
        )

    def test_upload_with_session_id_lands_in_specified_session(self):
        from unittest.mock import patch as mock_patch

        with mock_patch('patients.services.upload_audio_to_s3'):
            response = self._upload(session_id=self.session1.id)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        audio = AudioFile.objects.get(id=response.data['id'])
        self.assertEqual(audio.session_id, self.session1.id)
        self.assertEqual(audio.phase, 'POST_OP')
        self.assertIn(f'post_{self.session1.session_number}', audio.storage_key)

    def test_upload_with_session_id_derives_phase_from_session(self):
        """An explicit POST_OP session_id wins even if patient.status says otherwise."""
        from unittest.mock import patch as mock_patch

        self.patient.status = 'NEW'
        self.patient.save(update_fields=['status'])

        with mock_patch('patients.services.upload_audio_to_s3'):
            response = self._upload(session_id=self.session1.id)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        audio = AudioFile.objects.get(id=response.data['id'])
        self.assertEqual(audio.phase, 'POST_OP')

    def test_reupload_into_different_session_does_not_delete_other_session(self):
        """Replace-on-upload is scoped by session, not just (patient, exercise, phase)."""
        from unittest.mock import patch as mock_patch

        with mock_patch('patients.services.upload_audio_to_s3'):
            first = self._upload(session_id=self.session1.id)
            second = self._upload(session_id=self.followup.id)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)

        self.assertTrue(AudioFile.objects.filter(id=first.data['id']).exists())
        self.assertTrue(AudioFile.objects.filter(id=second.data['id']).exists())
        self.assertEqual(
            AudioFile.objects.filter(patient=self.patient, exercise_id='a_n').count(), 2,
        )

    def test_reupload_into_same_session_replaces_previous_recording(self):
        """Re-recording the same exercise in the same session still replaces it."""
        from unittest.mock import patch as mock_patch

        with mock_patch('patients.services.upload_audio_to_s3'):
            first = self._upload(session_id=self.followup.id)
            second = self._upload(session_id=self.followup.id)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)

        self.assertFalse(AudioFile.objects.filter(id=first.data['id']).exists())
        self.assertEqual(
            AudioFile.objects.filter(
                patient=self.patient, exercise_id='a_n', session=self.followup,
            ).count(), 1,
        )

    def test_upload_with_invalid_session_id_returns_400(self):
        import uuid
        from unittest.mock import patch as mock_patch

        with mock_patch('patients.services.upload_audio_to_s3'):
            response = self._upload(session_id=uuid.uuid4())
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upload_without_session_id_targets_active_session(self):
        """No session_id → falls back to active-session resolution (existing behaviour)."""
        from unittest.mock import patch as mock_patch

        with mock_patch('patients.services.upload_audio_to_s3'):
            response = self._upload()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        audio = AudioFile.objects.get(id=response.data['id'])
        self.assertEqual(audio.session_id, self.followup.id)


