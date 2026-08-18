"""
Inference-time denoising and trimming, meant to run immediately before feature
extraction (openSMILE eGeMAPS / HuBERT / mel-spectrogram).

Reference implementation for the external inference service — see README.md.

Why this stage exists
---------------------
The models are trained on the Saarbrücken Voice Database: studio recordings,
close mic, near-silent room. RecurrSens patients record in a browser, at home or
in a waiting room, through whatever microphone the device has. Handing that
audio to a feature extractor calibrated on studio data inflates jitter/shimmer
and depresses HNR/CPP for *everyone*, which compresses the separation between
healthy and paretic voices.

Ordering matters and is not arbitrary
-------------------------------------
1. :func:`highpass_filter` — removes DC offset and sub-phonatory rumble
   (handling noise, HVAC, mains hum) that would otherwise dominate the noise
   estimate in step 2.
2. :func:`spectral_gate` — attenuates the stationary noise floor.
3. :func:`trim_silence` — drops leading/trailing non-phonation so that duration
   and the openSMILE functionals are computed over voiced material only.
4. :func:`fix_duration` (optional) — equalises clip length across classes.

Two deliberate non-defaults
---------------------------
* **Peak normalisation is off by default.** Normalising amplitude destroys the
  intensity features in eGeMAPS. That sounds like a good thing given the
  intensity bias Low et al. (2024) report — but doing it only at inference,
  when the model was trained on un-normalised audio, is a train/serve skew that
  silently shifts every prediction. Normalise in *both* places or neither.
* **Gating is conservative.** ``reduction_db`` defaults to a partial (not total)
  suppression. Aggressive spectral subtraction removes the breathy, aperiodic
  turbulence at the glottis that *is* the diagnostic signal in RLN paresis; a
  denoiser tuned by ear will happily erase the pathology.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import signal

from .augmentation import _EPS, _as_float, _istft, _stft

__all__ = [
    'PreprocessConfig',
    'energy_vad',
    'estimate_noise_psd',
    'fix_duration',
    'highpass_filter',
    'preprocess',
    'spectral_gate',
    'trim_silence',
]


def highpass_filter(y: np.ndarray, sr: int, cutoff_hz: float = 60.0, order: int = 4) -> np.ndarray:
    """Zero-phase Butterworth high-pass.

    60 Hz sits below the male modal F0 floor (~85 Hz) with margin, so phonation
    is untouched while DC drift and low-frequency rumble are removed. Zero-phase
    (``sosfiltfilt``) matters: a causal filter would smear the glottal pulse
    shape that jitter and shimmer are measured from.
    """
    y = _as_float(y)
    nyquist = sr / 2.0
    if len(y) == 0 or cutoff_hz <= 0 or cutoff_hz >= nyquist:
        return y

    sos = signal.butter(order, cutoff_hz / nyquist, btype='highpass', output='sos')
    # filtfilt needs more samples than its padlen; skip on very short clips.
    if len(y) <= 3 * order * 2:
        return y
    return np.asarray(signal.sosfiltfilt(sos, y), dtype=y.dtype)


def estimate_noise_psd(
    y: np.ndarray,
    sr: int,
    n_fft: int = 1024,
    hop: int = 256,
    percentile: float = 10.0,
) -> np.ndarray:
    """Estimate the stationary noise power spectrum of ``y``.

    No labelled silent segment is required: patients start phonating at
    unpredictable moments and the wizard does not guarantee a leading pause.
    Returns a ``[freq]`` power vector.

    The estimate is the element-wise minimum of two independent bounds, because
    either one alone fails on a case that matters here:

    * a low per-bin percentile **over time**, which finds the floor whenever the
      clip contains non-phonated frames — but on a fully-voiced sustained vowel
      (``a_n``, ``i_h``, ... — 13 of the 15 exercises) every frame is voiced, so
      this bound collapses onto the signal itself and the gate would subtract
      the harmonics;
    * a low percentile **over frequency**, taken per frame and reduced by the
      median across frames. A harmonic stack occupies few bins, so most bins in
      any frame sit in an inter-harmonic valley and measure the broadband floor
      — but this bound is blind to a genuinely narrowband interferer.

    Taking the minimum keeps the estimate conservative in both regimes, which is
    what we want: under-gating leaves some noise, over-gating erases the breathy
    turbulence that carries the diagnosis.
    """
    y = _as_float(y)
    if len(y) == 0:
        return np.zeros(n_fft // 2 + 1)

    power = np.abs(_stft(y, n_fft, hop)) ** 2
    over_time = np.percentile(power, percentile, axis=1)
    over_freq = float(np.median(np.percentile(power, percentile, axis=0)))
    return np.minimum(over_time, over_freq)


def spectral_gate(
    y: np.ndarray,
    sr: int,
    n_fft: int = 1024,
    hop: int = 256,
    reduction_db: float = 12.0,
    over_subtraction: float = 1.5,
    noise_psd: np.ndarray | None = None,
) -> np.ndarray:
    """Attenuate stationary noise with a soft (Wiener-style) spectral gate.

    ``reduction_db`` bounds how far any bin may be attenuated — the mask is
    floored, never zeroed, which preserves the aperiodic component of breathy
    phonation. ``over_subtraction`` scales the noise estimate before gating;
    values above 1 gate harder.

    Pass ``noise_psd`` (e.g. estimated once from a device-specific calibration
    clip) to override the built-in percentile estimate.
    """
    y = _as_float(y)
    if len(y) == 0:
        return y

    spec = _stft(y, n_fft, hop)
    power = np.abs(spec) ** 2

    if noise_psd is None:
        noise_psd = estimate_noise_psd(y, sr, n_fft=n_fft, hop=hop)
    noise = (over_subtraction * np.asarray(noise_psd))[:, None]

    floor = 10.0 ** (-reduction_db / 20.0)
    mask = np.clip(power / (power + noise + _EPS), floor, 1.0)

    return _istft(spec * mask, n_fft, hop, length=len(y)).astype(y.dtype)


def energy_vad(
    y: np.ndarray,
    sr: int,
    frame_ms: float = 25.0,
    hop_ms: float = 10.0,
    threshold_db: float = -35.0,
    min_speech_ms: float = 50.0,
    silence_floor: float = 1e-6,
) -> tuple[np.ndarray, int, int]:
    """Energy-based voice activity detection.

    ``threshold_db`` is relative to the loudest frame, which makes the decision
    invariant to recording gain — important because gain varies wildly across
    patient devices and, per Low et al. (2024), correlates with class.

    Returns ``(mask, frame_len, hop_len)`` where ``mask`` is a per-frame boolean
    array. Runs of speech shorter than ``min_speech_ms`` are discarded as
    transients (a chair creak, a door).

    Because the threshold is relative, a clip containing *only* digital silence
    would otherwise come back fully voiced — every frame is equally loud.
    ``silence_floor`` is the absolute peak-RMS below which the whole clip is
    declared silent instead. A failed upload that yields an all-zero buffer must
    not be reported as one long phonation.
    """
    y = _as_float(y)
    frame_len = max(1, int(sr * frame_ms / 1000.0))
    hop_len = max(1, int(sr * hop_ms / 1000.0))

    if len(y) < frame_len:
        return np.zeros(0, dtype=bool), frame_len, hop_len

    frames = np.lib.stride_tricks.sliding_window_view(y, frame_len)[::hop_len]
    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1))

    peak = rms.max()
    if peak < silence_floor:
        return np.zeros(len(rms), dtype=bool), frame_len, hop_len

    db = 20.0 * np.log10(rms / peak + _EPS)
    mask = db > threshold_db

    min_frames = max(1, int(min_speech_ms / hop_ms))
    return _drop_short_runs(mask, min_frames), frame_len, hop_len


def _drop_short_runs(mask: np.ndarray, min_frames: int) -> np.ndarray:
    """Zero out ``True`` runs shorter than ``min_frames``."""
    if mask.size == 0 or min_frames <= 1:
        return mask

    out = mask.copy()
    start = None
    for i, active in enumerate(mask):
        if active and start is None:
            start = i
        elif not active and start is not None:
            if i - start < min_frames:
                out[start:i] = False
            start = None
    if start is not None and len(mask) - start < min_frames:
        out[start:] = False
    return out


def trim_silence(
    y: np.ndarray,
    sr: int,
    threshold_db: float = -35.0,
    pad_ms: float = 50.0,
    **vad_kwargs,
) -> np.ndarray:
    """Trim leading and trailing non-phonation, keeping ``pad_ms`` of margin.

    Only the outer edges are removed — internal pauses are kept, because pause
    structure inside connected speech (the ``phrase`` exercise) carries real
    information: a paretic speaker runs out of breath and pauses more.

    Returns ``y`` unchanged when no frame clears the threshold, so a failed VAD
    degrades to a no-op rather than to an empty clip.
    """
    y = _as_float(y)
    mask, frame_len, hop_len = energy_vad(y, sr, threshold_db=threshold_db, **vad_kwargs)
    if not mask.any():
        return y

    voiced = np.flatnonzero(mask)
    pad = int(sr * pad_ms / 1000.0)
    start = max(0, voiced[0] * hop_len - pad)
    end = min(len(y), voiced[-1] * hop_len + frame_len + pad)
    return y[start:end]


def fix_duration(y: np.ndarray, sr: int, seconds: float, center: bool = True) -> np.ndarray:
    """Crop or zero-pad ``y`` to exactly ``seconds``.

    Recording duration was one of the two confounds Low et al. (2024) had to
    neutralise before their UVFP models could be trusted: their pathological and
    control clips differed systematically in length, and the models used it.
    RecurrSens has the same exposure — the wizard does not enforce a fixed
    take length — so equalising duration before feature extraction removes the
    affordance at the source.
    """
    y = _as_float(y)
    target = max(1, round(seconds * sr))
    if len(y) == target:
        return y
    if len(y) > target:
        start = (len(y) - target) // 2 if center else 0
        return y[start : start + target]

    deficit = target - len(y)
    before = deficit // 2 if center else 0
    return np.pad(y, (before, deficit - before))


@dataclass(frozen=True)
class PreprocessConfig:
    """Parameters for :func:`preprocess`."""

    highpass_hz: float = 60.0
    gate: bool = True
    reduction_db: float = 12.0
    over_subtraction: float = 1.5
    trim: bool = True
    threshold_db: float = -35.0
    pad_ms: float = 50.0
    #: Set to a float to equalise clip length; ``None`` leaves duration alone.
    duration_s: float | None = None
    #: Off by default — see the module docstring.
    peak_normalize: bool = False


DEFAULT = PreprocessConfig()


def preprocess(y: np.ndarray, sr: int, config: PreprocessConfig = DEFAULT) -> np.ndarray:
    """Run the recommended chain: high-pass, gate, trim, (duration), (normalise).

    Intended to be called on the decoded waveform immediately before feature
    extraction, and — critically — on the *training* data too. Applying it on
    only one side reintroduces exactly the train/serve skew it is meant to close.
    """
    out = _as_float(y)
    if len(out) == 0:
        return out

    out = highpass_filter(out, sr, cutoff_hz=config.highpass_hz)

    if config.gate:
        out = spectral_gate(
            out,
            sr,
            reduction_db=config.reduction_db,
            over_subtraction=config.over_subtraction,
        )

    if config.trim:
        out = trim_silence(out, sr, threshold_db=config.threshold_db, pad_ms=config.pad_ms)

    if config.duration_s is not None:
        out = fix_duration(out, sr, config.duration_s)

    if config.peak_normalize:
        peak = float(np.max(np.abs(out))) if out.size else 0.0
        if peak > 0:
            out = out / peak

    return np.nan_to_num(out, nan=0.0, posinf=0.0, neginf=0.0)
