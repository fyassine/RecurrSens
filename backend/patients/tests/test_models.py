"""
Model tests for the patients app.
Tests cover model creation, field behavior, workflow status, and relationships.
"""
from datetime import date, datetime
from django.test import TestCase
from patients.models import Patient, AudioFile, Exercise


class ExerciseModelTest(TestCase):
    """Tests for the Exercise model."""

    def test_create_exercise(self):
        exercise = Exercise.objects.create(
            exercise_id='test_exercise',
            title='Test Exercise',
            description='Test description',
            order=1,
        )
        self.assertEqual(exercise.exercise_id, 'test_exercise')
        self.assertEqual(str(exercise), 'Test Exercise (test_exercise)')
        self.assertTrue(exercise.is_active)

    def test_exercise_ordering(self):
        Exercise.objects.create(exercise_id='b', title='B', description='B', order=2)
        Exercise.objects.create(exercise_id='a', title='A', description='A', order=1)
        exercises = list(Exercise.objects.all())
        self.assertEqual(exercises[0].exercise_id, 'a')
        self.assertEqual(exercises[1].exercise_id, 'b')


class PatientModelTest(TestCase):
    """Tests for the Patient model."""

    def test_create_patient(self):
        patient = Patient.objects.create(patient_id='TEST-001')
        self.assertEqual(patient.patient_id, 'TEST-001')
        self.assertEqual(patient.status, Patient.Status.NEW)
        self.assertEqual(patient.gender, Patient.Gender.UNKNOWN)
        self.assertEqual(patient.diagnosis, Patient.Diagnosis.TODO)
        self.assertEqual(patient.prediction_pre, Patient.PredictionStatus.TODO)
        self.assertEqual(patient.prediction_post, Patient.PredictionStatus.TODO)
        self.assertIsNotNone(patient.id)  # UUID auto-generated

    def test_patient_str(self):
        patient = Patient.objects.create(patient_id='STR-001')
        self.assertIn('STR-001', str(patient))
        self.assertIn('Neu', str(patient))

    def test_patient_age_calculation(self):
        patient = Patient.objects.create(
            patient_id='AGE-001',
            birth_date=date(1990, 1, 15),
        )
        age = patient.age
        expected_year = date.today().year - 1990
        # Adjust if birthday hasn't occurred yet this year
        if (date.today().month, date.today().day) < (1, 15):
            expected_year -= 1
        self.assertEqual(age, expected_year)

    def test_patient_age_none_if_no_birthday(self):
        patient = Patient.objects.create(patient_id='NOAGE-001')
        self.assertIsNone(patient.age)

    def test_patient_unique_patient_id(self):
        Patient.objects.create(patient_id='UNIQUE-001')
        with self.assertRaises(Exception):
            Patient.objects.create(patient_id='UNIQUE-001')

    def test_patient_ordering(self):
        """Most recently created patients should come first."""
        p1 = Patient.objects.create(patient_id='ORDER-001')
        p2 = Patient.objects.create(patient_id='ORDER-002')
        patients = list(Patient.objects.all())
        self.assertEqual(patients[0].patient_id, 'ORDER-002')
        self.assertEqual(patients[1].patient_id, 'ORDER-001')


class AudioFileModelTest(TestCase):
    """Tests for the AudioFile model."""

    def setUp(self):
        self.patient = Patient.objects.create(patient_id='AUDIO-001')

    def test_create_audio_file(self):
        audio = AudioFile.objects.create(
            patient=self.patient,
            exercise_id='a_n',
            phase=AudioFile.Phase.PRE_OP,
            storage_key='token/pre/a_n.webm',
        )
        self.assertEqual(audio.exercise_id, 'a_n')
        self.assertEqual(audio.phase, 'PRE_OP')
        self.assertIsNotNone(audio.id)

    def test_audio_file_str(self):
        audio = AudioFile.objects.create(
            patient=self.patient,
            exercise_id='phrase',
            phase=AudioFile.Phase.POST_OP,
            storage_key='token/post/phrase.webm',
        )
        s = str(audio)
        self.assertIn('Post-OP', s)
        self.assertIn('phrase', s)
        self.assertIn('AUDIO-001', s)

    def test_audio_cascade_delete(self):
        """Audio files should be deleted when patient is deleted."""
        AudioFile.objects.create(
            patient=self.patient,
            exercise_id='a_n',
            phase=AudioFile.Phase.PRE_OP,
            storage_key='token/pre/a_n.webm',
        )
        self.assertEqual(AudioFile.objects.count(), 1)
        self.patient.delete()
        self.assertEqual(AudioFile.objects.count(), 0)

    def test_audio_related_name(self):
        AudioFile.objects.create(
            patient=self.patient,
            exercise_id='a_n',
            phase=AudioFile.Phase.PRE_OP,
            storage_key='token/pre/a_n.webm',
        )
        AudioFile.objects.create(
            patient=self.patient,
            exercise_id='i_n',
            phase=AudioFile.Phase.POST_OP,
            storage_key='token/post/i_n.webm',
        )
        self.assertEqual(self.patient.audio_files.count(), 2)
        self.assertEqual(
            self.patient.audio_files.filter(phase='PRE_OP').count(), 1
        )
