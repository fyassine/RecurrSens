"""
Management command: generate the QR code for the live demonstration booth.

The demo URL has the same shape as a patient link ({APP_URL}/p/{uuid}), but the
token here identifies NO patient record — it is an opaque booth id used only for
correlating log lines. Nothing is created in the database by this command or by
the flow it points at. See docs/research/live-demo-qr-flow.md.

Usage:
    python manage.py demo_qr                      # print the URL, mint a token
    python manage.py demo_qr --token <uuid>       # reuse an existing booth token
    python manage.py demo_qr --out demo-qr.png    # also write the QR as a PNG
"""

import uuid

import qrcode
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Generate the live-demo QR code / URL for a conference booth'

    def add_arguments(self, parser):
        parser.add_argument(
            '--token',
            type=str,
            default=None,
            help='Reuse a specific booth token (UUID). A random one is minted otherwise.',
        )
        parser.add_argument(
            '--out',
            type=str,
            default=None,
            help='Write the QR code to this PNG path (e.g. demo-qr.png)',
        )

    def handle(self, *args, **options):
        raw_token = options['token']
        if raw_token:
            try:
                token = uuid.UUID(raw_token)
            except ValueError:
                raise CommandError(f'--token must be a UUID, got {raw_token!r}')
        else:
            token = uuid.uuid4()

        url = f'{settings.APP_URL.rstrip("/")}/demo/{token}'

        self.stdout.write(self.style.SUCCESS('Live-demo booth link'))
        self.stdout.write(f'  URL   : {url}')
        self.stdout.write(f'  Token : {token}')

        if not settings.DEMO_MODE_ENABLED:
            self.stdout.write(
                self.style.WARNING(
                    '  NOTE  : DEMO_MODE_ENABLED is False — the analyse endpoint will '
                    'return 404 until it is switched on.'
                )
            )

        self.stdout.write(
            f'  Backend: {settings.DEMO_INFERENCE_BACKEND} '
            f'({"fabricated scores" if settings.DEMO_INFERENCE_BACKEND == "stub" else settings.INFERENCE_SERVICE_URL})'
        )

        out_path = options['out']
        if out_path:
            qr = qrcode.QRCode(version=1, box_size=10, border=4)
            qr.add_data(url)
            qr.make(fit=True)
            qr.make_image(fill_color='black', back_color='white').save(out_path)
            self.stdout.write(self.style.SUCCESS(f'  QR    : written to {out_path}'))
