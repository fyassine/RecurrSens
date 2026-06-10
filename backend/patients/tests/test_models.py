"""Model tests for the patients app."""
from django.test import TestCase
from django.utils import timezone
from patients.models import Patient, AudioFile, Exercise, RecordingSession, PatientAuditLog


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

    def test_exercise_single_example_audio(self):
        exercise = Exercise.objects.create(
            exercise_id='i_h', title='Vokal I hoch',
            description='Test', order=1,
            example_audio_url='/examples/i_h.flac',
        )
        self.assertEqual(exercise.example_audio_url, '/examples/i_h.flac')


class PatientModelTest(TestCase):
    """Tests for the Patient model."""

    def test_create_patient(self):
        patient = Patient.objects.create(patient_id='TEST-001')
        self.assertEqual(patient.patient_id, 'TEST-001')
        self.assertEqual(patient.status, Patient.Status.NEW)
        self.assertEqual(patient.prediction_pre, Patient.PredictionStatus.TODO)
        self.assertEqual(patient.prediction_post, Patient.PredictionStatus.TODO)
        self.assertIsNotNone(patient.id)  # UUID auto-generated
        self.assertIsNotNone(patient.expires_at)  # auto-set by save()

    def test_patient_expires_at_auto_set(self):
        from django.conf import settings
        patient = Patient.objects.create(patient_id='EXP-001')
        retention = getattr(settings, 'DATA_RETENTION_DAYS', 3)
        delta = patient.expires_at - patient.created_at
        self.assertAlmostEqual(delta.days, retention, delta=1)

    def test_is_expiring_soon(self):
        from datetime import timedelta
        patient = Patient.objects.create(patient_id='SOON-001')
        patient.expires_at = timezone.now() + timedelta(hours=12)
        self.assertTrue(patient.is_expiring_soon)

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

    def test_soft_delete(self):
        """Soft-deleted patients have deleted_at set and is_deleted True."""
        patient = Patient.objects.create(patient_id='SOFT-001')
        self.assertFalse(patient.is_deleted)
        self.assertIsNone(patient.deleted_at)

        patient.deleted_at = timezone.now()
        patient.save()
        self.assertTrue(patient.is_deleted)


class RecordingSessionModelTest(TestCase):
    """Tests for the RecordingSession model."""

    def setUp(self):
        self.patient = Patient.objects.create(patient_id='SESSION-001')

    def test_create_session(self):
        session = RecordingSession.objects.create(
            patient=self.patient,
            phase=RecordingSession.Phase.PRE_OP,
            session_number=1,
        )
        self.assertEqual(session.phase, 'PRE_OP')
        self.assertEqual(session.session_number, 1)
        self.assertIsNotNone(session.id)

    def test_session_str(self):
        session = RecordingSession.objects.create(
            patient=self.patient,
            phase=RecordingSession.Phase.POST_OP,
            session_number=3,
        )
        s = str(session)
        self.assertIn('Post-OP', s)
        self.assertIn('Sitzung 3', s)
        self.assertIn('SESSION-001', s)

    def test_unique_session_per_phase(self):
        RecordingSession.objects.create(
            patient=self.patient,
            phase=RecordingSession.Phase.PRE_OP,
            session_number=1,
        )
        with self.assertRaises(Exception):
            RecordingSession.objects.create(
                patient=self.patient,
                phase=RecordingSession.Phase.PRE_OP,
                session_number=1,
            )

    def test_multiple_sessions_different_phases(self):
        RecordingSession.objects.create(
            patient=self.patient,
            phase=RecordingSession.Phase.PRE_OP,
            session_number=1,
        )
        RecordingSession.objects.create(
            patient=self.patient,
            phase=RecordingSession.Phase.POST_OP,
            session_number=1,
        )
        self.assertEqual(self.patient.sessions.count(), 2)

    def test_session_cascade_delete(self):
        RecordingSession.objects.create(
            patient=self.patient,
            phase=RecordingSession.Phase.PRE_OP,
            session_number=1,
        )
        self.assertEqual(RecordingSession.objects.count(), 1)
        self.patient.delete()
        self.assertEqual(RecordingSession.objects.count(), 0)

    def test_related_name(self):
        RecordingSession.objects.create(
            patient=self.patient,
            phase=RecordingSession.Phase.PRE_OP,
            session_number=1,
        )
        self.assertEqual(
            self.patient.sessions.filter(phase='PRE_OP').count(), 1
        )


class AudioFileModelTest(TestCase):
    """Tests for the AudioFile model."""

    def setUp(self):
        self.patient = Patient.objects.create(patient_id='AUDIO-001')
        self.session = RecordingSession.objects.create(
            patient=self.patient,
            phase=RecordingSession.Phase.PRE_OP,
            session_number=1,
        )

    def test_create_audio_file(self):
        audio = AudioFile.objects.create(
            patient=self.patient,
            exercise_id='a_n',
            phase=AudioFile.Phase.PRE_OP,
            storage_key='token/pre_1/a_n.webm',
            session=self.session,
        )
        self.assertEqual(audio.exercise_id, 'a_n')
        self.assertEqual(audio.phase, 'PRE_OP')
        self.assertEqual(audio.session, self.session)
        self.assertIsNotNone(audio.id)

    def test_audio_file_without_session(self):
        """Session is optional for backward compat."""
        audio = AudioFile.objects.create(
            patient=self.patient,
            exercise_id='a_n',
            phase=AudioFile.Phase.PRE_OP,
            storage_key='token/pre/a_n.webm',
        )
        self.assertIsNone(audio.session)

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


class PatientAuditLogModelTest(TestCase):
    """Tests for the PatientAuditLog model."""

    def test_create_audit_log(self):
        patient = Patient.objects.create(patient_id='AUDIT-001')
        log = PatientAuditLog.objects.create(
            patient=patient,
            event_type='create',
            event='Patient angelegt',
            actor='admin',
            actor_name='test-admin',
        )
        self.assertEqual(log.patient, patient)
        self.assertEqual(log.event_type, 'create')
        self.assertEqual(log.actor, 'admin')
        self.assertEqual(log.actor_name, 'test-admin')
        self.assertIsNotNone(log.id)

