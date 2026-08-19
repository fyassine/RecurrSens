"""
Tests for the live-demo (QR-code booth) flow.

The point of these tests is the privacy guarantee: the demo endpoint classifies
a recording and stores nothing. If someone later "fixes" the demo into the
normal persistent upload path, `test_analyze_persists_nothing` is what should
fail first.
"""

import uuid

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from patients.demo_inference import (
    HEALTHY,
    INFECTED,
    DemoInferenceError,
    HttpDemoInferenceBackend,
    StubDemoInferenceBackend,
    get_demo_inference_backend,
)
from patients.models import AudioFile, Patient

# A minimal but valid WebM/EBML header — enough for validate_audio_upload's
# magic-byte sniffing to accept it as audio/webm.
WEBM_BYTES = b'\x1a\x45\xdf\xa3' + b'\x00' * 2048


def demo_upload(name='demo.webm', content=None):
    return SimpleUploadedFile(name, content or WEBM_BYTES, content_type='audio/webm')


@override_settings(DEMO_MODE_ENABLED=True, DEMO_INFERENCE_BACKEND='stub')
class LiveDemoAnalyzeTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.token = uuid.uuid4()
        self.url = f'/api/demo/{self.token}/analyze/'

    def test_analyze_returns_prediction_and_confidence(self):
        response = self.client.post(self.url, {'file': demo_upload()}, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(response.data['prediction'], (HEALTHY, INFECTED))
        self.assertIsInstance(response.data['confidence'], float)
        self.assertEqual(response.data['favorable'], response.data['prediction'] == HEALTHY)
        self.assertFalse(response.data['stored'])
        self.assertEqual(response.data['backend'], 'stub')

    def test_analyze_persists_nothing(self):
        """The whole reason this flow exists. Do not relax this test."""
        response = self.client.post(self.url, {'file': demo_upload()}, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Patient.objects.count(), 0)
        self.assertEqual(AudioFile.objects.count(), 0)

    def test_demo_token_is_not_a_patient_lookup(self):
        """An unknown token must work — the demo is tied to no record."""
        response = self.client.post(
            f'/api/demo/{uuid.uuid4()}/analyze/',
            {'file': demo_upload()},
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_requires_no_authentication(self):
        self.client.credentials()  # explicitly anonymous
        response = self.client.post(self.url, {'file': demo_upload()}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_missing_file_rejected(self):
        response = self.client.post(self.url, {}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_audio_rejected(self):
        bad = SimpleUploadedFile('evil.exe', b'MZ' + b'\x00' * 64, content_type='application/x-msdownload')
        response = self.client.post(self.url, {'file': bad}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(DEMO_MAX_AUDIO_BYTES=128)
    def test_oversized_recording_rejected(self):
        response = self.client.post(self.url, {'file': demo_upload()}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

    @override_settings(DEMO_MODE_ENABLED=False)
    def test_disabled_demo_returns_404(self):
        response = self.client.post(self.url, {'file': demo_upload()}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_upload_is_never_spooled_to_disk(self):
        """
        Django spools uploads over FILE_UPLOAD_MAX_MEMORY_SIZE to a temp file by
        default. The demo view forces a memory-only handler; this asserts the
        recording still arrives (not silently dropped) when it exceeds that size.
        """
        big = WEBM_BYTES + b'\x00' * (3 * 1024 * 1024)
        with override_settings(FILE_UPLOAD_MAX_MEMORY_SIZE=1024):
            response = self.client.post(
                self.url,
                {'file': demo_upload(content=big)},
                format='multipart',
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(AudioFile.objects.count(), 0)


class StubBackendTest(TestCase):
    def setUp(self):
        self.backend = StubDemoInferenceBackend()

    def kwargs(self, audio=WEBM_BYTES):
        return dict(
            audio=audio,
            filename='demo.webm',
            content_type='audio/webm',
            gender='M',
            age=45,
        )

    def test_result_is_deterministic_for_the_same_audio(self):
        first = self.backend.analyze(**self.kwargs())
        second = self.backend.analyze(**self.kwargs())
        self.assertEqual(first.film_classifier, second.film_classifier)

    def test_confidence_stays_in_a_plausible_range(self):
        result = self.backend.analyze(**self.kwargs())
        self.assertGreaterEqual(result.film_classifier.percentage, self.backend.MIN_PERCENTAGE)
        self.assertLessEqual(result.film_classifier.percentage, self.backend.MAX_PERCENTAGE)

    def test_empty_audio_raises(self):
        with self.assertRaises(DemoInferenceError):
            self.backend.analyze(**self.kwargs(audio=b''))

    @override_settings(DEMO_STUB_FORCE_PREDICTION='INFECTED')
    def test_prediction_can_be_pinned_for_a_rehearsed_demo(self):
        result = self.backend.analyze(**self.kwargs())
        self.assertEqual(result.film_classifier.prediction, INFECTED)
        self.assertFalse(result.film_classifier.is_favorable)


class BackendSelectionTest(TestCase):
    @override_settings(DEMO_INFERENCE_BACKEND='stub')
    def test_selects_stub(self):
        self.assertIsInstance(get_demo_inference_backend(), StubDemoInferenceBackend)

    @override_settings(DEMO_INFERENCE_BACKEND='http')
    def test_selects_http(self):
        self.assertIsInstance(get_demo_inference_backend(), HttpDemoInferenceBackend)

    @override_settings(DEMO_INFERENCE_BACKEND='nonsense')
    def test_unknown_backend_falls_back_to_stub(self):
        self.assertIsInstance(get_demo_inference_backend(), StubDemoInferenceBackend)


class HttpBackendParsingTest(TestCase):
    """The HTTP backend must accept the real service's /predict response shape."""

    def setUp(self):
        self.backend = HttpDemoInferenceBackend()

    def test_parses_real_service_response_shape(self):
        result = self.backend._parse(
            {
                'film_classifier': {'prediction': 'HEALTHY', 'percentage': 87.4},
                'gradcam_pro': {'prediction': 'HEALTHY', 'percentage': 81.2},
            }
        )
        self.assertEqual(result.film_classifier.prediction, HEALTHY)
        self.assertEqual(result.film_classifier.percentage, 87.4)
        self.assertEqual(result.gradcam_pro.percentage, 81.2)
        self.assertEqual(result.backend, 'http')

    def test_gradcam_is_optional(self):
        result = self.backend._parse(
            {'film_classifier': {'prediction': 'INFECTED', 'percentage': 62.0}, 'gradcam_pro': None}
        )
        self.assertIsNone(result.gradcam_pro)

    def test_missing_film_block_raises(self):
        with self.assertRaises(DemoInferenceError):
            self.backend._parse({'gradcam_pro': {'prediction': 'HEALTHY', 'percentage': 90.0}})
