"""Unit tests for the audio upload validator.

Focus: the validator sniffs the format from magic bytes and trusts that over the
client-supplied filename, so mislabeled uploads (notably iOS WebKit recording
audio/mp4 but named `recording.webm`) self-correct instead of returning 400.
"""
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase

from patients.audio_validation import MAX_AUDIO_BYTES, validate_audio_upload


# Minimal magic-byte headers per container.
MP4 = b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom' + b'\x00' * 16
WEBM = b'\x1a\x45\xdf\xa3' + b'\x00' * 28
WAV = b'RIFF\x24\x00\x00\x00WAVEfmt ' + b'\x00' * 12
MP3 = b'ID3\x04\x00\x00\x00\x00\x00\x00' + b'\x00' * 22
OGG = b'OggS' + b'\x00' * 28


def _f(name, data, content_type='application/octet-stream'):
    return SimpleUploadedFile(name, data, content_type=content_type)


class AudioValidationTest(SimpleTestCase):
    def test_mp4_bytes_named_webm_self_correct_to_mp4(self):
        """The original iPhone bug: MP4 recording uploaded as recording.webm."""
        ext, mime = validate_audio_upload(_f('recording.webm', MP4))
        self.assertEqual((ext, mime), ('mp4', 'audio/mp4'))

    def test_correctly_named_formats_keep_their_extension(self):
        cases = [
            ('recording.webm', WEBM, ('webm', 'audio/webm')),
            ('recording.mp4', MP4, ('mp4', 'audio/mp4')),
            ('recording.wav', WAV, ('wav', 'audio/wav')),
            ('recording.mp3', MP3, ('mp3', 'audio/mpeg')),
            ('recording.ogg', OGG, ('ogg', 'audio/ogg')),
        ]
        for name, data, expected in cases:
            with self.subTest(name=name):
                self.assertEqual(validate_audio_upload(_f(name, data)), expected)

    def test_m4a_named_file_with_mp4_bytes_keeps_m4a(self):
        """A consistent member of the detected format keeps its own extension."""
        ext, mime = validate_audio_upload(_f('clinical.m4a', MP4))
        self.assertEqual((ext, mime), ('m4a', 'audio/mp4'))

    def test_signatureless_format_trusts_extension(self):
        """.caf/.amr/etc. have no reliable signature — accepted on extension."""
        ext, mime = validate_audio_upload(_f('voice.caf', b'caff' + b'\x00' * 24))
        self.assertEqual((ext, mime), ('caf', 'audio/x-caf'))

    def test_signed_extension_with_unmatched_bytes_is_rejected(self):
        """Claims a signed format but bytes match no signature → rejected."""
        with self.assertRaises(ValidationError) as ctx:
            validate_audio_upload(_f('recording.webm', b'garbage-not-audio'))
        self.assertIn('Dateiinhalt', ctx.exception.message)

    def test_unknown_extension_and_no_signature_is_rejected(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_audio_upload(_f('note.txt', b'just some text bytes'))
        self.assertIn('Nicht unterstütztes', ctx.exception.message)

    def test_oversize_file_is_rejected(self):
        big = SimpleUploadedFile('recording.mp4', MP4)
        big.size = MAX_AUDIO_BYTES + 1
        with self.assertRaises(ValidationError) as ctx:
            validate_audio_upload(big)
        self.assertIn('zu groß', ctx.exception.message)

    def test_file_pointer_reset_for_caller(self):
        f = _f('recording.mp4', MP4)
        validate_audio_upload(f)
        self.assertEqual(f.read(), MP4)
