"""
Management command: report who opened the live demo and who completed it.

Usage:
    python manage.py demo_visits                 # summary + one line per visit
    python manage.py demo_visits --csv > v.csv   # CSV export
"""

import csv

from django.core.management.base import BaseCommand
from django.utils import timezone

from patients.models import DemoVisit

DEVICE_FIELDS = [
    'device_type',
    'device_family',
    'os',
    'os_version',
    'browser',
    'browser_version',
    'screen_width',
    'screen_height',
    'language',
    'user_agent',
]


def _time(value):
    return timezone.localtime(value).strftime('%Y-%m-%d %H:%M:%S') if value else ''


class Command(BaseCommand):
    help = 'List live-demo visits: opened vs. completed, with device info'

    def add_arguments(self, parser):
        parser.add_argument('--csv', action='store_true', help='Write all fields as CSV')

    def handle(self, *args, **options):
        visits = DemoVisit.objects.order_by('opened_at')

        if options['csv']:
            writer = csv.writer(self.stdout)
            writer.writerow(
                ['visit_id', 'booth_token', 'status', 'opened_at', 'completed_at', *DEVICE_FIELDS]
            )
            for v in visits:
                writer.writerow(
                    [
                        v.id,
                        v.booth_token,
                        'completed' if v.completed_at else 'opened',
                        _time(v.opened_at),
                        _time(v.completed_at),
                        *[_safe(v.device_info.get(field, '')) for field in DEVICE_FIELDS],
                    ]
                )
            return

        total = visits.count()
        completed = visits.filter(completed_at__isnull=False).count()
        self.stdout.write(
            f'Visits: {total} | completed: {completed} | opened only: {total - completed}'
        )
        for v in visits:
            info = v.device_info
            state = 'completed' if v.completed_at else 'opened'
            device = ' · '.join(
                str(info[key])
                for key in ('device_type', 'device_family', 'os', 'browser')
                if info.get(key)
            )
            self.stdout.write(f'{_time(v.opened_at)}  {state:<9}  {device}')


def _safe(value):
    """Stop client-supplied text being read as a spreadsheet formula."""
    if isinstance(value, str) and value.startswith(('=', '+', '-', '@')):
        return f"'{value}"
    return value
