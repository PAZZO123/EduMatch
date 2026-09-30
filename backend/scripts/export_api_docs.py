"""Export docs/openapi.json and real example responses (docs/examples/*.json) for the frontend team.

Runs the whole demo flow against a throwaway database, so the examples always match the current API.
Usage:  python scripts/export_api_docs.py      (from backend/)
"""
import json
import secrets
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import PROJECT_DIR, Settings  # noqa: E402
from app.main import create_app  # noqa: E402

DOCS = PROJECT_DIR / 'docs'
EXAMPLES = DOCS / 'examples'


def trim(value, max_items=3):
    """Keep examples readable: shorten long lists of records (lists of codes/strings stay complete)."""
    if isinstance(value, list):
        records = any(isinstance(v, dict) for v in value)
        return [trim(v, max_items) for v in (value[:max_items] if records else value)]
    if isinstance(value, dict):
        return {k: trim(v, max_items) for k, v in value.items()}
    return value


def main():
    EXAMPLES.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        pw = secrets.token_urlsafe(12)
        settings = Settings(_env_file=None, database_url=f"sqlite:///{(Path(tmp) / 'docs.db').as_posix()}",
                            secret_key=secrets.token_urlsafe(40), admin_password=pw, officer_password=pw)
        with TestClient(create_app(settings)) as c:
            (DOCS / 'openapi.json').write_text(json.dumps(c.app.openapi(), indent=2), encoding='utf-8')
            saved = []

            def save(name, response):
                body = response.json()
                (EXAMPLES / f'{name}.json').write_text(json.dumps(
                    {'status': response.status_code, 'body': trim(body)}, indent=2, default=str), encoding='utf-8')
                saved.append(name)
                return body

            login = save('auth_login', c.post('/api/auth/login', json={'username': 'admin', 'password': pw}))
            h = {'X-CSRF-Token': login['csrf_token']}
            save('error_unauthenticated', TestClient(c.app).get('/api/cohorts'))
            save('model_status', c.get('/api/model/status'))
            save('model_registry', c.get('/api/model/registry'))
            cohort = save('demo_seed', c.post('/api/demo/seed', json={'fixture': 'demo_200', 'reset': True}, headers=h))
            cid = cohort['cohort_id']
            save('cohort_summary', c.get(f'/api/cohorts/{cid}/summary'))
            save('cohort_students', c.get(f'/api/cohorts/{cid}/students', params={'limit': 3}))
            run = save('run_create', c.post('/api/runs', json={'cohort_id': cid, 'expected_input_version':
                                                               cohort['input_version']}, headers=h))
            save('offers', c.get('/api/offers', params={'cohort_id': cid}))
            save('run_metrics', c.get(f"/api/runs/{run['run_id']}/metrics"))
            props = c.get(f"/api/runs/{run['run_id']}/proposals", params={'limit': 1000}).json()['proposals']
            save('run_proposals', c.get(f"/api/runs/{run['run_id']}/proposals", params={'limit': 3}))
            fb = next(p for p in props if p['fallback_used'])
            listed = next(p for p in props if p['status'] == 'DRAFT' and not p['fallback_used'])
            unassigned = next(p for p in props if p['status'] == 'UNASSIGNED')
            save('proposal_detail_fallback', c.get(f"/api/proposals/{fb['proposal_id']}"))
            save('proposal_detail_unassigned', c.get(f"/api/proposals/{unassigned['proposal_id']}"))
            save('proposal_alternatives', c.get(f"/api/proposals/{fb['proposal_id']}/alternatives",
                                                params={'compare_models': True}))
            save('decision_approve', c.post(f"/api/proposals/{listed['proposal_id']}/decision",
                                            json={'action': 'approve', 'expected_revision': listed['revision']}, headers=h))
            save('error_stale_revision', c.post(f"/api/proposals/{listed['proposal_id']}/decision",
                                                json={'action': 'approve', 'expected_revision': listed['revision']},
                                                headers=h))
            save('simulate', c.post(f'/api/cohorts/{cid}/simulate', json={'mode': 'RULES_ONLY'}, headers=h))
            save('audit', c.get('/api/audit', params={'cohort_id': cid, 'limit': 3}))
            bad = PROJECT_DIR / 'EduMatch_AI_Synthetic_Data' / 'invalid_inputs' / 'missing_score'
            files = {n: (f'{n}.csv', (bad / f'{n}.csv').read_bytes(), 'text/csv') for n in ('students', 'offers', 'preferences')}
            save('error_import_validation', c.post('/api/cohorts/import', files=files, headers=h))
            (EXAMPLES / 'export_approved.csv').write_text(c.get(f"/api/runs/{run['run_id']}/export.csv").text,
                                                          encoding='utf-8')
    print(f'Wrote docs/openapi.json and {len(saved)} examples to docs/examples/')


if __name__ == '__main__':
    main()
