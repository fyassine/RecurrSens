"""
Reference audio augmentation and preprocessing for the RLN-paresis models.

Not wired into the RecurrSens Django runtime — this package is reference
material for whoever owns the external inference service. See README.md.
"""

from .augmentation import (
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
from .noise_filtering import (
    DEFAULT,
    PreprocessConfig,
    energy_vad,
    estimate_noise_psd,
    fix_duration,
    highpass_filter,
    preprocess,
    spectral_gate,
    trim_silence,
)

__all__ = [
    'CONSERVATIVE',
    'DEFAULT',
    'AugmentationConfig',
    'PreprocessConfig',
    'add_gaussian_noise',
    'add_noise_at_snr',
    'apply_reverb',
    'augment',
    'energy_vad',
    'estimate_noise_psd',
    'fix_duration',
    'gain_scale',
    'highpass_filter',
    'pitch_shift',
    'preprocess',
    'spec_augment',
    'spectral_gate',
    'time_stretch',
    'trim_silence',
]
