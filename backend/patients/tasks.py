"""
Celery tasks for async operations.

Primary task: run_inference_task
  - Called when a patient completes PRE_OP or POST_OP recordings
  - Sends audio keys to the inference service
  - Stores prediction results back on the Patient model
"""
import logging
import requests
from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def run_inference_task(self, patient_id: str, phase: str):
    """
    Run AI inference for a patient's audio recordings.

    Args:
        patient_id: UUID string of the patient
        phase: 'PRE_OP' or 'POST_OP'

    This task calls two external inference endpoints:
        - /predict: Returns classification prediction + percentage
        - /reasoning: Returns AI explanation text

    Results are stored on the Patient model's AI fields.
    """
    from .models import Patient, AudioFile

    try:
        patient = Patient.objects.get(id=patient_id)
    except Patient.DoesNotExist:
        logger.error(f'Inference task: Patient {patient_id} not found')
        return

    # Get audio storage keys for this phase
    audio_files = AudioFile.objects.filter(patient=patient, phase=phase)
    keys = list(audio_files.values_list('storage_key', flat=True))

    if not keys:
        logger.warning(
            f'No audio files for patient {patient.patient_id} phase {phase}'
        )
        return

    inference_url = settings.INFERENCE_SERVICE_URL
    payload = {
        'bucket': settings.S3_BUCKET,
        'keys': keys,
    }

    # --- Call prediction endpoint ---
    prediction_result = None
    try:
        response = requests.post(
            f'{inference_url}/predict',
            json=payload,
            timeout=120,
        )
        response.raise_for_status()
        prediction_result = response.json()
        logger.info(
            f'Inference prediction for {patient.patient_id} ({phase}): '
            f'{prediction_result}'
        )
    except requests.RequestException as e:
        logger.error(
            f'Inference prediction failed for {patient.patient_id} ({phase}): {e}'
        )
        # Retry on failure
        try:
            self.retry(exc=e)
        except self.MaxRetriesExceededError:
            logger.error(f'Max retries exceeded for prediction {patient.patient_id}')

    # --- Call reasoning endpoint ---
    reasoning_result = None
    try:
        response = requests.post(
            f'{inference_url}/reasoning',
            json=payload,
            timeout=120,
        )
        response.raise_for_status()
        reasoning_result = response.json()
        logger.info(
            f'Inference reasoning for {patient.patient_id} ({phase}): '
            f'{reasoning_result}'
        )
    except requests.RequestException as e:
        logger.error(
            f'Inference reasoning failed for {patient.patient_id} ({phase}): {e}'
        )

    # --- Store results ---
    update_fields = []

    if prediction_result:
        film = prediction_result.get('film_classifier', {})
        gradcam = prediction_result.get('gradcam_pro', {})

        if phase == 'PRE_OP':
            patient.prediction_pre = film.get('prediction', 'TODO')
            patient.ai_percentage_rp_pre = film.get('percentage')
            patient.gradcam_prediction_pre = gradcam.get('prediction', '')
            patient.gradcam_percentage_pre = gradcam.get('percentage')
            update_fields.extend([
                'prediction_pre', 'ai_percentage_rp_pre',
                'gradcam_prediction_pre', 'gradcam_percentage_pre',
            ])
        else:
            patient.prediction_post = film.get('prediction', 'TODO')
            patient.ai_percentage_rp_post = film.get('percentage')
            patient.gradcam_prediction_post = gradcam.get('prediction', '')
            patient.gradcam_percentage_post = gradcam.get('percentage')
            update_fields.extend([
                'prediction_post', 'ai_percentage_rp_post',
                'gradcam_prediction_post', 'gradcam_percentage_post',
            ])

    if reasoning_result:
        text = reasoning_result.get('text', '')
        if phase == 'PRE_OP':
            patient.ai_reasoning_pre = text
            update_fields.append('ai_reasoning_pre')
        else:
            patient.ai_reasoning_post = text
            update_fields.append('ai_reasoning_post')

    if update_fields:
        patient.save(update_fields=update_fields)
        logger.info(
            f'Saved inference results for {patient.patient_id} ({phase}): '
            f'updated {update_fields}'
        )


@shared_task
def check_data_expiry():
    """
    Periodic task: enforce data-retention policy.

    Runs daily (configured via CELERY_BEAT_SCHEDULE in settings).
    Two passes:
      1. Notify admin for patients expiring within 24 hours.
      2. Mark patients as EXPIRED if their expires_at has passed.
    """
    from django.utils import timezone
    from .models import Patient

    now = timezone.now()
    soon = now + timezone.timedelta(hours=24)

    # --- Pass 1: send expiry-warning notifications ---
    expiring_soon = Patient.objects.filter(
        expires_at__lte=soon,
        expires_at__gt=now,
        notification_sent_at__isnull=True,
    )
    for patient in expiring_soon:
        # TODO: send notification email to settings.ADMIN_NOTIFICATION_EMAIL
        #   Example:
        #   from django.core.mail import send_mail
        #   send_mail(
        #       subject=f'Ablauf: Patient {patient.patient_id}',
        #       message=f'Die Daten des Patienten {patient.patient_id} laufen am '
        #               f'{patient.expires_at.strftime("%d.%m.%Y %H:%M")} ab.',
        #       from_email=settings.DEFAULT_FROM_EMAIL,
        #       recipient_list=[settings.ADMIN_NOTIFICATION_EMAIL],
        #   )
        patient.notification_sent_at = now
        patient.save(update_fields=['notification_sent_at'])
        logger.info(f'Expiry notification recorded for patient {patient.patient_id}')

    # --- Pass 2: mark expired patients ---
    expired = Patient.objects.filter(
        expires_at__lte=now,
    ).exclude(status=Patient.Status.EXPIRED)
    count = expired.count()
    expired.update(status=Patient.Status.EXPIRED)
    if count:
        logger.info(f'Marked {count} patient(s) as EXPIRED')

    # --- Pass 3: auto-delete expired patients that have been downloaded ---
    from .services import delete_patient_with_files
    to_delete = Patient.objects.filter(
        expires_at__lte=now,
        last_exported_at__isnull=False,
        deleted_at__isnull=True,
    )
    for patient in to_delete:
        delete_patient_with_files(patient)
        logger.info(f'Auto-deleted patient {patient.patient_id} (expired + downloaded)')


@shared_task
def send_session_email(patient_id: str, session_id: str):
    """
    Send an email to the patient with a QR code and link to their recording session.

    TODO: Implement when SMTP server credentials are available.
    Required settings:
        - EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD
        - DEFAULT_FROM_EMAIL
        - APP_URL (for building the recording link)

    The email should contain:
        - A greeting and instructions in German
        - A QR code linking to /p/{patient_token}
        - A clickable link as fallback

    Args:
        patient_id: UUID string of the patient
        session_id: UUID string of the recording session
    """
    from .models import Patient, RecordingSession

    try:
        patient = Patient.objects.get(id=patient_id)
        session = RecordingSession.objects.get(id=session_id)
    except (Patient.DoesNotExist, RecordingSession.DoesNotExist):
        logger.error(f'send_session_email: Patient {patient_id} or session {session_id} not found')
        return

    recording_url = f'{settings.APP_URL}/p/{patient.id}'
    logger.info(
        f'TODO: Send session email to patient {patient.patient_id} '
        f'for {session.get_phase_display()} session {session.session_number}. '
        f'Recording URL: {recording_url}'
    )
    # TODO: Uncomment and configure when SMTP is available:
    # from django.core.mail import send_mail
    # send_mail(
    #     subject=f'Neue Aufnahmesitzung - {session.get_phase_display()}',
    #     message=(
    #         f'Sehr geehrte/r Patient/in,\n\n'
    #         f'eine neue Aufnahmesitzung ({session.get_phase_display()}, '
    #         f'Sitzung {session.session_number}) wurde für Sie erstellt.\n\n'
    #         f'Bitte öffnen Sie den folgenden Link, um Ihre Aufnahmen zu starten:\n'
    #         f'{recording_url}\n\n'
    #         f'Mit freundlichen Grüßen,\n'
    #         f'Ihr Klinik-Team'
    #     ),
    #     from_email=settings.DEFAULT_FROM_EMAIL,
    #     recipient_list=[patient_email],  # TODO: Add patient email field
    # )
