"""Tests for device, browser, and microphone recording metadata."""

import io
import json
import zipfile
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from patients import services
from patients.models import AudioFile, Exercise, Patient, PatientAuditLog, RecordingSession
from patients.serializers import AudioFileCompactSerializer, AudioFileSerializer


class DeviceInfoServiceTest(TestCase):
    """Test device telemetry enrichment and summary formatting."""

    def test_enrich_device_info_from_ua_header(self):
        ua = (
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) '
            'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
        )
        enriched = services.enrich_device_info(None, ua_header=ua)
        self.assertEqual(enriched['parsed']['device_type'], 'Mobil')
        self.assertEqual(enriched['parsed']['device_family'], 'iPhone')
        self.assertEqual(enriched['parsed']['os'], 'iOS')
        self.assertEqual(enriched['parsed']['browser'], 'Mobile Safari')

    def test_enrich_device_info_merges_client_telemetry(self):
        client_data = {
            'microphone': {
              'label': 'MacBook Pro Microphone (Built-in)',
              'sample_rate': 48000,
              'channel_count': 1,
              'noise_suppression': True,
            },
            'audio_format': {'mime_type': 'audio/webm;codecs=opus'},
            'device': {
              'screen_width': 1920,
              'screen_height': 1080,
              'device_pixel_ratio': 2,
            },
            'browser': {
              'raw_user_agent': (
                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
              ),
            },
        }
        enriched = services.enrich_device_info(client_data)
        self.assertEqual(enriched['microphone']['label'], 'MacBook Pro Microphone (Built-in)')
        self.assertEqual(enriched['microphone']['sample_rate'], 48000)
        self.assertEqual(enriched['parsed']['device_type'], 'Desktop')
        self.assertEqual(enriched['parsed']['device_family'], 'Mac')
        self.assertEqual(enriched['parsed']['browser'], 'Chrome')

    def test_enrich_device_info_from_json_string(self):
        client_payload = json.dumps({
            'microphone': {'label': 'AirPods Pro'},
            'browser': {'raw_user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'},
        })
        enriched = services.enrich_device_info(client_payload)
        self.assertEqual(enriched['microphone']['label'], 'AirPods Pro')
        self.assertEqual(enriched['parsed']['device_type'], 'Desktop')
        self.assertEqual(enriched['parsed']['os'], 'Windows')

    def test_summarize_device_info(self):
        info = {
            'parsed': {
                'device_type': 'Mobil',
                'device_family': 'iPhone',
                'browser': 'Mobile Safari',
            },
            'microphone': {'label': 'AirPods Pro'},
        }
        summary = services.summarize_device_info(info)
        self.assertEqual(summary, 'Mobil · iPhone · Mobile Safari · AirPods Pro')

        self.assertEqual(services.summarize_device_info({}), '')
        self.assertEqual(services.summarize_device_info(None), '')


class DeviceInfoAPITest(TestCase):
    """Test audio upload endpoints with device_info payload."""

    def setUp(self):
        self.client = APIClient()
        self.patient = Patient.objects.create(patient_id='DEV-PAT-01')
        self.exercise = Exercise.objects.create(
            exercise_id='a_n',
            title='Vokal A normal',
            order=1,
        )

    @mock.patch('patients.services.upload_audio_to_s3')
    def test_audio_upload_stores_and_enriches_device_info(self, mock_s3):
        mock_s3.return_value = None

        audio_bytes = (
            b'\x1a\x45\xdf\xa3'
            + b'\x00' * 20
            + b'webm'
            + b'\x00' * 50
        )
        audio_file = SimpleUploadedFile(
            'recording.webm',
            audio_bytes,
            content_type='audio/webm',
        )

        device_telemetry = {
            'microphone': {
                'label': 'Test Microphone',
                'sample_rate': 44100,
                'channel_count': 1,
            },
            'audio_format': {'mime_type': 'audio/webm'},
            'device': {'screen_width': 393, 'screen_height': 852},
        }

        ua = (
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) '
            'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
        )

        response = self.client.post(
            f'/api/p/{self.patient.id}/audio/upload/',
            {
                'file': audio_file,
                'exerciseId': 'a_n',
                'device_info': json.dumps(device_telemetry),
            },
            format='multipart',
            HTTP_USER_AGENT=ua,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        af = AudioFile.objects.get(patient=self.patient, exercise_id='a_n')
        self.assertIsNotNone(af.device_info)
        self.assertEqual(af.device_info['microphone']['label'], 'Test Microphone')
        self.assertEqual(af.device_info['microphone']['sample_rate'], 44100)
        self.assertEqual(af.device_info['parsed']['device_type'], 'Mobil')
        self.assertEqual(af.device_info['parsed']['device_family'], 'iPhone')

        # Check Audit Log includes device summary
        audit = PatientAuditLog.objects.filter(
            patient=self.patient,
            event_type=PatientAuditLog.EventType.UPLOAD,
        ).first()
        self.assertIsNotNone(audit)
        self.assertIn('Mobil · iPhone · Mobile Safari · Test Microphone', audit.detail)

        # Check serializers expose device_info
        full_data = AudioFileSerializer(af).data
        self.assertIn('device_info', full_data)
        self.assertEqual(full_data['device_info']['microphone']['label'], 'Test Microphone')

        compact_data = AudioFileCompactSerializer(af).data
        self.assertIn('device_info', compact_data)

    def test_export_patients_zip_includes_recordings_csv(self):
        session = RecordingSession.objects.create(
            patient=self.patient,
            phase='PRE_OP',
            session_number=1,
        )
        AudioFile.objects.create(
            patient=self.patient,
            session=session,
            exercise_id='a_n',
            phase='PRE_OP',
            storage_key=f'{self.patient.id}/pre_1/a_n.webm',
            device_info={
                'microphone': {'label': 'AirPods Pro', 'sample_rate': 48000, 'channel_count': 1},
                'parsed': {
                    'device_type': 'Mobil',
                    'device_family': 'iPhone',
                    'os': 'iOS',
                    'os_version': '17.4',
                    'browser': 'Mobile Safari',
                    'browser_version': '17.4',
                },
                'audio_format': {'mime_type': 'audio/webm'},
            },
        )

        s3_mock = mock.Mock()
        s3_mock.get_object.return_value = {'Body': io.BytesIO(b'audio-content')}

        with mock.patch('patients.services.get_s3_client', return_value=s3_mock):
            zip_bytes = services.export_patients_zip(patient_ids=[str(self.patient.id)])

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            namelist = zf.namelist()
            self.assertIn('metadata.csv', namelist)
            self.assertIn('recordings.csv', namelist)

            rec_csv = zf.read('recordings.csv').decode('utf-8')
            self.assertIn('AirPods Pro', rec_csv)
            self.assertIn('Mobil', rec_csv)
            self.assertIn('iPhone', rec_csv)
            self.assertIn('iOS', rec_csv)
            self.assertIn('Mobile Safari', rec_csv)
            self.assertIn('48000', rec_csv)
