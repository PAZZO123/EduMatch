# EduMatch AI

AI-assisted school placement demo. **Synthetic data and demo policy only.** Every placement passes
deterministic eligibility, capacity and uniqueness checks and needs human approval.

```
EduMatch_AI_Synthetic_Data/   dataset package (cohorts, fixtures; training pairs rebuilt locally)
ml/                           model training, comparison, figures, trained models
backend/                      FastAPI + SQLAlchemy + SQLite API
docs/                         API guide for the frontend, openapi.json, example responses
src/, index.html              frontend: React + Vite + Tailwind CSS v4 (repo root)
```

The SRS (§5) suggested plain CSS for the frontend; the team uses **Tailwind CSS v4** instead
(`@tailwindcss/vite`, theme tokens in `src/index.css`). The API contract is in [docs/API.md](docs/API.md).

## Setup (once)

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r ml/requirements.txt -r backend/requirements.txt
cd backend && ../.venv/Scripts/python scripts/init_env.py
npm install
```

`init_env.py` writes `backend/.env` with a random secret key and random demo passwords for the
`admin` and `officer` accounts. That file is git-ignored; read the sign-in passwords there.

## Run the backend

```bash
cd backend
../.venv/Scripts/python -m uvicorn app.main:create_app --factory --port 8010
```

API docs: http://127.0.0.1:8010/docs · health: http://127.0.0.1:8010/api/health

An existing `backend/data/edumatch.db` from an older build is upgraded in place on startup (missing
columns are added; nothing is dropped).

## Run the frontend

In a second terminal, from the repo root:

```bash
npm run dev
```

Open http://localhost:3000 and sign in with a demo account from `backend/.env`
(`superadmin@edumatch.rw`, `placement@edumatch.rw`, `officer@edumatch.rw`, `school@edumatch.rw`).
Vite proxies `/api` to the backend on port 8010 (override with `EDUMATCH_API_URL`).

### Uploading a cohort (demo files)

**Placements** is a 6-step wizard (Upload → Validate → AI Match → Review → Approve → Complete). Upload:

- `students_2026.csv`: `student_id, display_name, cohort_id, province, overall_score, math_score, science_score,
  language_score, allow_fallback, choice_1, choice_2, choice_3`
- `schools_2026.csv`: `offer_id, school_name, province, district, stage_programme, capacity, min_overall,
  subject_min_math, subject_min_science, subject_min_language, weight_math, weight_science, weight_language`
- `placement_rules.json` (optional; the machine-readable policy) and `placement_rules.pdf` (optional; for people only,
  not parsed)

Ready-made demo files are in `EduMatch_AI_Synthetic_Data/upload_demo/`:
- `rwanda_2026/` has 320 synthetic students with realistic Rwandan names, and 27 A-Level combinations at 12 real Rwandan
  secondary schools. Seats and cutoffs are invented.
- `rwanda_2026_with_errors/` has the same data with deliberate mistakes, to show row-level validation.

Regenerate both with `python EduMatch_AI_Synthetic_Data/tools/generate_rwanda_upload.py`.

Validation runs on the server first (`POST /api/cohorts/import?dry_run=true`, nothing saved). Every proposal carries a
plain-language `reason_text`, and unplaced students also get a `suggested_action`; both appear in the review table and
the CSV exports. A separate `preferences.csv` (`student_id, offer_id, rank`) is still accepted instead of the
`choice_*` columns.

To change a demo password, edit it in `backend/.env`, then apply it to the existing database:

```bash
cd backend && ../.venv/Scripts/python scripts/set_demo_passwords.py
```

**One-process demo (offline):** `npm run build`, then start only the backend. It serves `dist/` at
http://127.0.0.1:8010.

`npm run dev:mock` starts the old in-browser mock server (`server.ts`). It does not use the real backend
or model; don't use it for the demo.

| Screen | What it does | Who |
|---|---|---|
| Dashboard | Live run metrics (FR-17): placement / first-choice / top-three / AI-fallback rates, violations, runtime | all |
| Data & Cohort | Load fixtures, CSV import with row-level errors, fallback rule, model card, run placement | admin (officer: run only) |
| Schools | Capacity, reserved / approved / remaining seats, real demand by rank | all (edit quota: admin) |
| Placements | Per-student proposal, decision trace, backend explanation, exact AI score breakdown; approve / change / reject | officer, admin (school admin: read-only) |
| Review & Export | Bulk approve, approved CSV, exceptions CSV, audit log, cohort reset | reset: admin only |
| AI Recommendations | 7-model leaderboard; switch the model for new runs | switch: admin only |
| Acceptance Gate | Runs SRS AT-01..AT-08 on the backend against a temporary database | admin |

## Tests

```bash
cd backend && ../.venv/Scripts/python -m pytest -q
```

97 tests: exact regression against all 14 reference cohorts, all 8 invalid-import fixtures, the SRS
acceptance gate (AT-01..AT-08) including the 500-student performance target, race tests (concurrent
officers fighting for the last seat, duplicate approvals, overlapping runs) and AI score explanations.

## Retrain / compare models (AI work only)

```bash
.venv/Scripts/python ml/prepare_data.py      # rebuilds the 130 MB training pairs (git-ignored), checksum-verified
.venv/Scripts/python ml/compare_models.py    # trains + evaluates all models, writes ml/models/ and ml/reports/
.venv/Scripts/python ml/make_figures.py      # 16 charts in ml/reports/figures/
cd backend && ../.venv/Scripts/python scripts/export_api_docs.py   # refresh docs/ after API changes
```

## The model

`ml/compare_models.py` trains 7 algorithms on the same 2,500 synthetic students (fixed settings, no
tuning) and picks the champion on **validation only**: highest top-1 ranking accuracy, then lowest error.
`ml/make_figures.py` renders 16 comparison charts into `ml/reports/figures/`.

| Model | Wrong #1 school (validation) | MAE (fit points) |
|---|---|---|
| **Linear Regression (active)** | **0.00%** | **≈0.00003** |
| Extra Trees | 1.16% | 0.07 |
| Random Forest | 1.83% | 0.26 |
| k-Nearest Neighbours | 5.62% | 0.06 |
| Neural Network (MLP) | 6.35% | 0.08 |
| Gradient Boosting | 7.85% | 0.11 |
| Decision Tree | 8.21% | 0.11 |

The backend loads every model in `ml/models/registry.json` after checking each file's SHA-256, and
serves the champion. An admin can switch models at `POST /api/model/active` (new runs only), or set
`EDUMATCH_ACTIVE_MODEL` in `backend/.env`. `GET /api/proposals/{id}/alternatives?compare_models=true`
scores a student's options with every model side by side.

Honest claim: the model learned a disclosed synthetic compatibility formula
(`.75·subject_fit + .15·overall + .10·same_province`); Linear Regression recovers those weights exactly.
This is not real placement accuracy. Retrain on real, authorised data before any real use.

## Main API routes (`/api` prefix)

| Area | Routes |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Data | `POST /demo/seed`, `POST /cohorts/import`, `GET /cohorts`, `GET /cohorts/{id}/summary`, `GET /cohorts/{id}/students`, `GET /offers?cohort_id=` |
| Admin edits | `PATCH /offers/{id}?cohort_id=`, `PATCH /cohorts/{id}/rules`, `PATCH /cohorts/{id}/students/{sid}`, `POST /cohorts/{id}/reset` |
| Model | `GET /model/status`, `GET /model/registry`, `GET /model/comparison`, `POST /model/active` |
| Runs | `POST /runs`, `GET /runs/{id}`, `GET /runs/{id}/metrics`, `GET /runs/{id}/proposals`, `POST /cohorts/{id}/simulate`, `POST /cohorts/{id}/what-if` |
| Review | `GET /proposals/{id}`, `GET /proposals/{id}/alternatives`, `POST /proposals/{id}/decision`, `POST /runs/{id}/bulk-approve` |
| Export / audit | `GET /runs/{id}/export.csv`, `GET /runs/{id}/exceptions.csv`, `GET /audit` |
| Acceptance | `POST /acceptance/run` (admin): SRS AT-01..AT-08 on an isolated temporary copy of the backend |

All mutations need the `X-CSRF-Token` header returned by login. Errors use `{code, message, details}`.
