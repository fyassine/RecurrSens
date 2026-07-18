"""
Management command: run an on-demand encrypted database backup.

Runs the same pipeline as the nightly Celery Beat job
(patients.tasks.backup_database_snapshot), synchronously. Useful before risky
migrations or for verifying backup configuration on a deployment server.

Usage:
    python manage.py backup_database
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from patients.tasks import backup_database_snapshot


class Command(BaseCommand):
    help = 'Run an on-demand encrypted database backup (same pipeline as the nightly Celery job)'

    def handle(self, *args, **options):
        if not settings.DB_BACKUP_ENABLED:
            raise CommandError(
                'DB_BACKUP_ENABLED is False — set DB_BACKUP_ENABLED=true and '
                'GPG_RECIPIENT_KEY before running a backup.'
            )

        self.stdout.write('Starting database backup...')
        backup_database_snapshot.run()
        self.stdout.write(
            self.style.SUCCESS('Database backup task finished — check logs/email for the result.')
        )
