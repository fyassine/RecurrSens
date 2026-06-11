"""
Management command: assign legacy patients (center=NULL) to a named center.

Usage:
    python manage.py assign_center "MRI"
    python manage.py assign_center "MRI" --all          # assign ALL patients (even those already in a center)
    python manage.py assign_center "MRI" --dry-run      # preview without saving
"""
from django.core.management.base import BaseCommand, CommandError

from patients.models import Center, Patient


class Command(BaseCommand):
    help = 'Assign unassigned (legacy) patients to a named center'

    def add_arguments(self, parser):
        parser.add_argument('center_name', type=str, help='Exact name of the Center to assign patients to')
        parser.add_argument(
            '--all',
            action='store_true',
            dest='assign_all',
            help='Reassign ALL patients, not just unassigned ones',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview how many patients would be updated without saving',
        )

    def handle(self, *args, **options):
        name = options['center_name']
        assign_all = options['assign_all']
        dry_run = options['dry_run']

        try:
            center = Center.objects.get(name=name)
        except Center.DoesNotExist:
            existing = list(Center.objects.values_list('name', flat=True))
            raise CommandError(
                f'Center "{name}" not found.\n'
                f'Existing centers: {existing or ["(none — create one in Django admin first)"]}'
            ) from None

        qs = Patient.objects.all() if assign_all else Patient.objects.filter(center__isnull=True)
        count = qs.count()

        if count == 0:
            self.stdout.write(self.style.WARNING('No patients match — nothing to do.'))
            return

        if dry_run:
            self.stdout.write(
                self.style.NOTICE(
                    f'[dry-run] Would assign {count} patient(s) to center "{center.name}".'
                )
            )
            return

        updated = qs.update(center=center)
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully assigned {updated} patient(s) to center "{center.name}".'
            )
        )
