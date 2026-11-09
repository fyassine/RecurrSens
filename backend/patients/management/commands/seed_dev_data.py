"""
Seed a tiny, obviously fake dataset for local testing.

Never run against real data: it refuses to run unless DEBUG is on, and every
patient it creates is named FAKE-00N. Safe to re-run (get_or_create).
"""

import io
import math
import os
import struct
import wave

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from patients import services
from patients.models import AudioFile, Center, Patient, RecordingSession, UserProfile

FAKE_PATIENTS = [
    ('FAKE-001', Patient.Status.NEW),
    ('FAKE-002', Patient.Status.PRE_OP_DONE),
    ('FAKE-003', Patient.Status.POST_OP_STARTED),
]


# Fake recordings per patient: (phase, session number, exercise ids).
# FAKE-001 stays empty on purpose so the empty state can be tested.
FAKE_RECORDINGS = {
    'FAKE-002': [
        ('PRE_OP', 1, ['i_h', 'i_n', 'a_h', 'a_n', 'u_h', 'u_n', 'iau', 'phrase']),
    ],
    'FAKE-003': [
        ('PRE_OP', 1, ['i_h', 'i_n', 'i_l', 'a_h', 'a_n', 'a_l', 'u_h', 'u_n', 'u_l', 'iau']),
        ('POST_OP', 1, ['i_h', 'a_h', 'u_h', 'phrase']),
    ],
}

FAKE_DEVICE_INFO = {
    'parsed': {'browser': 'Chrome', 'os': 'macOS', 'device_type': 'Desktop'},
    'microphone': {'label': 'Fake test microphone'},
}


def _fake_wav(seed: int) -> bytes:
    """One second of a quiet sine tone (mono, 16 kHz); pitch varies per recording."""
    rate = 16000
    freq = 110 + 15 * (seed % 12)
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(
            b''.join(
                struct.pack('<h', int(6000 * math.sin(2 * math.pi * freq * i / rate)))
                for i in range(rate)
            )
        )
    return buf.getvalue()


class Command(BaseCommand):
    help = 'Create exercises, one dev admin and three fake patients (local testing only)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--recordings-only',
            action='store_true',
            help='Only add fake recordings to the existing FAKE-00N patients (no admin credentials needed).',
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('seed_dev_data only runs with DEBUG=True (development settings).')

        if options['recordings_only']:
            if not Patient.objects.filter(patient_id__in=FAKE_RECORDINGS).count() == len(FAKE_RECORDINGS):
                raise CommandError('FAKE patients missing: run seed_dev_data without the flag first.')
            self.stdout.write(self.style.SUCCESS(f'Added {self._seed_recordings()} fake recordings.'))
            return

        username = os.environ.get('DEV_ADMIN_USERNAME', '')
        password = os.environ.get('DEV_ADMIN_PASSWORD', '')
        if not username or not password:
            raise CommandError('Set DEV_ADMIN_USERNAME and DEV_ADMIN_PASSWORD in .env first.')

        call_command('loaddata', 'exercises', verbosity=0)

        center, _ = Center.objects.get_or_create(name='MRI')

        user_model = get_user_model()
        user, created = user_model.objects.get_or_create(
            username=username, defaults={'is_staff': True, 'is_superuser': True}
        )
        if created:
            user.set_password(password)
            user.save()
        UserProfile.objects.get_or_create(
            user=user, defaults={'role': UserProfile.Role.SUPER_ADMIN, 'center': center}
        )

        now = timezone.now()
        for pseudonym, status in FAKE_PATIENTS:
            Patient.objects.get_or_create(
                patient_id=pseudonym,
                defaults={'status': status, 'center': center, 'pre_op_date': now},
            )

        recordings = self._seed_recordings()

        self.stdout.write(
            self.style.SUCCESS(
                f'Seeded: {Patient.objects.filter(patient_id__startswith="FAKE-").count()} fake '
                f'patients ({recordings} new fake recordings), admin "{username}" ({"created" if created else "already existed"}).'
            )
        )

    def _seed_recordings(self) -> int:
        """Upload tiny WAV files to storage and create matching AudioFile rows."""
        created = 0
        for pseudonym, plan in FAKE_RECORDINGS.items():
            patient = Patient.objects.get(patient_id=pseudonym)
            for phase, number, exercise_ids in plan:
                session, _ = RecordingSession.objects.get_or_create(
                    patient=patient, phase=phase, session_number=number
                )
                folder = f'{"pre" if phase == "PRE_OP" else "post"}_{number}'
                for i, exercise_id in enumerate(exercise_ids):
                    if AudioFile.objects.filter(
                        patient=patient, session=session, phase=phase, exercise_id=exercise_id
                    ).exists():
                        continue
                    key = f'{patient.id}/{folder}/{exercise_id}.wav'
                    services.upload_audio_to_s3(_fake_wav(i), key, 'audio/wav')
                    AudioFile.objects.create(
                        patient=patient,
                        session=session,
                        exercise_id=exercise_id,
                        phase=phase,
                        storage_key=key,
                        device_info=FAKE_DEVICE_INFO,
                    )
                    created += 1
        return created
