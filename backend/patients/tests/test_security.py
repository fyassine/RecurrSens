from unittest import mock

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from patients import services
from patients.models import (
from django.contrib.auth.models import User




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

















