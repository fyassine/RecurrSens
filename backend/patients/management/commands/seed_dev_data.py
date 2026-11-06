"""
Seed a tiny, obviously fake dataset for local testing.

Never run against real data: it refuses to run unless DEBUG is on, and every
patient it creates is named FAKE-00N. Safe to re-run (get_or_create).
"""

import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from patients.models import Center, Patient, UserProfile

FAKE_PATIENTS = [
    ('FAKE-001', Patient.Status.NEW),
    ('FAKE-002', Patient.Status.PRE_OP_DONE),
    ('FAKE-003', Patient.Status.POST_OP_STARTED),
]


class Command(BaseCommand):
    help = 'Create exercises, one dev admin and three fake patients (local testing only)'

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('seed_dev_data only runs with DEBUG=True (development settings).')

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

        self.stdout.write(
            self.style.SUCCESS(
                f'Seeded: {Patient.objects.filter(patient_id__startswith="FAKE-").count()} fake '
                f'patients, admin "{username}" ({"created" if created else "already existed"}).'
            )
        )
