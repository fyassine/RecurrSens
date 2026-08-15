# Literature Review — Detecting Vocal Fold Paralysis from Voice Recordings

**Scope:** published work on detecting unilateral vocal fold paralysis (UVFP) /
recurrent laryngeal nerve paresis (*Recurrensparese*) from voice or audio
recordings, with particular attention to **when** in the clinical pathway the
recordings were collected (pre-operatively, post-operatively, or both).

**Purpose:** position RecurrSens against the state of the art and check whether
the platform's current two-phase recording design (`Patient.pre_op_date` /
`Patient.post_op_date`, `RecordingSession.Phase.PRE_OP` / `POST_OP`, see
`backend/patients/models.py`) is well-founded.

**Coordination point:** Lara.

---

## 0. Method and a caveat on sourcing

Literature was identified via web search in August 2026. The sandbox this review
was written in has restricted outbound network access: **publisher full texts
(PLOS, PMC, medRxiv, Springer, Wiley) could not be retrieved directly**, so the
summaries below are built from abstracts, indexed metadata and search-surfaced
excerpts rather than from a full-text read.

Consequences to keep in mind before citing this file in a submission:

- Numbers marked **[verify]** should be confirmed against the PDF before they go
  into a manuscript.
- Fields recorded as *not reported in the retrievable abstract* mean exactly
  that — they may well be stated in the full text.
- No claim below should be treated as a full-text–verified quotation.

---

## 1. Primary / SOTA reference

> **Identifying bias in models that detect vocal fold paralysis from audio
> recordings using explainable machine learning and clinician ratings**
> Reddy et al., **PLOS Digital Health** (2024), DOI `10.1371/journal.pdig.0000516`
> (PMID 38814939; PMC11139298). Earlier preprint: medRxiv `10.1101/2020.11.23.20235945`,
> first circulated 2020 under the title *"Uncovering the important acoustic
> features for detecting vocal fold paralysis with explainable machine learning."*

### 1.1 Dataset and design

Retrospective case–control study drawn from a tertiary-care laryngology
practice. A chart review covering **2009–2019** screened **1,043 patient charts**
of patients who had undergone endoscopic evaluation together with voice testing.
The final analysed sample was **77 patients with endoscopically confirmed UVFP**
and **77 controls with normal voices, matched for age and sex** (154 total).

Each participant contributed four acoustic recordings collected as part of
**routine clinical care**: three sustained phonations of the vowel /a/ and one
reading of the introductory paragraph of the **Rainbow Passage**.

**Recording timing — post-onset / effectively post-operative.** Recordings were
made at the diagnostic clinic visit, i.e. *after* the paralysis existed and was
confirmed by endoscopy. There is **no paired pre-operative baseline** for the
patient group, and the control group is a separate set of people rather than the
same people at an earlier time point. This matters a great deal for §1.2. The
paper nonetheless explicitly motivates **pre-operative screening before surgery
carrying a high risk of UVFP (notably thyroid surgery)** as a target application,
and notes that thyroid and parathyroid surgery account for roughly **32 % of
post-surgical UVFP** — so the clinical ambition is pre-operative even though the
data are not.

### 1.2 Method

- **Features:** the 88-parameter **eGeMAPS** set (extended Geneva Minimalistic
  Acoustic Parameter Set), extracted with openSMILE. Audio *duration* was
  deliberately **not** included as a model feature.
- **Models:** four machine-learning models trained on the eGeMAPS inputs
  **[verify — the exact four classifier families are not stated in the
  retrievable abstract]**, evaluated with bootstrapped ROC AUC.
- **Explainability:** **SHAP** (SHapley Additive exPlanations) was used to
  attribute predictions to individual acoustic features — this is the mechanism
  by which the bias was found, not a post-hoc nicety.

### 1.3 Findings on bias — the central contribution

Headline performance was strong: **highest median bootstrapped ROC AUC 0.87**,
which **exceeded clinician performance (AUC range 0.74–0.81)** on the same
recordings.

The paper's real result is that this number was partly **an artefact of how the
recordings were made, not of the pathology**:

1. **Duration bias.** Patient and control recordings differed systematically in
   audio duration. Even though duration was not a model input, features derived
   from the signal carry duration-correlated information, and the models
   exploited it. The authors describe duration as having a *complex* effect on
   both machines *and* human raters.
2. **Intensity / loudness bias.** Patients were recorded at a **higher amplitude**
   than controls. Two non-clinical explanations are offered: patients with a
   softer, breathier voice may have been **coached or induced to over-project**
   so a clean recording could be obtained, and/or **microphone gain was raised
   selectively** for those participants.
3. Both are **dataset-specific acquisition differences** between the patient and
   control groups — exactly the kind of shortcut that inflates in-sample AUC and
   **is unlikely to generalise** to a new clinic, a new microphone, or a new
   recording protocol.

**Mitigation and the reassuring part of the result:** after **matching audio
duration across groups** and **removing the eGeMAPS variables associated with
intensity**, the models still reached **similar high performance**. So there
*is* genuine pathological signal in the voice — but the naive pipeline was
partly reading the recording setup, and only the debiased pipeline supports the
claim that the model detects UVFP.

### 1.4 Findings on clinician ratings — how the bias was diagnosed

Clinicians listened to the **reading-passage** recordings and rated them; their
discrimination performance is reported as **AUC 0.74–0.81**, i.e. **below** the
model's 0.87.

The important point is *not* the horse race. The clinician ratings functioned as
an **independent human instrument for auditing the dataset**: because the raters
perceived and reported that the patient recordings sounded **over-projected and
louder**, the authors had human-side corroboration that the amplitude difference
was an acquisition artefact rather than a property of paretic voice. A purely
statistical audit could have shown that intensity features were predictive; only
the human ratings explained *why*.

Details not recoverable from the abstract and worth checking in the full text
before citing: **the number of clinicians, their specialty mix, the rating
instrument (GRBAS / CAPE-V or a bespoke scale), and the blinding protocol**
— all **[verify]**.

### 1.5 Why this is the right primary reference for RecurrSens

It is the closest published analogue to what RecurrSens is building (audio-only
UVFP detection, explainable model, clinician comparison), it is recent, and its
principal warning — *your acquisition protocol can become your classifier* —
lands directly on a platform whose entire value proposition is **standardised,
patient-self-administered, remote audio capture**.

---

## 2. Comparison table

| # | Paper | Year | Pre-op / post-op / both | Dataset size | Method |
|---|---|---|---|---|---|
| 1 | **Reddy et al., *Identifying bias in models that detect vocal fold paralysis…*, PLOS Digital Health** (preprint 2020) | **2024** | **Post-op / post-onset only** — recordings at the diagnostic visit after endoscopic confirmation; no paired pre-op baseline; separate matched healthy controls | 77 UVFP + 77 age/sex-matched controls (154), screened from 1,043 charts, 2009–2019 | eGeMAPS (88 feats, openSMILE) → 4 ML models; SHAP explainability; clinician listening panel; duration-matching + intensity-feature removal as bias mitigation. AUC 0.87 (clinicians 0.74–0.81) |
| 2 | Heikkinen, Penttilä, Qvarnström, Mäkinen, Löppönen, Kärkkäinen, *Perceptual Assessment and Acoustic Voice Analysis as Screening Tests for Vocal Fold Paresis After Thyroid or Parathyroid Surgery*, World Journal of Surgery | 2021 (online 2020) | **Both** — laryngoscopy + acoustic analysis pre-operatively *and* post-operatively in every patient | 181 patients (prospective); 14 (6.6 %) new post-op VFP | Perceptual **GRBAS** rating + **MDVP** acoustic analysis. Not machine learning. Post-op GRBAS grade > 0 → **93 % sensitivity**; **MDVP showed no significant group differences** |
| 3 | Heikkinen et al., *Patient Self-Assessment and Acoustic Voice Analysis in Screening of Postoperative Vocal Fold Paresis and Paralysis*, Scandinavian Journal of Surgery 110(4):524–532, DOI `10.1177/14574969211007036` | 2021 | **Both** — pre-op laryngoscopy + acoustic + VHI; post-op laryngoscopy before discharge; VHI again at 2 weeks; follow-up acoustic at 2 weeks for VFP cases + 20 random controls | 181 patients (same 2017 prospective cohort as #2) | **Voice Handicap Index** self-assessment + **MDVP**. Not machine learning. High specificity, poor sensitivity; post-op **jitter > 1.33 → 55 % sens / 95 % spec** |
| 4 | Hu, Chang, Wang, Li, Cho, Chen, Lu, Tsai, Lee, *Deep Learning Application for Vocal Fold Disease Prediction Through Voice Recognition*, J Med Internet Res 23(6):e25247 | 2021 | **Post-onset only**; surgical timing not reported | 741 samples: 189 normal + 552 disordered — vocal atrophy 224, **unilateral vocal paralysis 50**, organic lesions 248, adductor spasmodic dysphonia 30. Split 593 train / 148 test | **CNN** 5-class classifier on voice recordings; benchmarked against human specialists. Sens 0.66 / spec 0.91 / **acc 66.9 %**, vs 60.1 % & 56.1 % (laryngologists) and 51.4 % & 43.2 % (general ENT) |
| 5 | *Research on automatic assessment of the severity of unilateral vocal cord paralysis based on Mel-spectrogram and convolutional neural networks*, BioMedical Engineering OnLine, DOI `10.1186/s12938-025-01401-9` | 2025 | **Post-onset only**; severity grading, not surgical follow-up | 131 healthy + **292 confirmed UVCP** (Eye & ENT Hospital, Fudan University), stratified by vocal-fold compensation: decompensated 84, partially compensated 98, fully compensated 110 | **TripleConvNet** CNN on **Mel-spectrograms** plus first- and second-order deltas; multi-class *severity* grading rather than binary detection |
| 6 | *Diagnosis of unilateral vocal fold paralysis using auto-diagnostic deep learning model*, Scientific Reports (PMID 40730807) | 2025 | **Post-onset only** | 500 participants; 2,639 laryngeal videoendoscopy clips | **Not audio** — image-based vs video-based deep learning on **laryngeal videoendoscopy**. Image model > 98 % accuracy for detection but weak on laterality/type; video model ≈ 99 % and substantially better on laterality and paralysis type. Included as a modality contrast / accuracy ceiling |
| 7 | Saarbrücken Voice Database (SVD) benchmark studies — e.g. *Experimental Evaluation of Deep Learning Methods for an Intelligent Pathological Voice Detection System Using the SVD*, Applied Sciences 11(15):7149, and the SVD pathology-subset analyses | 2021– | **Unknown / not recorded** — SVD carries no surgical-timing metadata | SVD: 687 healthy + 1,356 pathological speakers across 71 disorders, including a *Rekurrensparese* (vocal fold paralysis) class; sustained /a/, /i/, /u/ at normal, high and low intensity plus rising–falling pitch, 50 kHz | Wide range of classical ML (RF, DT, SVM) and deep models. Reported accuracies span **≈ 68 %** on a clean sustained-/a/ protocol to **100 %** for some CNN backbones — a spread widely attributed to protocol and data-leakage differences rather than to real model quality |

---

## 3. Patterns across the literature

**Pattern 1 — the field records after the fact.** Every *machine-learning* study
found here (#1, #4, #5, #6, and the SVD-based work in #7) is **cross-sectional
and post-onset**: patients are recorded once, after the paralysis is already
established and endoscopically confirmed, and are compared against a **separate
group of healthy controls**. Not one of them trains on paired within-patient
pre-op → post-op audio.

**Pattern 2 — the studies that *do* record both phases are not ML studies.** The
only genuinely longitudinal, both-phase designs found (#2 and #3, the same
Finnish 181-patient thyroid/parathyroid cohort) use **classical acoustic
parameters (MDVP) and perceptual/self-report instruments (GRBAS, VHI)** — and
they largely report **negative or weak results**: MDVP showed no significant
group differences at all in #2, and jitter reached only 55 % sensitivity in #3,
while the *perceptual* GRBAS grade reached 93 % sensitivity. The obvious reading:
the signal is audible to trained ears, but the hand-picked classical parameter
set does not capture it. That is precisely the gap a learned representation on
paired pre/post audio should be able to close, and nobody appears to have run
that study.

**Pattern 3 — between-group designs are where the bias lives.** Paper #1's
finding is a direct consequence of Pattern 1. When the patient group and the
control group are different people recorded on possibly different occasions,
every incidental difference in the acquisition — session length, microphone
gain, how the technician coached the speaker — is confounded with the label. A
**within-subject** design does not automatically eliminate this, but it removes
the single largest source of it: speaker identity, and with it age, sex, body
size, habitual loudness, smoking history and baseline voice quality all cancel
out, because the comparison is a patient against their own earlier voice.

**Pattern 4 — the accuracy numbers are not comparable to each other.** 66.9 %
(#4), ≈ 87 % AUC (#1), 98–99 % (#6, endoscopy video), up to 100 % (#7) — these
differ by task, modality, class balance and, above all, by how carefully the
protocol was controlled. Paper #1 is the only one in this set that actively
tried to *lower* its own headline number by removing artefacts. Any RecurrSens
result should be reported in that spirit; a suspiciously high AUC on early data
is more likely a protocol leak than a breakthrough.

---

## 4. Implications for RecurrSens

### 4.1 The two-phase design is a genuine differentiator — lead with it

RecurrSens records the **same patient** in both `PRE_OP` and `POST_OP` phases
(`RecordingSession.Phase`, with `Patient.pre_op_date` / `Patient.post_op_date`,
and per-phase predictions `prediction_pre` / `prediction_post`). Against the
literature above this is unusual: it combines the **longitudinal both-phase
design** of the Finnish thyroid studies with the **machine-learning ambition** of
the UVFP detection papers, and no publication found here does both. The
comparison table's "pre-op / post-op / both" column is, in effect, the argument
for the platform.

Two concrete scientific advantages worth stating explicitly in the abstract:

- **Within-subject control.** Each patient is their own baseline, which
  neutralises the speaker-level confounders that a matched-control design can
  only approximate.
- **Screening-relevant framing.** Paper #1 names pre-operative screening before
  high-risk surgery as the application it *cannot* evaluate on its data.
  RecurrSens collects exactly that pre-operative recording, prospectively.

### 4.2 Bias risks RecurrSens inherits, and what to do about them

The primary reference is a warning aimed squarely at this platform. Concrete
exposures in the current implementation:

1. **Duration.** Recording length is patient-controlled in the wizard, and
   `ExerciseSkip` lets exercises be omitted entirely. If pre-op and post-op
   sessions end up systematically different in length — plausible, since a
   patient with a fresh paresis tires faster — duration becomes a label leak in
   exactly the way #1 describes. *Recommendation:* store per-recording duration
   as explicit metadata on `AudioFile`, report the pre/post duration
   distributions, and duration-match before modelling.
2. **Intensity / gain and device.** The pre-op and post-op sessions may be
   recorded weeks apart, potentially on a **different phone**, at a different
   distance, in a different room. `AudioFile` currently stores only
   `storage_key`, `exercise_id`, `phase` and timestamps — there is **no device,
   sample-rate, or input-gain metadata**. *Recommendation:* capture
   device/user-agent, sample rate and a calibration tone or measured input level
   per session, so intensity can be audited and normalised rather than silently
   learned.
3. **Coaching.** #1's most likely bias mechanism is that patients were *asked to
   speak up*. The wizard's on-screen instructions are the platform's equivalent
   of a technician, and they are at least **identical across phases and
   patients** — a real advantage over the retrospective clinical archives in the
   literature. This should be stated as a design property, and the instruction
   text should be version-pinned so it does not drift mid-study.
4. **No demographics stored.** `Patient` deliberately holds only a pseudonym and
   no demographics. This is right for data protection, but it means the
   subgroup-fairness auditing that #1 performs (age, sex) **cannot be reproduced
   on RecurrSens data**. Worth acknowledging as a limitation rather than leaving
   a reviewer to find it.
5. **No clinician perceptual rating field.** #1's bias diagnosis depended on
   human listeners. RecurrSens stores AI outputs (`prediction_pre/post`,
   `ai_percentage_rp_*`, `gradcam_*`) and *patient* usability feedback
   (`PatientFeedback.rating`), but **nothing that records a clinician's
   perceptual judgement of the recording** (GRBAS / CAPE-V, or even a
   "recording sounds unusually loud/quiet" flag). Given that GRBAS was the
   *best-performing* screening instrument in #2 (93 % sensitivity), adding a
   lightweight clinician rating would serve both as a bias audit channel and as
   a clinically credible comparator. **This is the single highest-value schema
   addition suggested by the review.**

### 4.3 On explainability

The platform already persists GradCAM outputs (`gradcam_prediction_pre/post`,
`gradcam_percentage_pre/post`) alongside the primary prediction. That aligns
with the SHAP-driven approach of #1 and with the field's general direction
(#7 aside). The lesson from #1 is that explainability is worth having **because
it catches artefacts**, not because it reassures clinicians — the GradCAM
outputs should be inspected for attention on silence, onset transients or
overall level, not only on the phonation itself.

---

## 5. Key takeaway (one paragraph)

The published literature on detecting vocal fold paralysis from audio is almost
entirely **cross-sectional and post-operative**: patients are recorded once,
after diagnosis, and compared against separately recruited healthy controls. The
SOTA reference (Reddy et al., PLOS Digital Health 2024) shows what that design
costs — its models reached ROC AUC 0.87 and beat clinicians (0.74–0.81) partly
by exploiting **recording artefacts**, namely systematic differences in audio
duration and in intensity caused by patients over-projecting or by microphone
gain being raised for them; blinded clinician listening ratings were what
exposed the loudness artefact as an acquisition effect, and performance only
remained trustworthy after duration was matched and intensity-linked features
were removed. The few studies that *do* record both pre- and post-operatively
(the Finnish 181-patient thyroid/parathyroid cohort) are not machine-learning
studies and found classical acoustic parameters largely uninformative, while
perceptual GRBAS rating reached 93 % sensitivity. **RecurrSens sits in the gap
between those two groups**: it prospectively collects paired pre-operative and
post-operative recordings from the same patient under an identical, scripted,
self-administered protocol, which is both a real novelty claim and the strongest
available structural defence against the acquisition bias that the SOTA paper
identified — provided the platform starts capturing duration, device and input-level
metadata, and adds a clinician perceptual rating so that bias can actually be
audited.

---

## 6. Sources

- [Identifying bias in models that detect vocal fold paralysis from audio recordings using explainable machine learning and clinician ratings — PLOS Digital Health (2024)](https://journals.plos.org/digitalhealth/article?id=10.1371%2Fjournal.pdig.0000516) · [PubMed 38814939](https://pubmed.ncbi.nlm.nih.gov/38814939/) · [PMC11139298](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11139298/) · [medRxiv preprint](https://www.medrxiv.org/content/10.1101/2020.11.23.20235945v6)
- [Uncovering the important acoustic features for detecting vocal fold paralysis with explainable machine learning — medRxiv (2020, earlier title of the above)](https://www.medrxiv.org/content/10.1101/2020.11.23.20235945v1.full)
- [Perceptual Assessment and Acoustic Voice Analysis as Screening Tests for Vocal Fold Paresis After Thyroid or Parathyroid Surgery — World Journal of Surgery (2021)](https://onlinelibrary.wiley.com/doi/10.1007/s00268-020-05863-x) · [PubMed 33249535](https://pubmed.ncbi.nlm.nih.gov/33249535/)
- [Patient Self-Assessment and Acoustic Voice Analysis in Screening of Postoperative Vocal Fold Paresis and Paralysis — Scandinavian Journal of Surgery (2021)](https://pubmed.ncbi.nlm.nih.gov/33843366/)
- [Deep Learning Application for Vocal Fold Disease Prediction Through Voice Recognition — J Med Internet Res (2021)](https://www.jmir.org/2021/6/e25247)
- [Research on automatic assessment of the severity of unilateral vocal cord paralysis based on Mel-spectrogram and convolutional neural networks — BioMedical Engineering OnLine (2025)](https://link.springer.com/article/10.1186/s12938-025-01401-9)
- [Diagnosis of unilateral vocal fold paralysis using auto-diagnostic deep learning model — Scientific Reports (2025)](https://www.nature.com/articles/s41598-025-09797-z)
- [Experimental Evaluation of Deep Learning Methods for an Intelligent Pathological Voice Detection System Using the Saarbruecken Voice Database — Applied Sciences (2021)](https://www.mdpi.com/2076-3417/11/15/7149)
- [Multimodal Laryngoscopic Video Analysis for Assisted Diagnosis of Vocal Fold Paralysis — arXiv:2409.03597](https://arxiv.org/pdf/2409.03597)
