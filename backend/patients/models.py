"""
Data models for the Recurrensparese Diagnose application.

Ported from the deprecated Next.js/Prisma schema. Key models:
- Patient: Core entity with demographics, diagnosis, AI predictions, and workflow status.
- AudioFile: Audio recordings linked to a patient, exercise, and phase (PRE_OP / POST_OP).
- Exercise: Voice exercise configuration (vowels, phrases) used for recordings.
"""
import uuid
from django.db import models


class Exercise(models.Model):
    """
    Voice exercise configuration.
    Defines the exercises patients must perform for audio recording.
    """
    exercise_id = models.CharField(
        max_length=50, unique=True,
        help_text='Unique exercise identifier, e.g. "a_n", "i_n", "phrase"'
    )
    title = models.CharField(max_length=100, help_text='Display title, e.g. "Vokal A"')
    description = models.TextField(help_text='Instructions for the patient')
    example_audio_url_female = models.CharField(
        max_length=500, blank=True, default='',
        help_text='Path to female example audio'
    )
    example_audio_url_male = models.CharField(
        max_length=500, blank=True, default='',
        help_text='Path to male example audio'
    )
    order = models.PositiveIntegerField(default=0, help_text='Display order')
    is_active = models.BooleanField(default=True, help_text='Whether this exercise is currently in use')

    class Meta:
        ordering = ['order']
        verbose_name = 'Übung'
        verbose_name_plural = 'Übungen'

    def __str__(self):
        return f'{self.title} ({self.exercise_id})'


class Patient(models.Model):
    """
    Core patient entity. The UUID primary key doubles as the patient access token.

    Workflow statuses:
        NEW → CONSENT_GIVEN → DEMOGRAPHICS_DONE → PRE_OP_DONE →
        POST_OP_STARTED → POST_OP_DONE → COMPLETED
    """

    class Status(models.TextChoices):
        NEW = 'NEW', 'Neu'
        CONSENT_GIVEN = 'CONSENT_GIVEN', 'Einwilligung erteilt'
        DEMOGRAPHICS_DONE = 'DEMOGRAPHICS_DONE', 'Demografie abgeschlossen'
        PRE_OP_DONE = 'PRE_OP_DONE', 'Prä-OP abgeschlossen'
        POST_OP_STARTED = 'POST_OP_STARTED', 'Post-OP begonnen'
        POST_OP_DONE = 'POST_OP_DONE', 'Post-OP abgeschlossen'
        COMPLETED = 'COMPLETED', 'Abgeschlossen'

    class Diagnosis(models.TextChoices):
        LEFT = 'LEFT', 'Links'
        RIGHT = 'RIGHT', 'Rechts'
        BOTH = 'BOTH', 'Beidseitig'
        HEALTHY = 'HEALTHY', 'Gesund'
        TODO = 'TODO', 'Ausstehend'

    class PredictionStatus(models.TextChoices):
        TODO = 'TODO', 'Ausstehend'
        INFECTED = 'INFECTED', 'Pathologisch'
        HEALTHY = 'HEALTHY', 'Gesund'

    class Gender(models.TextChoices):
        MALE = 'M', 'Männlich'
        FEMALE = 'W', 'Weiblich'
        DIVERSE = 'D', 'Divers'
        UNKNOWN = '?', 'Unbekannt'

    # Primary key is UUID — also serves as the patient access token
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Human-readable patient ID (e.g. assigned by the hospital)
    patient_id = models.CharField(
        max_length=100, unique=True,
        verbose_name='Patienten-ID',
        help_text='Lesbare Patienten-ID (z.B. vom Krankenhaus vergeben)'
    )

    # Workflow
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.NEW,
        verbose_name='Status'
    )

    # Demographics
    gender = models.CharField(
        max_length=1, choices=Gender.choices, default=Gender.UNKNOWN,
        verbose_name='Geschlecht'
    )
    birth_date = models.DateField(
        null=True, blank=True,
        verbose_name='Geburtsdatum'
    )

    # Operation dates
    pre_op_date = models.DateTimeField(
        null=True, blank=True,
        verbose_name='Prä-OP Datum'
    )
    post_op_date = models.DateTimeField(
        null=True, blank=True,
        verbose_name='Post-OP Datum'
    )

    # Diagnosis
    diagnosis = models.CharField(
        max_length=10, choices=Diagnosis.choices, default=Diagnosis.TODO,
        verbose_name='Diagnose'
    )
    diagnosis_text = models.TextField(
        blank=True, default='',
        verbose_name='Diagnose (Freitext)',
        help_text='Optionale zusätzliche Diagnose-Details'
    )

    # --- Pre-Op AI Results ---
    prediction_pre = models.CharField(
        max_length=10, choices=PredictionStatus.choices, default=PredictionStatus.TODO,
        verbose_name='KI-Vorhersage (Prä-OP)'
    )
    ai_percentage_rp_pre = models.FloatField(
        null=True, blank=True,
        verbose_name='KI Wahrscheinlichkeit Prä-OP (%)'
    )
    gradcam_prediction_pre = models.CharField(
        max_length=20, blank=True, default='',
        verbose_name='GradCAM Vorhersage (Prä-OP)'
    )
    gradcam_percentage_pre = models.FloatField(
        null=True, blank=True,
        verbose_name='GradCAM Wahrscheinlichkeit Prä-OP (%)'
    )
    ai_reasoning_pre = models.TextField(
        blank=True, default='',
        verbose_name='KI-Begründung (Prä-OP)'
    )

    # --- Post-Op AI Results ---
    prediction_post = models.CharField(
        max_length=10, choices=PredictionStatus.choices, default=PredictionStatus.TODO,
        verbose_name='KI-Vorhersage (Post-OP)'
    )
    ai_percentage_rp_post = models.FloatField(
        null=True, blank=True,
        verbose_name='KI Wahrscheinlichkeit Post-OP (%)'
    )
    gradcam_prediction_post = models.CharField(
        max_length=20, blank=True, default='',
        verbose_name='GradCAM Vorhersage (Post-OP)'
    )
    gradcam_percentage_post = models.FloatField(
        null=True, blank=True,
        verbose_name='GradCAM Wahrscheinlichkeit Post-OP (%)'
    )
    ai_reasoning_post = models.TextField(
        blank=True, default='',
        verbose_name='KI-Begründung (Post-OP)'
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Erstellt am')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Aktualisiert am')

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Patient'
        verbose_name_plural = 'Patienten'

    def __str__(self):
        return f'Patient {self.patient_id} ({self.get_status_display()})'

    @property
    def age(self):
        """Calculate patient age from birth date."""
        if not self.birth_date:
            return None
        from datetime import date
        today = date.today()
        age = today.year - self.birth_date.year
        if (today.month, today.day) < (self.birth_date.month, self.birth_date.day):
            age -= 1
        return age


class AudioFile(models.Model):
    """
    Audio recording linked to a patient and exercise.
    The actual file is stored in S3/MinIO; this model tracks the metadata.
    """

    class Phase(models.TextChoices):
        PRE_OP = 'PRE_OP', 'Prä-OP'
        POST_OP = 'POST_OP', 'Post-OP'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(
        Patient, on_delete=models.CASCADE, related_name='audio_files',
        verbose_name='Patient'
    )
    exercise_id = models.CharField(
        max_length=50,
        verbose_name='Übungs-ID',
        help_text='References Exercise.exercise_id'
    )
    phase = models.CharField(
        max_length=10, choices=Phase.choices, default=Phase.PRE_OP,
        verbose_name='Phase'
    )
    storage_key = models.CharField(
        max_length=500,
        verbose_name='Speicher-Schlüssel',
        help_text='S3/MinIO object key'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Erstellt am')

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Audiodatei'
        verbose_name_plural = 'Audiodateien'

    def __str__(self):
        return f'{self.get_phase_display()} - {self.exercise_id} ({self.patient.patient_id})'
