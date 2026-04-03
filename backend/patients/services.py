"""
Business logic services for the patients app.

Ported from the deprecated Next.js app (lib/api.ts):
- advance_patient_step: Workflow state machine
- check_completeness: Validates all required data is present
- generate_patient_pdf: QR code PDF generation
- export_patients_data: CSV + audio ZIP export
"""
import io
import csv
import logging
import zipfile
from datetime import date, datetime
from typing import Optional

from django.utils import timezone

import boto3
import qrcode
from django.conf import settings
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas

from .models import Patient, AudioFile, Exercise

logger = logging.getLogger(__name__)


def get_s3_client():
    """Create and return a boto3 S3 client configured for MinIO/S3."""
    return boto3.client(
        's3',
        region_name=settings.S3_REGION,
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
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


def get_audio_from_s3(key: str) -> Optional[bytes]:
    """Download audio file data from S3/MinIO."""
    s3 = get_s3_client()
    try:
        response = s3.get_object(Bucket=settings.S3_BUCKET, Key=key)
        return response['Body'].read()
    except Exception as e:
        logger.error(f'Failed to get S3 file {key}: {e}')
        return None


# =============================================================================
# Workflow State Machine
# =============================================================================

# Valid status transitions
STATUS_TRANSITIONS = {
    Patient.Status.NEW: Patient.Status.CONSENT_GIVEN,
    Patient.Status.CONSENT_GIVEN: Patient.Status.DEMOGRAPHICS_DONE,
    Patient.Status.DEMOGRAPHICS_DONE: Patient.Status.PRE_OP_DONE,
    Patient.Status.PRE_OP_DONE: Patient.Status.POST_OP_STARTED,
    Patient.Status.POST_OP_STARTED: Patient.Status.POST_OP_DONE,
    Patient.Status.POST_OP_DONE: Patient.Status.COMPLETED,
}


def advance_patient_step(patient: Patient) -> Patient:
    """
    Advance a patient to the next workflow step.

    State machine:
        NEW → CONSENT_GIVEN → DEMOGRAPHICS_DONE → PRE_OP_DONE →
        POST_OP_STARTED → POST_OP_DONE → COMPLETED

    Side effects:
        - Sets pre_op_date when advancing to PRE_OP_DONE
        - Sets post_op_date when advancing to POST_OP_DONE
        - Triggers inference tasks on PRE_OP_DONE and POST_OP_DONE
        - Validates completeness before marking COMPLETED

    Returns the updated patient instance.
    Raises ValueError if the transition is invalid or data is incomplete.
    """
    current = patient.status
    next_status = STATUS_TRANSITIONS.get(current)

    if not next_status:
        raise ValueError(
            f'Patient "{patient.patient_id}" kann nicht weiter voranschreiten. '
            f'Aktueller Status: {patient.get_status_display()}'
        )

    # Before completing, check data completeness
    if next_status == Patient.Status.COMPLETED:
        completeness = check_completeness(patient)
        if not completeness['complete']:
            raise ValueError(
                f'Fall kann nicht abgeschlossen werden. '
                f'Fehlende Daten: {", ".join(completeness["missing"])}'
            )

    # Apply transition
    patient.status = next_status

    # Set operation dates
    if next_status == Patient.Status.PRE_OP_DONE:
        patient.pre_op_date = timezone.now()
    elif next_status == Patient.Status.POST_OP_DONE:
        patient.post_op_date = timezone.now()

    patient.save()

    # Trigger async inference tasks
    if next_status in (Patient.Status.PRE_OP_DONE, Patient.Status.POST_OP_DONE):
        try:
            from .tasks import run_inference_task
            phase = 'PRE_OP' if next_status == Patient.Status.PRE_OP_DONE else 'POST_OP'
            run_inference_task.delay(str(patient.id), phase)
        except Exception as e:
            logger.error(f'Failed to trigger inference for patient {patient.patient_id}: {e}')

    logger.info(
        f'Patient {patient.patient_id} advanced from {current} to {next_status}'
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

    # Required demographics
    if not patient.patient_id or not patient.patient_id.strip():
        missing.append('patientId')
    if not patient.gender or patient.gender == Patient.Gender.UNKNOWN:
        missing.append('gender')
    if not patient.birth_date:
        missing.append('birthDate')
    if not patient.diagnosis or patient.diagnosis == Patient.Diagnosis.TODO:
        missing.append('diagnosis')

    # Required audio files
    active_exercises = Exercise.objects.filter(is_active=True)
    exercise_ids = list(active_exercises.values_list('exercise_id', flat=True))

    pre_files = patient.audio_files.filter(phase='PRE_OP')
    post_files = patient.audio_files.filter(phase='POST_OP')

    pre_exercise_ids = set(pre_files.values_list('exercise_id', flat=True))
    post_exercise_ids = set(post_files.values_list('exercise_id', flat=True))

    missing_pre = [eid for eid in exercise_ids if eid not in pre_exercise_ids]
    if missing_pre:
        missing.append(f'preOpAudio:{",".join(missing_pre)}')

    missing_post = [eid for eid in exercise_ids if eid not in post_exercise_ids]
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

def generate_patient_pdf(patient: Patient) -> bytes:
    """
    Generate a PDF with a QR code for the patient.
    The QR code encodes the patient access URL: {APP_URL}/p/{token}

    Returns PDF as bytes.
    """
    patient_url = f'{settings.APP_URL}/p/{patient.id}'

    # Generate QR code image
    qr = qrcode.QRCode(version=1, box_size=10, border=1)
    qr.add_data(patient_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color='black', back_color='white')

    # Save QR to a temporary buffer
    qr_buffer = io.BytesIO()
    qr_img.save(qr_buffer, format='PNG')
    qr_buffer.seek(0)

    # Create PDF with ReportLab
    pdf_buffer = io.BytesIO()
    p = canvas.Canvas(pdf_buffer, pagesize=A4)
    width, height = A4

    # Title
    p.setFont('Helvetica-Bold', 18)
    p.drawString(2 * cm, height - 3 * cm, 'Recurrensparese Diagnose')

    # Subtitle
    p.setFont('Helvetica', 12)
    p.drawString(2 * cm, height - 4 * cm, f'Patienten-ID: {patient.patient_id}')

    # Instructions
    p.setFont('Helvetica', 10)
    p.drawString(2 * cm, height - 5.5 * cm, 'Bitte scannen Sie den QR-Code, um Ihre Sprachaufnahmen zu starten.')

    # Draw QR code
    from reportlab.lib.utils import ImageReader
    qr_reader = ImageReader(qr_buffer)
    qr_size = 5.5 * cm
    qr_x = 2.1 * cm
    qr_y = height - 12.8 * cm
    p.drawImage(qr_reader, qr_x, qr_y, width=qr_size, height=qr_size)

    # URL text below QR
    p.setFont('Helvetica', 8)
    p.drawString(2.1 * cm, qr_y - 0.5 * cm, patient_url)

    # Footer
    p.setFont('Helvetica', 8)
    p.drawString(2 * cm, 2 * cm, f'Erstellt am: {datetime.now().strftime("%d.%m.%Y %H:%M")}')

    p.showPage()
    p.save()

    pdf_buffer.seek(0)
    return pdf_buffer.read()


# =============================================================================
# Data Export
# =============================================================================

def _map_diagnosis_to_pathology(diagnosis: str) -> str:
    """Map diagnosis enum value to German pathology text."""
    mapping = {
        'HEALTHY': 'Keine Recurrensparese',
        'LEFT': 'Linke Recurrensparese',
        'RIGHT': 'Rechte Recurrensparese',
        'BOTH': 'Beidseitige Recurrensparese',
    }
    return mapping.get(diagnosis, '')


def _format_date(dt) -> str:
    """Format a date/datetime for CSV export."""
    if not dt:
        return ''
    if isinstance(dt, datetime):
        return dt.strftime('%Y-%m-%d')
    if isinstance(dt, date):
        return dt.strftime('%Y-%m-%d')
    return ''


def export_patients_zip() -> bytes:
    """
    Export all completed patients as a ZIP containing:
    - export.csv: Tabular data (one row per recording phase)
    - data/: Audio files organized by patient token and phase

    Returns ZIP file as bytes.
    """
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Build CSV
        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow([
            'AufnahmeID', 'AufnahmeTyp', 'AufnahmeDatum',
            'Diagnose', 'SprecherID', 'Geburtsdatum',
            'Geschlecht', 'Pathologien',
        ])

        completed = Patient.objects.filter(
            status=Patient.Status.COMPLETED
        ).prefetch_related('audio_files')

        for patient in completed:
            # PRE-OP row
            writer.writerow([
                f'{patient.id}/pre',
                'h',
                _format_date(patient.pre_op_date),
                '',
                patient.patient_id,
                _format_date(patient.birth_date),
                patient.gender,
                'Keine Recurrensparese',
            ])
            # POST-OP row
            writer.writerow([
                f'{patient.id}/post',
                'h',
                _format_date(patient.post_op_date),
                patient.diagnosis_text,
                patient.patient_id,
                _format_date(patient.birth_date),
                patient.gender,
                _map_diagnosis_to_pathology(patient.diagnosis),
            ])

        zf.writestr('export.csv', csv_buffer.getvalue())

        # Add audio files
        s3 = get_s3_client()
        for patient in completed:
            for audio_file in patient.audio_files.all():
                try:
                    response = s3.get_object(
                        Bucket=settings.S3_BUCKET,
                        Key=audio_file.storage_key,
                    )
                    data = response['Body'].read()
                    zf.writestr(f'data/{audio_file.storage_key}', data)
                except Exception as e:
                    logger.error(
                        f'Failed to fetch audio {audio_file.storage_key} '
                        f'for patient {patient.patient_id}: {e}'
                    )

    zip_buffer.seek(0)
    return zip_buffer.read()


# =============================================================================
# Delete Patient (with S3 cleanup)
# =============================================================================

def delete_patient_with_files(patient: Patient) -> None:
    """
    Delete a patient and all associated data:
    1. Delete audio files from S3/MinIO
    2. Delete AudioFile records from DB
    3. Delete Patient record from DB
    """
    # Delete audio files from S3
    for audio_file in patient.audio_files.all():
        delete_audio_from_s3(audio_file.storage_key)

    # Cascade delete handles AudioFile records
    patient.delete()
    logger.info(f'Deleted patient {patient.patient_id} and all associated files')
