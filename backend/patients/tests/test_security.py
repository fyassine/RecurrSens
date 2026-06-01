"""
Security & access-control tests covering the P0/P1 fixes:
  - signed-token audio streaming
  - center-scoped audio download-url / reassign
  - removal of the patient-facing PATCH status bypass
  - presign-confirm S3 existence check
  - race-safe PRE_OP session creation
"""
from unittest import mock

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from patients import services
from patients.models import (
    Patient, AudioFile, Exercise, RecordingSession, Center, UserProfile,
)
from django.contrib.auth.models import User


def _jwt_for(client, username, password):
    resp = client.post('/api/auth/token/', {'username': username, 'password': password})
    return resp.data['access']


class AudioAccessControlTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Two centers, each with a CENTER_USER and a patient + audio file.
        self.center_a = Center.objects.create(name='Center A')
        self.center_b = Center.objects.create(name='Center B')

        self.user_a = User.objects.create_user('user_a', password='pw')
        UserProfile.objects.create(user=self.user_a, role='CENTER_USER', center=self.center_a)
        self.user_b = User.objects.create_user('user_b', password='pw')
        UserProfile.objects.create(user=self.user_b, role='CENTER_USER', center=self.center_b)

        self.patient_a = Patient.objects.create(patient_id='A-001', center=self.center_a)
        self.audio_a = AudioFile.objects.create(
            patient=self.patient_a, exercise_id='a_n', phase='PRE_OP',
            storage_key=f'{self.patient_a.id}/pre/a_n.webm',
        )

    def _auth(self, username):
        token = _jwt_for(self.client, username, 'pw')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    # --- stream-url minting ---------------------------------------------------

    def test_stream_url_requires_auth(self):
        resp = self.client.get(f'/api/audio/{self.audio_a.id}/stream-url/')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_stream_url_other_center_404(self):
        self._auth('user_b')  # belongs to Center B
        resp = self.client.get(f'/api/audio/{self.audio_a.id}/stream-url/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_stream_url_own_center_ok(self):
        self._auth('user_a')
        resp = self.client.get(f'/api/audio/{self.audio_a.id}/stream-url/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn(f'/api/audio/{self.audio_a.id}/?t=', resp.data['url'])

    # --- stream proxy token validation ---------------------------------------

    def test_stream_without_token_forbidden(self):
        resp = self.client.get(f'/api/audio/{self.audio_a.id}/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_stream_with_bad_token_forbidden(self):
        resp = self.client.get(f'/api/audio/{self.audio_a.id}/?t=not-a-valid-token')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_stream_with_valid_token_ok(self):
        token = services.sign_audio_stream_token(self.audio_a.id)
        with mock.patch('patients.services.get_audio_from_s3', return_value=b'audio-bytes'):
            resp = self.client.get(f'/api/audio/{self.audio_a.id}/?t={token}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.content, b'audio-bytes')

    def test_token_for_one_file_rejected_for_another(self):
        other = AudioFile.objects.create(
            patient=self.patient_a, exercise_id='i_n', phase='PRE_OP',
            storage_key=f'{self.patient_a.id}/pre/i_n.webm',
        )
        token = services.sign_audio_stream_token(self.audio_a.id)
        resp = self.client.get(f'/api/audio/{other.id}/?t={token}')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # --- download-url & reassign center scoping -------------------------------

    def test_download_url_other_center_404(self):
        self._auth('user_b')
        resp = self.client.get(f'/api/audio/{self.audio_a.id}/url/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_reassign_other_center_404(self):
        self._auth('user_b')
        resp = self.client.patch(
            f'/api/audio/{self.audio_a.id}/reassign/',
            {'phase': 'POST_OP', 'session': None}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class PatientPatchBypassTest(TestCase):
    """The patient-facing PATCH (status bypass) must be gone; admin PATCH must
    not be able to mutate status either."""

    def setUp(self):
        self.client = APIClient()
        self.patient = Patient.objects.create(patient_id='P-001')

    def test_patient_patch_not_allowed(self):
        resp = self.client.patch(
            f'/api/p/{self.patient.id}/', {'status': 'POST_OP_DONE'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.status, Patient.Status.NEW)

    def test_admin_patch_cannot_change_status(self):
        admin = User.objects.create_superuser('admin', 'a@b.c', 'pw')  # noqa: F841
        token = _jwt_for(self.client, 'admin', 'pw')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        resp = self.client.patch(
            f'/api/patients/{self.patient.id}/',
            {'status': 'POST_OP_DONE'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.patient.refresh_from_db()
        # status is not a writable field → unchanged
        self.assertEqual(self.patient.status, Patient.Status.NEW)


class PresignConfirmExistenceTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.patient = Patient.objects.create(patient_id='PC-001')
        Exercise.objects.create(exercise_id='a_n', title='A', description='x', order=1)

    def _confirm(self):
        return self.client.post(
            f'/api/p/{self.patient.id}/audio/confirm/',
            {
                'storage_key': f'{self.patient.id}/pre/a_n.webm',
                'exerciseId': 'a_n',
                'phase': 'PRE_OP',
            },
            format='json',
        )

    def test_confirm_rejected_when_object_missing(self):
        with mock.patch('patients.services.audio_object_exists', return_value=False):
            resp = self._confirm()
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AudioFile.objects.count(), 0)

    def test_confirm_creates_record_when_object_present(self):
        with mock.patch('patients.services.audio_object_exists', return_value=True):
            resp = self._confirm()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(AudioFile.objects.count(), 1)


class SessionRaceTest(TestCase):
    def test_advance_twice_creates_single_pre_op_session(self):
        patient = Patient.objects.create(patient_id='S-001')
        services.advance_patient_step(patient)  # NEW -> CONSENT_GIVEN, creates session
        # Re-run the auto-create branch directly; must be idempotent.
        RecordingSession.objects.get_or_create(
            patient=patient, phase=RecordingSession.Phase.PRE_OP, session_number=1,
        )
        self.assertEqual(
            RecordingSession.objects.filter(patient=patient, phase='PRE_OP').count(), 1
        )


class ExportS3FailureTest(TestCase):
    def test_s3_fetch_failure_writes_errors_txt(self):
        import io
        import zipfile

        patient = Patient.objects.create(patient_id='EXP-S3')
        AudioFile.objects.create(
            patient=patient, exercise_id='a_n', phase='PRE_OP',
            storage_key=f'{patient.id}/pre/a_n.webm',
        )

        s3 = mock.Mock()
        s3.get_object.side_effect = Exception('connection reset')
        with mock.patch('patients.services.get_s3_client', return_value=s3):
            zip_bytes = services.export_patients_zip(patient_ids=[str(patient.id)])

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
            self.assertIn('metadata.csv', names)
            self.assertIn('errors.txt', names)
            self.assertIn('connection reset', zf.read('errors.txt').decode())
