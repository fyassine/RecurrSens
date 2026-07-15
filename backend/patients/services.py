"""
Business logic services for the patients app.

Ported from the deprecated Next.js app (lib/api.ts):
- advance_patient_step: Workflow state machine
- check_completeness: Validates all required data is present
- generate_patient_pdf: QR code PDF generation
- export_patients_data: CSV + audio ZIP export
"""
import base64
import csv
import io
import logging
import os
import zipfile
from datetime import date, datetime
from pathlib import Path

import boto3
import boto3.session
import qrcode
from botocore.config import Config as BotocoreConfig
from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.core import signing
from django.template.loader import render_to_string
from django.utils import timezone
from user_agents import parse as parse_ua
from weasyprint import HTML

from .models import Exercise, LoginHistory, Patient, RecordingSession
from .permissions import _get_center, _get_role

logger = logging.getLogger(__name__)


def get_s3_client():
    """Create and return a boto3 S3 client configured for MinIO/S3."""
    return boto3.client(
        's3',
        region_name=settings.S3_REGION,
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        config=BotocoreConfig(s3={'addressing_style': 'path'}),
    )


def generate_presigned_upload_url(key: str, content_type: str = 'audio/webm', expires_in: int = 3600) -> str:
    """
    Generate a pre-signed URL for direct client upload to S3/MinIO.
    The client can PUT a file directly to this URL without going through Django.
    """
    s3 = get_s3_client()
    # Ensure bucket exists
    try:
        s3.head_bucket(Bucket=settings.S3_BUCKET)
    except Exception:
        try:
            s3.create_bucket(Bucket=settings.S3_BUCKET)
        except Exception:
            pass  # Bucket may already exist

    url = s3.generate_presigned_url(
        'put_object',
        Params={
            'Bucket': settings.S3_BUCKET,
            'Key': key,
            'ContentType': content_type,
        },
        ExpiresIn=expires_in,
    )
    return url


def generate_presigned_download_url(key: str, expires_in: int = 3600) -> str:
    """Generate a pre-signed URL for downloading a file from S3/MinIO."""
    s3 = get_s3_client()
    return s3.generate_presigned_url(
        'get_object',
        Params={
            'Bucket': settings.S3_BUCKET,
            'Key': key,
        },
        ExpiresIn=expires_in,
    )


def upload_audio_to_s3(file_data: bytes, key: str, content_type: str = 'audio/webm') -> None:
    """Upload audio file data directly to S3/MinIO (server-side upload fallback)."""
    s3 = get_s3_client()
    # Ensure bucket exists
    try:
        s3.head_bucket(Bucket=settings.S3_BUCKET)
    except Exception:
        try:
            s3.create_bucket(Bucket=settings.S3_BUCKET)
        except Exception:
            pass

    s3.put_object(
        Bucket=settings.S3_BUCKET,
        Key=key,
        Body=file_data,
        ContentType=content_type,
    )


def delete_audio_from_s3(key: str) -> None:
    """Delete an audio file from S3/MinIO."""
    s3 = get_s3_client()
    try:
        s3.delete_object(Bucket=settings.S3_BUCKET, Key=key)
    except Exception as e:
        logger.error(f'Failed to delete S3 file {key}: {e}')


def move_audio_in_s3(old_key: str, new_key: str) -> bool:
    """
    Move (copy + delete) an audio file within S3/MinIO.

    Copies the object from *old_key* to *new_key* inside the same bucket,
    then deletes the source.  Returns True on success, False if the copy
    failed (the source object is left untouched in that case so no data is
    lost).
    """
    if old_key == new_key:
        return True  # Nothing to do

    s3 = get_s3_client()
    try:
        s3.copy_object(
            Bucket=settings.S3_BUCKET,
            CopySource={'Bucket': settings.S3_BUCKET, 'Key': old_key},
            Key=new_key,
        )
    except Exception as e:
        logger.error(f'Failed to copy S3 file {old_key} → {new_key}: {e}')
        return False

    # Source copied successfully — remove old object
    try:
        s3.delete_object(Bucket=settings.S3_BUCKET, Key=old_key)
    except Exception as e:
        # Non-fatal: the copy succeeded, only cleanup failed
        logger.warning(f'Failed to delete old S3 file {old_key} after copy: {e}')

    return True


def get_audio_from_s3(key: str) -> bytes | None:
    """Download audio file data from S3/MinIO."""
    s3 = get_s3_client()
    try:
        response = s3.get_object(Bucket=settings.S3_BUCKET, Key=key)
        return response['Body'].read()
    except Exception as e:
        logger.error(f'Failed to get S3 file {key}: {e}')
        return None


def audio_object_exists(key: str) -> bool:
    """Return True if an object exists at *key* in the bucket (HEAD request)."""
    s3 = get_s3_client()
    try:
        s3.head_object(Bucket=settings.S3_BUCKET, Key=key)
        return True
    except Exception:
        return False


# =============================================================================
# Signed audio-stream tokens
# =============================================================================
#
# Native <audio> elements cannot send an Authorization header, so the streaming
# proxy (AudioStreamView) cannot rely on JWT. Instead, an authenticated,
# center-scoped endpoint mints a short-lived signed token that the proxy
# validates. The signature proves an authorised party requested the URL and the
# embedded timestamp bounds its lifetime.

_AUDIO_STREAM_SALT = 'patients.audio-stream'
AUDIO_STREAM_TOKEN_MAX_AGE = 300  # seconds (5 minutes)


def sign_audio_stream_token(file_id) -> str:
    """Return a short-lived signed token authorising streaming of one audio file."""
    return signing.dumps(str(file_id), salt=_AUDIO_STREAM_SALT)


def verify_audio_stream_token(file_id, token: str) -> bool:
    """Validate a stream token against a file id, enforcing the max-age expiry."""
    if not token:
        return False
    try:
        value = signing.loads(
            token, salt=_AUDIO_STREAM_SALT, max_age=AUDIO_STREAM_TOKEN_MAX_AGE
        )
    except signing.BadSignature:
        return False
    return value == str(file_id)


# =============================================================================
# Patient Creation
# =============================================================================

def generate_next_patient_id() -> str | None:
    """
    Suggest the next patient_id by incrementing the most recently created
    patient's ID, if that ID is a zero-padded numeric string (e.g. "0020").
    Preserves the zero-padded width. Returns None if there are no patients
    yet or the last patient_id isn't numeric — caller must then ask the user
    to choose an ID manually.
    """
    last_patient = Patient.objects.first()  # default ordering: -created_at
    if not last_patient or not last_patient.patient_id.isdigit():
        return None
    width = len(last_patient.patient_id)
    candidate = int(last_patient.patient_id) + 1
    while Patient.objects.filter(patient_id=str(candidate).zfill(width)).exists():
        candidate += 1
    return str(candidate).zfill(width)


# =============================================================================
# Workflow State Machine
# =============================================================================

# Valid status transitions (CONSENT_GIVEN kept for backward compat but not used in new flow)
STATUS_TRANSITIONS = {
    Patient.Status.NEW: Patient.Status.CONSENT_GIVEN,
    Patient.Status.CONSENT_GIVEN: Patient.Status.PRE_OP_DONE,
    Patient.Status.PRE_OP_DONE: Patient.Status.POST_OP_STARTED,
    Patient.Status.POST_OP_STARTED: Patient.Status.POST_OP_DONE,
}


# =============================================================================
# Recording Session Management
# =============================================================================

def create_recording_session(patient: Patient, phase: str) -> RecordingSession:
    """
    Create a new recording session for a patient.
    Auto-increments session_number per patient and phase.
    """
    last_session = (
        RecordingSession.objects
        .filter(patient=patient, phase=phase)
        .order_by('-session_number')
        .first()
    )
    next_number = (last_session.session_number + 1) if last_session else 1

    session = RecordingSession.objects.create(
        patient=patient,
        phase=phase,
        session_number=next_number,
    )
    logger.info(
        f'Created {phase} session {next_number} for patient {patient.id}'
    )
    # TODO: Send email notification with QR code / recording link to patient
    # Requires SMTP configuration. See tasks.py send_session_email() stub.
    return session


def get_active_session(patient: Patient, phase: str) -> RecordingSession | None:
    """
    Get the latest recording session for a patient and phase.
    This is the session that audio uploads will be assigned to.
    """
    return (
        RecordingSession.objects
        .filter(patient=patient, phase=phase)
        .order_by('-session_number')
        .first()
    )


def advance_patient_step(patient: Patient) -> Patient:
    """
    Advance a patient to the next workflow step.

    State machine:
        NEW → CONSENT_GIVEN → PRE_OP_DONE →
        POST_OP_STARTED → POST_OP_DONE

    In the new flow, NEW → CONSENT_GIVEN is triggered by the landing page
    (Start button), and CONSENT_GIVEN → PRE_OP_DONE happens when recordings
    are complete. A PRE_OP recording session is auto-created on the first advance.

    Side effects:
        - Creates first PRE_OP session when advancing from NEW
        - Sets pre_op_date when advancing to PRE_OP_DONE
        - Sets post_op_date when advancing to POST_OP_DONE
        - Triggers inference tasks on PRE_OP_DONE and POST_OP_DONE

    Returns the updated patient instance.
    Raises ValueError if the transition is invalid.
    """
    current = patient.status
    next_status = STATUS_TRANSITIONS.get(current)

    if not next_status:
        raise ValueError(
            f'Patient "{patient.patient_id}" kann nicht weiter voranschreiten. '
            f'Aktueller Status: {patient.get_status_display()}'
        )

    # Apply transition
    patient.status = next_status

    # Set operation dates
    if next_status == Patient.Status.PRE_OP_DONE:
        patient.pre_op_date = timezone.now()
    elif next_status == Patient.Status.POST_OP_DONE:
        patient.post_op_date = timezone.now()

    patient.save()

    # Log status change in PatientAuditLog
    try:
        from .models import PatientAuditLog
        status_labels = {
            'NEW': 'Neu',
            'CONSENT_GIVEN': 'Einwilligung erteilt',
            'PRE_OP_DONE': 'Prä-OP abgeschlossen',
            'POST_OP_STARTED': 'Post-OP begonnen',
            'POST_OP_DONE': 'Post-OP abgeschlossen',
        }
        old_label = status_labels.get(current, current)
        new_label = status_labels.get(next_status, next_status)
        PatientAuditLog.objects.create(
            patient=patient,
            event_type=PatientAuditLog.EventType.EDIT,
            event='Status geändert',
            detail=f'{old_label} → {new_label}',
            files=[],
            actor=PatientAuditLog.Actor.PATIENT,
            actor_name=f'{patient.patient_id} (Patient)',
        )
    except Exception:
        logger.exception('Failed to write advance audit log for patient %s', patient.id)

    # Auto-create first PRE_OP session when patient starts.
    # get_or_create is race-safe: the unique_together (patient, phase,
    # session_number) constraint prevents duplicate sessions under concurrent
    # /advance/ requests.
    if next_status == Patient.Status.CONSENT_GIVEN:
        RecordingSession.objects.get_or_create(
            patient=patient,
            phase=RecordingSession.Phase.PRE_OP,
            session_number=1,
        )

    # Trigger async inference tasks
    if next_status in (Patient.Status.PRE_OP_DONE, Patient.Status.POST_OP_DONE):
        try:
            from .tasks import run_inference_task
            phase = 'PRE_OP' if next_status == Patient.Status.PRE_OP_DONE else 'POST_OP'
            run_inference_task.delay(str(patient.id), phase)
        except Exception as e:
            logger.error(f'Failed to trigger inference for patient {patient.id}: {e}')

    logger.info(
        f'Patient {patient.id} advanced from {current} to {next_status}'
    )
    return patient


def init_post_op_patient(patient: Patient) -> Patient:
    """
    Initialise a newly created patient directly as post-operative.

    Used when a patient presents for their first visit after surgery and has no
    pre-operative recordings.  The function:
        - Sets status to POST_OP_STARTED
        - Records post_op_date as now()
        - Creates the first POST_OP recording session

    Returns the updated patient instance.
    """
    now = timezone.now()
    patient.status = Patient.Status.POST_OP_STARTED
    # Set pre_op_date alongside post_op_date so downstream timelines/reports
    # don't see a null pre-op timestamp when pre-op is skipped.
    if patient.pre_op_date is None:
        patient.pre_op_date = now
    patient.post_op_date = now
    patient.save(update_fields=['status', 'pre_op_date', 'post_op_date', 'updated_at'])

    create_recording_session(patient, RecordingSession.Phase.POST_OP)

    logger.info(
        f'Patient {patient.id} initialised directly as POST_OP_STARTED'
    )
    return patient


# =============================================================================
# Completeness Check
# =============================================================================

def check_completeness(patient: Patient) -> dict:
    """
    Check whether a patient has all required data to close the case.

    Returns:
        {
            'complete': bool,
            'missing': list[str],    # required fields that block completion
            'warnings': list[str],   # optional fields that are missing (non-blocking)
        }
    """
    missing = []
    warnings = []

    # Required pseudonym
    if not patient.patient_id or not patient.patient_id.strip():
        missing.append('patientId')

    # Required audio files
    active_exercises = Exercise.objects.filter(is_active=True)
    exercise_ids = list(active_exercises.values_list('exercise_id', flat=True))

    pre_files = patient.audio_files.filter(phase='PRE_OP')
    post_files = patient.audio_files.filter(phase='POST_OP')

    skipped_pre = patient.exercise_skips.filter(phase='PRE_OP')
    skipped_post = patient.exercise_skips.filter(phase='POST_OP')

    pre_exercise_ids = set(pre_files.values_list('exercise_id', flat=True))
    post_exercise_ids = set(post_files.values_list('exercise_id', flat=True))

    skipped_pre_ids = set(skipped_pre.values_list('exercise_id', flat=True))
    skipped_post_ids = set(skipped_post.values_list('exercise_id', flat=True))

    pre_done_ids = pre_exercise_ids | skipped_pre_ids
    post_done_ids = post_exercise_ids | skipped_post_ids

    missing_pre = [eid for eid in exercise_ids if eid not in pre_done_ids]
    if missing_pre:
        missing.append(f'preOpAudio:{",".join(missing_pre)}')

    missing_post = [eid for eid in exercise_ids if eid not in post_done_ids]
    if missing_post:
        missing.append(f'postOpAudio:{",".join(missing_post)}')

    # Warnings for AI results (non-blocking)
    if patient.prediction_pre == Patient.PredictionStatus.TODO:
        warnings.append('aiPreMissing')
    if patient.prediction_post == Patient.PredictionStatus.TODO:
        warnings.append('aiPostMissing')

    return {
        'complete': len(missing) == 0,
        'missing': missing,
        'warnings': warnings,
    }


# =============================================================================
# PDF Generation
# =============================================================================

_LOGO_PATH = Path(__file__).resolve().parent / 'assets' / 'mri_tum_logo.png'


def _file_to_data_uri(path: Path, mime: str) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode('ascii')
    return f'data:{mime};base64,{encoded}'


def generate_patient_pdf(patient: Patient) -> bytes:
    """
    Generate a letterhead-branded PDF invite with a QR code for the patient.
    The QR code encodes the patient access URL: {APP_URL}/p/{token}

    Returns PDF as bytes.
    """
    patient_url = f'{settings.APP_URL}/p/{patient.id}'

    # Generate QR code image
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(patient_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color='black', back_color='white')

    qr_buffer = io.BytesIO()
    qr_img.save(qr_buffer, format='PNG')
    qr_data_uri = f'data:image/png;base64,{base64.b64encode(qr_buffer.getvalue()).decode("ascii")}'

    app_url = settings.APP_URL.rstrip('/')
    html = render_to_string('patients/patient_invite.html', {
        'logo_data_uri': _file_to_data_uri(_LOGO_PATH, 'image/png'),
        'qr_data_uri': qr_data_uri,
        'patient_id': patient.patient_id,
        'access_code_formatted': patient.access_code_formatted,
        'fallback_url': f'{app_url}/code',
        'app_url': app_url,
        'created_at': datetime.now().strftime('%d.%m.%Y %H:%M'),
    })

    return HTML(string=html).write_pdf()


# =============================================================================
# Data Export
# =============================================================================

def _format_date(dt) -> str:
    """Format a date/datetime for CSV export."""
    if not dt:
        return ''
    if isinstance(dt, datetime):
        return dt.strftime('%Y-%m-%d')
    if isinstance(dt, date):
        return dt.strftime('%Y-%m-%d')
    return ''


def export_patients_zip(patient_ids: list | None = None) -> bytes:
    """
    Export patients as a ZIP containing:
    - metadata.csv: One row per patient with patient-level metadata
    - {patient_id}/prae_op/: Pre-op audio files
    - {patient_id}/post_op_{n}/: Post-op audio files per session

    Args:
        patient_ids: Optional list of UUID strings. When provided, exports those
                     specific patients (any status, non-deleted). When None,
                     exports all non-deleted patients regardless of status.

    Returns ZIP file as bytes.
    """
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        if patient_ids is not None:
            patients = Patient.objects.filter(
                id__in=patient_ids,
                deleted_at__isnull=True,
            ).prefetch_related('audio_files__session', 'sessions')
        else:
            patients = Patient.objects.filter(
                deleted_at__isnull=True,
            ).prefetch_related('audio_files__session', 'sessions')

        # Build metadata CSV (one row per patient)
        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow([
            'PatientenID', 'Status', 'PraeOP_Datum', 'PostOP_Datum',
            'Anzahl_PraeOP_Aufnahmen', 'Anzahl_PostOP_Aufnahmen',
            'Erstellt_am',
        ])

        s3 = get_s3_client()
        export_time = timezone.now()
        fetch_errors: list[str] = []

        for patient in patients:
            audio_files = list(patient.audio_files.all())
            pre_count = sum(1 for f in audio_files if f.phase == 'PRE_OP')
            post_count = sum(1 for f in audio_files if f.phase == 'POST_OP')
            writer.writerow([
                patient.patient_id,
                patient.get_status_display(),
                _format_date(patient.pre_op_date),
                _format_date(patient.post_op_date),
                pre_count,
                post_count,
                _format_date(patient.created_at),
            ])

            # Add audio files under per-patient directories
            for audio_file in audio_files:
                _, ext = os.path.splitext(audio_file.storage_key)
                if audio_file.phase == 'PRE_OP':
                    subdir = 'prae_op'
                elif audio_file.session_id is not None:
                    subdir = f'post_op_{audio_file.session.session_number}'
                else:
                    subdir = 'post_op'
                zip_path = f'{patient.patient_id}/{subdir}/{audio_file.exercise_id}{ext}'
                try:
                    response = s3.get_object(
                        Bucket=settings.S3_BUCKET,
                        Key=audio_file.storage_key,
                    )
                    zf.writestr(zip_path, response['Body'].read())
                except Exception as e:
                    msg = f'ERROR: {audio_file.storage_key} → {e}'
                    logger.error(
                        f'Failed to fetch audio {audio_file.storage_key} '
                        f'for patient {patient.patient_id}: {e}'
                    )
                    fetch_errors.append(msg)

            patient.last_exported_at = export_time
            patient.save(update_fields=['last_exported_at'])

        zf.writestr('metadata.csv', csv_buffer.getvalue())
        if fetch_errors:
            zf.writestr('errors.txt', '\n'.join(fetch_errors))

    zip_buffer.seek(0)
    return zip_buffer.read()


# =============================================================================
# Delete Patient (with S3 cleanup)
# =============================================================================

def delete_patient_with_files(patient: Patient) -> None:
    """
    Soft-delete a patient: remove audio data but keep metadata.

    1. Delete audio files from S3/MinIO
    2. Delete AudioFile records from DB
    3. Clear AI prediction fields
    4. Set deleted_at timestamp
    5. Keep: patient_id, timestamps, session metadata
    """
    # Delete audio files from S3
    for audio_file in patient.audio_files.all():
        delete_audio_from_s3(audio_file.storage_key)

    # Delete AudioFile DB records
    patient.audio_files.all().delete()

    # Clear AI prediction fields
    patient.prediction_pre = Patient.PredictionStatus.TODO
    patient.ai_percentage_rp_pre = None
    patient.gradcam_prediction_pre = ''
    patient.gradcam_percentage_pre = None
    patient.ai_reasoning_pre = ''
    patient.prediction_post = Patient.PredictionStatus.TODO
    patient.ai_percentage_rp_post = None
    patient.gradcam_prediction_post = ''
    patient.gradcam_percentage_post = None
    patient.ai_reasoning_post = ''

    # Mark as soft-deleted
    patient.deleted_at = timezone.now()
    patient.save()

    logger.info(
        f'Soft-deleted patient {patient.patient_id}: '
        f'audio files removed, metadata preserved'
    )


# =============================================================================
# Authentication / Login History
# =============================================================================

USER_AGENT_MAX_LENGTH = 500  # must match LoginHistory.user_agent max_length


def get_client_ip(request) -> str | None:
    """Return the client's IP, preferring X-Forwarded-For (set by nginx)."""
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def parse_user_agent(ua_string: str) -> dict:
    """Parse a raw User-Agent string into structured browser/OS/device info."""
    if not ua_string:
        return {
            'browser': None,
            'browser_version': None,
            'os': None,
            'os_version': None,
            'device_type': 'Unbekannt',
            'device_family': None,
        }
    ua = parse_ua(ua_string)
    if ua.is_mobile:
        device_type = 'Mobil'
    elif ua.is_tablet:
        device_type = 'Tablet'
    elif ua.is_pc:
        device_type = 'Desktop'
    else:
        device_type = 'Unbekannt'
    return {
        'browser': ua.browser.family,
        'browser_version': ua.browser.version_string,
        'os': ua.os.family,
        'os_version': ua.os.version_string,
        'device_type': device_type,
        'device_family': ua.device.family,
    }


def record_login(user, request) -> None:
    """Record a successful login: update last_login + create a LoginHistory row."""
    update_last_login(None, user)
    ua_string = request.META.get('HTTP_USER_AGENT', '')[:USER_AGENT_MAX_LENGTH]
    LoginHistory.objects.create(
        user=user,
        ip_address=get_client_ip(request),
        user_agent=ua_string,
    )


def get_account_info(user, request) -> dict:
    """Assemble the full account/login-history payload for AccountInfoView."""
    role = _get_role(user)
    center = _get_center(user)

    current_ua = request.META.get('HTTP_USER_AGENT', '')
    history = [
        {
            'created_at': entry.created_at,
            'ip_address': entry.ip_address,
            **parse_user_agent(entry.user_agent),
        }
        for entry in user.login_history.all()[:10]
    ]

    return {
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'date_joined': user.date_joined,
        'role': role,
        'center_id': str(center.id) if center else None,
        'center_name': center.name if center else None,
        'last_login': user.last_login,
        'current_session': {
            'ip_address': get_client_ip(request),
            'user_agent': current_ua,
            **parse_user_agent(current_ua),
        },
        'login_history': history,
    }
