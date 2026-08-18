# `research/audio_preprocessing` — reference implementations

**These modules are not wired into the RecurrSens runtime, and should not be.**

RecurrSens does not run inference. `backend/patients/tasks.py::run_inference_task`
POSTs S3 keys to `settings.INFERENCE_SERVICE_URL` and stores what comes back;
all feature extraction, augmentation and model code lives in the external
inference service (the `Mesnero/ENT-Diagnostics` repo). This directory exists so
that work can be handed over as *runnable, tested code* rather than as prose in
a design document.

Nothing here imports Django, touches the database, or reads object storage. The
Django app does not import this package, and `manage.py test` does not collect
it.

## What's here

| File | Purpose |
|---|---|
| `augmentation.py` | Training-time augmentation: pitch shift, time stretch, additive noise at a target SNR, gain scaling, synthetic reverb, SpecAugment-style masking, plus a seeded `augment()` chain. |
| `noise_filtering.py` | Inference-time preprocessing meant to run immediately before feature extraction: high-pass, spectral gating, energy VAD, silence trimming, duration equalisation. |
| `tests/` | `pytest` suite. Every signal is generated from numpy primitives. |

Dependencies are `numpy` and `scipy` only — no `librosa`, no `torchaudio` — so
the modules drop into whatever environment the inference service already has.

```bash
pip install -r research/audio_preprocessing/requirements.txt
python -m pytest research/audio_preprocessing/tests -q
```

## No real audio, here or ever

The tests synthesise everything they need — harmonic stacks, noise, silence —
from `numpy`. See `tests/conftest.py`.

Patient recordings live in MinIO/S3 and must never be committed to this
repository, added as test fixtures, or checked in as extracted features. The
Saarbrücken corpus the models train on is likewise not redistributable here. If
you need a regression fixture, generate it.

## Design decisions worth keeping

These are the non-obvious choices; the rationale is in
[`docs/research/ai-feature-optimization.md`](../../docs/research/ai-feature-optimization.md)
and in the module docstrings.

- **Gain is randomised widely (±12 dB) on purpose.** Low et al. (2024) found a
  vocal-fold-paralysis classifier reading recording *intensity* rather than
  voice quality, because patients over-project. Gain augmentation is the
  cheapest way to make the model invariant to that confound.
- **Pitch and time perturbations are kept small (±1 semitone, ±5 %).** F0,
  jitter and shimmer *are* the label. The sex-specific biomarker thresholds in
  the inference service are calibrated on unshifted audio. Augment harder and
  you are relabelling, not regularising.
- **Peak normalisation is off by default.** Normalising at inference only, when
  the model was trained on un-normalised audio, is a train/serve skew. Do it on
  both sides or neither.
- **The spectral gate is floored, never zeroed.** The aperiodic turbulence of a
  breathy, incompletely-adducted glottis is the diagnostic signal in RLN
  paresis. A denoiser tuned by ear will remove it.
- **Preprocessing must be applied to the training data too.** Applying it on one
  side only reintroduces exactly the domain gap it is meant to close.

## Known gap this does not close

Browser capture currently calls `navigator.mediaDevices.getUserMedia({ audio: true })`
(`frontend/src/components/AudioRecorder.tsx`), so Chrome/Firefox/Safari apply
`autoGainControl`, `noiseSuppression` and `echoCancellation` by default, and
audio is then Opus-encoded. No amount of downstream filtering recovers what
those have already removed. That is a frontend fix, not a preprocessing one —
see the write-up.
