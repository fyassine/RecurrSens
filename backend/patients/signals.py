"""
Django signals for the patients app.

Automatically writes PatientAuditLog entries for:
  - Patient creation            → 'create' event
  - AudioFile creation (upload) → 'upload' event
  - AudioFile deletion          → 'delete' event

Export and edit events are written explicitly in the relevant view/serializer
code because they carry richer context (actor username, changed fields, etc.)
that signals cannot easily access.
"""

import contextlib
import logging
from contextvars import ContextVar

from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver

from .models import AudioFile, Patient, PatientAuditLog

logger = logging.getLogger(__name__)

# Why the AudioFile currently being deleted is going away. The pre_delete signal
# cannot see the caller, and every deletion used to be logged as "manually
# removed by admin" — which misattributed both automatic purges and a patient
# re-recording an exercise to a human administrator. Callers declare intent via
# `deletion_reason(...)`; anything undeclared is a genuine admin action.
_deletion_reason: ContextVar[str] = ContextVar('deletion_reason', default='admin')

DELETION_LABELS = {
    'admin': ('1 {phase} Aufnahme manuell entfernt', PatientAuditLog.Actor.ADMIN, 'admin'),
    'rerecord': (
        '1 {phase} Aufnahme durch neue Aufnahme ersetzt',
        PatientAuditLog.Actor.PATIENT,
        'Patient (Neuaufnahme)',
    ),
    'retention': (
        '1 {phase} Aufnahme automatisch gelöscht (Ablauffrist)',
        PatientAuditLog.Actor.SYSTEM,
        'System (Ablauffrist)',
    ),
}


@contextlib.contextmanager
def deletion_reason(reason: str):
    """Declare why audio is being deleted, so the audit entry attributes it correctly."""
    token = _deletion_reason.set(reason)
    try:
        yield
    finally:
        _deletion_reason.reset(token)


# ---------------------------------------------------------------------------
# Patient creation
# ---------------------------------------------------------------------------


@receiver(post_save, sender=Patient)
def log_patient_create(sender, instance: Patient, created: bool, **kwargs):
    """Write a 'create' audit entry when a new patient is first saved."""
    if not created:
        return
    try:
        PatientAuditLog.objects.create(
            patient=instance,
            event_type=PatientAuditLog.EventType.CREATE,
            event='Patient angelegt',
            detail='Neuer Patienteneintrag erstellt',
            files=[],
            actor=PatientAuditLog.Actor.ADMIN,
            actor_name='admin',  # actor resolved from request context where possible
        )
        # Also write the scheduled-expiry system event immediately
        PatientAuditLog.objects.create(
            patient=instance,
            event_type=PatientAuditLog.EventType.EXPIRY,
            event='Automatische Ablaufmarkierung geplant',
            detail=(
                f'Datensatz zum Löschen vorgemerkt '
                f'(Ablauf: {instance.expires_at.strftime("%d.%m.%Y")})'
            ),
            files=[],
            actor=PatientAuditLog.Actor.SYSTEM,
            actor_name='System',
        )
    except Exception:
        # Audit log failures must never break the primary save path
        logger.exception('Failed to write create audit log for patient %s', instance.patient_id)


# ---------------------------------------------------------------------------
# Audio file upload
# ---------------------------------------------------------------------------


@receiver(post_save, sender=AudioFile)
def log_audio_upload(sender, instance: AudioFile, created: bool, **kwargs):
    """Write an 'upload' audit entry whenever a new audio file is created."""
    if not created:
        return
    try:
        phase_label = 'Prä-OP' if instance.phase == 'PRE_OP' else 'Post-OP'
        exercise_label = instance.exercise_id.upper() if instance.exercise_id else ''
        file_name = f'Aufnahme [{exercise_label}]' if exercise_label else 'Aufnahme'

        PatientAuditLog.objects.create(
            patient=instance.patient,
            event_type=PatientAuditLog.EventType.UPLOAD,
            event=f'{phase_label} Aufnahme hochgeladen',
            detail=f'1 Aufnahme hinzugefügt — {phase_label} Sektion',
            files=[file_name],
            actor=PatientAuditLog.Actor.PATIENT,
            actor_name=f'{instance.patient.patient_id} (Patient)',
        )
    except Exception:
        logger.exception('Failed to write upload audit log for audio file %s', instance.id)


# ---------------------------------------------------------------------------
# Audio file deletion
# ---------------------------------------------------------------------------


@receiver(pre_delete, sender=AudioFile)
def log_audio_delete(sender, instance: AudioFile, **kwargs):
    """Write a 'delete' audit entry just before an audio file is removed."""
    try:
        phase_label = 'Prä-OP' if instance.phase == 'PRE_OP' else 'Post-OP'
        exercise_label = instance.exercise_id.upper() if instance.exercise_id else ''
        # Derive a human-friendly storage filename from the key
        storage_file = instance.storage_key.rsplit('/', 1)[-1] if instance.storage_key else ''
        file_name = storage_file or (
            f'{exercise_label.lower()}.audio' if exercise_label else 'Aufnahme'
        )

        reason = _deletion_reason.get()
        detail_tpl, actor, actor_name = DELETION_LABELS.get(reason, DELETION_LABELS['admin'])

        PatientAuditLog.objects.create(
            patient=instance.patient,
            event_type=PatientAuditLog.EventType.DELETE,
            event='Aufnahme gelöscht',
            detail=detail_tpl.format(phase=phase_label),
            files=[file_name],
            actor=actor,
            actor_name=actor_name,
        )
    except Exception:
        logger.exception('Failed to write delete audit log for audio file %s', instance.id)
