# Live-Demonstration via QR-Code — technische Umsetzung

**Status:** implemented, inference stubbed
**Scope:** showing RecurrSens live at a conference / demo booth
**Code:** `backend/patients/demo_inference.py`, `backend/patients/demo_views.py`,
`frontend/src/pages/LiveDemo.tsx`, `backend/patients/management/commands/demo_qr.py`

---

## 1. What this is

A visitor at a booth scans a QR code, records about three seconds of a sustained
vowel on their own phone, and sees a classification result with a confidence
value. The whole thing takes well under a minute and leaves no trace: no patient
record, no audio file, no database row.

It is **not** the patient wizard with fewer steps. It is a separate flow with a
different data-protection contract, and the two must not be merged.

---

## 2. The privacy design, and why it differs from the normal flow

### 2.1 What the normal flow does

The clinical workflow is built to persist. `AudioUploadView` writes every
recording to MinIO/S3 and creates an `AudioFile` row pointing at the stored
object; the pre-sign views hand the browser a URL that puts the object straight
into the bucket. This is deliberate and correct — the recordings *are* the
research data, they are exported as CSV + ZIP, and they are backed up
indefinitely (see `_backup_audio_objects` in `patients/tasks.py`).

`.claude/CLAUDE.md` states the rule that follows from this:

> Never store audio files in Django's media root — always use MinIO/S3.

### 2.2 What the demo flow does instead

**The demo flow stores the audio nowhere at all.** Not in MinIO/S3, not on disk,
not in the database. Concretely, a demo recording:

| Location | Normal flow | Demo flow |
|---|---|---|
| MinIO / S3 object | ✅ written | ❌ never |
| `AudioFile` row | ✅ created | ❌ never |
| `Patient` row | ✅ required | ❌ never — no record exists |
| Django filesystem / temp file | ❌ never | ❌ never |
| Backup archive | ✅ kept indefinitely | ❌ nothing to keep |
| Log lines | metadata only | verdict + booth token only |
| Lifetime | retention period | one HTTP request |

The recording exists as a `bytes` object on the request-handling thread, is
handed to the inference backend, and is dropped when the request returns.

### 2.3 Why

A booth visitor is not a patient. There is no treatment relationship, no
informed consent process, and no clinical reason to keep their voice. Collecting
biometric voice data from passers-by so a demo can work would be both
disproportionate and a needless GDPR liability — a special-category (Art. 9)
processing question, a retention question, and a deletion-request question, all
for a thirty-second interaction whose only output is a number on a screen. If
nothing is stored, none of those questions arise, and the visitor can be told
so honestly, on screen, at the moment of the result.

There is a second benefit: "we can show you the platform without keeping your
voice" is itself a good thing to demonstrate to a clinical audience.

### 2.4 How it is enforced in code

Three mechanisms, because a comment alone would not survive refactoring:

1. **Physical separation.** The demo lives in `demo_views.py` and
   `demo_inference.py`, not in `views.py` / `services.py`. Those modules are
   full of S3 and ORM helpers, and the demo path must not grow a convenient
   call into any of them. The frontend page is likewise separate from
   `PatientWizardPage`.

2. **A memory-only upload handler.** This is the non-obvious one. Django's
   default upload handling spools any body over `FILE_UPLOAD_MAX_MEMORY_SIZE`
   (2.5 MB) to a **temporary file on disk** via `TemporaryFileUploadHandler`. A
   few seconds of WebM audio clears 2.5 MB easily, so on a stock configuration
   the demo audio would land in `/tmp` — quietly breaking the guarantee even
   though no application code ever "saves" anything. `MemoryOnlyAudioUploadHandler`
   forces the buffer to stay in RAM. Note that simply removing the temp handler
   is *not* a fix: with no active handler Django silently discards the file.

3. **A regression test.** `patients/tests/test_demo.py` asserts that a
   successful analysis leaves `Patient.objects.count() == 0` and
   `AudioFile.objects.count() == 0`, and that an upload larger than
   `FILE_UPLOAD_MAX_MEMORY_SIZE` still succeeds (i.e. that the memory handler is
   active and the file was not dropped). If someone "fixes" the demo into the
   persistent path, these fail first.

### 2.5 The honest caveat: the real inference service does touch disk

The guarantee above covers RecurrSens. The **inference service is a separate
process with its own behaviour**, and as it stands today it does write to disk:
`prepare_files_for_inference` (`inference-service/postprocess.py` in
ENT-Diagnostics) shells out to `ffmpeg` to transcode WebM → WAV and writes the
result, all inside a `tempfile.TemporaryDirectory()` that is removed when the
request finishes.

So when the stub is swapped for the real service (§5), the accurate claim
becomes: *the audio is never persisted; it exists transiently in memory in the
web tier and, during transcoding, as a temp file in the inference container that
is deleted at the end of the request.* That is still defensible, but it is a
different sentence from the one the stubbed demo can make, and the on-screen
wording plus any privacy notice should be revisited at that point rather than
inherited unchanged.

If a stricter guarantee is wanted later, the transcode can be moved to an
in-memory pipe (`ffmpeg -i pipe:0 -f wav pipe:1`), which removes the temp file
entirely. That is a change on the ENT-Diagnostics side, not here.

### 2.6 What the booth token is (and is not)

The QR code encodes `{APP_URL}/demo/{uuid}` — deliberately the same *shape* as a
patient link (`{APP_URL}/p/{uuid}`, see `services.generate_patient_pdf`), so the
mechanism is familiar and the existing QR tooling applies.

The resemblance stops there. A patient token is a `Patient` primary key and is
resolved against the database on every request (`IsPatientTokenValid`). The demo
token **is never looked up anywhere**. It identifies no record, grants no
access, and exists only so booth log lines can be correlated. Any well-formed
UUID works; the URL route uses `<uuid:token>` purely to keep the path shape
consistent. Opening `/demo` with no token at all also works — the page mints a
throwaway one client-side.

This is why the endpoint is `/api/demo/{token}/analyze/` and **not** under
`/api/p/{token}/`: that prefix means "a real patient record", and reusing it
would invite exactly the confusion this flow needs to avoid.

### 2.7 Abuse surface

The endpoint is unauthenticated by necessity — there is no account and no
patient record to authenticate against. It is bounded by:

- `DEMO_MODE_ENABLED` (default **false**; a 404, not a 403, when off — with no
  demo running the endpoint should not advertise that it exists),
- the `demo_inference` throttle scope (default `300/hour`, generous because a
  conference NATs every visitor behind one public IP),
- `DEMO_MAX_AUDIO_BYTES` (default 10 MB), checked from `Content-Length` *before*
  the body is parsed and again against the buffered size afterwards (a chunked
  request has no usable `Content-Length`),
- the same audio whitelist and magic-byte sniffing as the clinical upload path
  (`audio_validation.validate_audio_upload`) — the demo relaxes the storage
  rule, not the input validation.

---

## 3. UX and the timing budget

**Requirement: scan → result in under one minute.**

That constraint is what drives the design. The patient wizard has 15 exercises,
a consent screen, a demographics form and per-exercise example playback; running
it at a booth would take ten minutes and the queue would collapse. So the demo
keeps exactly one exercise and drops everything that is not needed to produce a
number.

### 3.1 Budget breakdown

| Step | Budget | Notes |
|---|---|---|
| Scan QR, browser opens the page | ~5 s | Static SPA route, no API call on load |
| Read the instruction | ~8 s | One sentence, one exercise, no consent wall |
| Grant microphone permission | ~5 s | First-time visitors only; browser prompt |
| Record the sustained vowel | ~3–5 s | Press-and-hold; `a_n`, min. 2 s |
| Client-side quality check | <1 s | RMS in dBFS + duration, in the browser |
| Tap "Auswerten", upload | ~2 s | A few hundred KB over booth wifi |
| Inference | ~1 s stub / ~5–15 s real | See the note below |
| Read the result | ~10 s | Colour, percentage, privacy confirmation |
| **Total** | **~35 s stub / ~45–55 s real** | |

### 3.2 What the budget cost

Three things were deliberately cut, and each is a real trade-off:

- **No demographics.** The real model is FiLM-conditioned on sex and age, so a
  real-model demo arguably needs them. Collecting them costs ~10 s and pushes a
  slow visitor over the minute. Compromise: the fields are wired through the API
  and settings (`DEMO_DEFAULT_GENDER` / `DEMO_DEFAULT_AGE`, overridable per
  request), so a future UI can supply them without touching the backend — but
  the demo UI does not ask. **If the demo is switched to the real model, add
  two quick chips for sex and age band, and re-budget.** A FiLM model fed the
  wrong conditioning produces a confidently wrong number, which is worse than a
  slow demo.
- **No example playback.** The wizard lets patients hear a reference recording.
  At a booth the presenter says "say aaah" out loud, which is faster.
- **One exercise, not the full set.** The real model averages over several
  recordings; one sustained vowel is a weaker input. This is acceptable only
  because the demo makes no clinical claim (§4).

### 3.3 The one number to watch

Inference latency is the only step not under this repo's control, and the only
one that can blow the budget. `DEMO_INFERENCE_TIMEOUT` defaults to 20 s so a
hanging call fails fast and returns a retryable error rather than stranding a
visitor at the booth with a spinner. Measure the real service's cold-start and
warm latency before demoing with it, and keep the container warm.

---

## 4. Result visualisation

The result screen shows, in order of visual weight:

1. **Colour.** Green (`green-6`) for a favourable/normal result. Anything else
   uses amber (`orange-6`), never red — this is a booth demo with no clinical
   validity, and a result that reads as an alarming diagnosis handed to a
   passer-by would be both misleading and unkind.
2. **The numeric confidence, prominently**: `XX%` at 3rem, plus a progress bar,
   plus the label "Konfidenz des Modells".
3. **The framing sentence.** *"Der Konfidenzwert beschreibt, wie sicher sich das
   Modell bei dieser Aufnahme ist. Er ersetzt keine ärztliche Beurteilung und
   ist nicht mit ihr gleichzusetzen."*

That third element is not boilerplate. The SOTA reference paper — *"Identifying
bias in models that detect vocal fold paralysis from audio recordings using
explainable machine learning and clinician ratings"* — is specifically about
what happens when a model's confidence is read as if it were a clinician's
judgement: the model's confidence and the clinicians' ratings diverge in
patterned, bias-revealing ways, and the number alone hides that. Showing a bare
percentage to a clinical audience without that framing would misrepresent the
very work this project builds on. The confidence is presented as *the model's
certainty about this recording*, adjacent to clinical judgement rather than a
substitute for it.

Two further elements:

4. **A privacy confirmation** — "Ihre Aufnahme wurde ausschließlich im
   Arbeitsspeicher verarbeitet und ist bereits gelöscht." Driven by the API's
   `stored: false` field, which is hardcoded because the endpoint has no branch
   that stores.
5. **A standing disclaimer** in the footer: demonstration without diagnostic
   validity.

---

## 5. Swapping the stub for the real inference call

### 5.1 The seam

`DemoInferenceBackend` (a `Protocol` in `demo_inference.py`) is the swap point.
Two implementations ship:

- `StubDemoInferenceBackend` (default) — fabricates a verdict deterministically
  from a SHA-256 digest of the audio bytes, so the same recording always yields
  the same number (reproducible rehearsals; an obvious signal if something is
  non-deterministic). Confidence lands in 71–96 %, biased towards `HEALTHY`.
  The digest is computed, used and dropped inside the call; it is never stored
  or logged. **It is not a model and the number has no clinical meaning.**
- `HttpDemoInferenceBackend` — posts the in-memory bytes to the real service.

Both return `DemoInferenceResult`, whose field names mirror the real service's
`/predict` response body (`film_classifier` / `gradcam_pro`, each with
`prediction` and `percentage`), so the swap is a settings change rather than a
refactor. Selection is `DEMO_INFERENCE_BACKEND` (`stub` | `http`); an unknown
value logs a warning and falls back to the stub.

### 5.2 The one blocker

The real service's `POST /predict` takes:

```json
{"bucket": "...", "keys": ["patient-uuid/pre_1/a_n.webm"], "gender": "M", "age": 45}
```

and downloads the audio from S3 by key (`main.py: download_files`). **That is
fundamentally incompatible with this flow**: using it would mean writing the
demo recording into the bucket first, which is precisely what must never happen.

So `HttpDemoInferenceBackend` targets a multipart variant instead —
`DEMO_INFERENCE_PREDICT_PATH`, default `/predict-upload` — that takes the bytes
directly. **This endpoint does not exist yet.** Until it ships, leave
`DEMO_INFERENCE_BACKEND=stub`.

### 5.3 The handler to add on the ENT-Diagnostics side

Roughly twenty lines, reusing everything `/predict` already does. Response body
unchanged, so nothing here needs to change:

```python
from fastapi import File, Form, UploadFile

@app.post("/predict-upload", response_model=InferenceResult)
async def predict_upload(
    file: UploadFile = File(...),
    gender: str = Form("M"),
    age: int = Form(45),
):
    """
    Same as /predict, but the audio arrives in the request body instead of
    being fetched from S3 — for the RecurrSens live demo, where the recording
    is never written to the bucket. Nothing here outlives the request.
    """
    if not inference_engine:
        raise HTTPException(status_code=503, detail="Inference engine not initialized")

    with tempfile.TemporaryDirectory() as temp_dir:
        # Keep the suffix: prepare_files_for_inference() decides whether to
        # transcode from the extension, and treats a name containing "phrase"
        # differently. A demo file must not be called *phrase*.
        suffix = os.path.splitext(file.filename or "demo.webm")[1] or ".webm"
        local_path = os.path.join(temp_dir, f"demo{suffix}")
        with open(local_path, "wb") as fh:
            fh.write(await file.read())

        processed = prepare_files_for_inference([local_path])
        sex_int = 1 if gender.upper() in ["W", "F", "FEMALE"] else 0
        result = inference_engine.run_inference(processed, age, sex_int)

        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
```

Then, on the RecurrSens side, the entire swap is:

```bash
DEMO_INFERENCE_BACKEND=http
INFERENCE_SERVICE_URL=http://inference:8001
DEMO_INFERENCE_PREDICT_PATH=/predict-upload
```

No code change. Re-read §2.5 and §3.2 before demoing with the real model.

### 5.4 Adding a different backend

Implement `analyze(*, audio, filename, content_type, gender, age)` returning a
`DemoInferenceResult`, and register the class in `_BACKENDS`. The only hard
requirement: **it must not persist `audio` anywhere.**

---

## 6. Running a demo

```bash
# 1. Enable the flow (dev has it on by default)
export DEMO_MODE_ENABLED=true

# 2. Mint a booth token and get the QR code
python manage.py demo_qr --out demo-qr.png

#    Live-demo booth link
#      URL   : https://recurrsens.eu/demo/3f2b...  ← print this as the QR
#      Token : 3f2b...
#      Backend: stub (fabricated scores)

# 3. Optional: pin the outcome for a rehearsed walk-through
export DEMO_STUB_FORCE_PREDICTION=HEALTHY
```

Print the QR, put it on the booth. Nothing else needs provisioning — there is no
patient to create, and no cleanup afterwards, because nothing was kept.

### Pre-demo checklist

- [ ] `DEMO_MODE_ENABLED=true` on the environment being demoed
- [ ] The site is served over **HTTPS** — `getUserMedia` is unavailable on
      insecure origins, and the recorder will refuse to start
- [ ] Try it once end-to-end on a phone over the booth wifi, not just on a laptop
- [ ] If using `DEMO_INFERENCE_BACKEND=http`: the service is warm, and §3.2's
      sex/age caveat has been dealt with
- [ ] Turn `DEMO_MODE_ENABLED` back off afterwards

---

## 7. Files

| File | Role |
|---|---|
| `backend/patients/demo_inference.py` | Backend interface, stub + HTTP implementations |
| `backend/patients/demo_views.py` | `POST /api/demo/{token}/analyze/`, memory-only upload handler |
| `backend/patients/tests/test_demo.py` | Privacy regression tests |
| `backend/patients/management/commands/demo_qr.py` | Booth QR / URL generation |
| `frontend/src/pages/LiveDemo.tsx` | One-recording page + result visualisation |
| `frontend/src/api/client.ts` | `analyzeDemoRecording()` |
| `backend/config/settings/base.py` | `DEMO_*` settings |
