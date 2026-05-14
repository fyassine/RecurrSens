"""
Data models for the Recurrensparese Diagnose application.

Models:
- Patient: Core entity with pseudonym, AI predictions, and workflow status.
- RecordingSession: Groups audio recordings for a single recording visit.
- AudioFile: Audio recordings linked to a patient, session, exercise, and phase.
- Exercise: Voice exercise configuration (vowels, phrases) used for recordings.
"""
import uuid
from datetime import timedelta
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from django.conf import settings


class Exercise(models.Model):
    """
    Voice exercise configuration.
    Defines the exercises patients must perform for audio recording.
    """
    exercise_id = models.CharField(
        max_length=50, unique=True,
        help_text='Unique exercise identifier, e.g. "a_n", "i_h", "phrase"'
    )
    title = models.CharField(max_length=100, help_text='Display title, e.g. "Vokal A"')
    description = models.TextField(help_text='Instructions for the patient')
    example_audio_url = models.CharField(
        max_length=500, blank=True, default='',
        help_text='Path to example audio file'
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
    Core patient entity. The UUID primary key doubles as the patient access token
    and as the linking key for the offline server.

    Only voice samples and a pseudonym (patient_id) are stored — no demographics.

    Workflow statuses:
        NEW → CONSENT_GIVEN → PRE_OP_DONE →
        POST_OP_STARTED → POST_OP_DONE
    """

    class Status(models.TextChoices):
        NEW = 'NEW', 'Neu'
        CONSENT_GIVEN = 'CONSENT_GIVEN', 'Einwilligung erteilt'
        PRE_OP_DONE = 'PRE_OP_DONE', 'Prä-OP abgeschlossen'
        POST_OP_STARTED = 'POST_OP_STARTED', 'Post-OP begonnen'
        POST_OP_DONE = 'POST_OP_DONE', 'Post-OP abgeschlossen'

    class PredictionStatus(models.TextChoices):
        TODO = 'TODO', 'Ausstehend'
        INFECTED = 'INFECTED', 'Pathologisch'
        HEALTHY = 'HEALTHY', 'Gesund'

    # Primary key is UUID — also serves as the patient access token and offline linking key
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Pseudonym assigned by the clinic (no real patient identity stored here)
    patient_id = models.CharField(
        max_length=100, unique=True,
        verbose_name='Pseudonym',
        help_text='Pseudonym des Patienten (kein echter Name)'
    )

    # Workflow
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.NEW,
        verbose_name='Status'
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

    # Data retention
    expires_at = models.DateTimeField(
        verbose_name='Läuft ab am',
        help_text='Datum, ab dem der Datensatz gelöscht werden soll'
    )
    notification_sent_at = models.DateTimeField(
        null=True, blank=True,
        verbose_name='Benachrichtigung gesendet am',
        help_text='Zeitpunkt, zu dem die Ablauf-Benachrichtigung versendet wurde'
    )

    # Soft delete
    deleted_at = models.DateTimeField(
        null=True, blank=True,
        verbose_name='Gelöscht am',
        help_text='Zeitpunkt der Soft-Löschung (Audiodaten entfernt, Metadaten bleiben)'
    )

    # Download tracking (used as deletion gate)
    last_exported_at = models.DateTimeField(
        null=True, blank=True,
        verbose_name='Zuletzt exportiert am',
        help_text='Zeitpunkt des letzten ZIP-Exports; Pflichtbedingung für automatische Löschung'
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Patient'
        verbose_name_plural = 'Patienten'

    def __str__(self):
        return f'Patient {self.patient_id} ({self.get_status_display()})'

    def save(self, *args, **kwargs):
        if not self.expires_at:
            retention_days = getattr(settings, 'DATA_RETENTION_DAYS', 7)
            self.expires_at = timezone.now() + timedelta(days=retention_days)
        super().save(*args, **kwargs)

    @property
    def is_expiring_soon(self) -> bool:
        """True if expires within the next 24 hours."""
        return self.expires_at <= timezone.now() + timedelta(hours=24)

    @property
    def is_deleted(self) -> bool:
        """True if this patient has been soft-deleted."""
        return self.deleted_at is not None

    @property
    def has_been_downloaded(self) -> bool:
        """True if audio data was exported at least once."""
        return self.last_exported_at is not None


class RecordingSession(models.Model):
    """
    Groups audio recordings for a single recording visit.
    Each recording session belongs to a patient and phase, with a sequential number.
    Admin creates sessions and sends recording links to patients.
    """

    class Phase(models.TextChoices):
        PRE_OP = 'PRE_OP', 'Prä-OP'
        POST_OP = 'POST_OP', 'Post-OP'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(
        Patient, on_delete=models.CASCADE, related_name='sessions',
        verbose_name='Patient'
    )
    phase = models.CharField(
        max_length=10, choices=Phase.choices,
        verbose_name='Phase'
    )
    session_number = models.PositiveIntegerField(
        verbose_name='Sitzungsnummer',
        help_text='Sequential number per patient and phase (1, 2, 3, …)'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Erstellt am')

    class Meta:
        ordering = ['created_at']
        unique_together = [('patient', 'phase', 'session_number')]
        verbose_name = 'Aufnahmesitzung'
        verbose_name_plural = 'Aufnahmesitzungen'

    def __str__(self):
        return (
            f'{self.get_phase_display()} Sitzung {self.session_number} '
            f'({self.patient.patient_id})'
        )


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
    session = models.ForeignKey(
        RecordingSession, on_delete=models.CASCADE, related_name='audio_files',
        verbose_name='Aufnahmesitzung',
        null=True, blank=True,
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


class PatientFeedback(models.Model):
    """Patient feedback per phase (optional rating/comment, skippable)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(
        Patient, on_delete=models.CASCADE, related_name='feedback_entries',
        verbose_name='Patient'
    )
    phase = models.CharField(
        max_length=10, choices=RecordingSession.Phase.choices,
        verbose_name='Phase'
    )
    rating = models.PositiveSmallIntegerField(
        null=True, blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        verbose_name='Bewertung (1-5)'
    )
    comment = models.TextField(blank=True, default='', verbose_name='Kommentar')
    skipped = models.BooleanField(default=False, verbose_name='Übersprungen')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Erstellt am')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Aktualisiert am')

    class Meta:
        unique_together = [('patient', 'phase')]
        ordering = ['-created_at']
        verbose_name = 'Feedback'
        verbose_name_plural = 'Feedback'

    def __str__(self):
        return f'Feedback {self.get_phase_display()} ({self.patient.patient_id})'


class ExerciseSkip(models.Model):
    """Tracks skipped exercises per patient, scoped to a recording session."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(
        Patient, on_delete=models.CASCADE, related_name='exercise_skips',
        verbose_name='Patient'
    )
    session = models.ForeignKey(
        RecordingSession, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='exercise_skips',
        verbose_name='Sitzung',
    )
    phase = models.CharField(
        max_length=10, choices=RecordingSession.Phase.choices,
        verbose_name='Phase',
        help_text='Kept for backward compat and admin display; uniqueness enforced via session.'
    )
    exercise_id = models.CharField(
        max_length=50,
        verbose_name='Übungs-ID',
        help_text='References Exercise.exercise_id'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Erstellt am')

    class Meta:
        unique_together = [('patient', 'session', 'exercise_id')]
        ordering = ['-created_at']
        verbose_name = 'Übung übersprungen'
        verbose_name_plural = 'Übungen übersprungen'

    def __str__(self):
        return (
            f'{self.get_phase_display()} - {self.exercise_id} '
            f'({self.patient.patient_id})'
        )
