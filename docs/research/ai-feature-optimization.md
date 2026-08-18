# KI-Modellierung und Diagnose — Feature Optimisation, Recording Selection, and Explainability

**Work package:** KI-Modellierung und Diagnose (Maxi)
**Status:** research proposal — methodology and reasoned hypotheses, not measured results
**Scope:** how to choose the recordings and features that maximise AUC, which
three recordings to choose, and how to find out what the model is actually
using.

---

## 0. What this document is, and what it deliberately does not contain

This repository does not run the model. `backend/patients/tasks.py::run_inference_task`
POSTs a list of S3 keys to `settings.INFERENCE_SERVICE_URL` and writes the
response onto the `Patient` record. There is no training code here, no access to
the production database, and no patient audio — recordings live in MinIO/S3 and
are never checked in.

**There are therefore no measured AUC values, accuracy figures, or patient
outcomes in this document.** Every number that appears in an output block is
marked *illustrative* and is a formatting placeholder. What this document does
contain is the exact procedure — and, where useful, the code — that would
produce those numbers when run against the real corpus by whoever owns the
inference service.

The model side *was* available while writing this: the team's ML code
(`Mesnero/ENT-Diagnostics`, branch `handoff/cloud-agent-snapshot`) was attached
read-only, so the proposals below are grounded in the pipeline that actually
exists rather than in generic literature. No data was copied out of it.

---

## 1. The system as it stands

### 1.1 What patients record

`backend/patients/fixtures/exercises.json` defines 15 exercises:

| # | `exercise_id` | Task | In Saarbrücken corpus? |
|---|---|---|---|
| 1–4 | `i_h`, `i_n`, `i_l`, `i_lhl` | Vowel /i/ — high, normal, low, low-high-low glide | yes |
| 5–8 | `a_h`, `a_n`, `a_l`, `a_lhl` | Vowel /a/ — high, normal, low, glide | yes |
| 9–12 | `u_h`, `u_n`, `u_l`, `u_lhl` | Vowel /u/ — high, normal, low, glide | yes |
| 13 | `iau` | Vowel sequence /i-a-u/ in one breath | **no** |
| 14 | `phrase` | "Guten Morgen, wie geht es Ihnen?" | yes |
| 15 | `happy_birthday` | Sung "Happy Birthday" | **no** |

Exercises 1–12 and 14 are precisely the Saarbrücken Voice Database (SVD)
protocol — three vowels at four pitch conditions plus the standard German
sentence. That is not a coincidence: `model/architectures/*/dataset.py` reads
SVD directly (`healthy/` vs `rekurrensparese/`, `.nsp` Kay files), and
`extract_metadata.py` parses the SVD `overview.csv`.

**This has a hard consequence for combination search.** `iau` and
`happy_birthday` have *no training support whatsoever* in SVD. A model trained
on SVD cannot score them, and including them in a combination search would be
scoring noise. The search space is the **13 SVD-supported exercises**, unless
and until RecurrSens' own labelled recordings are large enough to fine-tune on —
at which point `iau` (a within-breath vowel transition, i.e. a sustained probe
of adduction stability) becomes the more interesting of the two to revisit.

### 1.2 What the models are

Three architectures exist in `model/architectures/`:

- **`FiLMClassifier`** — the one actually deployed. Per recording it extracts
  HuBERT `facebook/hubert-base-ls960` mean-pooled embeddings (768-d) concatenated
  with openSMILE **eGeMAPSv02 Functionals (88-d)** → 856-d, then an MLP whose
  hidden representation is FiLM-modulated by `[age, sex]`. Notably it applies
  *metadata dropout*: with p=0.5 during training, `age` is shuffled within the
  batch to stop the model using age as a shortcut — an explicit, already-present
  bias mitigation.
- **`biovoiceNet`** — a rule-based classifier over five interpretable
  biomarkers (**HNR, Jitter ppq5, Shimmer apq11, CPP, F0 variability**) with
  sex-specific thresholds in `postprocessing/intervals.md`. Pathological if ≥2 of
  5 markers are out of range, or 1 marker with "excellent separation" (currently
  Jitter).
- **`gradcamPro`** — ResNet-50 over mel-spectrograms with `[age, sex]`
  concatenated late, for Grad-CAM saliency.

`run_inference_task` reads `film_classifier` and `gradcam_pro` from the
`/predict` response, so the first and third are live.

### 1.3 How recordings are currently combined

`model/architectures/FiLMClassifier/inference/inference_script.py` looks for
exactly four files:

```python
expected_files = ['a_n.wav', 'i_n.wav', 'u_n.wav', 'phrase.wav']
```

scores each independently, and aggregates by **unweighted mean of the softmax
probabilities**:

```python
avg_probs = torch.stack(all_probs).mean(dim=0)
```

Meanwhile the Django side sends *every* recording for the phase:

```python
audio_files = AudioFile.objects.filter(patient=patient, phase=phase)
keys = list(audio_files.values_list('storage_key', flat=True))
```

So the platform collects up to 15 takes and the model uses 4 of them, chosen —
as far as the code shows — by convention rather than by measurement. Reducing
that to a justified 3 is the substance of this work package, and it is worth
real money in session time: the `ExerciseSkip` model already exists because
patients do not always finish.

---

## 2. Reference literature

The anchor paper is **Low, Rao, Randolph, Song & Ghosh (2024)**, which is the
closest published work to this exact problem — detecting unilateral vocal fold
paralysis (UVFP) from voice, with explainability and an explicit bias audit.
Their setup overlaps ours almost line for line: **the same 88 eGeMAPS features**
this pipeline extracts, a sustained vowel /a/ task and a connected-speech task,
and SHAP for feature attribution. They report median bootstrapped ROC AUC in the
range **0.79–0.87 depending on model and task**, beating clinician raters
(0.74–0.81).

Their central result is a warning, not a score: the models were partly reading
**recording duration and intensity** rather than voice quality. Pathological
speakers over-projected (or were recorded at higher gain), so loudness leaked the
label. After matching duration and removing intensity-associated variables,
comparable performance was recoverable — but the naive model had been right for
the wrong reason. Section 6 applies that lesson to RecurrSens, where the exposure
is worse.

Supporting work used below:

- **Eyben et al. (2016)** — the eGeMAPS parameter set itself: a deliberately
  minimal, clinically interpretable 88-parameter set. Relevant because it defines
  what our 88 dimensions *are*, and therefore what a SHAP attribution can mean.
- **Jiang, Hsu, Pan, Yu, Chen & Hsieh (2025)** — CPP as an outcome measure in
  UVFP specifically; smoothed CPP tracks perceived dysphonia severity better
  than jitter, shimmer or HNR, particularly where breathiness dominates. This is
  the single most useful pointer for *which* acoustic dimension to protect.
- **Yagnavajjula, Mittapalle, Alku, Sreenivasa & Mitra (2024)** — wavelet
  scattering features to separate spasmodic dysphonia from **recurrent laryngeal
  nerve palsy** on SVD; direct evidence that the RLNP class in SVD is separable
  and that source-domain features carry it.
- **Vrba et al. (2025)** — reproducible voice-pathology detection on SVD. Two
  things matter for us: they searched **20 480 feature subsets** with repeated
  stratified CV (the combinatorial-search design we borrow in §3), and they call
  out **data leakage from multiple recordings per patient** as the field's
  recurring methodological failure. They also report results **separately by
  sex**, which SVD's imbalance demands.

Full citations in §8.

---

## 3. Methodology: finding the combination that maximises AUC

### 3.1 First, fix the unit of prediction

`SVDDataset.__getitem__` returns **one sample per audio file**, carrying the
patient's label. The clinical question is about the *patient*. These are not the
same thing, and conflating them causes two distinct problems.

**Leakage.** If recordings from one patient land in both train and validation,
the model can memorise the speaker and the reported AUC is fiction. The FiLM
notebooks get this right — `pipeline_improved.ipynb` uses
`GroupShuffleSplit` on `groups = [s['patient_id'] for s in dataset.samples]`.
But `gradcamPro/train.py:40` and `biovoiceNet/train.py:18` both call plain
`random_split` on the file-level dataset. **Those two split by recording, not by
patient.** With up to 13 recordings per speaker, that is a severe leak, and any
AUC they have reported is not comparable to the FiLM numbers. This is the single
highest-priority fix in this document, and it is a three-line change.

**Aggregation is a modelling choice, not plumbing.** The current unweighted mean
of softmax probabilities treats a confident wrong take and a hesitant right one
as equals. It should be evaluated as a hyperparameter (§3.4).

Everything below is therefore evaluated at **patient level**, with grouping by
`patient_id` enforced at every split.

### 3.2 The search space

Choosing 3 of the 13 SVD-supported exercises gives

$$\binom{13}{3} = 286$$

candidate combinations. This is small enough to search **exhaustively** — no
greedy forward selection needed, and greedy selection would in any case miss the
complementarity effects that are the whole point (a recording is worth including
because it tells you something the others do not, not because it scores well
alone).

The search is cheap because features are already cached per recording:
`SVDDataset` writes `{patient_id}_{filename}.pt`. Extract features **once** for
all recordings, then the 286 evaluations are MLP fits over cached tensors, not
repeated HuBERT passes. Budget the feature extraction, not the search.

For completeness, the same harness answers the more general question — the best
combination of *any* size is a search over $2^{13}-1 = 8191$ subsets, which is
also tractable and tells you what the 3-recording constraint costs.

### 3.3 Nested, grouped cross-validation

This is the part that is easy to get wrong. With 286 candidates and a corpus of
order 10² patients, **selecting the best combination and reporting its score on
the same data will produce an optimistically biased AUC** — the winner's margin
is substantially selection noise. The fix is that combination selection happens
strictly inside an inner loop:

```
outer: GroupKFold(n_splits=5) on patient_id        # unbiased estimate
  inner: GroupKFold(n_splits=5) on patient_id      # selection
    for each of the 286 combinations:
      for each inner fold: fit -> score patients -> AUC
    pick the combination maximising mean inner AUC
  refit on the full outer-train split with that combination
  score the untouched outer-test split
report: mean +/- CI of the 5 outer AUCs
```

Two properties worth stating explicitly:

- The reported AUC estimates the performance of *the whole procedure* ("search
  286 combinations, then fit"), which is what you would actually deploy.
- The inner loop may select a **different** combination per outer fold. That is
  not a bug — it is the honest signal that the choice is unstable. Report the
  selection frequency across folds; a combination chosen in 5/5 folds is a real
  finding, one chosen in 2/5 is a coin flip.

Stratify folds by label **and by sex**. SVD is sex-imbalanced, the biomarker
thresholds are sex-specific, and Vrba et al. report per-sex results for exactly
this reason.

### 3.4 Aggregation operators to compare

For each candidate combination, treat the patient-level aggregator as a
hyperparameter selected in the inner loop:

| Operator | Rationale |
|---|---|
| Mean of probabilities | Current behaviour; the baseline to beat. |
| Mean of logits | Less saturating — a 0.99 and a 0.51 do not average to "probably". |
| Max of probabilities | Matches clinical reasoning: one clearly pathological take is diagnostic. Raises sensitivity, costs specificity. |
| Trimmed mean / median | Robust to one corrupted take (a cough, a truncated upload). |
| Learned weights | A 3-input logistic layer over per-recording logits. Learns that, say, `phrase` deserves more weight — but adds parameters to a small-*n* problem; regularise and expect it to win only marginally. |
| Concatenation | Concatenate the three 856-d vectors into one 2568-d input and train a single classifier. Strictly more expressive (it can model interactions *between* recordings), strictly more prone to overfit. Worth one row in the table. |

The current default is a reasonable prior, not a measured optimum. Note that
`max` interacts badly with missing takes, and `ExerciseSkip` means missingness is
real — define the operator's behaviour on 2-of-3 explicitly.

### 3.5 Statistical comparison — and honesty about power

Ranking 286 combinations by point-estimate AUC and declaring a winner is not a
result. Required:

1. **Bootstrap over patients** (not recordings), ≥2000 resamples, BCa intervals.
2. **DeLong's test** for the paired comparison of correlated ROC curves — every
   combination is evaluated on the same patients, so the comparisons are paired
   and independent-sample tests overstate significance.
3. **Benjamini–Hochberg FDR correction** across the comparisons actually made.
4. **One-standard-error rule.** Take the set of combinations whose mean AUC is
   within 1 SE of the best, then break the tie on secondary criteria — worst-case
   subgroup AUC (§3.6), patient burden, and robustness to a missing take. This is
   where a defensible recommendation comes from, not from the top of the list.

Expect the honest outcome to be *a set*, not a winner. With realistic *n*, the
top ~20 combinations will very likely be statistically indistinguishable. Report
the set and choose within it on clinical grounds — and say so, rather than
manufacturing a false ordering.

### 3.6 Bias-controlled AUC (the Low et al. lesson)

A combination that wins on raw AUC while reading loudness is worse than useless.
Every candidate is therefore scored **twice**: once normally, once under
confound control.

- **Duration.** Record clip duration per recording. Test its univariate AUC
  against the label. If duration alone separates the classes, the model has a
  free shortcut — equalise with `fix_duration()` before feature extraction and
  re-run.
- **Intensity.** eGeMAPS contains `loudness_*` and `equivalentSoundLevel_dBp`
  functionals. Run the whole pipeline (a) with them and (b) with every
  intensity-associated feature ablated. The gap between the two AUCs *is* the
  intensity-shortcut magnitude. Low et al. found comparable performance survived
  ablation; if ours collapses, we have their bias and none of their mitigation.
- **Subgroup AUC.** Report AUC by sex and by age band, with CIs. A combination
  with 0.86 overall and 0.62 in women is not an 0.86 model. Note this is
  possible **only on SVD** — RecurrSens stores no demographics at all, so
  subgroup analysis on production data is currently impossible (§6, finding 0).

---

## 4. Proposal: the best 3-recording combination

### 4.1 Recommendation

> **`a_n` + `i_lhl` + `phrase`**
>
> — sustained /a/ at normal pitch, an /i/ pitch glide, and the connected-speech
> sentence.

This is a **hypothesis with a stated rationale, to be confirmed or refuted by
the procedure in §3** — not a measured result. Section 4.3 says what would
falsify it.

### 4.2 Why these three

The governing principle is **complementarity**: three recordings are worth
having only if each probes a different failure mode of the paretic larynx.
Source-filter theory is what makes this concrete. RLN paresis is a *source*
pathology — the vocal fold is immobile, adduction is incomplete, and the glottal
waveform is disturbed. Changing the **vowel** changes the vocal-tract *filter*,
which is not where the disease lives. Changing the **phonatory mode** — steady
vs. gliding vs. running speech — changes how the source is stressed, which is.

That single observation is the argument against the current set. `a_n`, `i_n`
and `u_n` are three steady-state phonations differing mainly in filter shape.
They are near-duplicates in the dimension that carries the diagnosis, and
eGeMAPS functionals partly normalise the difference away. Three-quarters of the
current 4-recording protocol is spent on one phonatory mode.

**`phrase` — connected speech. Non-negotiable.**
- It is the analogue of the Rainbow Passage in Low et al., one of the two tasks
  that produced their 0.79–0.87 range.
- It is the only task where **HuBERT is in-domain**. The encoder is
  `facebook/hubert-base-ls960` — pretrained on 960 h of *read connected speech*.
  Mean-pooling its output over a 2-second steady vowel asks it to represent
  something unlike anything it was trained on; over a sentence it is doing the
  job it was built for. 768 of the model's 856 input dimensions come from this
  encoder, so this is not a small consideration.
- It elicits behaviour a sustained vowel cannot: voice onset/offset across
  voiced–voiceless boundaries, prosodic F0 movement, and breath management. A
  paretic speaker leaks air, runs short, and pauses — measurable in running
  speech, invisible in a 2-second vowel.
- CPPS on connected speech is the strongest correlate of perceived dysphonia
  severity in UVFP (Jiang et al. 2025).

**`a_n` — sustained /a/, normal pitch. The stable reference.**
- The most standardised task in the voice literature and the vowel task in Low
  et al., so results stay comparable to published work.
- /a/ is an open vowel with minimal supraglottic constriction, giving the
  cleanest estimates of the perturbation measures. All five `biovoiceNet`
  biomarkers — HNR, jitter ppq5, shimmer apq11, CPP, F0 variability — are
  defined on sustained phonation, and the sex-specific thresholds in
  `intervals.md` are calibrated on it. Dropping the sustained vowel entirely
  would orphan the interpretable, clinician-facing half of the system.
- Keeps continuity with the deployed checkpoint and with SVD.

**`i_lhl` — /i/ low-high-low pitch glide. The differentiating pick.**
- This is what replaces `i_n` and `u_n`, and it is the substantive claim.
- RLN paresis impairs **pitch range** characteristically: cricothyroid and
  vocalis function is compromised, the high end of the range is lost first, and
  the transition is where voice breaks and pitch instability appear. A glide
  *provokes* the instability; a steady vowel waits for it.
- **F0 variability is one of the five biomarkers, and on a steady vowel it is
  nearly degenerate** — by construction there is almost no F0 movement to
  measure, so the feature is measuring micro-perturbation only. On a glide it
  becomes a genuine measure of phonatory control across the range. The same
  applies to the eGeMAPS F0 percentile/slope functionals, which are close to
  uninformative on `*_n` takes.
- /i/ rather than /a/ avoids redundancy with the reference vowel, and as a
  high-front vowel with tighter glottal adduction and a higher F0 ceiling it
  contrasts maximally with open /a/. `i_lhl` over `a_lhl` keeps the two vowels
  distinct across the pair.

**Why the dropped takes are the right ones to drop.** `i_n` and `u_n` are
collinear with `a_n` for the reasons above. `*_h` and `*_l` (static high/low)
probe range but only at one endpoint, and patients hit them inconsistently
without pitch guidance — the glide gets both endpoints *and* the transition in
one take, with better compliance. `iau` and `happy_birthday` have no SVD
training support at all (§1.1).

**Session cost.** Three takes instead of four, and the removed ones are the most
redundant. Given `ExerciseSkip`, shorter protocols mean more complete records.

### 4.3 What would falsify this

State this before running, not after:

- If `i_lhl` does not beat `i_n` as the third recording alongside `a_n` +
  `phrase` (paired DeLong, patient-level), the pitch-range argument does not hold
  in this corpus and the current protocol should stand.
- If glide recordings show materially higher feature-extraction failure rates —
  openSMILE F0 tracking breaking on voice breaks, surfacing as the `NaN` pattern
  Vrba et al. treat as a *feature* — then `i_lhl` is a data-quality liability
  even if its features are informative. **Check the NaN rate per exercise before
  anything else.**
- If `phrase` alone is statistically indistinguishable from any 3-combination,
  the honest recommendation is a **1-recording protocol**, and the whole
  combination question dissolves. This is a real possibility given the HuBERT
  domain argument, and it would be the most valuable finding available. Test it
  first — it is one model fit.

---

## 5. Feature-importance and explainability methodology

Mirrors the SOTA paper's approach, at the three levels the system has.

### 5.1 Which *recording* drives the decision — permutation importance

Operates on the aggregation stage; model-agnostic; directly answers the work
package's question.

For a fitted patient-level model and a held-out fold, for each exercise *e* in
the combination: replace recording *e*'s feature vector with the same recording
drawn from a **random other patient** (preserving the exercise, permuting the
speaker), re-score, and measure the AUC drop. Repeat ≥100 times for a CI.

Permuting *within exercise* is the important detail: it destroys the
patient-specific information while preserving the exercise's marginal
distribution, so the drop is attributable to that recording's contribution and
not to a distribution shift.

Report as a ranked table with CIs. An exercise whose permutation costs
approximately zero AUC is not contributing and should be dropped — this is also
the cheapest sanity check on the §4 proposal.

### 5.2 Which *features* drive it — SHAP on the interpretable block

Follow Low et al. directly, but note a structural constraint: the 856-d input is
768 HuBERT dimensions (individually meaningless — no clinician can act on
"HuBERT dim 412") plus 88 eGeMAPS parameters (each a named, interpretable
acoustic quantity). SHAP over the raw 856 is not interpretable, so:

- **`KernelExplainer`/`GradientExplainer` over the 88 eGeMAPS dimensions**, with
  the HuBERT block held at its background value. These are the attributions a
  clinician can read, and they are directly comparable to the published results
  since it is the same feature set.
- **Group SHAP** treating the HuBERT block as a *single* coalition member. This
  answers the architecturally interesting question — how much of the decision is
  the learned representation versus the classical acoustic parameters — without
  pretending individual embedding dimensions mean something.
- **Group by exercise as well**, so the same run yields both "which feature" and
  "which recording" attributions in one consistent framework.
- Aggregate with **mean |SHAP| across patients**, and always plot the beeswarm,
  not just the bar chart: direction and heterogeneity are where bias shows up.
  A feature that pushes toward "pathology" for women and "healthy" for men is
  invisible in a mean-magnitude ranking.

**The expected-value check.** Compare the SHAP ranking against the five
`biovoiceNet` biomarkers. If the FiLM model's top eGeMAPS attributions are
CPP-, HNR- and jitter-adjacent, the deep model and the rule-based model agree
and both are probably reading phonation. If the top attributions are
`loudness_*`, `equivalentSoundLevel_dBp` or duration-adjacent, **that is the Low
et al. bias reproducing in our pipeline**, and §3.6's ablation becomes mandatory
rather than a robustness check.

### 5.3 Where in the signal — Grad-CAM

`gradcamPro` exists for this. Saliency over the mel-spectrogram localises the
decision in time and frequency. Two specific validity checks:

- Does saliency fall on **phonated** regions? If it concentrates on silence,
  onset transients, or the clip edges, the model is reading recording artefacts.
  This is a cheap, visual, high-yield audit.
- Does it fall in the **glottal-source** bands (F0 and low harmonics, plus the
  high-frequency turbulence band where breathiness lives) rather than tracking
  formant structure? Formant tracking would mean it is reading vowel identity or
  vocal-tract length — the latter a sex proxy.

### 5.4 The bias audit — required, not optional

Reproduce the Low et al. audit on our data before trusting any AUC:

1. **Duration and intensity vs. label.** Univariate AUC of clip duration, and of
   mean intensity, against the diagnosis. Do this first; it is two lines and it
   can invalidate everything downstream.
2. **Sex and age shortcuts.** The FiLM model already shuffles `age` with p=0.5
   as metadata dropout — good. But `sex` is *not* dropped out, and the
   sex-conditioned FiLM parameters give the model a legitimate channel to
   specialise by sex and an illegitimate one to use sex as a prior when the
   corpus is imbalanced. Run the ablation: train with `sex` shuffled and compare.
3. **Subgroup performance.** AUC by sex, by age band, with CIs (§3.6).
4. **Clinician comparison.** Low et al.'s most valuable design choice was
   benchmarking the model against clinician ratings on the same recordings —
   it is what turned "AUC 0.87" into "better than the ENT in the room", the only
   claim that matters at deployment.

   RecurrSens **cannot currently do this**: `Patient` stores `prediction_pre`,
   `prediction_post` and the Grad-CAM equivalents, but there is no field for a
   clinician's own assessment and no ground-truth diagnosis field at all. There
   is nothing to compute an AUC *against* — the platform records what the model
   said and never what was true. Adding a blinded clinician rating and a
   confirmed post-operative diagnosis to the model is a precondition for
   evaluating anything on RecurrSens' own data, as opposed to on SVD. It is a
   small migration and it gates the entire evaluation programme.

---

## 6. Findings in the current pipeline

Concrete issues found while reading the code, ordered by impact on AUC validity.
Finding 0 spans both repositories; findings 1–4 are in `Mesnero/ENT-Diagnostics`
(attached read-only for this work — reported, not changed); finding 5 is in this
repository. None of these are fixed by this branch, which is documentation and
reference code only.

0. **The deployed model is conditioned on `age` and `sex`, and RecurrSens sends
   neither.** This is the most consequential mismatch found, and it spans both
   repositories.

   `FiLMConditionedClassifier.forward(audio_features, age, sex)` takes both as
   required arguments and uses them to generate the FiLM modulation
   (`metadata_dim=2`); `inference_script.py` takes `--age` and `--sex` as
   **required** CLI arguments; and `biovoiceNet` selects its entire threshold
   table by sex — the male/female values differ substantially (HNR 16.97 vs
   20.71, shimmer apq11 6.71 vs 4.39).

   But `run_inference_task` sends only:

   ```python
   payload = {'bucket': settings.S3_BUCKET, 'keys': keys}
   ```

   and `Patient` cannot supply the missing fields even in principle — the model
   docstring states *"Only voice samples and a pseudonym (patient_id) are stored
   — no demographics."* There is no age and no sex anywhere in the schema.

   So the inference service is receiving audio with no metadata for a model that
   requires metadata. Whatever it does about that — defaulting to a constant,
   imputing a population mean, inferring sex from F0 — is happening silently,
   outside this repo, and applies **the same wrong modulation to every
   patient**. If it defaults sex, roughly half of all BioVoiceNet threshold
   decisions are made against the wrong table.

   This needs a decision before any AUC work is meaningful, and it is a genuine
   design tension rather than an oversight: the no-demographics rule looks
   deliberate and privacy-motivated. The options, in order of preference:

   - **Collect the two fields and send them.** Age band and sex are the minimum
     the current models need. This is a data-protection question for the team,
     not a technical one — but note that the recordings themselves are far more
     identifying than a sex flag, so the marginal privacy cost is small.
   - **Retrain without metadata conditioning**, accepting whatever AUC that
     costs, and drop the FiLM branch. Honest, and removes a bias channel.
   - **Keep conditioning but make the default explicit and documented**, so that
     a constant is a recorded modelling choice rather than an accident.

   Whichever is chosen, `run_inference_task`'s payload and the service's
   expected schema should be documented together — they currently disagree.

   A direct consequence for §3.6: **subgroup AUC by sex and age cannot be
   computed on RecurrSens production data at all.** Those analyses are possible
   only on SVD, where `extract_metadata.py` recovers both from `overview.csv`.

1. **Recording-level splits leak patients.** `gradcamPro/train.py:40` and
   `biovoiceNet/train.py:18` call `random_split` on a file-level dataset. With
   up to 13 recordings per speaker, train and validation share patients and the
   resulting AUCs are inflated and not comparable to the FiLM notebooks (which
   correctly use `GroupShuffleSplit` on `patient_id`). Fix before any further
   benchmarking.

2. **Sex encoding is inconsistent across modules.** `extract_metadata.py` maps
   `w → 1, m → 0`, and `INFERENCE_README.md` documents `--sex 0=male, 1=female`
   — consistent. But `biovoiceNet/utils.py` `THRESHOLDS` is keyed `0 = Female,
   1 = Male`, the opposite. `gradcamPro/dataset.py` flips with `sex = 1 -
   sex_val` to reach a third convention. As written, BioVoiceNet applies male
   thresholds to women and vice versa — and because the thresholds differ
   substantially (HNR 16.97 vs 20.71, shimmer 6.71 vs 4.39), this silently
   degrades the rule-based classifier rather than failing loudly. Worth a shared
   constant and a test.

3. **`FiLMClassifier/inference.py` is stale and cannot run.** It imports
   `FlexibleMultimodalClassifier`, which is commented out in `model.py`, and
   calls it with a `text_features=` signature that `FiLMConditionedClassifier`
   does not accept. The working entry point is
   `inference/inference_script.py`. Delete or fix the stale one before someone
   deploys it.

4. **The four-recording set is undocumented convention.** Nothing in the repo
   records why `a_n, i_n, u_n, phrase` were chosen, or that unweighted
   probability averaging was compared against anything. §3–4 exist to replace
   that with a decision.

5. **Browser capture applies uncontrolled DSP — the largest domain gap.**
   `frontend/src/components/AudioRecorder.tsx:94` and
   `LandingScreen.tsx:120` both call:

   ```js
   navigator.mediaDevices.getUserMedia({ audio: true })
   ```

   With no constraints specified, Chrome, Firefox and Safari all default
   `autoGainControl`, `noiseSuppression` and `echoCancellation` to **on**. The
   audio is then Opus-encoded (`audio/webm;codecs=opus`, or `audio/mp4` on iOS).

   This is serious for this specific model, in three ways:

   - **AGC destroys the intensity information** the model may be relying on —
     and it does so *per device, per session*, i.e. as an uncontrolled variable
     rather than a consistent transform. Low et al.'s bias is not merely present
     here; it is randomised by hardware.
   - **Noise suppression is a neural denoiser tuned for intelligibility.** It
     specifically attenuates the aperiodic, breathy, turbulent components of the
     signal. In RLN paresis that turbulence *is* the diagnosis. The browser is
     removing the pathology before the model sees it.
   - **Train/serve mismatch.** The models are trained on SVD: studio-recorded,
     uncompressed Kay `.nsp`, no AGC, no denoising. They are served
     AGC'd, denoised, Opus-transcoded browser audio. Jitter, shimmer, HNR and CPP
     are all sensitive to lossy coding at these bitrates.

   The fix is cheap and belongs in the frontend:

   ```js
   navigator.mediaDevices.getUserMedia({
     audio: {
       autoGainControl: false,
       noiseSuppression: false,
       echoCancellation: false,
       channelCount: 1,
       sampleRate: 48000,
     },
   })
   ```

   Constraints are advisory — some browsers and most iOS versions will ignore
   them — so also **record what was actually applied** via
   `track.getSettings()` and persist it with the `AudioFile`. That turns an
   invisible confound into a covariate you can stratify on, and the platform
   already stores device info per patient. Until this lands, cross-device AUC
   comparisons are not interpretable, and no amount of the preprocessing in
   `research/audio_preprocessing/` recovers what AGC and NS have already removed.

---

## 7. Experiment plan

Ordered so that the cheapest invalidating checks run first.

| # | Step | Output |
|---|---|---|
| −1 | Resolve the `age`/`sex` gap (§6, finding 0); confirm what the service currently substitutes | Unblocks everything; may change the model |
| 0 | Duration/intensity univariate AUC vs. label; per-exercise openSMILE NaN rate | Go/no-go on everything below |
| 1 | Fix recording-level splits in `gradcamPro` / `biovoiceNet`; unify sex encoding | Comparable baselines |
| 2 | Extract and cache features once for all 13 exercises × all patients | Feature cache |
| 3 | Baseline: current `a_n, i_n, u_n, phrase` + mean-prob aggregation, patient-grouped nested CV | The number to beat |
| 4 | Single-recording AUC for each of the 13 | Marginal ranking; tests the `phrase`-alone hypothesis |
| 5 | Exhaustive 286-combination nested search × aggregation operators | Ranked set + selection frequency |
| 6 | DeLong + BH-FDR + one-SE rule | The defensible set, not a winner |
| 7 | Repeat 5 under intensity ablation and duration matching | Bias-controlled ranking |
| 8 | SHAP (eGeMAPS + grouped), permutation importance, Grad-CAM audit | Explainability report |
| 9 | Subgroup AUC by sex and age band | Fairness table |

Steps 0 and 4 are each under an hour of compute once features are cached, and
either can change the plan. Do not start at step 5.

### Search harness

Illustrative structure — patient-level, grouped, nested. Feature loading and the
model fit are stubs for the service's own code.

```python
from itertools import combinations

import numpy as np
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

SVD_EXERCISES = [
    'a_n', 'a_h', 'a_l', 'a_lhl',
    'i_n', 'i_h', 'i_l', 'i_lhl',
    'u_n', 'u_h', 'u_l', 'u_lhl',
    'phrase',
]  # 'iau' and 'happy_birthday' have no SVD training support -- see section 1.1


def patient_auc(combo, train_pids, test_pids, aggregate):
    """Fit on train_pids, score test_pids, return patient-level AUC."""
    model = fit_recording_model(train_pids, combo)          # service's own code
    scores, labels = [], []
    for pid in test_pids:
        probs = [model.predict_proba(features(pid, ex)) for ex in combo
                 if has_recording(pid, ex)]
        if not probs:                 # ExerciseSkip: missingness is real
            continue
        scores.append(aggregate(probs))
        labels.append(label(pid))
    return roc_auc_score(labels, scores)


def nested_search(pids, labels, groups, aggregators, k=5):
    """Outer loop gives the unbiased estimate; inner loop does the selecting."""
    outer_auc, selected = [], []

    for train_idx, test_idx in GroupKFold(k).split(pids, labels, groups):
        train, test = pids[train_idx], pids[test_idx]
        best, best_score = None, -np.inf

        for combo in combinations(SVD_EXERCISES, 3):        # 286 candidates
            for name, agg in aggregators.items():
                inner = [
                    patient_auc(combo, train[i], train[j], agg)
                    for i, j in GroupKFold(k).split(train, labels[train_idx],
                                                    groups[train_idx])
                ]
                if np.mean(inner) > best_score:
                    best_score, best = np.mean(inner), (combo, name)

        # The winner is refit on all of train and scored on untouched test.
        combo, name = best
        outer_auc.append(patient_auc(combo, train, test, aggregators[name]))
        selected.append(best)

    return outer_auc, selected
```

*Illustrative output — placeholder values, not measurements:*

```
Outer-fold AUC : 0.__ +/- 0.__     <- fill from a real run
Selected 5/5   : ('a_n', 'i_lhl', 'phrase'), aggregate='logit_mean'
                 ^ selection frequency is the stability signal (section 3.3)
```

---

## 8. References

1. **Low DM, Rao V, Randolph G, Song PC, Ghosh SS.** *Identifying bias in models
   that detect vocal fold paralysis from audio recordings using explainable
   machine learning and clinician ratings.* PLOS Digital Health, 2024.
   doi:10.1371/journal.pdig.0000516. PMID 38814939. Preprint: medRxiv
   2020.11.23.20235945. Code: `github.com/danielmlow/vfp`.
2. **Eyben F, Scherer KR, Schuller BW, et al.** *The Geneva Minimalistic Acoustic
   Parameter Set (GeMAPS) for Voice Research and Affective Computing.* IEEE
   Transactions on Affective Computing, 7(2):190–202, 2016. — defines the 88
   eGeMAPS parameters this pipeline extracts.
3. **Jiang JY, Hsu PM, Pan YA, Yu YH, Chen CK, Hsieh LC.** *Cepstral Peak
   Prominence: A Valuable Measure of Voice Outcome Severity in Patients With
   Unilateral Vocal Fold Paralysis.* Journal of Voice, 2025. PMID 39757085.
4. **Yagnavajjula MK, Mittapalle KR, Alku P, Sreenivasa RK, Mitra P.** *Automatic
   classification of neurological voice disorders using wavelet scattering
   features.* Speech Communication, 157:103040, 2024. — spasmodic dysphonia vs.
   recurrent laryngeal nerve palsy on the Saarbrücken corpus.
5. **Vrba J, Steinbach J, Jirsa T, Verde L, De Fazio R, Zeng Y, Ichiji K, Hájek L,
   Sedláková Z, Urbániová Z, Chovanec M, Mareš J, Homma N.** *Reproducible
   Machine Learning-based Voice Pathology Detection: Introducing the Pitch
   Difference Feature.* Journal of Voice, 2025. arXiv:2410.10537. PMID 40221253.
   — 20 480-subset feature search on SVD, patient-level leakage control,
   sex-stratified reporting.

---

## 9. Related deliverable

[`research/audio_preprocessing/`](../../research/audio_preprocessing/) — tested
reference implementations of the augmentation and preprocessing stages this
document assumes (intensity-invariance augmentation, duration equalisation,
conservative spectral gating, VAD trimming), written to be handed to whoever
owns the external inference service. They are not wired into the RecurrSens
runtime.
