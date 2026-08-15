# Abstract Draft — RecurrSens

**Status:** draft for conference / journal submission.
**Coordination point:** Lara.
**Target length:** 250–350 words for the abstract body.

> **Before submitting:** the two values marked `[TBD]` in *Results/Cohort* are
> placeholders. This sandbox has no access to the production database, so no
> real patient counts or feedback statistics appear anywhere in this document.
> Run `python manage.py abstract_metrics` against the production database
> (see §2) and paste the returned numbers in.

---

## 1. Abstract

**Title (working):** *RecurrSens: a QR-token voice-recording platform for paired
pre- and post-operative screening of recurrent laryngeal nerve paresis*

**Background.** Unilateral vocal fold paralysis (UVFP) caused by recurrent
laryngeal nerve injury is a recognised complication of thyroid and parathyroid
surgery, yet detection still depends on laryngoscopy. Published machine-learning
approaches to detecting UVFP from voice are almost exclusively cross-sectional:
patients are recorded once, after diagnosis, and compared against separately
recruited healthy controls. That design has been shown to admit acquisition
biases — systematic differences in recording duration and signal intensity
between groups — that inflate apparent performance and generalise poorly.

**Objective.** We present RecurrSens, a clinical data-collection platform built
to produce *paired* pre-operative and post-operative voice recordings from the
same patient under an identical, scripted protocol, and to support explainable
automated analysis of those recordings.

**Methods.** Clinicians enrol patients through a JWT-protected dashboard under a
pseudonym; no demographic data are stored. Each patient receives a QR code
encoding a UUID access token, with a typed fallback code, that opens a guided
browser-based recording wizard requiring no account or app install. The wizard
leads the patient through a fixed set of voice exercises — sustained vowels and
phrases — in a pre-operative and a post-operative phase, with on-screen
instructions held constant across phases and centres. Audio uploads directly to
S3-compatible object storage; a Celery worker then submits each completed phase
to an inference service asynchronously, and per-phase predictions, probabilities
and Grad-CAM attributions return to the clinician dashboard. Patients optionally
rate the recording experience on a five-point scale. Completed records export as
CSV plus audio archives.

**Results / Cohort.** As of `[TBD — date]`, `[TBD — run against production DB]`
patients have been enrolled across participating centres, of whom
`[TBD — run against production DB]` have completed the post-operative phase.
Mean patient-reported usability rating was `[TBD — run against production DB]`
of 5 (n = `[TBD]`).

**Conclusion.** RecurrSens operationalises the within-subject pre/post design
that the current UVFP literature lacks. By making each patient their own
baseline and holding the acquisition protocol fixed across both phases, it
directly targets the confounders that limit existing case–control models, and
yields a prospectively collected corpus suitable for pre-operative screening
research.

---

## 2. Filling in the cohort numbers

A management command implements both queries verbatim:

```bash
# inside the backend container
docker compose exec backend python manage.py abstract_metrics

# machine-readable, e.g. to paste into a script
docker compose exec backend python manage.py abstract_metrics --json

# restrict to one centre
docker compose exec backend python manage.py abstract_metrics --center "MRI"
```

Source: `backend/patients/management/commands/abstract_metrics.py`.

### 2.1 Number of enrolled patients

Soft-deleted records (`Patient.deleted_at` set — audio removed, metadata
retained) are excluded, since they no longer contribute usable voice data.

```python
from patients.models import Patient

# Total enrolled (excluding soft-deleted)
enrolled = Patient.objects.filter(deleted_at__isnull=True).count()

# Completed the post-operative phase — the terminal state of the workflow
# (Status: NEW → CONSENT_GIVEN → PRE_OP_DONE → POST_OP_STARTED → POST_OP_DONE)
completed = Patient.objects.filter(
    deleted_at__isnull=True,
    status=Patient.Status.POST_OP_DONE,
).count()

# Full breakdown across the five real Status choices
from django.db.models import Count

breakdown = (
    Patient.objects.filter(deleted_at__isnull=True)
    .values('status')
    .annotate(n=Count('id'))
    .order_by('status')
)
```

**Value: `[TBD — run against production DB]`**

### 2.2 Average patient-reported usability rating

`PatientFeedback.rating` is a `PositiveSmallIntegerField` validated to 1–5, and
is **nullable** — feedback can be submitted with a comment only, or skipped
entirely (`PatientFeedback.skipped`). Both must be filtered out or the mean is
wrong.

```python
from django.db.models import Avg, Count
from patients.models import PatientFeedback

usability = PatientFeedback.objects.filter(
    rating__isnull=False,
    skipped=False,
    patient__deleted_at__isnull=True,
).aggregate(
    average_rating=Avg('rating'),
    n_ratings=Count('id'),
)
# -> {'average_rating': ..., 'n_ratings': ...}
```

**Value: `[TBD — run against production DB]`** (report as mean ± SD with n; the
command prints the per-phase split for `PRE_OP` and `POST_OP` as well, in case
usability differs between the two visits — itself a reportable finding.)

---

## 3. Notes for the co-authors

- **Word count.** The abstract body above is **344 words** as written, or **327**
  counting each bracketed placeholder as a single token — inside the 250–350
  target either way, but with little headroom. Recount after the real numbers
  are substituted.
- **Novelty claim.** The "paired pre/post, same patient, identical protocol"
  framing is the defensible claim; see `docs/research/literature-review.md` §3–4
  for the evidence that no published ML study does this.
- **Limitations to state in the full paper, not the abstract.** No demographics
  are stored, so subgroup fairness auditing (age, sex) is not possible on this
  data; `AudioFile` does not yet record duration, device or input gain, which
  are exactly the acquisition variables the SOTA reference found to be
  confounded; and there is currently no clinician perceptual rating (GRBAS /
  CAPE-V) stored alongside the AI prediction.
- **Do not report an AUC from early data without a duration- and
  intensity-matched control analysis** — see literature review §4.2.
