"""Unit tests for the noise-filtering module — synthetic audio only."""

from __future__ import annotations

import numpy as np
import pytest

from ..augmentation import add_gaussian_noise
from ..noise_filtering import (
    PreprocessConfig,
    energy_vad,
    estimate_noise_psd,
    fix_duration,
    highpass_filter,
    preprocess,
    spectral_gate,
    trim_silence,
)
from .conftest import SR, measure_f0, si_snr_db, synth_vowel


class TestHighpassFilter:
    def test_attenuates_low_frequency_rumble(self, vowel, sr):
        t = np.arange(len(vowel)) / sr
        rumble = 0.5 * np.sin(2.0 * np.pi * 20.0 * t)
        out = highpass_filter(vowel + rumble, sr, cutoff_hz=60.0)

        # Energy in the 0-40 Hz band should collapse.
        def band_energy(x):
            spec = np.abs(np.fft.rfft(x))
            freqs = np.fft.rfftfreq(len(x), 1.0 / sr)
            return np.sum(spec[freqs < 40.0] ** 2)

        assert band_energy(out) < 0.01 * band_energy(vowel + rumble)

    def test_preserves_phonation_band(self, vowel, sr):
        out = highpass_filter(vowel, sr, cutoff_hz=60.0)
        assert measure_f0(out, sr) == pytest.approx(120.0, rel=0.05)

    def test_removes_dc_offset(self, vowel, sr):
        biased = vowel + 0.4
        out = highpass_filter(biased, sr)
        assert abs(out.mean()) < 0.01 * abs(biased.mean())

    def test_preserves_length(self, vowel, sr):
        assert len(highpass_filter(vowel, sr)) == len(vowel)

    def test_short_clips_pass_through(self, sr):
        tiny = np.ones(5)
        np.testing.assert_allclose(highpass_filter(tiny, sr), tiny)


class TestNoisePsdEstimate:
    def test_tracks_the_injected_noise_floor(self, vowel, sr, rng):
        quiet = estimate_noise_psd(add_gaussian_noise(vowel, 40.0, rng=rng), sr)
        loud = estimate_noise_psd(add_gaussian_noise(vowel, 5.0, rng=rng), sr)
        # Median, not mean: a few harmonic bins dominate the mean and swamp the
        # floor the estimator is actually tracking.
        assert np.median(loud) > 10.0 * np.median(quiet)

    def test_shape_matches_the_rfft_bin_count(self, vowel, sr):
        assert estimate_noise_psd(vowel, sr, n_fft=1024).shape == (513,)

    def test_handles_empty_input(self, sr):
        assert estimate_noise_psd(np.zeros(0), sr).shape == (513,)


class TestSpectralGate:
    @pytest.mark.parametrize('input_snr', [5.0, 10.0, 15.0])
    def test_improves_snr(self, vowel, sr, rng, input_snr):
        noisy = add_gaussian_noise(vowel, input_snr, rng=rng)
        gated = spectral_gate(noisy, sr)
        assert si_snr_db(vowel, gated) > si_snr_db(vowel, noisy)

    def test_preserves_length(self, vowel, sr, rng):
        noisy = add_gaussian_noise(vowel, 10.0, rng=rng)
        assert len(spectral_gate(noisy, sr)) == len(noisy)

    def test_preserves_f0(self, vowel, sr, rng):
        noisy = add_gaussian_noise(vowel, 10.0, rng=rng)
        assert measure_f0(spectral_gate(noisy, sr), sr) == pytest.approx(120.0, rel=0.05)

    def test_attenuation_is_floored_not_zeroed(self, sr, rng):
        # A pure noise clip must not be annihilated: the aperiodic component of
        # breathy phonation is diagnostic in RLN paresis, and a gate that can
        # reach zero will erase it.
        noise = rng.standard_normal(SR)
        out = spectral_gate(noise, sr, reduction_db=12.0)
        assert np.sqrt(np.mean(out**2)) > 0.1 * np.sqrt(np.mean(noise**2))

    def test_stronger_reduction_removes_more_energy(self, vowel, sr, rng):
        noisy = add_gaussian_noise(vowel, 5.0, rng=rng)
        mild = spectral_gate(noisy, sr, reduction_db=3.0)
        harsh = spectral_gate(noisy, sr, reduction_db=30.0)
        assert np.sum(harsh**2) < np.sum(mild**2)

    def test_accepts_an_external_noise_profile(self, vowel, sr, rng):
        noisy = add_gaussian_noise(vowel, 10.0, rng=rng)
        profile = estimate_noise_psd(rng.standard_normal(SR) * 0.05, sr)
        out = spectral_gate(noisy, sr, noise_psd=profile)
        assert len(out) == len(noisy)
        assert np.all(np.isfinite(out))


class TestEnergyVad:
    def test_finds_the_voiced_region(self, vowel_with_silence, sr):
        mask, _, hop = energy_vad(vowel_with_silence, sr)
        voiced = np.flatnonzero(mask)
        assert voiced.size > 0
        # Phonation runs from 0.30 s to 0.90 s.
        assert voiced[0] * hop / sr == pytest.approx(0.30, abs=0.05)
        assert voiced[-1] * hop / sr == pytest.approx(0.90, abs=0.05)

    def test_is_invariant_to_recording_gain(self, vowel_with_silence, sr):
        # The threshold is relative to the loudest frame, so a device that
        # records 20 dB hotter must yield the same decision.
        quiet, _, _ = energy_vad(vowel_with_silence * 0.05, sr)
        loud, _, _ = energy_vad(vowel_with_silence * 5.0, sr)
        np.testing.assert_array_equal(quiet, loud)

    def test_rejects_short_transients(self, sr):
        clip = np.zeros(sr)
        clip[sr // 2 : sr // 2 + int(0.005 * sr)] = 1.0  # 5 ms click
        mask, _, _ = energy_vad(clip, sr, min_speech_ms=50.0)
        assert not mask.any()

    def test_silence_yields_no_detections(self, sr):
        mask, _, _ = energy_vad(np.zeros(sr), sr)
        assert not mask.any()

    def test_clip_shorter_than_one_frame(self, sr):
        mask, _, _ = energy_vad(np.ones(10), sr)
        assert mask.size == 0


class TestTrimSilence:
    def test_removes_leading_and_trailing_silence(self, vowel_with_silence, sr):
        out = trim_silence(vowel_with_silence, sr, pad_ms=50.0)
        # 0.6 s of phonation plus 2x50 ms padding.
        assert len(out) / sr == pytest.approx(0.7, abs=0.06)

    def test_preserves_the_phonation(self, vowel_with_silence, sr):
        assert measure_f0(trim_silence(vowel_with_silence, sr), sr) == pytest.approx(
            150.0, rel=0.05
        )

    def test_all_silence_is_returned_unchanged(self, sr):
        silence = np.zeros(sr)
        np.testing.assert_allclose(trim_silence(silence, sr), silence)

    def test_keeps_internal_pauses(self, sr):
        # Pause structure inside connected speech is informative, so only the
        # outer edges may be trimmed.
        clip = np.concatenate(
            [
                synth_vowel(f0=120.0, seconds=0.3),
                np.zeros(int(0.4 * SR)),
                synth_vowel(f0=120.0, seconds=0.3),
            ]
        )
        assert len(trim_silence(clip, sr, pad_ms=0.0)) / sr == pytest.approx(1.0, abs=0.06)


class TestFixDuration:
    @pytest.mark.parametrize('seconds', [0.5, 1.0, 2.5])
    def test_output_length_is_exact(self, vowel, sr, seconds):
        assert len(fix_duration(vowel, sr, seconds)) == round(seconds * sr)

    def test_pads_short_clips_symmetrically(self, sr):
        out = fix_duration(np.ones(sr // 2), sr, 1.0, center=True)
        assert out[0] == 0.0 and out[-1] == 0.0
        assert out[sr // 2] == 1.0

    def test_pads_from_the_end_when_not_centered(self, sr):
        out = fix_duration(np.ones(sr // 2), sr, 1.0, center=False)
        assert out[0] == 1.0 and out[-1] == 0.0

    def test_crops_long_clips(self, vowel, sr):
        assert len(fix_duration(vowel, sr, 0.4)) == int(0.4 * sr)


class TestPreprocessChain:
    def test_improves_snr_on_a_noisy_clip(self, vowel, sr, rng):
        noisy = add_gaussian_noise(vowel, 8.0, rng=rng)
        out = preprocess(noisy, sr, PreprocessConfig(trim=False))
        assert si_snr_db(vowel, out) > si_snr_db(vowel, noisy)

    def test_preserves_f0_end_to_end(self, vowel_with_silence, sr, rng):
        noisy = add_gaussian_noise(vowel_with_silence, 15.0, rng=rng)
        assert measure_f0(preprocess(noisy, sr), sr) == pytest.approx(150.0, rel=0.06)

    def test_peak_normalisation_is_off_by_default(self, vowel, sr):
        # Normalising at inference only, while the model was trained on
        # un-normalised audio, is a train/serve skew. Default must be off.
        assert PreprocessConfig().peak_normalize is False
        loud = preprocess(vowel * 4.0, sr)
        quiet = preprocess(vowel * 0.25, sr)
        assert np.max(np.abs(loud)) > 4.0 * np.max(np.abs(quiet))

    def test_peak_normalisation_when_enabled(self, vowel, sr):
        out = preprocess(vowel * 0.01, sr, PreprocessConfig(peak_normalize=True))
        assert np.max(np.abs(out)) == pytest.approx(1.0, abs=1e-6)

    def test_duration_equalisation(self, vowel_with_silence, sr):
        out = preprocess(vowel_with_silence, sr, PreprocessConfig(duration_s=2.0))
        assert len(out) == 2 * sr

    def test_output_is_finite(self, vowel_with_silence, sr, rng):
        for snr in (0.0, 10.0, 40.0):
            out = preprocess(add_gaussian_noise(vowel_with_silence, snr, rng=rng), sr)
            assert np.all(np.isfinite(out))

    def test_handles_empty_input(self, sr):
        assert preprocess(np.zeros(0), sr).size == 0

    def test_does_not_mutate_its_input(self, vowel, sr):
        original = vowel.copy()
        preprocess(vowel, sr)
        np.testing.assert_allclose(vowel, original)
