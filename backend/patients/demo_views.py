"""
Live-demo endpoint (QR-code booth flow).

================================================================================
PRIVACY EXCEPTION — DO NOT "FIX" THIS INTO THE NORMAL PERSISTENT FLOW
================================================================================
Every other audio path in this app persists: `AudioUploadView` writes to
MinIO/S3 and creates an `AudioFile` row; the pre-sign views hand the client a
URL that puts the object in the bucket. THIS VIEW PERSISTS NOTHING.

The recording is parsed into memory, handed to the demo inference backend, and
dropped. No S3 object, no temp file, no `Patient`, no `AudioFile`, no audit row,
no log line containing audio. The `demo_token` in the URL is an opaque
correlation id printed on a booth poster — it is *never* looked up in the
database and does not identify anybody.

Kept in its own module (rather than in views.py / services.py) on purpose: those
modules are full of S3 and ORM helpers, and the demo flow must not grow a
convenient call into any of them. See docs/research/live-demo-qr-flow.md.
================================================================================

    POST /api/demo/{demo_token}/analyze/   multipart: file=<recording>
"""

import logging

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.uploadhandler import MemoryFileUploadHandler
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .audio_validation import validate_audio_upload
from .demo_inference import DemoInferenceError, get_demo_inference_backend

logger = logging.getLogger(__name__)


class PayloadTooLarge(APIException):
    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_detail = {'error': 'Aufnahme zu groß.'}


class MemoryOnlyAudioUploadHandler(MemoryFileUploadHandler):
    """
    Upload handler that keeps the demo recording in RAM, always.

    Django's stock `MemoryFileUploadHandler` deactivates itself once the body
    exceeds `FILE_UPLOAD_MAX_MEMORY_SIZE` (2.5 MB by default) and defers to the
    next handler in the chain — normally `TemporaryFileUploadHandler`, which
    spools the upload to a file under /tmp. A recording clears 2.5 MB easily, so
    on the default configuration the demo audio would land on disk, which this
    flow must never allow. Simply dropping the temp handler is not a fix either:
    with no active handler Django silently discards the file.

    So this handler stays activated regardless of `FILE_UPLOAD_MAX_MEMORY_SIZE`.
    The size ceiling is enforced separately, before the body is parsed, in
    `LiveDemoAnalyzeView.initial` (`DEMO_MAX_AUDIO_BYTES`), so an oversized
    upload is rejected outright rather than being buffered into the worker's
    memory or handed to a disk-backed handler.
    """

    def handle_raw_input(self, input_data, META, content_length, boundary, encoding=None):
        self.activated = True


class LiveDemoAnalyzeView(APIView):
    """
    Classify a single demo recording without storing it.

    Unauthenticated by design — a booth visitor scans a QR code and records;
    there is no account and no patient record. Abuse is bounded by the
    `demo_inference` throttle scope, the `DEMO_MAX_AUDIO_BYTES` ceiling, and
    `DEMO_MODE_ENABLED` (off unless a demo is actually running).
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser]
    throttle_scope = 'demo_inference'

    def dispatch(self, request, *args, **kwargs):
        # `request` is still the raw Django HttpRequest here, and nothing has
        # touched request.POST/FILES yet — Django refuses to swap upload
        # handlers once the body has been parsed.
        request.upload_handlers = [MemoryOnlyAudioUploadHandler(request)]
        return super().dispatch(request, *args, **kwargs)

    def initial(self, request, *args, **kwargs):
        # Runs after throttling but before the handler touches request.FILES, so
        # an oversized body is refused before it is read into memory.
        super().initial(request, *args, **kwargs)

        if not settings.DEMO_MODE_ENABLED:
            # 404 rather than 403: with no demo running the endpoint should not
            # advertise that it exists.
            raise Http404()

        try:
            content_length = int(request.META.get('CONTENT_LENGTH') or 0)
        except (TypeError, ValueError):
            content_length = 0

        if content_length > settings.DEMO_MAX_AUDIO_BYTES:
            raise PayloadTooLarge()

    def post(self, request, token):
        """
        `token` is the demo/booth correlation id from the QR code. It is
        intentionally NOT resolved against the Patient table — the demo is not
        tied to any patient record, and no row is created for this interaction.
        """
        file = request.FILES.get('file')
        if not file:
            return Response(
                {'error': 'Keine Aufnahme empfangen.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if file.size > settings.DEMO_MAX_AUDIO_BYTES:
            # Second line of defence: a chunked request arrives without a usable
            # Content-Length, so the check in `initial` cannot see its size.
            return Response(
                {'error': 'Aufnahme zu groß.'},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        # Same whitelist and magic-byte sniffing as the real upload path — the
        # demo relaxes the storage rule, not the input validation.
        try:
            extension, content_type = validate_audio_upload(file)
        except ValidationError as e:
            return Response(
                {'error': e.message if hasattr(e, 'message') else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # The one and only copy of the audio, held on this thread's stack.
        audio = file.read()

        # The real model is FiLM-conditioned on sex and age, so the fields are
        # wired through even though the demo UI does not ask for them (it has a
        # sub-minute budget). The defaults keep a stub demo running; a demo
        # driven by the real model should collect them — see the docs.
        gender = (request.data.get('gender') or settings.DEMO_DEFAULT_GENDER)[:1].upper()
        try:
            age = int(request.data.get('age') or settings.DEMO_DEFAULT_AGE)
        except (TypeError, ValueError):
            age = settings.DEMO_DEFAULT_AGE

        backend = get_demo_inference_backend()
        try:
            result = backend.analyze(
                audio=audio,
                filename=f'demo.{extension}',
                content_type=content_type,
                gender=gender,
                age=age,
            )
        except DemoInferenceError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        finally:
            # Drop this frame's reference. Python frees the buffer once the
            # request objects go out of scope regardless; this is here so the
            # intent survives future edits to the code below.
            del audio

        film = result.film_classifier
        gradcam = result.gradcam_pro

        # Deliberately free of anything that could tie back to a person: the
        # booth token and the verdict, nothing else.
        logger.info(
            f'Live demo analysis for booth token {token} via {result.backend} backend: '
            f'{film.prediction} ({film.percentage}%) — nothing persisted'
        )

        return Response(
            {
                'prediction': film.prediction,
                'confidence': film.percentage,
                'favorable': film.is_favorable,
                'gradcam': (
                    {'prediction': gradcam.prediction, 'confidence': gradcam.percentage}
                    if gradcam
                    else None
                ),
                'backend': result.backend,
                # Read by the UI to show the visitor that nothing was kept.
                # Hardcoded because this endpoint has no branch that stores.
                'stored': False,
            }
        )
