# EduMatch AI — API guide for the frontend

Base URL (local): `http://127.0.0.1:8010/api` · interactive docs: `http://127.0.0.1:8010/docs`
Machine-readable contract: [`openapi.json`](openapi.json) · real responses to mock against: [`examples/`](examples)

Regenerate both after any backend change: `cd backend && ../.venv/Scripts/python scripts/export_api_docs.py`

## 1. Running the backend for frontend work

```bash
cd backend
../.venv/Scripts/python -m uvicorn app.main:create_app --factory --port 8010
```

CORS already allows the Vite dev server (`http://localhost:5173` and `http://127.0.0.1:5173`).
Sign-in credentials for `admin` and `officer` are in `backend/.env` (created by `scripts/init_env.py`).

## 2. Authentication and CSRF (read this first)

Sessions use an **HttpOnly cookie**, so the browser handles it; always send `credentials: 'include'`.
Every **POST/PATCH** (except login) must also send the `X-CSRF-Token` header. Its value comes from the
login response (`csrf_token`), from `GET /auth/me`, or from the readable `edumatch_csrf` cookie.

```js
const API = 'http://127.0.0.1:8010/api';
let csrf = null;

export async function login(username, password) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw await r.json();          // { code, message, details, request_id }
  const body = await r.json();              // { user: {username, display_name, role}, csrf_token, expires_at }
  csrf = body.csrf_token;
  return body.user;
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = method === 'GET' ? {} : { 'X-CSRF-Token': csrf };
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${API}${path}`, {
    method, credentials: 'include', headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  if (r.status === 401) { /* go to login screen */ }
  if (!r.ok) throw await r.json();
  return r.headers.get('content-type')?.includes('text/csv') ? r.blob() : r.json();
}
```

On page reload call `GET /auth/me`: 200 means still signed in (and returns a fresh `csrf_token`), 401 means show login.
Roles: `ADMIN` can do everything; `OFFICER` cannot seed, import, edit inputs, reset, or switch models (403 `FORBIDDEN`).
Hide those controls for officers — the backend enforces it anyway.

## 3. The five SRS screens → endpoints

| Screen | Calls |
|---|---|
| **Login** | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| **Dashboard / data** | `GET /cohorts` · `GET /cohorts/{id}/summary` · `GET /model/status` · admin: `GET /demo/fixtures`, `POST /demo/seed {fixture, reset}`, `POST /cohorts/import` (multipart: `students`, `offers`, `preferences`, optional `rules`) · run: `POST /runs {cohort_id, expected_input_version}` · `GET /runs/{id}/metrics` |
| **Schools and offers** | `GET /offers?cohort_id=` (capacity, proposed/approved/remaining seats, status OPEN/FULL/UNAVAILABLE) · admin: `PATCH /offers/{offer_id}?cohort_id=`, `PATCH /cohorts/{id}/rules` |
| **Placement workspace** | `GET /runs/{id}/proposals?status=&offer_id=&student_id=&reason=&fallback=&limit=&offset=` · `GET /proposals/{id}` (explanation, trace, choices, history, score breakdown) · `GET /cohorts/{id}/students?search=` |
| **Review and export** | `GET /proposals/{id}/alternatives?compare_models=true` · `POST /proposals/{id}/decision` · `POST /runs/{id}/bulk-approve` · `GET /runs/{id}/export.csv` · `GET /runs/{id}/exceptions.csv` · `GET /audit?run_id=&student_id=` · admin: `POST /cohorts/{id}/reset {confirm: true}` |

Extras for the "wow" moments: `GET /model/registry` (all 7 models with metrics — a comparison table),
`GET /model/comparison` (full offline evaluation report), `POST /cohorts/{id}/simulate` (dry-run:
AI vs rules-only, or capacity what-if — nothing saved), `POST /cohorts/{id}/what-if` (re-rank one
student with changed scores — nothing saved), admin `POST /model/active {model_key}`.

## 4. The review flow (optimistic concurrency)

Every proposal has a `revision`. Send the one you displayed:

```json
POST /proposals/{proposal_id}/decision
{ "action": "approve", "expected_revision": 1 }
{ "action": "change",  "expected_revision": 1, "offer_id": "DEMO_200-O004", "reason": "Family request" }
{ "action": "reject",  "expected_revision": 1, "reason": "Needs follow-up" }
```

The response is the updated proposal with its new `revision`, plus `run_status` and `run_revision`.
On **409 `STALE_REVISION`** someone else changed it: refetch the proposal and show the new state.
`change` and `reject` need a non-empty `reason` (show a required text box). A change creates status
`CHANGED`, which still needs an `approve`. Only offers returned in `alternatives[]` are valid change
targets; `not_authorized[]` explains the rest.

Bulk approval: `POST /runs/{id}/bulk-approve {expected_run_revision}` approves every untouched `DRAFT`.

## 5. States and labels

| Thing | Values |
|---|---|
| Run `status` | `GENERATED` → `UNDER_REVIEW` → `COMPLETED`; `STALE` after an input edit; `SUPERSEDED` when replaced |
| Run `mode` | `AI` or `RULES_ONLY` (model unavailable — show **"AI unavailable"**) |
| Proposal `status` | `DRAFT`, `CHANGED` (both = "Draft proposal"), `APPROVED`, `REJECTED`, `UNASSIGNED` |
| `reason_code` | `LISTED_CHOICE_1/2/3`, `FALLBACK_AI_RANKED`, `NO_ELIGIBLE_OFFER`, `NO_ELIGIBLE_CHOICE`, `CHOICES_EXHAUSTED` |
| `reason_codes` (detail) | e.g. `FIRST_CHOICE_FULL`, `SECOND_CHOICE_FEASIBLE`, `FALLBACK_NOT_OPTED_IN`, `OFFICER_CHANGED` |

SRS display rules: always show the **"Synthetic data"** and **"Demo policy"** labels (`summary.data_label`,
`summary.policy_label`); show `fit_score` as a **compatibility score out of 100, one decimal — never a
probability**; `fit_score: null` on listed-choice placements is correct (the AI did not decide those);
show status as text as well as colour; show measured `runtime_ms`, never a fixed claim; keep draft and
approved metrics visually separate (`metrics.draft` vs `metrics.approved`).

`score_breakdown` (on AI-chosen proposals and on alternatives) splits the fit score exactly:
`baseline + sum(contributions) = total`. Good for a small stacked bar: subject fit / overall / same province.

## 6. Errors

Every error body is `{ code, message, details, request_id }`. Show `message` to the user; branch on `code`.
Import errors put row-level problems in `details.errors[]` as `{file, row, field, code, message}` — render as a table.

| HTTP | Codes |
|---|---|
| 400 | `BAD_REQUEST` (malformed body — `details` lists fields), `MISSING_FILE`, `NO_CHANGES` |
| 401 | `NOT_AUTHENTICATED`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN` (role), `CSRF_FAILED` (missing/incorrect `X-CSRF-Token`) |
| 404 | `COHORT_NOT_FOUND`, `RUN_NOT_FOUND`, `PROPOSAL_NOT_FOUND`, `OFFER_NOT_FOUND`, `STUDENT_NOT_FOUND`, `REPORT_NOT_FOUND` |
| 409 | `STALE_REVISION`, `STALE_INPUT_VERSION`, `CAPACITY_FULL`, `ALREADY_APPROVED`, `INVALID_TRANSITION`, `RUN_STALE`, `RUN_NOT_ACTIVE`, `RUN_IN_PROGRESS`, `APPROVALS_EXIST`, `COHORT_EXISTS`, `PLAN_INVALID` |
| 413 | `FILE_TOO_LARGE` (10 MB per file) |
| 422 | `VALIDATION_FAILED` (import), `INELIGIBLE_OFFER`, `PREFERENCE_NOT_AUTHORIZED`, `REASON_REQUIRED`, `REASON_TOO_LONG`, `OFFER_REQUIRED`, `NO_CHANGE`, `UNKNOWN_OFFER`, `UNKNOWN_MODEL`, `UNKNOWN_FIXTURE`, `INVALID_CAPACITY`, `EMPTY_COHORT` |
| 429 | `TOO_MANY_ATTEMPTS` (5 failed logins → 5-minute cooldown) |
| 500 | `INTERNAL_ERROR`, `INVARIANT_VIOLATION` — quote `request_id` when reporting |

Disable the "Run" button while a run is in flight (the backend also returns `RUN_IN_PROGRESS`).
After an admin edit, `input_version` increments: re-read the summary before the next `POST /runs`.
