"""
Data models for the Recurrensparese Diagnose application.

Models:
- Center: Clinical center (Zentrum) for multi-tenant patient isolation.
- UserProfile: Extends Django's User with role and center assignment.
- Patient: Core entity with pseudonym, AI predictions, and workflow status.
- RecordingSession: Groups audio recordings for a single recording visit.
- AudioFile: Audio recordings linked to a patient, session, exercise, and phase.
- Exercise: Voice exercise configuration (vowels, phrases) used for recordings.
"""
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class Center(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200, unique=True, verbose_name='Zentrum')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Erstellt am')

    class Meta:
        ordering = ['name']
        verbose_name = 'Zentrum'
        verbose_name_plural = 'Zentren'

    def __str__(self):
        return self.name


class UserProfile(models.Model):
    class Role(models.TextChoices):
        SUPER_ADMIN = 'SUPER_ADMIN', 'Super Admin'
        CENTER_USER = 'CENTER_USER', 'Zentrum-Benutzer'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
        verbose_name='Benutzer',
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.SUPER_ADMIN,
        verbose_name='Rolle',
    )
    center = models.ForeignKey(
        Center,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
        verbose_name='Zentrum',
        help_text='Pflichtfeld für CENTER_USER; leer für SUPER_ADMIN',
    )

    class Meta:
        verbose_name = 'Benutzerprofil'
        verbose_name_plural = 'Benutzerprofile'

    def __str__(self):
        return f'{self.user.username} ({self.get_role_display()})'  # type: ignore[attr-defined]


class LoginHistory(models.Model):
    """Audit log of successful logins, recorded from CenterTokenObtainPairView."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='login_history',
        verbose_name='Benutzer',
    )
    ip_address = models.GenericIPAddressField(
        null=True, blank=True, verbose_name='IP-Adresse',
    )
    user_agent = models.CharField(
        max_length=500, blank=True, default='', verbose_name='User-Agent',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Zeitpunkt')

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Login-Verlauf'
        verbose_name_plural = 'Login-Verläufe'

    def __str__(self):
        return f'{self.user.username} @ {self.created_at:%Y-%m-%d %H:%M}'


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
        FAILED = 'FAILED', 'Fehlgeschlagen'

    # Primary key is UUID — also serves as the patient access token and offline linking key
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Pseudonym assigned by the clinic (no real patient identity stored here)
    patient_id = models.CharField(
        max_length=100, unique=True,
        verbose_name='Pseudonym',
        help_text='Pseudonym des Patienten (kein echter Name)'
    )

    # Center assignment (null = legacy patient with no center restriction)
    center = models.ForeignKey(
        Center,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='patients',
        verbose_name='Zentrum',
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

    @property
    def last_activity(self):
        """
        Returns the latest timestamp among:
        - patient.updated_at
        - patient's audio files created_at
        - patient's feedback entries updated_at / created_at
        - patient's exercise skips created_at
        """
        timestamps = [self.updated_at]

        if hasattr(self, '_prefetched_objects_cache') and 'audio_files' in self._prefetched_objects_cache:
            timestamps.extend(af.created_at for af in self.audio_files.all())
        else:
            timestamps.extend(self.audio_files.values_list('created_at', flat=True))

        if hasattr(self, '_prefetched_objects_cache') and 'feedback_entries' in self._prefetched_objects_cache:
            timestamps.extend(fe.updated_at for fe in self.feedback_entries.all())
        else:
            timestamps.extend(self.feedback_entries.values_list('updated_at', flat=True))

        if hasattr(self, '_prefetched_objects_cache') and 'exercise_skips' in self._prefetched_objects_cache:
            timestamps.extend(es.created_at for es in self.exercise_skips.all())
        else:
            timestamps.extend(self.exercise_skips.values_list('created_at', flat=True))

        valid_timestamps = [t for t in timestamps if t]
        return max(valid_timestamps) if valid_timestamps else self.updated_at


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


class PatientAuditLog(models.Model):
    """
    Append-only audit log for patient-level events.

    Records every meaningful action taken on or by a patient:
    - Administrative actions (create, edit, export, delete)
    - Patient-initiated uploads
    - System-generated events (expiry scheduling)

    This model is intentionally write-once: entries should never be
    updated or deleted (they are the authoritative audit trail).
    """

    class EventType(models.TextChoices):
        CREATE = 'create', 'Erstellt'
        UPLOAD = 'upload', 'Upload'
        DELETE = 'delete', 'Löschung'
        EXPORT = 'export', 'Export'
        EDIT = 'edit', 'Bearbeitet'
        EXPIRY = 'expiry', 'Ablauf'
        VIEW = 'view', 'Zugriff'

    class Actor(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        PATIENT = 'patient', 'Patient'
        SYSTEM = 'system', 'System'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name='audit_logs',
        verbose_name='Patient',
    )

    event_type = models.CharField(
        max_length=20,
        choices=EventType.choices,
        verbose_name='Ereignistyp',
    )

    # German display label shown in the timeline
    event = models.CharField(
        max_length=200,
        verbose_name='Ereignis',
        help_text='Short German label shown in the UI timeline',
    )

    # Optional sub-text / description shown below the event label
    detail = models.CharField(
        max_length=500,
        blank=True,
        default='',
        verbose_name='Details',
    )

    # List of affected file names (exercise labels for uploads/deletes)
    files = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Betroffene Dateien',
        help_text='List of file name strings, e.g. ["Aufnahme 1 [A_N]", "Aufnahme 2 [I_H]"]',
    )

    actor = models.CharField(
        max_length=10,
        choices=Actor.choices,
        verbose_name='Akteur',
    )

    actor_name = models.CharField(
        max_length=200,
        verbose_name='Akteur-Name',
        help_text='Username, patient pseudonym, or "System"',
    )

    # Immutable creation timestamp — never use auto_now
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Zeitpunkt',
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Audit-Eintrag'
        verbose_name_plural = 'Audit-Einträge'
        indexes = [
            models.Index(fields=['patient', '-created_at']),
        ]

    def __str__(self):
        return f'{self.get_event_type_display()} — {self.patient.patient_id} @ {self.created_at:%Y-%m-%d %H:%M}'

