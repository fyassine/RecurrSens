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

    # Calculate age
    age = patient.age or -1

    inference_url = settings.INFERENCE_SERVICE_URL
    payload = {
        'bucket': settings.S3_BUCKET,
        'keys': keys,
        'gender': patient.gender,
        'age': age,
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
