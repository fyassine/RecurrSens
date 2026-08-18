"""
Synthetic audio fixtures.

Every signal here is generated from numpy primitives. No real patient audio is
used anywhere in this test suite, and none may be added — patient recordings
live in MinIO/S3 and must never enter the repository.
"""

from __future__ import annotations

import numpy as np
import pytest

SR = 16_000


def synth_vowel(
    f0: float = 120.0,
    seconds: float = 1.0,
    sr: int = SR,
    n_harmonics: int = 12,
    jitter: float = 0.0,
    seed: int = 0,
) -> np.ndarray:
    """A crude sustained-vowel surrogate: a decaying harmonic stack at ``f0``.

    ``jitter`` (as a fraction of the period) perturbs the instantaneous
    frequency, which lets a test move a signal toward or away from "pathology"
    without touching real data.
    """
    rng = np.random.default_rng(seed)
    t = np.arange(int(seconds * sr)) / sr

    phase = 2.0 * np.pi * f0 * t
    if jitter:
        drift = np.cumsum(rng.standard_normal(len(t))) * jitter / sr
        phase = phase + 2.0 * np.pi * f0 * drift

    out = np.zeros_like(t)
    for k in range(1, n_harmonics + 1):
        out += np.sin(k * phase) / k
    return (out / np.max(np.abs(out))).astype(np.float64)


def measure_f0(y: np.ndarray, sr: int = SR) -> float:
    """Estimate F0 by picking the peak of the autocorrelation."""
    y = y - y.mean()
    corr = np.correlate(y, y, mode='full')[len(y) - 1 :]
    lo, hi = int(sr / 500.0), int(sr / 50.0)  # search 50-500 Hz
    return sr / (lo + int(np.argmax(corr[lo:hi])))


def snr_db(clean: np.ndarray, noisy: np.ndarray) -> float:
    """SNR of ``noisy`` treating ``noisy - clean`` as the noise term.

    Only valid when nothing has rescaled the signal — use it to check that a
    mixing function hit its requested SNR, not to score an enhancer.
    """
    noise = noisy[: len(clean)] - clean
    return 10.0 * np.log10(np.sum(clean**2) / (np.sum(noise**2) + 1e-12))


def si_snr_db(clean: np.ndarray, estimate: np.ndarray) -> float:
    """Scale-invariant SNR — the right metric for scoring an enhancer.

    A spectral gate multiplies every bin by a mask below 1, so it necessarily
    attenuates the signal along with the noise. Plain SNR charges that rescale
    as error and would report a working denoiser as a broken one; SI-SNR
    projects out the gain first.
    """
    clean = clean - clean.mean()
    estimate = estimate[: len(clean)] - estimate[: len(clean)].mean()

    alpha = np.dot(estimate, clean) / (np.dot(clean, clean) + 1e-12)
    target = alpha * clean
    residual = estimate - target
    return 10.0 * np.log10(np.sum(target**2) / (np.sum(residual**2) + 1e-12))


@pytest.fixture
def sr() -> int:
    return SR


@pytest.fixture
def vowel() -> np.ndarray:
    """1 s sustained /a/-like tone at 120 Hz."""
    return synth_vowel(f0=120.0, seconds=1.0)


@pytest.fixture
def vowel_with_silence() -> np.ndarray:
    """0.3 s silence, 0.6 s phonation, 0.4 s silence."""
    return np.concatenate(
        [
            np.zeros(int(0.3 * SR)),
            synth_vowel(f0=150.0, seconds=0.6),
            np.zeros(int(0.4 * SR)),
        ]
    )


@pytest.fixture
def rng() -> np.random.Generator:
    return np.random.default_rng(20260815)
