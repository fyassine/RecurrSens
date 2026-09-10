"""
Inference backend for the live QR-code demo (conference / booth flow).

================================================================================
PRIVACY EXCEPTION — DO NOT "FIX" THIS INTO THE NORMAL PERSISTENT FLOW
================================================================================
The normal patient workflow (see .claude/CLAUDE.md and docs/architecture.md)
always persists audio to MinIO/S3 and creates an `AudioFile` row pointing at the
stored object. THIS MODULE IS DELIBERATELY DIFFERENT.

Audio handed to a backend here lives only as a `bytes` object on the
request-handling thread. It is:

  * never uploaded to MinIO/S3,
  * never written to the Django filesystem or to a temp file,
  * never written to the database (no Patient, no AudioFile, no audit row),
  * never logged — not the bytes, not a hash of them, not a transcript.

It is discarded when the request returns and the local reference goes out of
scope. That is the entire point of the live demo: a booth visitor can try the
platform without any record of their voice existing afterwards.

If you arrived here because "the demo doesn't store its recordings" looks like a
bug — it is not a bug, it is the requirement. Do not add an S3 upload, a model
write, or a filesystem cache to this path. See docs/research/live-demo-qr-flow.md
for the full rationale and for how to swap the stub for the real service.
================================================================================

Swapping in the real inference service
--------------------------------------
`DemoInferenceBackend` is the seam. `StubDemoInferenceBackend` fabricates a
plausible score so the flow is demonstrable today;`HttpDemoInferenceBackend`
posts the same recordings (three neutral-pitch vowels — i_n, a_n, u_n) to the
real service and parses the same response shape. Both return
`DemoInferenceResult`, whose field names mirror the real service's `/predict`
response (`film_classifier` / `gradcam_pro`, each with `prediction` and
`percentage`) so the swap is a settings change, not a refactor.

Selection is via `DEMO_INFERENCE_BACKEND` ('stub' | 'http').
"""

import hashlib
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# Labels the real inference service emits (see ENT-Diagnostics
# inference-service/inference.py). 'HEALTHY' is the favourable outcome the demo
# UI colours green.
HEALTHY = 'HEALTHY'
INFECTED = 'INFECTED'

FAVORABLE_PREDICTION = HEALTHY


class DemoInferenceError(Exception):
    """Raised when a demo inference attempt fails. Carries no audio content."""


@dataclass(frozen=True)
class DemoAudio:
    """
    One in-memory recording handed to a backend. The demo now records three
    neutral-pitch vowels (i_n, a_n, u_n) instead of one, so the exercise the
    patient wizard treats as a list of `AudioFile` rows is here just a list of
    these — never written anywhere, held only for the duration of `analyze()`.
    """

    data: bytes
    filename: str
    content_type: str


@dataclass(frozen=True)
class DemoPrediction:
    """One model head's verdict. Mirrors the real service's `PredictionResponse`."""

    prediction: str
    percentage: float

    @property
    def is_favorable(self) -> bool:
        return self.prediction == FAVORABLE_PREDICTION


@dataclass(frozen=True)
class DemoInferenceResult:
    """
    Mirrors the real service's `InferenceResult` (`/predict` response body).

    Deliberately holds only the verdict — never the audio it was derived from.
    """

    film_classifier: DemoPrediction
    gradcam_pro: DemoPrediction | None
    backend: str


class DemoInferenceBackend(Protocol):
    """The seam between the demo flow and whatever actually scores the audio.

    Implementations MUST NOT persist any `DemoAudio.data` anywhere.
    """

    name: str

    def analyze(
        self,
        *,
        recordings: Sequence[DemoAudio],
        gender: str,
        age: int,
    ) -> DemoInferenceResult: ...


# ==============================================================================
# Stub backend (default)
# ==============================================================================


class StubDemoInferenceBackend:
    """
    Fabricates a plausible classification so the booth flow is demonstrable
    without the real model being reachable.

    The verdict is derived deterministically from a digest of the concatenated
    recording bytes, so the same three recordings always yield the same answer —
    which makes the demo reproducible when rehearsing, and makes a "record
    twice, get two different numbers" bug obvious. The digest is computed, used,
    and dropped inside this call; it is never stored or logged.

    THIS IS NOT A MODEL. The number it returns carries no clinical meaning
    whatsoever, which is why the demo UI labels itself as a demonstration and
    never as a diagnosis.
    """

    name = 'stub'

    # Range for the fabricated confidence. Kept away from 100% because a model
    # that claims total certainty reads as fake to a clinical audience — and the
    # reference paper's whole point is that model confidence has to be read
    # against clinician ratings rather than taken at face value.
    MIN_PERCENTAGE = 71.0
    MAX_PERCENTAGE = 96.0

    def analyze(
        self,
        *,
        recordings: Sequence[DemoAudio],
        gender: str,
        age: int,
    ) -> DemoInferenceResult:
        if not recordings or any(not r.data for r in recordings):
            raise DemoInferenceError('Leere Aufnahme.')

        # Transient, local, never persisted or logged.
        digest = hashlib.sha256(b''.join(r.data for r in recordings)).digest()

        forced = (getattr(settings, 'DEMO_STUB_FORCE_PREDICTION', '') or '').upper()
        if forced in (HEALTHY, INFECTED):
            # Lets a presenter pin the outcome for a rehearsed walk-through.
            prediction = forced
        else:
            # Biased towards the favourable result: most booth visitors have
            # healthy vocal folds, and a demo that keeps flagging passers-by as
            # pathological is both misleading and alarming.
            prediction = INFECTED if digest[0] < 64 else HEALTHY

        percentage = self._percentage(digest[1])
        gradcam_percentage = self._percentage(digest[2])

        return DemoInferenceResult(
            film_classifier=DemoPrediction(prediction=prediction, percentage=percentage),
            gradcam_pro=DemoPrediction(prediction=prediction, percentage=gradcam_percentage),
            backend=self.name,
        )

    def _percentage(self, byte_value: int) -> float:
        span = self.MAX_PERCENTAGE - self.MIN_PERCENTAGE
        return round(self.MIN_PERCENTAGE + (byte_value / 255) * span, 1)


# ==============================================================================
# HTTP backend (real inference service)
# ==============================================================================


class HttpDemoInferenceBackend:
    """
    Posts the in-memory recording to the real inference service and returns its
    verdict.

    NOTE — this needs an inference-service endpoint that does not exist yet.
    The service's current `POST /predict` takes `{bucket, keys, gender, age}`
    and downloads the audio from S3 by key, which is fundamentally incompatible
    with "the audio is never stored anywhere": using it would mean writing the
    demo recording to the bucket first. So this backend targets a multipart
    upload variant (`DEMO_INFERENCE_PREDICT_PATH`, default `/predict-upload`)
    that accepts the bytes directly. docs/research/live-demo-qr-flow.md contains
    the ~20-line FastAPI handler that needs to be added on the ENT-Diagnostics
    side; the response body is unchanged from `/predict`.

    Until that endpoint ships, leave DEMO_INFERENCE_BACKEND='stub'.
    """

    name = 'http'

    def analyze(
        self,
        *,
        recordings: Sequence[DemoAudio],
        gender: str,
        age: int,
    ) -> DemoInferenceResult:
        url = f'{settings.INFERENCE_SERVICE_URL.rstrip("/")}{settings.DEMO_INFERENCE_PREDICT_PATH}'

        try:
            response = requests.post(
                url,
                # Streamed straight out of memory — nothing is spooled to disk
                # on the way, and none of `recordings` is retained after this
                # call. `requests` sends repeated 'file' parts for a list of
                # tuples under the same key, matching `predict-upload`'s
                # `files: list[UploadFile]`.
                files=[
                    ('file', (r.filename, r.data, r.content_type)) for r in recordings
                ],
                data={'gender': gender, 'age': str(age)},
                timeout=settings.DEMO_INFERENCE_TIMEOUT,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as exc:
            # Log the failure, never the request body.
            logger.warning(f'Live demo inference call failed: {exc}')
            raise DemoInferenceError('Analyse derzeit nicht verfügbar.') from exc
        except ValueError as exc:
            logger.warning(f'Live demo inference returned malformed JSON: {exc}')
            raise DemoInferenceError('Analyse derzeit nicht verfügbar.') from exc

        return self._parse(payload)

    def _parse(self, payload: dict) -> DemoInferenceResult:
        film = self._prediction(payload.get('film_classifier'))
        if film is None:
            logger.warning('Live demo inference response had no usable film_classifier block')
            raise DemoInferenceError('Analyse derzeit nicht verfügbar.')

        return DemoInferenceResult(
            film_classifier=film,
            gradcam_pro=self._prediction(payload.get('gradcam_pro')),
            backend=self.name,
        )

    def _prediction(self, block) -> DemoPrediction | None:
        if not isinstance(block, dict):
            return None
        prediction = block.get('prediction')
        percentage = block.get('percentage')
        if not prediction or percentage is None:
            return None
        try:
            return DemoPrediction(prediction=str(prediction), percentage=float(percentage))
        except (TypeError, ValueError):
            return None


# ==============================================================================
# Selection
# ==============================================================================

_BACKENDS: dict[str, type] = {
    StubDemoInferenceBackend.name: StubDemoInferenceBackend,
    HttpDemoInferenceBackend.name: HttpDemoInferenceBackend,
}


def get_demo_inference_backend() -> DemoInferenceBackend:
    """Return the backend named by DEMO_INFERENCE_BACKEND, defaulting to the stub."""
    configured = getattr(settings, 'DEMO_INFERENCE_BACKEND', StubDemoInferenceBackend.name)
    backend_cls = _BACKENDS.get(configured)
    if backend_cls is None:
        logger.warning(
            f'Unknown DEMO_INFERENCE_BACKEND={configured!r}; falling back to the stub backend'
        )
        backend_cls = StubDemoInferenceBackend
    return backend_cls()
