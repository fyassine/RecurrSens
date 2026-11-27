"""Tests for the live-demo usage log."""

import uuid
from io import StringIO

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from patients.models import DemoVisit

IPHONE_UA = (
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 '
    '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
)


@override_settings(DEMO_MODE_ENABLED=True)
class LiveDemoVisitTest(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.token = uuid.uuid4()
        self.url = f'/api/demo/{self.token}/visit/'
        self.visit_id = str(uuid.uuid4())

    def send(self, event, **extra):
        return self.client.post(
            self.url,
            {'visit_id': self.visit_id, 'event': event, **extra},
            format='json',
            HTTP_USER_AGENT=IPHONE_UA,
            HTTP_X_FORWARDED_FOR='203.0.113.7',
        )

    def test_opened_stores_device_info_without_ip_or_unknown_fields(self):
        response = self.send('opened', device={'screen_width': 390, 'extra': 'x'})

        self.assertEqual(response.status_code, 204)
        visit = DemoVisit.objects.get()
        self.assertEqual(visit.booth_token, self.token)
        self.assertIsNone(visit.completed_at)
        self.assertEqual(visit.device_info['device_type'], 'Mobil')
        self.assertEqual(visit.device_info['screen_width'], 390)
        self.assertNotIn('extra', visit.device_info)
        self.assertNotIn('203.0.113.7', str(visit.device_info))

    def test_completed_updates_same_visit_and_keeps_first_time(self):
        self.send('opened')
        self.send('completed')
        first = DemoVisit.objects.get().completed_at
        self.send('completed')
        self.send('opened')

        self.assertEqual(DemoVisit.objects.count(), 1)
        self.assertIsNotNone(first)
        self.assertEqual(DemoVisit.objects.get().completed_at, first)

    def test_completed_without_opened_creates_the_visit(self):
        self.send('completed')
        self.assertIsNotNone(DemoVisit.objects.get().completed_at)

    def test_invalid_payloads_are_rejected(self):
        self.assertEqual(self.send('other').status_code, 400)
        self.assertEqual(self.send('opened', device='x').status_code, 400)
        self.assertEqual(DemoVisit.objects.count(), 0)

    @override_settings(DEMO_MODE_ENABLED=False)
    def test_disabled_outside_demo_mode(self):
        self.assertEqual(self.send('opened').status_code, 404)
        self.assertEqual(DemoVisit.objects.count(), 0)

    def test_report_separates_opened_from_completed(self):
        self.send('completed')
        self.visit_id = str(uuid.uuid4())
        self.send('opened')

        out = StringIO()
        call_command('demo_visits', stdout=out)
        self.assertIn('Visits: 2 | completed: 1 | opened only: 1', out.getvalue())

        out = StringIO()
        call_command('demo_visits', '--csv', stdout=out)
        self.assertIn(',completed,', out.getvalue())
        self.assertIn(',opened,', out.getvalue())
