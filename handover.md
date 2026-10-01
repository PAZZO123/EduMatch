# EduMatch AI: project handover

> Audience: the next engineer or AI model picking up this project.
> Written: 30 September 2026. The demo target date in the SRS is **1 October 2026**.
> Repo root: `C:\Users\USER\Desktop\My Projects\EduMatch` (git, branch `main`).
> Read sections 1–3 first. They explain what the system is and how to run it.
> Sections 4–9 explain how every part works. Sections 10–13 cover what was done,
> what was not done, and what to do next.

---

## Table of contents

1. What EduMatch AI is
2. Quick start (run it in 5 minutes)
3. Repository map
4. Architecture and request flow
5. The domain: allocation policy, eligibility, invariants
6. The AI model: data, training, comparison, serving
7. Backend (FastAPI) in detail
8. Frontend (React + Vite + Tailwind) in detail
9. Security, roles and accounts
10. Testing and the acceptance gate
11. Work log: what was done in this session and why
12. What was NOT done / known gaps and risks
13. Recommended next steps (prioritised)
14. Gotchas and conventions for whoever continues
15. Glossary

---

## 1. What EduMatch AI is

EduMatch AI is a hackathon demonstration for **NESA** (Rwanda's National Examination and
School Inspection Authority). It matches O-Level students to secondary school offers
using exam results, ranked preferences, school capacity and eligibility rules.

The governing idea is **"AI recommends, humans decide"**:

- A **deterministic rules engine** (serial priority allocation) makes the placement
  proposals. It is fully explainable.
- A **locally trained machine-learning model** is used only for one narrow job: when
  a student's listed choices all fail **and** the student opted into fallback, the model
  ranks the remaining eligible, available, *unlisted* schools by "compatibility".
- Every proposal is a **draft**. An officer must approve, change (with a reason) or
  reject it. Nothing is final until a human approves it.
- The backend independently re-checks every hard constraint before saving a plan or an
  approval. The constraints are capacity, eligibility, one seat per student, and
  preference authority.
- Everything is **synthetic data and demo policy**. Nothing claims to be real NESA
  policy or real placement accuracy. The SRS requires these labels to be visible.

The source of truth for requirements is
`EduMatch_AI_Software_Requirements_Specification.pdf` (13 pages, SRS v1.0). It defines:

- **FR-01…FR-18**: functional requirements (auth, seed, import, validation, rules, runs,
  AI inference, preferences, explanations, review, approval, change, reject, stale
  writes, export, audit, metrics, reset).
- **NFR-01…NFR-10**: correctness, ≤10 s for 500 students, reliability, offline, secrets,
  privacy, usability, traceability, maintainability, transparency.
- **AT-01…AT-08**: the acceptance gate.
- **§21**: a six-student hand-checkable fixture with known expected results.

One deliberate deviation: SRS §5 says "React + Vite; plain CSS". **The team uses
Tailwind CSS v4 instead.** This is intentional and is noted in the README. The PDF itself
was not edited.

---

## 2. Quick start

### 2.1 One-time setup (Windows, Git Bash or PowerShell)

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r ml/requirements.txt -r backend/requirements.txt
cd backend && ../.venv/Scripts/python scripts/init_env.py && cd ..
npm install
```

`init_env.py` writes `backend/.env` (git-ignored). It contains a random secret key and
the demo account usernames and passwords.

### 2.2 Run

Terminal 1 (backend, port 8010):

```bash
.venv/Scripts/python -m uvicorn app.main:create_app --factory --app-dir backend --port 8010
```

Terminal 2 (frontend, port 3000, proxies `/api` to 8010):

```bash
npm run dev
```

Open http://localhost:3000. Click **Sign In** and use a demo account.

Alternative, one process and offline: run `npm run build`, then start only the backend.
It serves `dist/` at http://127.0.0.1:8010 (`frontend_dist` setting in `backend/app/config.py`).

`.claude/launch.json` contains the same two configurations (`backend`, `frontend`).

### 2.3 Demo accounts

| Email | Title (UI role) | Server role |
|---|---|---|
| `superadmin@edumatch.rw` | Super Administrator | ADMIN |
| `placement@edumatch.rw` | Placement Administrator | ADMIN |
| `officer@edumatch.rw` | Placement Officer | OFFICER |
| `school@edumatch.rw` | School Administrator | VIEWER (read-only) |

- **Passwords** live in `backend/.env` (`EDUMATCH_*_PASSWORD`). A copy-friendly table is
  in `DEMO_ACCOUNTS.local.md`. Both files are git-ignored. **Never commit passwords.**
- The backend only creates these accounts on first start. After editing a password in
  `.env`, apply it to the existing database with:
  `cd backend && ../.venv/Scripts/python scripts/set_demo_passwords.py`
- The live database also has two legacy accounts, `admin` and `officer`, from an older
  build. They cannot sign in through the UI because the email field has `type="email"`.
  They are harmless.

### 2.4 Tests

```bash
cd backend && ../.venv/Scripts/python -m pytest -q      # 93 tests, about 70–100 s
cd .. && npx tsc --noEmit                                 # frontend type-check
npm run build                                             # production bundle
```

At handover: **93 passed**, tsc clean, build OK. The in-app Acceptance Gate: **8/8 PASS**
in about 4 s.

### 2.5 The five-minute demo script (SRS §23)

1. Sign in as Super Admin. The Dashboard shows the synthetic-data / demo-policy labels.
2. **Data & Cohort**: show the model card (Linear Regression, champion). Load the 200
   cohort if needed, then click **Run placement**. Note the measured runtime and
   0 violations.
3. **Placements**: find a student labelled "AI-ranked fallback". Show the score,
   the exact score breakdown and the explanation.
4. Click **Change…** and try to reassign. Only feasible schools are offered. The
   backend rejects full or ineligible offers (409 `CAPACITY_FULL` / 422 `INELIGIBLE_OFFER`).
5. Approve one proposal. Then go to **Review & Export**: audit log, approved-only CSV,
   exceptions CSV.
6. **AI Recommendations**: the 7-model leaderboard and the honest caveat.
7. **Acceptance Gate**: run AT-01..AT-08 live. It uses an isolated temporary database.

---

## 3. Repository map

```
EduMatch/
├── EduMatch_AI_Software_Requirements_Specification.pdf   SRS v1.0 (requirements source of truth)
├── EduMatch_AI_Synthetic_Data/     dataset package (synthetic students/offers/prefs/rules + tools)
│   ├── demo/demo_200, stress_500, large_5000        demo cohorts (one province each)
│   ├── scenarios/…                   11 edge-case fixtures (six_student_base, seat_shortage, tied_scores…)
│   ├── invalid_inputs/…              8 broken imports + expected_validation_errors.json
│   ├── model_training/{train,validation,test}/      20k/5k/5k students; pairs.csv is git-ignored (~130 MB)
│   ├── tools/                        generate_data.py, train_model.py, validate_data.py, common.py
│   └── manifest.json, schema.json, data_dictionary.csv, README.md
├── ml/                             our model pipeline
│   ├── prepare_data.py               rebuilds git-ignored pairs.csv, checksum-verified
│   ├── compare_models.py             trains + evaluates 7 models, writes ml/models + ml/reports
│   ├── make_figures.py               16 PNG charts → ml/reports/figures/
│   ├── models/<key>/model.joblib + metadata.json, models/registry.json (champion + SHA-256)
│   └── reports/results.json, validation_predictions.npz, figures/
├── backend/                        FastAPI + SQLAlchemy + SQLite
│   ├── app/
│   │   ├── main.py                   app factory, startup (db, accounts, auto-seed, model registry)
│   │   ├── config.py                 Settings (env prefix EDUMATCH_, reads backend/.env)
│   │   ├── db.py                     engine (WAL, BEGIN IMMEDIATE), create_all + additive column upgrade
│   │   ├── models.py                 ORM tables
│   │   ├── schemas.py                request bodies (Pydantic, strict)
│   │   ├── security.py               scrypt passwords, sessions, CSRF, throttling, role guards
│   │   ├── roles.py                  UI title ↔ server role mapping
│   │   ├── errors.py                 {code, message, details} error envelope
│   │   ├── ml_registry.py            loads hashed model artifacts, scoring, breakdowns
│   │   ├── domain/                   PURE logic, no DB/HTTP: records, rules, allocation, invariants, metrics, validation
│   │   ├── services/                 DB-aware orchestration: cohorts, runs, decisions, explain, export, audit, acceptance
│   │   └── api/                      routers: auth, users, cohorts, model, runs, acceptance
│   ├── scripts/init_env.py, set_demo_passwords.py, export_api_docs.py
│   ├── tests/                        pytest suite (93 tests)
│   └── data/edumatch.db              the live SQLite database (git-ignored)
├── docs/API.md, openapi.json, examples/*.json      API contract for the frontend (generated)
├── src/                            frontend (React 19 + Vite 8 + Tailwind 4, TypeScript)
│   ├── App.tsx, main.tsx, index.css
│   ├── components/                   screens + shell (see §8)
│   ├── services/api.ts, auth.ts      the ONLY place that talks to the backend
│   ├── services/placementEngine.ts, fixtures.ts   LEGACY in-browser mock (only server.ts uses it)
│   ├── types/index.ts
│   └── assets/images/                photos + edumatch_logo*.png/webp + edumatch_mark.png
├── public/favicon.png              logo emblem favicon
├── index.html, vite.config.ts, tsconfig.json, package.json
├── server.ts                       LEGACY Express mock server (npm run dev:mock), not the real backend
├── README.md                       run instructions, screens table, model table, routes
├── DEMO_ACCOUNTS.local.md          demo logins (git-ignored)
└── handover.md                     this file
```

---

## 4. Architecture and request flow

```
Browser (React SPA, :3000)
   │  fetch('/api/...', credentials: 'include', X-CSRF-Token on mutations)
   ▼
Vite dev proxy  ──(keepAlive:false agent; proxy errors → JSON 502)──►  FastAPI (:8010)
                                                                      │
                          ┌───────────────────────────────────────────┤
                          ▼                                           ▼
             services/ (cohorts, runs, decisions, …)        ml_registry (7 hashed models)
                          │                                           │
                          ▼                                           │
             domain/ (pure: validation → allocate → check_plan → metrics) ◄── scorer = model.score
                          │
                          ▼
             SQLite (WAL, BEGIN IMMEDIATE), backend/data/edumatch.db
```

Key principles, taken from the SRS and followed throughout:

- **The browser never does authoritative calculations** (SRS §5). All allocation,
  eligibility, capacity and metrics come from the backend. The old in-browser engine is
  no longer used by any screen.
- **Pure domain layer.** `backend/app/domain/*` has no DB or HTTP code, so it is easy to
  test and to reason about.
- **Explanations come from recorded facts.** The allocator writes a structured `trace`
  per proposal. `services/explain.py` turns that trace into sentences. Nothing is
  re-derived later.
- **Independent verification.** `domain/invariants.py::check_plan` re-derives every hard
  constraint from the raw inputs. It is written separately from the allocator on purpose.
  If a generated plan fails it, nothing is saved (500 `INVARIANT_VIOLATION`).
- **Optimistic concurrency.** Cohort inputs have an `input_version`. Runs and proposals
  have a `revision`. Mutations must send the expected version, otherwise they get 409.
- **One active plan per cohort.** A new run replaces a draft run (the old one is marked
  `SUPERSEDED`). Once anything is approved, new runs and input edits are blocked until
  an admin resets the cohort.

---

## 5. The domain

### 5.1 Inputs (SRS §9)

- `students.csv`: `student_id, display_name, cohort_id, province, overall_score,
  math_score, science_score, language_score, allow_fallback`. Scores are 0–100.
  Blank never becomes 0.
- `offers.csv`: `offer_id, school_name, province, stage_programme, capacity, min_overall,
  subject_min_math, subject_min_science, subject_min_language, weight_math,
  weight_science, weight_language`. Weights are non-negative and sum to 1. Capacity 0
  means unavailable, not missing.
- `preferences.csv`: `student_id, offer_id, rank`. Ranks are 1..3 and contiguous. There
  are no duplicate ranks or duplicate offers per student, and at least one choice.
- `rules.json`: for example
  `{"rule_version":"demo-policy-v1","score_scale":"0-100","score_direction":"higher_better",
  "priority":"overall_desc_then_student_id_asc","allow_unlisted_fallback":true,
  "allocation":"serial_priority", ...}`.

Validation is in `domain/validation.py::validate_import`. It validates the **whole batch**
and returns every problem as `{file, row, field, code, message}`. If there is any error,
nothing is committed (422 `VALIDATION_FAILED`). Error codes match the dataset's
`invalid_inputs/*/expected_validation_errors.json`: duplicate student, duplicate choice,
duplicate rank, missing score, negative capacity, no choices, out-of-range score, and
unknown offer.

Immutable records: `domain/records.py` (`StudentRec`, `OfferRec`, `PrefRec`,
`CohortInputs`, `DEFAULT_RULES`, `FEATURES`).

### 5.2 Eligibility (`domain/rules.py`)

A student is eligible for an offer if `overall_score ≥ min_overall` and every
**configured** subject minimum is met. `eligibility_failures()` returns each failed rule
with the required and actual values. These facts end up in the trace and the explanation.

### 5.3 Allocation policy (`domain/allocation.py`, SRS §14–15)

1. Sort students by `(-overall_score, student_id)`. This is the demo priority, and the
   ID tie-break is only a deterministic convention.
2. For each student, try the **listed choices in rank order**. Take the first that is
   eligible **and** has a free seat. Each attempt is recorded in the trace with outcome
   `INELIGIBLE` (with failures), `CAPACITY_FULL`, or `FEASIBLE`.
3. If no listed choice works **and** the rules allow fallback **and** the student has
   `allow_fallback=true`, score every eligible, available, **unlisted** offer with the
   model. Reserve the best one (ties go to the lower `offer_id`). The trace step is
   `kind: FALLBACK`, outcome `SELECTED`, with `fit_score` and `candidates_considered`.
4. Otherwise the student is `UNASSIGNED`, with reasons.

Reason codes you will see include `LISTED_CHOICE_1/2/3`, `FIRST_CHOICE_FULL`,
`SECOND_CHOICE_FEASIBLE`, `FIRST_CHOICE_INELIGIBLE`, `FALLBACK_AUTHORIZED`,
`FALLBACK_AI_RANKED`, `FALLBACK_NOT_OPTED_IN`, `FALLBACK_DISABLED_BY_RULE`,
`FALLBACK_NO_FEASIBLE_OFFER`, `NO_ELIGIBLE_CHOICE`, `NO_ELIGIBLE_OFFER`,
`CHOICES_EXHAUSTED`, `AI_UNAVAILABLE`, `OFFICER_REJECTED`.

A listed-choice proposal has `fit_score = null`. The AI did not decide it, and the UI now
says "AI not used for this proposal".

`rank_alternatives()` scores the options for the review screen and for the what-if
endpoint.

### 5.4 Invariants (`domain/invariants.py`, SRS §16)

`check_plan(inputs, assignments)` counts seat-holding statuses (DRAFT, CHANGED, APPROVED)
and verifies:

- **capacity**: reservations ≤ capacity per offer;
- **eligibility**: every assigned offer is eligible;
- **uniqueness**: at most one seat per student;
- **preference authority**: an unlisted offer only with opt-in and the rule enabled;
- **accountability**: every valid student appears exactly once.

It returns counts per violation type plus `passed`. It runs after every allocation, and
again inside every decision transaction.

### 5.5 Metrics (`domain/metrics.py`, SRS §19)

The denominator is always **all data-valid applicants**. A zero denominator gives `None`,
shown as N/A. Draft and approved counts are separate blocks: `assigned`,
`placement_rate`, `top_three_rate`, `first_choice_rate`, `fallback_assigned`. Also
reported: `unassigned`, `unassigned_rate`, `utilization`, `status_counts`,
`reason_counts`, `pending_review`. Served live at `GET /api/runs/{id}/metrics`,
together with `violations`.

### 5.6 The six-student fixture (SRS §21, used by AT-02/04/05/06)

Offers: A (cap 2, min 50), B (cap 1, min 50), C (cap 1, min 70). Expected result:
S1→A, S2→A, S3→B (A full), S4→C, S5 unassigned (A full, C ineligible), S6 unassigned
(below 50). Metrics: 4/6 assigned, top-three 66.7%, first choice 50%, utilisation 100%.
Variant for AT-04 (`six_student_fallback_on`): B cap 0, C cap 2, S3 opts in → S3 gets C
through the AI with a score, and S4 still gets C.

---

## 6. The AI model

### 6.1 What the model predicts

For a (student, offer) pair, the input is 4 features in a fixed order
(`domain/rules.py::pair_features`, `records.FEATURES`):

| # | Feature | Definition |
|---|---|---|
| 1 | `overall_norm` | overall_score / 100 |
| 2 | `subject_fit` | Σ subject_score × offer weight / 100 |
| 3 | `eligibility_margin` | max(0, overall − min_overall) / 100 |
| 4 | `same_province` | 1 if student.province == offer.province else 0 |

The target is the **disclosed synthetic teaching formula** (SRS §12):
`y = 0.75·subject_fit + 0.15·overall_norm + 0.10·same_province`.
It is invented and is **not** admission success or probability. The runtime score is
`fit_score = 100 × clip(prediction, 0, 1)`. Student IDs, names and protected traits are
never features.

### 6.2 Data pipeline

- The dataset package generator (`EduMatch_AI_Synthetic_Data/tools/generate_data.py`)
  is deterministic (seed 20260930).
- `pairs.csv` files (~130 MB) are git-ignored. `ml/prepare_data.py` rebuilds them and
  checks each file's SHA-256 against `manifest.json`.
- Splits are **by student**: train 20k, validation 5k, test 5k students, 60 offer
  profiles, 5 provinces. Pair rows never cross splits.

### 6.3 Training and selection (`ml/compare_models.py`)

- 7 models, all with fixed hyperparameters (no tuning), trained on the same 2,500
  training students (150,000 pairs), seed 42:
  Linear Regression, Decision Tree, Random Forest (the SRS spec: 100 trees, depth 8,
  leaf 5), Extra Trees, Histogram Gradient Boosting, k-NN (k=15), and an MLP (64-32).
  A mean-target baseline is included for comparison.
- **The champion is chosen on validation only**: highest top-1 ranking accuracy (did
  the model rank each student's truly-best eligible offer first?), then lowest MAE. Test
  metrics are reported but never used for selection.
- Outputs: `ml/models/<key>/model.joblib`, `metadata.json` (version, features, metrics,
  dependency versions, seed), `ml/models/registry.json` (champion + SHA-256 per file),
  `ml/reports/results.json` (all metrics, confusion matrices, learning curve).
  `make_figures.py` renders 16 charts into `ml/reports/figures/`.

### 6.4 Results: which model we use and why

| Rank | Model | Top-1 validation | Top-1 test | MAE validation | Fit time |
|---|---|---|---|---|---|
| 1 | **Linear Regression (champion, in use)** | **100.00%** | **100.00%** | 2.9e-7 | 0.05 s |
| 2 | Extra Trees | 98.84% | 98.99% | 7.3e-4 | 0.9 s |
| 3 | Random Forest (SRS spec) | 98.17% | 98.26% | 2.6e-3 | 2.8 s |
| 4 | k-Nearest Neighbours | 94.38% | 94.20% | 6.2e-4 | 0.25 s |
| 5 | Neural Network (MLP) | 93.65% | 93.35% | 7.5e-4 | 10.4 s |
| 6 | Gradient Boosting | 92.15% | 92.72% | 1.1e-3 | 17.5 s |
| 7 | Decision Tree | 91.79% | 91.93% | 1.1e-3 | 0.35 s |

Mean baseline: MAE 0.125, top-1 ≈ 0.2%. Every model beats it.

**Decision: keep Linear Regression.** It is the best on every metric, the fastest, and
exactly explainable. Its score decomposes into per-feature contributions, which the UI
shows as the "Score breakdown (exact linear decomposition)".

**Honest caveat (keep this visible, required by NFR-10):** Linear Regression wins because
the target *is* a linear formula, so it recovers the weights exactly. This proves the
model is integrated and working inside the system. It does **not** prove real placement
quality. Retrain on authorised historical data before any real use. The SRS named
Random Forest; it remains loaded and an admin can switch to it.

### 6.5 Serving (`backend/app/ml_registry.py`)

- At startup, every model in `registry.json` is loaded **only if its SHA-256 matches**.
  joblib can execute code, so only the team's own hashed artifacts are trusted. Feature
  order is also checked against the backend contract.
- The active model is the champion, unless `EDUMATCH_ACTIVE_MODEL` is set in `.env` or an
  admin calls `POST /api/model/active`. A switch affects **new runs only**, and each run
  records `model_key`, `model_version` and `model_sha256`.
- If no model loads, the status is "AI unavailable" and runs are explicitly
  **RULES_ONLY**. Opted-in students get `AI_UNAVAILABLE` instead of a fallback. There are
  no silent random scores (SRS failure behaviour).
- `GET /api/proposals/{id}/alternatives?compare_models=true` returns scores from all
  7 models side by side.
- `POST /api/cohorts/{id}/what-if` re-ranks one student's options with hypothetical
  scores. It is read-only.

---

## 7. Backend in detail

### 7.1 Startup (`app/main.py::create_app`)

1. `use_settings(settings)`: settings are **process-global** (see gotchas, §14).
2. Lifespan:
   - create the DB folder, then `Database(...).create_all()`, which also runs
     `add_missing_columns()`;
   - `_ensure_users` creates missing demo accounts from `.env` and backfills empty
     `title`s;
   - `_auto_seed` does nothing by default (`auto_seed_fixture=None`); set `EDUMATCH_AUTO_SEED_FIXTURE=demo_200` in `.env` to preload the sample into an empty DB;
   - load the `ModelRegistry`.
3. Middleware: request id, security headers (nosniff, DENY frame, no-referrer),
   `Cache-Control: no-store` on `/api`, and CORS for localhost:5173/3000.
4. Routers are mounted under `/api`: auth, users, cohorts, model, runs, acceptance.
   `GET /api/health` is public.
5. If `dist/index.html` exists, the SPA is served at `/`.

### 7.2 Database (`app/models.py`, SQLite)

Tables:

- `users`: id, username (email), display_name, role (ADMIN/OFFICER/VIEWER), title,
  department, password_hash, is_active, created_via (SEED/ADMIN/SELF), last_login_at,
  created_at.
- `auth_sessions`: token_hash (SHA-256 of the cookie token), user_id, csrf_token,
  expires_at.
- `cohorts`: id, source_label (SEED:demo_200 / IMPORT), synthetic, input_version,
  rules (JSON), rule_version, checksum, validation_status, original_snapshot (used by
  reset), active_run_id.
- `students`, `offers`, `preferences`: keyed by CSV IDs within a cohort. Unique
  (cohort, student, offer) and (cohort, student, rank).
- `placement_runs`: status (GENERATED → UNDER_REVIEW → COMPLETED; STALE; SUPERSEDED),
  mode, versions, model key/version/sha, metrics JSON, invariants JSON, runtime_ms,
  revision.
- `proposals`: unique (run_id, student_id). Status DRAFT/CHANGED/APPROVED/REJECTED/
  UNASSIGNED, preference_rank, fallback_used, fit_score, reason_code(s), trace JSON,
  engine_offer_id, released_offer_id, revision, reviewer, reviewed_at, decision_reason.
  **Partial unique index `uq_one_approved_per_student`**: a second approval for the same
  cohort and student is impossible, even if application code were bypassed.
- `audit_events`: actor, role, action, cohort/run/proposal/student, old/new offer,
  reason, details JSON, time.

Engine (`app/db.py`): WAL mode, foreign keys on, `synchronous=NORMAL`, and **every
transaction begins with `BEGIN IMMEDIATE`**. Writers are serialised, so two officers
cannot race for the last seat. `add_missing_columns()` adds columns declared in models
but missing in an old DB file. It never drops anything.

### 7.3 Services

- `services/cohorts.py`: seed (from `EduMatch_AI_Synthetic_Data`), create/replace a
  cohort, versioned edits (`update_offer/rules/student` bump `input_version` and mark
  GENERATED/UNDER_REVIEW runs `STALE`; blocked with 409 `APPROVALS_EXIST` if anything is
  approved), `reset_cohort` (restores `original_snapshot`, deletes runs and proposals,
  keeps the audit log), `summary`, `offers_with_reservations`.
- `services/runs.py::create_run`: a per-cohort thread lock (409 `RUN_IN_PROGRESS`). Then:
  1. check the version;
  2. check there are no approvals;
  3. load inputs;
  4. resolve the model;
  5. `allocate`;
  6. `check_plan`, aborting if it fails;
  7. supersede the previous run and persist the run and all proposals in one transaction.

  The audit event is `RUN_GENERATED`. Also here: `simulate` (dry run, optional capacity
  overrides), `live_metrics`, `list_proposals` (filters: status list, offer, student,
  reason, fallback; paging up to 1000), and `reservations`.
- `services/decisions.py::decide`: approve / change / reject in one `BEGIN IMMEDIATE`
  transaction. It checks that the run is active and not stale, and that the revision
  matches (409 `STALE_REVISION`, `ALREADY_APPROVED`). For a change, it releases the
  student's own seat, then validates the target: 409 `CAPACITY_FULL`, 422
  `INELIGIBLE_OFFER`, 422 `PREFERENCE_NOT_AUTHORIZED`, 422 `REASON_REQUIRED`. It then
  writes the proposal and audit event, bumps the revision, re-verifies the whole plan and
  commits. A change produces status `CHANGED`, which still needs approval. A reject
  releases the seat and keeps the student in the exception queue. `bulk_approve` approves
  all valid DRAFT/CHANGED proposals with a run-revision check. `alternatives` returns
  feasible options with scores (optionally from all models).
- `services/explain.py`: human-readable lines built from the trace (priority position,
  each choice outcome, fallback details, provenance).
- `services/export.py`: `approved_csv` (approved rows only, with officer, reason,
  timestamp and rule/model versions) and `exceptions_csv` (unassigned and rejected).
  Cells are guarded against spreadsheet formula injection.
- `services/audit.py::record`.
- `services/acceptance.py`: **new in this session**; see §10.2.

### 7.4 API routes (all under `/api`; see `docs/API.md` and `docs/openapi.json`)

| Area | Routes |
|---|---|
| Health | `GET /health` (public) |
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me`, `POST /auth/password`, `POST /auth/register` (creates an INACTIVE account) |
| Users (admin) | `GET /users`, `POST /users` (returns a one-time temporary password), `PATCH /users/{id}` |
| Data | `GET /demo/fixtures`, `POST /demo/seed`, `POST /cohorts/import` (multipart), `GET /cohorts`, `GET /cohorts/{id}/summary`, `GET /cohorts/{id}/students`, `GET /offers?cohort_id=` |
| Admin edits | `PATCH /offers/{id}?cohort_id=`, `PATCH /cohorts/{id}/rules`, `PATCH /cohorts/{id}/students/{sid}`, `POST /cohorts/{id}/reset` (`{"confirm": true}`) |
| Model | `GET /model/status`, `GET /model/registry`, `GET /model/comparison`, `POST /model/active` |
| Runs | `POST /runs`, `GET /runs/{id}`, `GET /cohorts/{id}/runs`, `GET /runs/{id}/metrics`, `GET /runs/{id}/proposals`, `POST /cohorts/{id}/simulate`, `POST /cohorts/{id}/what-if` |
| Review | `GET /proposals/{id}`, `GET /proposals/{id}/alternatives`, `POST /proposals/{id}/decision`, `POST /runs/{id}/bulk-approve` |
| Export / audit | `GET /runs/{id}/export.csv`, `GET /runs/{id}/exceptions.csv`, `GET /audit` |
| Acceptance | `POST /acceptance/run` (admin): AT-01..AT-08 on an isolated temporary backend |

Errors always use `{code, message, details, request_id}`. Status codes: 400 malformed,
401 unauthenticated, 403 CSRF or role, 404, 409 stale or conflict, 413, 422 validation or
eligibility, 429 throttled, 500 invariant violation. Stack traces are never exposed.

After changing the API, regenerate the docs with
`cd backend && ../.venv/Scripts/python scripts/export_api_docs.py`. It uses a throwaway
DB and rewrites `docs/openapi.json` and `docs/examples/*.json`.

---

## 8. Frontend in detail

Stack: React 19, Vite 8, TypeScript (`tsc --noEmit` as lint), Tailwind CSS v4 through
`@tailwindcss/vite`. Theme tokens are in `src/index.css` (`@theme`: primary-navy
#0B1F3A, primary-blue #2563EB, ai-teal #0F9D8A, success, warning, danger). Icons come
from `lucide-react`. There is no router library: `App.tsx` switches on `route`
(landing / login / admin) and `currentView`.

### 8.1 Data access: `src/services/api.ts` (the only backend client)

- `request()`: same-origin fetch with `credentials:'include'`. It adds `X-CSRF-Token`
  (from the login response or the `edumatch_csrf` cookie) to every non-GET request, and
  throws `ApiError{status, code, details}`.
- A 401 fires the `edumatch:unauthorized` window event, and `App` returns to login.
  **Except** for `/auth/login|logout|me`. That exception fixes an infinite logout loop.
- **Cohort selection**: `resolveCohortId()` uses the remembered cohort
  (`localStorage.edumatch_cohort`) if it still exists, otherwise the newest.
  `selectCohortId()` is called after seed or import, or from the Data screen switcher.
- Adapters map backend shapes to the UI types in `src/types/index.ts`: `toOffer`,
  `toMetrics` (percentages ×100, plus `fallback_count`, `mode`, `model_version`),
  `toTrace` (trace → `DecisionTraceItem`), `toProposal`.
- Public `api` methods:
  - session: `checkHealth`, `login`, `getMe`, `logout`;
  - model: `getModelStatus`, `getModelRegistry`, `getModelComparison`, `setActiveModel`;
  - cohorts: `getCohortSummary`, `listCohorts`, `selectCohort`, `importCohort`
    (multipart), `patchRules`, `getOffers`, `patchOffer`, `getOfferDemand`, `seedDemo`,
    `resetCohort`;
  - runs and review: `runPlacement`, `getProposals` (joins proposals, students and
    offers client-side), `getProposalDetail`, `getAlternatives`, `submitDecision`,
    `bulkApprove`, `simulate`;
  - other: `getAuditTrail`, `runAcceptanceGate`, `getExportUrl`,
    `getExceptionsExportUrl`.
- `src/services/auth.ts`: `authService` holds a cached profile in `localStorage` for
  first paint only; `restoreSession()` confirms it with `/auth/me`. Also here:
  `ROLE_PERMISSIONS` (which views each title may open), `isAdminRole`, `canReviewRole`,
  and user-directory management.

### 8.2 Screens (`src/components/`)

| View id | Component | Content / behaviour |
|---|---|---|
| landing | `LandingPage.tsx` | Marketing page, photos. Its hero stats (149,206 candidates…) are marketing copy; see gaps |
| login | `AdminLogin.tsx` | Full logo, email + password, demo-account shortcut cards (fill the email), self-registration |
| dashboard / analytics | `DashboardScreen.tsx` | Live metrics: valid applicants, pending, placement rate + violations, first-choice / top-three / AI-fallback rates, seat bar, fullest schools, run mode + runtime |
| data | `DataCohortScreen.tsx` | Cohort switcher, fixture loaders (admin), CSV import with row-error table (admin), fallback-rule toggle (admin, locked after approvals), live model card, run launcher (admin + officer, AI or rules-only) |
| students | `StudentsScreen.tsx` | Student list linked to the placement drill-down |
| schools | `SchoolsScreen.tsx` | Offers list and detail: capacity / reserved / approved / remaining, real demand (ranked 1st, 2nd/3rd), seats filled by listed vs AI, requirements, Edit Quota (admin) |
| placement | `StudentPlacementScreen.tsx` | Per-student review: scores, ranked choices, proposal card (AI-ranked fallback vs rules), exact score breakdown or decision trace, backend explanation, Approve / Change… / Reject (officer + admin), read-only note for viewers |
| review | `ReviewExportScreen.tsx` | Approved / pending / exception counts, bulk approve, approved CSV, exceptions CSV, audit log, Reset cohort (admin only) |
| responsible_ai | `ResponsibleAIScreen.tsx` | Principles, 7-model leaderboard with CHAMPION / IN USE, "Use for new runs" (admin), honest caveat, decision pipeline, latest audit events |
| acceptance | `AcceptanceGate.tsx` | Runs AT-01..AT-08 on the backend and shows PASS/FAIL, duration and real log lines |
| users | `UserManagement.tsx` | Admin: list, create (temporary password), edit, activate or deactivate |
| account | `MyAccountScreen.tsx` | Profile and password change |
| (shell) | `Sidebar.tsx`, `TopHeader.tsx`, `BackendSettingsModal.tsx`, `AccessRestricted.tsx`, `RoleBadge.tsx`, `BrandMark.tsx` | Role-filtered nav; header with API status, Export, Run Placement (admin + officer), account menu |
| unused | `PlacementWorkspace.tsx`, `Navbar.tsx`, `MinimalLandingPage.tsx` | Not rendered anywhere; candidates for deletion |

Branding: `BrandMark.tsx` exports `BrandMark` (the emblem on a white tile, used in the
sidebar and the landing header and footer) and `BrandLogo` (the full logo, used on the
sign-in page). Assets: `src/assets/images/edumatch_logo.webp` (original),
`edumatch_logo_full.png` (trimmed), `edumatch_mark.png` (emblem), and
`public/favicon.png`.

### 8.3 Dev proxy (`vite.config.ts`)

`/api` → `EDUMATCH_API_URL` or `http://127.0.0.1:8010`. The proxy uses
`agent: new http.Agent({keepAlive:false})`, and a proxy `error` handler returns JSON 502
`BACKEND_UNREACHABLE`. **Do not remove these.** See bug #2 in §11.3.

---

## 9. Security, roles and accounts

- Passwords: salted scrypt (stdlib), constant-time comparison.
- Session: a random 256-bit token in an HttpOnly, SameSite=Strict cookie
  (`edumatch_session`); only its SHA-256 is stored. Lifetime `session_hours`=8.
  `cookie_secure` is off locally; turn it on for HTTPS.
- CSRF: every non-GET request must send `X-CSRF-Token` matching the session
  (403 `CSRF_FAILED`).
- Brute force: 5 failed logins per username/IP → 429 for 300 s (in memory).
- Roles (`app/roles.py`): the UI title maps to a server role.
  - Super Administrator and Placement Administrator → **ADMIN**: seed, import, edit,
    reset, switch models, manage users, acceptance gate.
  - Placement Officer → **OFFICER**: run placement, approve/change/reject, bulk approve.
  - School Administrator → **VIEWER**: read-only.
- The server enforces roles (`require_admin`, `require_reviewer`). The UI only hides what
  a role cannot use (`ROLE_PERMISSIONS`, `isAdminRole`, `canReviewRole`).
- Self-registration creates an **inactive** account. An admin activates it in User
  Management.
- Secrets: `backend/.env` is git-ignored and `init_env.py` generates it. **No secret in
  git.**

---

## 10. Testing and the acceptance gate

### 10.1 pytest (`backend/tests`, 93 tests)

- `test_domain.py`: exact regression against all 14 reference cohorts (their
  `expected_*_placements.csv`), the 8 invalid-import fixtures, and the pure-function
  rules.
- `test_acceptance.py`: SRS AT-01..AT-08 through the real HTTP API with a `TestClient`
  and a temporary DB. Includes the 500-student (≤10 s) and 5,000-student (≤30 s)
  performance checks, a missing model (→ RULES_ONLY), a tampered model (refused), every
  model driving a run, and what-if / simulate.
- `test_concurrency_and_ai.py`: officers racing for the last seat, duplicate approvals,
  overlapping runs, and AI score explanations.
- `test_accounts.py`: registration, activation, roles, profile, password change.
- `test_acceptance_endpoint.py` (**new**): the in-app gate passes 8/8, is admin-only,
  and does not touch the live DB.
- `test_schema_upgrade.py` (**new**): an old-schema `users` table is upgraded in place
  and sign-in works.
- `conftest.py`: `make_settings(tmp_path)` plus an `Api` helper that logs in and
  attaches CSRF.

### 10.2 In-app Acceptance Gate (`POST /api/acceptance/run`)

`services/acceptance.py` runs each AT through the **real HTTP API** of a *separate*
app instance. That instance uses:

- `live_settings.model_copy(update=…)` with a temp SQLite file;
- its own random demo accounts (`gate-admin`, `gate-officer`);
- the **same secret key, model files and fixtures**, and the currently active model key.

AT-03 and AT-06 start a *second* instance on the same temp DB to prove persistence and
that reloading the model reproduces the same scores. A `threading.Lock` prevents two
concurrent gates (409 `GATE_RUNNING`). At the end, `use_settings(live)` restores the
global settings. Typical duration: about 4 s. Result shape:
`{passed, total, duration_ms, isolated, note, results:[{id, requirements, name, status,
duration_ms, log[]}]}`.

---

## 11. Work log: what was done in this session

Starting point: the backend, ML pipeline and dataset were already built and committed
(`cb83f66`). The frontend was merged from a teammate (`91e001d`). There were large
**uncommitted** changes in the working tree: user accounts and roles (`users.py`,
`roles.py`, `models.py` new columns, `auth.ts` rewrite, `api.ts` rewrite from mock to
real backend). Several screens still showed mock or invented data.

### 11.1 Model decision

We reviewed `ml/reports/results.json` and `registry.json`. **Linear Regression** was
already the champion and is objectively the best of the 7. We kept it and surfaced the
evidence in the UI (the leaderboard plus the caveat). Nothing was retrained.

### 11.2 Backend changes

1. **In-app acceptance gate**: `app/services/acceptance.py`, `app/api/acceptance.py`,
   router registered in `main.py`, test `tests/test_acceptance_endpoint.py`.
2. **Schema upgrade for old databases**: `Database.add_missing_columns()` in `db.py`,
   called from `create_all()`. `_ensure_users` backfills empty `title`s with
   `DEFAULT_TITLE[role]`. Test: `tests/test_schema_upgrade.py`. Reason: the existing
   `backend/data/edumatch.db` predated the `title/department/created_via/last_login_at`
   columns, so sign-in would have crashed.
3. `scripts/set_demo_passwords.py`: applies the `.env` demo passwords to an existing DB
   and creates any missing accounts.
4. Regenerated `docs/openapi.json` and `docs/examples/*`.

### 11.3 Frontend bugs fixed (found by driving the real app in a browser)

1. **Infinite logout loop.** A 401 from `/auth/logout` fired the unauthorized event,
   whose handler called logout again, forever (thousands of requests). This reset the
   login form and wiped sessions mid-load. Fix: session endpoints don't fire the event
   (`api.ts::request`).
2. **Random hangs in `npm run dev` (root cause of empty screens and stale lists).**
   Node (≥19) keeps upstream sockets alive; uvicorn closes idle ones after 5 s. When
   Node reused a socket just as uvicorn closed it, the proxy got `ECONNRESET` and Vite
   **left the browser request hanging forever**. As a result a `Promise.all` in
   `getProposals` never resolved: the Placements page showed "0 / 0" after a reload, and
   the list didn't refresh after a decision. Fix: `keepAlive:false` agent plus a JSON
   502 error handler in `vite.config.ts`. It was verified with 24 concurrent loads,
   including after a 6 s idle gap.
3. **Stale list after a decision** (hardening). `StudentPlacementScreen` now applies the
   server's decision response to local state immediately (`applyDecision`), and uses a
   sequence guard (`loadSeq`) so an older reload can never overwrite a newer one.

### 11.4 Frontend: fake data replaced with real backend data

- **Data & Cohort** (was unreachable, with a hard-coded "RandomForest rf-demo-v1, MAE
  0.041" card, simulated CSV errors, and a fallback checkbox that saved nothing): now has
  the real model card, a real multipart CSV import with a row-level error table, a real
  `PATCH rules` toggle, a cohort switcher, and a real run launcher. Added to the nav.
- **Review & Export** (was unreachable): added to the nav. Reset now calls
  `POST /cohorts/{id}/reset`; it used to reseed demo_200 regardless of the current cohort.
  Reset is admin-only, and bulk approve is for reviewers only.
- **Acceptance Gate**: used the in-browser `placementEngine.ts` with hard-coded PASS
  logs. It now calls the backend gate.
- **AI Recommendations**: removed the fake "Student #10452 / School A (Quality: 94)"
  pipeline. Removed the `S…`→`#104…` ID rewriting, and replaced the unsupported
  "Encrypted" and "0 Violations" claims. Added the 7-model leaderboard with admin
  switching.
- **Schools**: demand figures were invented (55%/28% of allocated). They are now real
  counts from preferences and proposals (`api.getOfferDemand`). Shows reserved,
  approved and remaining seats, plus subject minima. Edit Quota is admin-only. Fixed
  "Province Province".
- **Placements**: removed the invented "Match Quality" (40/30/15/15 weights) and the
  always-green "Why this match?". Everything was labelled "AI Recommendation" even when
  the AI was not used. Now it shows "AI-ranked fallback" vs "Rules · listed choice N",
  `fit_score` only when the model decided, the exact score breakdown, the decision trace,
  the backend explanation, the officer reason, and proper status labels. Real student
  IDs are shown. Viewers are read-only.
- **Dashboard**: removed the hard-coded fallbacks (200 / 149 / 94.2% / 52% / 84.5% /
  12%) and the fake "+12.4%". "AI Compliance" was really the placement rate; it is now
  labelled correctly with real violations. The AI-fallback rate comes from the backend's
  `fallback_assigned`. There is a personalised greeting, run mode and runtime (FR-17),
  and "Fullest schools" sorted by fill.
- **Top header**: officers can now run placement. Run errors (for example
  `APPROVALS_EXIST`) are shown in a banner instead of only in the console.
- `App.tsx`: new views `data` and `review`; metrics are cleared when there is no active
  run.
- `auth.ts`: `ROLE_PERMISSIONS` gained `data`, `review`, and `acceptance` for Placement
  Admin; added `isAdminRole` and `canReviewRole`.
- `types/index.ts`: `DashboardMetrics` gained `fallback_count`, `mode`, `model_version`;
  `AlternativeOfferOption` gained `has_score`, `listed_rank`.

### 11.5 Other

- `package.json`: `npm start` now runs `vite`. It used to run the mock Express server.
  The mock is still available as `npm run dev:mock`.
- New logo: `BrandMark.tsx`, logo assets, favicon link in `index.html`.
- Demo accounts: the four `.env` accounts got easy passwords, recorded in
  `DEMO_ACCOUNTS.local.md` (git-ignored via `*.local.md` in `.gitignore`).
- `README.md`: frontend at the repo root (not `frontend/`), the Tailwind note, run
  steps, a screens table, the password script, the acceptance route, and the test count.
- `.claude/launch.json`: backend + frontend launch configurations.

### 11.6 How it was verified

- pytest 93/93. `tsc --noEmit` clean. `npm run build` OK.
- Browser run (against a **copy** of the live DB so no real data changed): login for all
  4 roles, dashboard metrics equal to `/metrics`, a rules proposal and an AI-fallback
  proposal (score 77.0 = 55.9 + 11.0 + 10.0), approve, reject ×4, change with reason,
  CSV import errors, approved and exceptions CSV contents, reset, Run Placement, model
  leaderboard, the gate 8/8, and role-based hiding for officer and viewer.

### 11.7 Session 2: Blair's frontend merged, the Rwanda upload set, and clear reasons

**Frontend source.** The UI now comes from `https://github.com/blair-cloud/EduMatch` (folder `Frontend/`), cloned
next to this repo at `../EduMatch_blair`. It was **three-way merged** (base = our last commit, ours = working tree,
theirs = Blair), with these results:

- Blair's re-theme (navy `#172554`, blue accents, `#020261` sidebar) and his logo files (`src/assets/logo.png`,
  `src/assets/favicon.png`, `public/*`) are adopted. The session-1 `BrandMark` component was removed.
- Blair's `api.ts`/`auth.ts` were still the old mock clients, so **ours were kept**. Everything talks to the real backend.
- Where Blair's version still had fake numbers (Dashboard, Schools, Data & Cohort, AI screen), our real-data version was
  kept and his colours were applied on top.
- **Placements = Blair's 6-step wizard** (`StudentPlacementWorkflow.tsx`, rendered by `StudentPlacementScreen.tsx`).
  Its placeholder logic was rewritten against the backend:
  - Upload recognises files by their CSV header: students / schools / preferences / rules JSON / reference PDF.
    Excel is rejected with "save as CSV".
  - Validate calls `POST /cohorts/import?dry_run=true` and shows real counts or a row-level error table, using the
    uploaded file names. Import happens only on "Import & Continue".
  - AI Match calls the real run; the animation just shows the real pipeline stages. The false "Gale-Shapley",
    "affirmative action" and "gender parity" claims were removed.
  - Review: "Placed by" (1st/2nd/3rd choice or "AI suggested · score") and a **Reason** column with the suggested next
    step. Real stats: 1st-choice %, top-3 %, violations.
  - The detail panel shows the reason, the backend's step-by-step explanation, and **real feasible alternatives** with
    AI scores.
  - Change/Assign offers only feasible schools (`/alternatives`), with a mandatory reason and an optional note.
  - Final approval approves officer changes one by one, then bulk-approves drafts (the backend's bulk approve covers
    unchanged drafts only).
  - Read-only roles see no actions.
  - Bug fixed: a multi-file upload kept only the first file.

**Backend additions.**

- `domain/validation.py`: `preferences.csv` is optional. Without it, choices come from `choice_1..3` columns of
  students.csv, and errors point at those columns (for example `students.csv row 21 choice_2 UNKNOWN_OFFER`).
- `api/cohorts.py` + `services/cohorts.preview`: `dry_run=true` returns counts, provinces, zero-capacity offers,
  fallback opt-ins and whether the cohort exists or has approvals. Nothing is saved.
- `services/explain.reason_summary`: one plain sentence per proposal (`reason_text`) plus `suggested_action` for
  unplaced or rejected students. It is built only from the trace and reason codes, and appears in every proposal
  response.
- `services/export.py`: the approved CSV gains `display_name` and `placement_reason`. For approved officer changes,
  the reason includes the officer's change reason from the audit log. The exceptions CSV gains `display_name`,
  `reason_text` and `suggested_action`.
- Tests: `tests/test_rwanda_upload.py` covers the dry run, the error variant's exact rows, choice-columns ≡
  preferences.csv, reasons and suggestions, and change→approve→export. **97 tests pass.**

**Demo data.** `EduMatch_AI_Synthetic_Data/tools/generate_rwanda_upload.py` (deterministic, seed 2026) writes
`upload_demo/rwanda_2026/`:
- 320 students, 27 offers, 354 seats;
- 12 real Rwandan schools across all 5 provinces, with PCM/PCB/MCB/MPC/MEG/HEG combinations;
- `placement_rules.json` plus a readable PDF and a README.

It also writes `upload_demo/rwanda_2026_with_errors/` with 5 mistakes, which produce 9 reported problems. Student
names are random pairings of common Kinyarwanda family names and first names, so they are **not real students**
(SRS NFR-06). The school names are real; seats and cutoffs are invented.

Measured run on this set: 151 ms, 267/320 placed (140 first choice, 48 AI-suggested), 53 not placed with reasons and
suggestions, 0 violations.

---

## 12. What was NOT done / known gaps and risks

1. **Nothing is committed.** Everything from this session and the earlier uncommitted
   account work sits in the working tree on `main`. Review `git status` and commit
   (ideally on a branch).
2. **The user's already-running backend (port 8010)** was started before these changes.
   Restart it to get the acceptance endpoint and the schema upgrade.
3. **Legacy mock code still exists**: `server.ts`, `src/services/placementEngine.ts`,
   `src/services/fixtures.ts`, and the unused components `PlacementWorkspace.tsx`,
   `Navbar.tsx`, `MinimalLandingPage.tsx`. The real app doesn't use them. They confuse
   readers and can be deleted (update `package.json` `dev:mock` too).
4. **Landing page marketing numbers** (149,206 candidates, 1,890 schools, the
   `studentsMock` preview) are invented. They conflict with NFR-10 (no unsupported
   claims) and should be relabelled as illustrative or replaced with synthetic-demo
   figures.
5. **SRS PDF still says "plain CSS".** The README documents the Tailwind choice, but the
   PDF was not updated.
6. **Students screen** (`StudentsScreen.tsx`) was not audited in depth. It reads real
   data, but check its labels and filters.
7. **FR-10 filters on the Placements screen**: the backend supports filtering by status,
   offer, reason and fallback, but the review UI only has search and next/previous.
   Filters and a list or table view would help officers.
8. **Offer edits beyond capacity and min score** (subject minima, weights) and **student
   edits** (`PATCH /cohorts/{id}/students/{sid}`, what-if) have backend endpoints but no
   UI.
9. **Simulate / what-if / compare-models** (`POST /cohorts/{id}/simulate`, `/what-if`,
   `alternatives?compare_models=true`) are not surfaced in the UI. These are good P1
   demo features: "rules-only vs AI on the same snapshot", and "change a subject score
   and re-rank" (SRS §13 "what judges can verify").
10. **The login email field is `type="email"`**, so non-email usernames can't sign in
    from the UI (only the legacy `admin`/`officer` accounts are affected).
11. **Global settings in the backend** (`config.use_settings`): the acceptance gate
    temporarily swaps them. That is safe because the copy has the same secret key and
    data dirs, but any future setting read via `get_settings()` during a gate run will
    see the gate's DB URL. Keep new code on `request.app.state` where possible.
12. **Login throttling is in memory** (resets on restart, not shared across processes).
    Fine for a demo.
13. **The model is trained on a synthetic formula.** There is no real-world validity.
    Real historical data, fairness analysis and NESA policy validation are future work
    (SRS §25 questions).
14. **No HTTPS or deployment config**; the target is a local laptop (NFR-04). If hosting,
    set `EDUMATCH_COOKIE_SECURE=true` and serve over HTTPS.
15. **Bundle size**: the landing photos are about 1 MB each; the JS is about 450 kB. Fine
    locally; compress for hosting.
16. **The dark theme / mobile layout** was not tested. The SRS asks for laptop and
    projector readability.

---

## 13. Recommended next steps (prioritised)

**Before the demo (P0):**

1. Restart the backend, then run the demo script in §2.5 once end to end, including the
   Acceptance Gate.
2. Commit the work: `git checkout -b feature/integration-handover`, review the diff,
   and commit backend, frontend and docs separately. Do **not** commit `backend/.env`,
   `backend/data/*.db` or `DEMO_ACCOUNTS.local.md` (already ignored).
3. Reset the live cohort to a clean state before presenting (Review & Export → Reset
   cohort, then Run placement).
4. Record a backup screen capture (SRS §22–24).

**Soon after (P1):**

5. Add Placements filters (status / offer / reason / fallback) using the existing query
   params in `GET /runs/{id}/proposals`.
6. Add a "Compare rules-only vs AI" panel (`/simulate`), a "What-if" panel (`/what-if`)
   and a "Compare models" toggle in the Change dialog (`compare_models=true`).
7. Delete the legacy mock files (§12.3) and the unused components.
8. Replace or relabel the landing page statistics (§12.4).
9. Offer editor: subject minima and weights; student score editor with version checks.

**Later (from the SRS "later release"):**

10. Real, authorised de-identified historical data. Retrain, and add group-fairness
    metrics.
11. NESA rule validation (placement stage, tie-breaks, reserved seats); appeals
    workflow; parent/student portal; SMS.
12. Deployment: HTTPS, Postgres (the engine already abstracts the DB; BEGIN IMMEDIATE
    and the partial index would need Postgres equivalents), and persistent login
    throttling.

---

## 14. Gotchas and conventions

- **Always run the backend with `--app-dir backend`** from the repo root, or `cd backend`
  first. `app` is the package.
- **The Vite proxy must keep `keepAlive:false`** (see §11.3 #2), otherwise random
  requests hang forever.
- **Never compute placement or eligibility in the browser.** Add backend endpoints
  instead.
- **Every mutation needs the version it expects** (`expected_input_version`,
  `expected_revision`, `expected_run_revision`). The UI reads the current value first
  (see `api.patchOffer`, `api.runPlacement`).
- **Approved results freeze the cohort**: new runs and input edits return 409
  `APPROVALS_EXIST` until an admin resets.
- **Seeding replaces a cohort with the same ID**; different fixtures are different
  cohorts. The UI works on the remembered or newest cohort (`resolveCohortId`).
- **Model artifacts are trusted by SHA-256.** If you retrain, `compare_models.py`
  rewrites `registry.json` with the new hashes. Never hand-edit a joblib file.
- **Docs are generated**: after API changes, run `scripts/export_api_docs.py`.
- **Line endings**: `.gitattributes` forces LF (the dataset checksums depend on it).
  The working copy may show CRLF warnings on Windows; that's harmless.
- **Windows shell**: use Git Bash-style paths in scripts; the venv python is
  `.venv/Scripts/python`.
- **Style**: Python uses single quotes, 120-col lines, and short docstrings that explain
  *why*; ruff-clean. TypeScript/React uses functional components, Tailwind utility
  classes with the hex tokens seen in existing screens, and lucide icons. Match the
  surrounding code.
- **Labels required by the SRS**: "Synthetic data", "Demo policy", "Draft proposal",
  "Approved", "Unassigned". AI scores are compatibility, never probability or confidence.

---

## 15. Glossary

| Term | Meaning |
|---|---|
| Cohort | One set of students + offers + preferences + rules (e.g. `SYN-DEMO_200-2026`) |
| Offer | A school plus its stage/programme and capacity for this cohort |
| Input version | Counter bumped by every edit; runs record which version they used |
| Run | One allocation over a cohort snapshot; statuses GENERATED → UNDER_REVIEW → COMPLETED, or STALE / SUPERSEDED |
| Proposal | One student's result in a run: DRAFT / CHANGED / APPROVED / REJECTED / UNASSIGNED |
| Revision | Optimistic-lock counter on runs and proposals (stale → 409) |
| Fallback | AI-ranked unlisted offer, only for opted-in students when the rules allow it |
| fit_score | 0–100 model compatibility score (not a probability); null for listed-choice proposals |
| Trace | Structured record of every choice considered and why; the source of explanations |
| Invariants | Capacity, eligibility, uniqueness, preference authority and accountability checks |
| Champion | The model picked on validation (Linear Regression) |
| Acceptance gate | SRS AT-01..AT-08; runnable by pytest and from the UI |
| RULES_ONLY | Mode with no model: listed choices only, and fallback reported as `AI_UNAVAILABLE` |

---

*End of handover.* When unsure, trust in this order: the SRS PDF → the backend tests →
`docs/API.md` → this document. When you change behaviour, update this file and
`README.md`.

### Addendum (1 Oct 2026): no default cohort

- The 200-student sample is **no longer loaded automatically** (`config.auto_seed_fixture` defaults to `None`).
  A fresh database starts empty. Load data through Placements → Upload, or the sample buttons.
- New admin action **Delete cohort** (Data & Cohort screen, with confirmation) → `POST /api/cohorts/{id}/delete`
  `{"confirm": true}`. It removes students, offers, choices, runs and proposals, and records `COHORT_DELETED` in the
  audit log, which keeps its history. Tests: `tests/test_cohort_delete.py`.
- The auto-loaded `SYN-DEMO_200-2026` cohort was removed from `backend/data/edumatch.db`. A backup of the database
  from before the removal is at `backend/data/edumatch.backup-2026-09-30.db` (git-ignored).

### Addendum (1 Oct 2026): placement history and officer assignment

**Placement history.**
- Table: `placement_history` (model `PlacementHistory`, service `services/history.py`).
- It stores a permanent snapshot of a run and every student's result: school, status, a plain-language reason,
  officer exceptions, reviewer, and the officer's change/assignment reason taken from the audit log.
- A snapshot is written when a run completes, when a newer run replaces it, and before a cohort reset, re-import or
  delete removes it. It has no foreign keys, so it survives all of these.
- API: `GET /api/history`, `GET /api/history/{id}`, `GET /api/history/{id}/export.csv`.
- UI: sidebar → **History**, showing the list of runs, each run's per-student results with search and filters, and
  CSV download. All roles can open it.

**Officer assignment ("Assign school").**
- An unplaced or rejected student can be placed at **any school with a free seat**, not only their own choices.
- Open schools: `GET /api/proposals/{id}/open-offers`, built by `rank_open_offers` in `domain/allocation.py`. The
  order is: fewest exceptions first; then, for below-cutoff options, the fewest points short; then the student's
  choices; then AI fit.
- Decision: `action: "assign"`, which requires a reason. Going below the entry requirements also requires
  `allow_below_cutoff: true`.
- The proposal then carries `override_preference` and/or `override_eligibility`. `check_plan` accepts these
  recorded exceptions and counts them as `officer_exceptions`. **Capacity and one-seat-per-student never have
  exceptions.**
- An assignment is not an AI fallback (`fallback_used = False`). The status becomes CHANGED and needs approval.
- The audit action is `PROPOSAL_ASSIGNED`. The approved CSV gains an `officer_exception` column.
- Unplaced students' `suggested_action` now points to "Assign school".
- Note: this deliberately relaxes the SRS hard rules (preference authority, eligibility) for **human** decisions
  only. The engine and the AI never create exceptions.

Tests: `tests/test_history_and_assign.py`. **102 backend tests pass.**
