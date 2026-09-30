# EduMatch AI

AI-assisted school placement demo. **Synthetic data and demo policy only.** Every placement passes
deterministic eligibility, capacity and uniqueness checks and needs human approval.

```
EduMatch_AI_Synthetic_Data/   dataset package (cohorts, fixtures; training pairs rebuilt locally)
ml/                           model training, comparison, figures, trained models
backend/                      FastAPI + SQLAlchemy + SQLite API
docs/                         API guide for the frontend, openapi.json, example responses
frontend/                     React + Vite + Tailwind (built by the frontend teammate)
```

**Frontend teammate:** start with [docs/API.md](docs/API.md). Work in `frontend/` on your own branch;
the backend only needs the setup and run steps below.

## Setup (once)

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r ml/requirements.txt -r backend/requirements.txt
cd backend && ../.venv/Scripts/python scripts/init_env.py
```

`init_env.py` writes `backend/.env` with a random secret key and random demo passwords for the
`admin` and `officer` accounts. That file is git-ignored; read the sign-in passwords there.

## Run the backend

```bash
cd backend
../.venv/Scripts/python -m uvicorn app.main:create_app --factory --port 8010
```

API docs: http://127.0.0.1:8010/docs · health: http://127.0.0.1:8010/api/health

## Tests

```bash
cd backend && ../.venv/Scripts/python -m pytest -q
```

85 tests: exact regression against all 14 reference cohorts, all 8 invalid-import fixtures, the SRS
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

All mutations need the `X-CSRF-Token` header returned by login. Errors use `{code, message, details}`.
