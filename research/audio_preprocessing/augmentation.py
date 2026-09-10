"""
Training-time audio augmentation for voice-pathology models.

Reference implementation for the external inference/training service. Nothing in
this module is imported by the RecurrSens Django runtime — see README.md.

Design constraints specific to this problem:

* **Label preservation.** Recurrent-laryngeal-nerve (RLN) paresis is a *source*
  pathology: the diagnostic signal lives in glottal periodicity (jitter,
  shimmer, HNR, CPP, F0 variability). Augmentations that resynthesise the
  excitation destroy the label. Everything here either leaves the excitation
  intact (gain, additive noise, reverb) or perturbs it by a small, bounded
  amount (pitch shift, time stretch) — see ``CONSERVATIVE`` for the ranges we
  recommend.
* **Intensity invariance is a feature, not a side effect.** Low et al. (2024)
  showed that a UVFP classifier can latch onto recording *loudness* rather than
  voice quality, because pathological speakers over-project. Randomising gain at
  training time is the cheapest way to make the model invariant to that
  confound, so :func:`gain_scale` is part of the default chain on purpose.
* **numpy + scipy only.** No librosa/torchaudio, so the module drops into any
  environment the inference service already has.

All functions take and return a mono ``float`` waveform as a 1-D
:class:`numpy.ndarray` and never mutate their input.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy import signal

__all__ = [
    'CONSERVATIVE',
    'AugmentationConfig',
    'add_gaussian_noise',
    'add_noise_at_snr',
    'apply_reverb',
    'augment',
    'gain_scale',
    'pitch_shift',
    'spec_augment',
    'time_stretch',
]

_EPS = 1e-10


# --------------------------------------------------------------------------- #
# STFT helpers (kept local so the module has no librosa dependency)
# --------------------------------------------------------------------------- #


def _window(n_fft: int) -> np.ndarray:
    """Periodic Hann window — the correct choice for STFT/ISTFT round-tripping."""
    return np.hanning(n_fft + 1)[:-1]


def _stft(y: np.ndarray, n_fft: int, hop: int) -> np.ndarray:
    """Centred STFT. Returns a complex array shaped ``[freq, time]``."""
    pad = n_fft // 2
    # `reflect` needs at least `pad` samples on each side; fall back to zeros.
    mode = 'reflect' if len(y) > pad else 'constant'
    padded = np.pad(y, pad, mode=mode)
    if len(padded) < n_fft:
        padded = np.pad(padded, (0, n_fft - len(padded)))

    n_frames = 1 + (len(padded) - n_fft) // hop
    frames = np.lib.stride_tricks.sliding_window_view(padded, n_fft)[::hop][:n_frames]
    return np.fft.rfft(frames * _window(n_fft), axis=-1).T


def _istft(spec: np.ndarray, n_fft: int, hop: int, length: int | None = None) -> np.ndarray:
    """Inverse of :func:`_stft`, using window-squared overlap-add normalisation."""
    win = _window(n_fft)
    frames = np.fft.irfft(spec.T, n=n_fft, axis=-1) * win

    n_frames = frames.shape[0]
    out = np.zeros(n_fft + hop * (n_frames - 1))
    wsum = np.zeros_like(out)
    for i in range(n_frames):
        out[i * hop : i * hop + n_fft] += frames[i]
        wsum[i * hop : i * hop + n_fft] += win**2

    out /= np.maximum(wsum, _EPS)
    out = out[n_fft // 2 :]  # undo the centring pad

    if length is not None:
        out = out[:length] if len(out) >= length else np.pad(out, (0, length - len(out)))
    return out


def _phase_vocoder(spec: np.ndarray, rate: float, hop: int) -> np.ndarray:
    """Resample an STFT along time by ``rate``, keeping phase coherent."""
    n_freq, n_time = spec.shape
    spec = np.concatenate([spec, np.zeros((n_freq, 2), dtype=spec.dtype)], axis=1)

    mag = np.abs(spec)
    phase = np.angle(spec)
    # Expected per-hop phase advance of bin k: omega_k * hop, omega_k = 2*pi*k/n_fft.
    n_fft = 2 * (n_freq - 1)
    expected = 2.0 * np.pi * hop * np.arange(n_freq) / n_fft

    steps = np.arange(0, n_time, rate)
    out = np.zeros((n_freq, len(steps)), dtype=complex)
    acc = phase[:, 0].copy()

    for i, t in enumerate(steps):
        left = int(np.floor(t))
        frac = t - left
        out[:, i] = ((1.0 - frac) * mag[:, left] + frac * mag[:, left + 1]) * np.exp(1j * acc)

        # Wrap the heterodyned phase difference into (-pi, pi].
        delta = phase[:, left + 1] - phase[:, left] - expected
        delta -= 2.0 * np.pi * np.round(delta / (2.0 * np.pi))
        acc = acc + expected + delta

    return out


def _as_float(y: np.ndarray) -> np.ndarray:
    y = np.asarray(y)
    if y.ndim != 1:
        raise ValueError(f'expected a mono 1-D waveform, got shape {y.shape}')
    return y.astype(np.float64, copy=True) if y.dtype.kind != 'f' else y.astype(y.dtype, copy=True)


def _rms(y: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(y, dtype=np.float64)) + _EPS))


# --------------------------------------------------------------------------- #
# Augmentations
# --------------------------------------------------------------------------- #


def time_stretch(y: np.ndarray, rate: float, n_fft: int = 1024, hop: int = 256) -> np.ndarray:
    """Change duration by ``1 / rate`` while leaving F0 unchanged.

    ``rate > 1`` speeds the signal up, ``rate < 1`` slows it down.

    Duration was one of the two confounds Low et al. (2024) had to control for,
    so stretching also doubles as a way to decorrelate duration from the label
    when the two classes were recorded under different protocols.
    """
    if rate <= 0:
        raise ValueError('rate must be positive')
    y = _as_float(y)
    if rate == 1.0 or len(y) == 0:
        return y

    stretched = _phase_vocoder(_stft(y, n_fft, hop), rate, hop)
    target = max(1, round(len(y) / rate))
    return _istft(stretched, n_fft, hop, length=target).astype(y.dtype)


def pitch_shift(
    y: np.ndarray, sr: int, n_steps: float, n_fft: int = 1024, hop: int = 256
) -> np.ndarray:
    """Shift pitch by ``n_steps`` semitones, preserving duration.

    Implemented as phase-vocoder time stretch followed by resampling back to the
    original length.

    .. warning::
       F0 is itself diagnostic, and the sex-specific biomarker thresholds in the
       ENT-Diagnostics pipeline are calibrated on unshifted audio. Keep
       ``|n_steps|`` small (``CONSERVATIVE`` uses ±1 semitone). Shifting far
       enough to move a speaker across the male/female F0 range would relabel
       the sample as surely as flipping ``y``.
    """
    y = _as_float(y)
    if n_steps == 0 or len(y) == 0:
        return y

    rate = 2.0 ** (-n_steps / 12.0)
    stretched = time_stretch(y, rate, n_fft=n_fft, hop=hop)
    if len(stretched) < 2:
        return y

    shifted = signal.resample(stretched, len(y))
    return np.asarray(shifted, dtype=y.dtype)


def add_noise_at_snr(
    y: np.ndarray, noise: np.ndarray, snr_db: float, rng: np.random.Generator | None = None
) -> np.ndarray:
    """Mix ``noise`` into ``y`` at exactly ``snr_db`` dB signal-to-noise ratio.

    ``noise`` is tiled or randomly cropped to match the length of ``y``.
    """
    y = _as_float(y)
    noise = _as_float(noise)
    if len(y) == 0 or len(noise) == 0:
        return y

    if len(noise) < len(y):
        noise = np.tile(noise, int(np.ceil(len(y) / len(noise))))
    if len(noise) > len(y):
        rng = rng or np.random.default_rng()
        start = int(rng.integers(0, len(noise) - len(y) + 1))
        noise = noise[start : start + len(y)]

    scale = _rms(y) / (_rms(noise) * (10.0 ** (snr_db / 20.0)))
    return (y + scale * noise).astype(y.dtype)


def add_gaussian_noise(
    y: np.ndarray, snr_db: float, rng: np.random.Generator | None = None
) -> np.ndarray:
    """Add white Gaussian noise at ``snr_db`` dB SNR.

    Models the microphone/room noise floor of at-home patient recordings, which
    is markedly worse than the studio conditions of the Saarbrücken corpus the
    models are trained on.
    """
    y = _as_float(y)
    if len(y) == 0:
        return y
    rng = rng or np.random.default_rng()
    noise = rng.standard_normal(len(y))
    return add_noise_at_snr(y, noise, snr_db, rng=rng)


def gain_scale(y: np.ndarray, gain_db: float) -> np.ndarray:
    """Scale amplitude by ``gain_db`` decibels.

    This is the intensity-invariance augmentation. Low et al. (2024) found their
    UVFP models were partly reading recording intensity rather than voice
    quality; randomising gain over a wide range at training time removes that
    affordance without discarding the intensity-adjacent features outright.
    """
    y = _as_float(y)
    return (y * (10.0 ** (gain_db / 20.0))).astype(y.dtype)


def apply_reverb(
    y: np.ndarray,
    sr: int,
    rt60: float = 0.3,
    wet: float = 0.2,
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    """Convolve with a synthetic exponentially-decaying room impulse response.

    Simulates the small consulting rooms and living rooms patients actually
    record in. ``wet`` is the linear mix weight of the reverberant path;
    ``rt60`` is the decay time in seconds.
    """
    y = _as_float(y)
    if len(y) == 0 or wet <= 0:
        return y

    rng = rng or np.random.default_rng()
    n = max(2, int(rt60 * sr))
    # RT60 = time to decay by 60 dB, i.e. amplitude factor 1e-3.
    rir = rng.standard_normal(n) * np.exp(-np.arange(n) * (3.0 * np.log(10.0) / n))
    rir /= np.linalg.norm(rir) + _EPS

    wet_signal = signal.fftconvolve(y, rir, mode='full')[: len(y)]
    out = (1.0 - wet) * y + wet * wet_signal * (_rms(y) / (_rms(wet_signal) + _EPS))
    return out.astype(y.dtype)


def spec_augment(
    spec: np.ndarray,
    n_freq_masks: int = 1,
    freq_mask_width: int = 8,
    n_time_masks: int = 1,
    time_mask_width: int = 16,
    mask_value: float | None = None,
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    """SpecAugment-style masking of a ``[freq, time]`` spectrogram.

    Applies to the mel-spectrogram branch of the pipeline (the ResNet-50
    Grad-CAM model), not to the waveform branch. ``mask_value`` defaults to the
    mean of ``spec``, which keeps the masked region neutral for a network
    trained on normalised inputs.
    """
    spec = np.asarray(spec)
    if spec.ndim != 2:
        raise ValueError(f'expected a 2-D [freq, time] spectrogram, got shape {spec.shape}')

    rng = rng or np.random.default_rng()
    out = spec.astype(spec.dtype, copy=True)
    fill = float(spec.mean()) if mask_value is None else float(mask_value)
    n_f, n_t = out.shape

    for _ in range(n_freq_masks):
        width = int(rng.integers(0, min(freq_mask_width, n_f) + 1))
        if width:
            start = int(rng.integers(0, n_f - width + 1))
            out[start : start + width, :] = fill

    for _ in range(n_time_masks):
        width = int(rng.integers(0, min(time_mask_width, n_t) + 1))
        if width:
            start = int(rng.integers(0, n_t - width + 1))
            out[:, start : start + width] = fill

    return out


# --------------------------------------------------------------------------- #
# Composition
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class AugmentationConfig:
    """Ranges for :func:`augment`. Each is sampled uniformly, per call.

    ``p_*`` are the per-augmentation application probabilities.
    """

    pitch_semitones: tuple[float, float] = (-1.0, 1.0)
    stretch_rate: tuple[float, float] = (0.95, 1.05)
    snr_db: tuple[float, float] = (20.0, 40.0)
    gain_db: tuple[float, float] = (-12.0, 12.0)
    rt60_s: tuple[float, float] = (0.15, 0.45)
    reverb_wet: tuple[float, float] = (0.05, 0.25)

    p_pitch: float = 0.5
    p_stretch: float = 0.5
    p_noise: float = 0.5
    p_gain: float = 0.8
    p_reverb: float = 0.3

    order: tuple[str, ...] = field(
        default=('pitch', 'stretch', 'reverb', 'noise', 'gain'),
    )


#: Recommended starting point. Pitch and stretch stay inside the range where the
#: perturbation is smaller than normal within-speaker variation, so the RLN label
#: survives. Gain is deliberately wide — see :func:`gain_scale`.
CONSERVATIVE = AugmentationConfig()


def augment(
    y: np.ndarray,
    sr: int,
    config: AugmentationConfig = CONSERVATIVE,
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    """Apply a randomly sampled augmentation chain to ``y``.

    Pass a seeded ``rng`` for reproducible epochs::

        rng = np.random.default_rng(epoch * 10_000 + index)
        x = augment(waveform, sr=16_000, rng=rng)

    Gain is applied last so the requested SNR of the noise stage is not
    disturbed by a subsequent rescale.
    """
    rng = rng or np.random.default_rng()
    out = _as_float(y)
    if len(out) == 0:
        return out

    for step in config.order:
        if step == 'pitch' and rng.random() < config.p_pitch:
            out = pitch_shift(out, sr, float(rng.uniform(*config.pitch_semitones)))
        elif step == 'stretch' and rng.random() < config.p_stretch:
            out = time_stretch(out, float(rng.uniform(*config.stretch_rate)))
        elif step == 'reverb' and rng.random() < config.p_reverb:
            out = apply_reverb(
                out,
                sr,
                rt60=float(rng.uniform(*config.rt60_s)),
                wet=float(rng.uniform(*config.reverb_wet)),
                rng=rng,
            )
        elif step == 'noise' and rng.random() < config.p_noise:
            out = add_gaussian_noise(out, float(rng.uniform(*config.snr_db)), rng=rng)
        elif step == 'gain' and rng.random() < config.p_gain:
            out = gain_scale(out, float(rng.uniform(*config.gain_db)))

    return np.nan_to_num(out, nan=0.0, posinf=0.0, neginf=0.0)
