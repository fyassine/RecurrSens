"""
API integration tests for the patients app.
Tests cover all major endpoints, authentication, and business logic flows.
"""
from datetime import date
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status

from patients.models import Patient, AudioFile, Exercise


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

    def test_list_patients(self):
        self.create_test_patient('LIST-001')
        self.create_test_patient('LIST-002')
        response = self.client.get('/api/patients/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Response is paginated
        self.assertEqual(response.data['count'], 2)

    def test_get_patient_detail(self):
        patient = self.create_test_patient('DET-001')
        response = self.client.get(f'/api/patients/{patient.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['patient_id'], 'DET-001')
        self.assertIn('audio_files', response.data)

    def test_update_patient(self):
        patient = self.create_test_patient('UPD-001')
        response = self.client.patch(f'/api/patients/{patient.id}/', {
            'gender': 'M',
            'diagnosis': 'LEFT',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        patient.refresh_from_db()
        self.assertEqual(patient.gender, 'M')
        self.assertEqual(patient.diagnosis, 'LEFT')

    def test_delete_patient(self):
        patient = self.create_test_patient('DEL-001')
        response = self.client.delete(f'/api/patients/{patient.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Patient.objects.filter(id=patient.id).exists())


class PatientWorkflowTest(BaseAPITest):
    """Tests for the patient workflow state machine."""

    def test_advance_from_new(self):
        patient = self.create_test_patient('WF-001')
        response = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'CONSENT_GIVEN')

    def test_advance_full_workflow(self):
        """Test advancing through all steps (except COMPLETED which needs data)."""
        patient = self.create_test_patient(
            'WF-002',
            gender='M',
            birth_date=date(1990, 1, 1),
        )
        # NEW → CONSENT_GIVEN
        r = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(r.data['status'], 'CONSENT_GIVEN')

        # CONSENT_GIVEN → DEMOGRAPHICS_DONE
        r = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(r.data['status'], 'DEMOGRAPHICS_DONE')

        # DEMOGRAPHICS_DONE → PRE_OP_DONE
        r = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(r.data['status'], 'PRE_OP_DONE')

        # PRE_OP_DONE → POST_OP_STARTED
        r = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(r.data['status'], 'POST_OP_STARTED')

        # POST_OP_STARTED → POST_OP_DONE
        r = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(r.data['status'], 'POST_OP_DONE')

    def test_advance_completed_requires_data(self):
        """COMPLETED requires all data to be present."""
        patient = self.create_test_patient('WF-003')
        patient.status = Patient.Status.POST_OP_DONE
        patient.save()

        response = self.client.post(f'/api/patients/{patient.id}/advance/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_advance_already_completed(self):
        """Cannot advance beyond COMPLETED."""
        patient = self.create_test_patient('WF-004')
        patient.status = Patient.Status.COMPLETED
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
        self.assertIn('gender', response.data['missing'])
        self.assertIn('birthDate', response.data['missing'])
        self.assertIn('diagnosis', response.data['missing'])

    def test_complete_patient(self):
        patient = self.create_test_patient(
            'CMP-002',
            gender='M',
            birth_date=date(1990, 1, 1),
            diagnosis=Patient.Diagnosis.LEFT,
        )
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

    def test_update_demographics(self):
        patient = self.create_test_patient('PUB-002')
        client = APIClient()
        response = client.patch(
            f'/api/p/{patient.id}/',
            {'gender': 'W', 'birth_date': '1985-06-15'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        patient.refresh_from_db()
        self.assertEqual(patient.gender, 'W')
        self.assertEqual(patient.birth_date, date(1985, 6, 15))

    def test_advance_via_token(self):
        patient = self.create_test_patient('PUB-003')
        client = APIClient()
        response = client.post(f'/api/p/{patient.id}/advance/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'CONSENT_GIVEN')


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
