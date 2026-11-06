from urllib.parse import parse_qs, urlparse

from django.test import SimpleTestCase, override_settings

from patients import services, tasks


@override_settings(
    S3_ENDPOINT='http://garage:3900',
    S3_ACCESS_KEY='GKtestaccesskey',
    S3_SECRET_KEY='x' * 64,
    S3_BUCKET='bucket',
    S3_REGION='us-east-1',
)
class PresignedUrlSigningTests(SimpleTestCase):
    """Garage only accepts SigV4; boto3 presigns with SigV2 unless told otherwise."""

    def _assert_sigv4(self, url: str):
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        self.assertEqual(parsed.netloc, 'garage:3900')
        self.assertTrue(parsed.path.startswith('/bucket/'), 'expected path-style URL')
        self.assertEqual(query.get('X-Amz-Algorithm'), ['AWS4-HMAC-SHA256'])
        self.assertNotIn('AWSAccessKeyId', query)

    def test_upload_url_is_sigv4(self):
        self._assert_sigv4(
            services.generate_presigned_upload_url('tok/pre/a.webm', 'audio/webm')
        )

    def test_download_url_is_sigv4(self):
        self._assert_sigv4(services.generate_presigned_download_url('tok/pre/a.webm'))

    def test_task_client_uses_sigv4_path_style(self):
        client = tasks._s3_client()
        self.assertEqual(client.meta.config.signature_version, 's3v4')
        self.assertEqual(client.meta.config.s3['addressing_style'], 'path')
