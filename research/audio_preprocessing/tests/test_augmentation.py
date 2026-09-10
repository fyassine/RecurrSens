"""Unit tests for the augmentation module — synthetic audio only."""

from __future__ import annotations

import numpy as np
import pytest

from ..augmentation import (
    CONSERVATIVE,
    AugmentationConfig,
    add_gaussian_noise,
    add_noise_at_snr,
    apply_reverb,
    augment,
    gain_scale,
    pitch_shift,
    spec_augment,
    time_stretch,
)
from .conftest import measure_f0, snr_db, synth_vowel


class TestTimeStretch:
    @pytest.mark.parametrize('rate', [0.8, 0.95, 1.25, 1.5])
    def test_duration_scales_by_inverse_rate(self, vowel, rate):
        out = time_stretch(vowel, rate)
        assert out.shape[0] == pytest.approx(len(vowel) / rate, rel=0.02)

    @pytest.mark.parametrize('rate', [0.8, 1.25])
    def test_f0_is_preserved(self, vowel, sr, rate):
        # The whole point of a phase vocoder: duration moves, pitch does not.
        assert measure_f0(time_stretch(vowel, rate), sr) == pytest.approx(120.0, rel=0.05)

    def test_identity_rate_is_a_noop(self, vowel):
        np.testing.assert_allclose(time_stretch(vowel, 1.0), vowel)

    def test_rejects_non_positive_rate(self, vowel):
        with pytest.raises(ValueError):
            time_stretch(vowel, 0.0)


class TestPitchShift:
    @pytest.mark.parametrize('n_steps', [-4, -1, 1, 4])
    def test_f0_moves_by_the_requested_ratio(self, vowel, sr, n_steps):
        expected = 120.0 * 2.0 ** (n_steps / 12.0)
        assert measure_f0(pitch_shift(vowel, sr, n_steps), sr) == pytest.approx(expected, rel=0.05)

    def test_duration_is_preserved(self, vowel, sr):
        assert len(pitch_shift(vowel, sr, 2)) == len(vowel)

    def test_zero_steps_is_a_noop(self, vowel, sr):
        np.testing.assert_allclose(pitch_shift(vowel, sr, 0), vowel)


class TestNoise:
    @pytest.mark.parametrize('target', [5.0, 20.0, 35.0])
    def test_gaussian_noise_hits_the_requested_snr(self, vowel, target, rng):
        noisy = add_gaussian_noise(vowel, target, rng=rng)
        assert snr_db(vowel, noisy) == pytest.approx(target, abs=0.5)

    def test_shorter_noise_is_tiled_to_length(self, vowel, rng):
        short = rng.standard_normal(len(vowel) // 4)
        out = add_noise_at_snr(vowel, short, 20.0, rng=rng)
        assert len(out) == len(vowel)
        assert snr_db(vowel, out) == pytest.approx(20.0, abs=0.5)

    def test_longer_noise_is_cropped_to_length(self, vowel, rng):
        long = rng.standard_normal(len(vowel) * 3)
        out = add_noise_at_snr(vowel, long, 20.0, rng=rng)
        assert len(out) == len(vowel)

    def test_is_reproducible_under_a_seed(self, vowel):
        a = add_gaussian_noise(vowel, 20.0, rng=np.random.default_rng(7))
        b = add_gaussian_noise(vowel, 20.0, rng=np.random.default_rng(7))
        np.testing.assert_allclose(a, b)


class TestGainScale:
    @pytest.mark.parametrize('gain_db', [-20.0, -6.0, 6.0, 20.0])
    def test_rms_moves_by_the_requested_decibels(self, vowel, gain_db):
        before = np.sqrt(np.mean(vowel**2))
        after = np.sqrt(np.mean(gain_scale(vowel, gain_db) ** 2))
        assert 20.0 * np.log10(after / before) == pytest.approx(gain_db, abs=1e-6)

    def test_leaves_f0_untouched(self, vowel, sr):
        # Gain must be a pure intensity perturbation — this is what makes it
        # safe to randomise widely for intensity-invariance.
        assert measure_f0(gain_scale(vowel, 15.0), sr) == pytest.approx(measure_f0(vowel, sr))


class TestReverb:
    def test_preserves_length(self, vowel, sr, rng):
        assert len(apply_reverb(vowel, sr, rng=rng)) == len(vowel)

    def test_changes_the_signal(self, vowel, sr, rng):
        out = apply_reverb(vowel, sr, rt60=0.4, wet=0.5, rng=rng)
        assert not np.allclose(out, vowel)

    def test_zero_wet_is_a_noop(self, vowel, sr, rng):
        np.testing.assert_allclose(apply_reverb(vowel, sr, wet=0.0, rng=rng), vowel)


class TestSpecAugment:
    def test_masks_are_applied(self, rng):
        spec = rng.random((64, 100))
        out = spec_augment(
            spec, n_freq_masks=1, freq_mask_width=8, n_time_masks=1, time_mask_width=16, rng=rng
        )
        assert out.shape == spec.shape
        assert not np.allclose(out, spec)

    def test_mask_value_is_used(self, rng):
        spec = rng.random((32, 50))
        out = spec_augment(spec, freq_mask_width=8, time_mask_width=8, mask_value=-1.0, rng=rng)
        assert (out == -1.0).any()

    def test_zero_width_masks_leave_the_input_alone(self, rng):
        spec = rng.random((32, 50))
        out = spec_augment(spec, freq_mask_width=0, time_mask_width=0, rng=rng)
        np.testing.assert_allclose(out, spec)

    def test_does_not_mutate_its_input(self, rng):
        spec = rng.random((32, 50))
        original = spec.copy()
        spec_augment(spec, rng=rng)
        np.testing.assert_allclose(spec, original)

    def test_rejects_non_2d_input(self, vowel):
        with pytest.raises(ValueError):
            spec_augment(vowel)


class TestAugmentChain:
    def test_is_reproducible_under_a_seed(self, vowel, sr):
        a = augment(vowel, sr, rng=np.random.default_rng(42))
        b = augment(vowel, sr, rng=np.random.default_rng(42))
        np.testing.assert_allclose(a, b)

    def test_different_seeds_give_different_output(self, vowel, sr):
        a = augment(vowel, sr, rng=np.random.default_rng(1))
        b = augment(vowel, sr, rng=np.random.default_rng(2))
        assert not (len(a) == len(b) and np.allclose(a, b))

    def test_output_is_finite(self, vowel, sr):
        for seed in range(25):
            out = augment(vowel, sr, rng=np.random.default_rng(seed))
            assert np.all(np.isfinite(out))
            assert out.size > 0

    def test_conservative_ranges_preserve_f0_within_a_semitone(self, sr):
        # The label must survive augmentation: under CONSERVATIVE the pitch
        # perturbation stays inside normal within-speaker variation.
        vowel = synth_vowel(f0=120.0, seconds=1.0)
        config = AugmentationConfig(p_noise=0.0, p_reverb=0.0, p_gain=0.0)
        semitone = 2.0 ** (1.0 / 12.0)
        for seed in range(15):
            out = augment(vowel, sr, config=config, rng=np.random.default_rng(seed))
            assert 120.0 / semitone * 0.95 <= measure_f0(out, sr) <= 120.0 * semitone * 1.05

    def test_does_not_mutate_its_input(self, vowel, sr):
        original = vowel.copy()
        augment(vowel, sr, rng=np.random.default_rng(3))
        np.testing.assert_allclose(vowel, original)

    def test_handles_empty_input(self, sr):
        assert augment(np.zeros(0), sr).size == 0

    def test_conservative_is_the_default_config(self):
        assert CONSERVATIVE.pitch_semitones == (-1.0, 1.0)
        # Gain is deliberately wide — it is the intensity-invariance knob.
        assert CONSERVATIVE.gain_db == (-12.0, 12.0)
        assert CONSERVATIVE.p_gain >= 0.8
