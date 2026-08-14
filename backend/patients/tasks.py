"""
Celery tasks for async operations.

Primary task: run_inference_task
  - Called when a patient completes PRE_OP or POST_OP recordings
  - Sends audio keys to the inference service
  - Stores prediction results back on the Patient model
"""

import base64
import logging
import os
import shutil
import subprocess
import tempfile

import boto3
import requests
from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

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
    from .models import AudioFile, Patient

    try:
        patient = Patient.objects.get(id=patient_id)
    except Patient.DoesNotExist:
        logger.error(f'Inference task: Patient {patient_id} not found')
        return

    # Get audio storage keys for this phase
    audio_files = AudioFile.objects.filter(patient=patient, phase=phase)
    keys = list(audio_files.values_list('storage_key', flat=True))

    if not keys:
        logger.warning(f'No audio files for patient {patient.id} phase {phase}')
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
        logger.info(f'Inference prediction for {patient.id} ({phase}): {prediction_result}')
    except requests.RequestException as e:
        logger.error(f'Inference prediction failed for {patient.id} ({phase}): {e}')
        # Retry on failure
        try:
            self.retry(exc=e)
        except self.MaxRetriesExceededError:
            # Permanent failure: mark the prediction so the record isn't left
            # stuck at TODO forever, and surface it for manual review.
            field = 'prediction_pre' if phase == 'PRE_OP' else 'prediction_post'
            setattr(patient, field, Patient.PredictionStatus.FAILED)
            patient.save(update_fields=[field])
            logger.error(
                f'Max retries exceeded for prediction {patient.id} ({phase}); marked {field}=FAILED'
            )
            return

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
        logger.info(f'Inference reasoning for {patient.id} ({phase}): {reasoning_result}')
    except requests.RequestException as e:
        logger.error(f'Inference reasoning failed for {patient.id} ({phase}): {e}')

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
            update_fields.extend(
                [
                    'prediction_pre',
                    'ai_percentage_rp_pre',
                    'gradcam_prediction_pre',
                    'gradcam_percentage_pre',
                ]
            )
        else:
            patient.prediction_post = film.get('prediction', 'TODO')
            patient.ai_percentage_rp_post = film.get('percentage')
            patient.gradcam_prediction_post = gradcam.get('prediction', '')
            patient.gradcam_percentage_post = gradcam.get('percentage')
            update_fields.extend(
                [
                    'prediction_post',
                    'ai_percentage_rp_post',
                    'gradcam_prediction_post',
                    'gradcam_percentage_post',
                ]
            )

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
        logger.info(f'Saved inference results for {patient.id} ({phase}): updated {update_fields}')


@shared_task
def check_data_expiry():
    """
    Periodic task: warn about patients whose retention period has elapsed.

    Runs daily (configured via CELERY_BEAT_SCHEDULE in settings).

    This task NEVER deletes anything. It only notifies. Deletion of patient
    audio is a deliberate manual action (DELETE /api/patients/{token}/), by
    decision of 2026-08-15.

    Why: `Patient.expires_at` is fixed at creation time and is never extended
    when new recordings arrive, so an automatic purge keyed on it destroyed
    freshly-recorded post-op audio together with the expired pre-op audio —
    a patient created on 06.08 expired on 13.08 and lost recordings made on
    12.08. Ten patients lost recordings younger than the retention window
    before this was caught, with no recovery path (the object store has no
    versioning and the nightly backup covered Postgres only).

    Do not reintroduce automatic deletion here without first giving each
    AudioFile its own expiry clock; the patient-level date is not a safe
    signal for destroying data.
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
    from django.core.mail import send_mail

    for patient in expiring_soon:
        # Notify the admin. The pseudonym (patient_id) is appropriate here — this
        # is an internal admin notification, not a log. Failures (e.g. no SMTP
        # configured) fall back to a logged warning so the periodic task never
        # crashes and the record is still marked notified.
        try:
            send_mail(
                subject=f'Ablauf: Patient {patient.patient_id}',
                message=(
                    f'Die Daten des Patienten {patient.patient_id} laufen am '
                    f'{patient.expires_at.strftime("%d.%m.%Y %H:%M")} ab.'
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[settings.ADMIN_NOTIFICATION_EMAIL],
                fail_silently=False,
            )
        except Exception as e:
            logger.warning(
                f'Expiry email failed for patient {patient.id}; recording notification anyway: {e}'
            )

        patient.notification_sent_at = now
        patient.save(update_fields=['notification_sent_at'])
        logger.info(f'Expiry notification recorded for patient {patient.id}')

    # --- Pass 2: report what is due for manual review (no deletion) ---
    overdue = Patient.objects.filter(
        expires_at__lte=now,
        deleted_at__isnull=True,
    )
    if overdue.exists():
        logger.info(
            'check_data_expiry: %d patient(s) past their retention date and awaiting '
            'manual review; automatic deletion is disabled by design',
            overdue.count(),
        )


@shared_task(bind=True, max_retries=2, default_retry_delay=300)
def backup_database_snapshot(self):
    """
    Periodic task: nightly encrypted PostgreSQL backup to S3/MinIO.

    Only runs when DB_BACKUP_ENABLED=True (production only — see
    CELERY_BEAT_SCHEDULE in settings; dev/staging leave this unset).

    Pipeline:
      1. pg_dump --format=custom --compress=9
      2. GPG-encrypt the dump (DB_BACKUP_GPG_RECIPIENT is required whenever
         this task is enabled — enforced at boot in config.settings.production)
      3. Upload to S3_BUCKET under DB_BACKUP_S3_PREFIX/DB_BACKUP_ENV_LABEL/
      4. Prune old backups beyond DB_BACKUP_RETENTION
      5. Copy any new audio objects into the audio backup (kept indefinitely)
      6. Email ADMIN_NOTIFICATION_EMAIL with the result

    Note that step 5 is deliberately NOT pruned: the dump in steps 1-4 contains
    metadata only, so without it a deleted recording is unrecoverable.
    """
    if not settings.DB_BACKUP_ENABLED:
        logger.info('backup_database_snapshot: DB_BACKUP_ENABLED=False; skipping')
        return

    db = settings.DATABASES['default']
    timestamp = timezone.now().strftime('%Y-%m-%d_%H-%M-%S')
    work_dir = tempfile.mkdtemp(prefix='db-backup-')
    dump_path = os.path.join(work_dir, f'{db["NAME"]}_{timestamp}.dump')
    enc_path = f'{dump_path}.gpg'

    try:
        _run_pg_dump(db, dump_path)
        _gpg_encrypt(dump_path, enc_path, work_dir)

        s3_key = (
            f'{settings.DB_BACKUP_S3_PREFIX}/{settings.DB_BACKUP_ENV_LABEL}/'
            f'{os.path.basename(enc_path)}'
        )
        size = os.path.getsize(enc_path)
        _upload_to_s3(enc_path, s3_key)
        pruned = _prune_old_backups()
        copied, archived_total = _backup_audio_objects()
    except Exception as exc:
        logger.error(f'backup_database_snapshot failed: {exc}')
        try:
            self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            _send_backup_email(success=False, detail=str(exc))
        return
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    logger.info(
        f'backup_database_snapshot: uploaded {s3_key} ({size} bytes), pruned {pruned} '
        f'old backup(s), archived {copied} new audio object(s) ({archived_total} total)'
    )
    _send_backup_email(
        success=True,
        detail=(
            f'Database : {db["NAME"]}\n'
            f'Env      : {settings.DB_BACKUP_ENV_LABEL}\n'
            f'S3 key   : {s3_key}\n'
            f'Size     : {size} bytes\n'
            f'Pruned   : {pruned} old backup(s) (retention: {settings.DB_BACKUP_RETENTION})\n'
            f'Audio    : {copied} new object(s) archived, {archived_total} held in total\n'
            f'Time     : {timezone.now().isoformat()}\n'
        ),
    )


def _run_pg_dump(db: dict, dump_path: str):
    env = os.environ.copy()
    env['PGPASSWORD'] = db['PASSWORD']
    subprocess.run(
        [
            'pg_dump',
            '--host',
            db['HOST'],
            '--port',
            str(db['PORT']),
            '--username',
            db['USER'],
            '--format=custom',
            '--compress=9',
            '--no-password',
            '--file',
            dump_path,
            db['NAME'],
        ],
        env=env,
        check=True,
        capture_output=True,
        text=True,
        timeout=600,
    )


def _gpg_encrypt(dump_path: str, enc_path: str, work_dir: str):
    """Encrypt the dump in an isolated GNUPGHOME (no persistent keyring needed)."""
    gnupg_home = os.path.join(work_dir, 'gnupg')
    os.makedirs(gnupg_home, mode=0o700, exist_ok=True)
    env = os.environ.copy()
    env['GNUPGHOME'] = gnupg_home

    if settings.DB_BACKUP_GPG_PUBLIC_KEY:
        # Stored base64-encoded so the ASCII-armored key survives as a
        # single-line env var (.env files / docker-compose don't support
        # multi-line values).
        public_key = base64.b64decode(settings.DB_BACKUP_GPG_PUBLIC_KEY).decode('utf-8')
        subprocess.run(
            ['gpg', '--batch', '--import'],
            input=public_key,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )

    subprocess.run(
        [
            'gpg',
            '--batch',
            '--yes',
            '--trust-model',
            'always',
            '--encrypt',
            '--recipient',
            settings.DB_BACKUP_GPG_RECIPIENT,
            '--output',
            enc_path,
            dump_path,
        ],
        env=env,
        check=True,
        capture_output=True,
        text=True,
        timeout=300,
    )


def _s3_client():
    return boto3.client(
        's3',
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name=settings.S3_REGION,
    )


def _upload_to_s3(file_path: str, s3_key: str):
    _s3_client().upload_file(file_path, settings.S3_BUCKET, s3_key)


def _prune_old_backups() -> int:
    """Delete the oldest backups beyond DB_BACKUP_RETENTION. Returns count deleted."""
    client = _s3_client()
    prefix = f'{settings.DB_BACKUP_S3_PREFIX}/{settings.DB_BACKUP_ENV_LABEL}/'

    keys = []
    paginator = client.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=settings.S3_BUCKET, Prefix=prefix):
        keys.extend(obj['Key'] for obj in page.get('Contents', []))
    keys.sort()  # timestamped filenames sort chronologically, oldest first

    excess = len(keys) - settings.DB_BACKUP_RETENTION
    if excess <= 0:
        return 0

    for key in keys[:excess]:
        client.delete_object(Bucket=settings.S3_BUCKET, Key=key)
    return excess


def _audio_backup_prefix() -> str:
    return f'{settings.DB_BACKUP_S3_PREFIX}/audio/'


def _backup_audio_objects() -> tuple[int, int]:
    """
    Copy every audio object into the audio-backup prefix, server-side.

    Returns (newly_copied, total_held).

    The copy is incremental — an object already present in the archive is left
    alone — and nothing is ever removed from it. Deleting a recording through
    the app therefore no longer destroys the only copy.

    Deliberately unpruned: see the note in `backup_database_snapshot`. Storage
    grows without bound, which is the accepted trade-off for recoverability;
    the retention concept must state that audio copies are kept indefinitely.
    """
    if not getattr(settings, 'AUDIO_BACKUP_ENABLED', True):
        logger.info('_backup_audio_objects: AUDIO_BACKUP_ENABLED=False; skipping')
        return 0, 0

    client = _s3_client()
    bucket = settings.S3_BUCKET
    archive_prefix = _audio_backup_prefix()
    # Everything the backup machinery itself owns; never archive our own archive.
    reserved = (f'{settings.DB_BACKUP_S3_PREFIX}/', '_recovery_backups/')

    paginator = client.get_paginator('list_objects_v2')

    archived = set()
    for page in paginator.paginate(Bucket=bucket, Prefix=archive_prefix):
        for obj in page.get('Contents', []):
            archived.add(obj['Key'][len(archive_prefix) :])

    copied = 0
    for page in paginator.paginate(Bucket=bucket):
        for obj in page.get('Contents', []):
            key = obj['Key']
            if key.startswith(reserved) or key in archived:
                continue
            try:
                client.copy_object(
                    Bucket=bucket,
                    Key=f'{archive_prefix}{key}',
                    CopySource={'Bucket': bucket, 'Key': key},
                )
            except Exception as exc:
                # One unreadable object must not abort the whole nightly backup.
                logger.warning(f'_backup_audio_objects: could not archive {key}: {exc}')
                continue
            archived.add(key)
            copied += 1

    return copied, len(archived)


def _send_backup_email(success: bool, detail: str):
    status = 'Succeeded' if success else 'FAILED'
    try:
        send_mail(
            subject=f'[RecurrSens {settings.DB_BACKUP_ENV_LABEL}] DB Backup {status}',
            message=detail,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[settings.ADMIN_NOTIFICATION_EMAIL],
            fail_silently=False,
        )
    except Exception as e:
        logger.warning(f'backup_database_snapshot: notification email failed: {e}')


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
        f'TODO: Send session email to patient {patient.id} '
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
