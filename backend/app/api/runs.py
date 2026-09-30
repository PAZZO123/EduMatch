from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..domain.rules import pair_features
from ..models import AuditEvent, Cohort, Offer, PlacementRun, Preference, Proposal, Student, User
from ..schemas import BulkApproveIn, DecisionIn, RunIn
from ..security import current_user, get_db
from ..services import cohorts as cohort_svc
from ..services import decisions as dec_svc
from ..services import export as export_svc
from ..services import runs as svc
from ..services.explain import explain

router = APIRouter(tags=['runs'])


def run_out(run: PlacementRun) -> dict:
    return {'run_id': run.id, 'cohort_id': run.cohort_id, 'status': run.status, 'revision': run.revision,
            'mode': run.mode, 'ai_label': 'Local model' if run.mode == 'AI' else 'Rules-only (AI not used)',
            'input_version': run.input_version, 'rule_version': run.rule_version, 'model_key': run.model_key,
            'model_version': run.model_version, 'model_sha256': run.model_sha256, 'metrics': run.metrics,
            'runtime_ms': run.runtime_ms, 'invariants': run.invariants, 'stale_reason': run.stale_reason,
            'created_by': run.created_by, 'created_at': run.created_at, 'label': 'Draft proposal'}


def proposal_out(p: Proposal, student: Student | None = None, schools: dict | None = None) -> dict:
    out = {'proposal_id': p.id, 'run_id': p.run_id, 'student_id': p.student_id, 'offer_id': p.offer_id,
           'school_name': (schools or {}).get(p.offer_id), 'status': p.status, 'priority_position': p.priority_position,
           'preference_rank': p.preference_rank, 'fallback_used': p.fallback_used, 'fit_score': p.fit_score,
           'reason_code': p.reason_code, 'reason_codes': p.reason_codes, 'engine_offer_id': p.engine_offer_id,
           'released_offer_id': p.released_offer_id, 'revision': p.revision, 'reviewer': p.reviewer,
           'reviewed_at': p.reviewed_at, 'decision_reason': p.decision_reason}
    if student is not None:
        out['student'] = {'display_name': student.display_name, 'province': student.province,
                          'overall_score': student.overall_score, 'math_score': student.math_score,
                          'science_score': student.science_score, 'language_score': student.language_score,
                          'allow_fallback': student.allow_fallback}
    return out


def _schools(db: Session, cohort_id: str) -> dict:
    return dict(db.execute(select(Offer.offer_id, Offer.school_name).where(Offer.cohort_id == cohort_id)).all())


@router.post('/runs')
def create_run(body: RunIn, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    cohort = cohort_svc.get_cohort(db, body.cohort_id)
    run = svc.create_run(db, cohort, body.expected_input_version, body.mode, body.model_key, user,
                         request.app.state.registry)
    return run_out(run)


@router.get('/runs/{run_id}')
def get_run(run_id: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return run_out(svc.get_run(db, run_id))


@router.get('/cohorts/{cohort_id}/runs')
def cohort_runs(cohort_id: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    cohort_svc.get_cohort(db, cohort_id)
    runs = db.scalars(select(PlacementRun).where(PlacementRun.cohort_id == cohort_id)
                      .order_by(PlacementRun.created_at.desc())).all()
    return {'runs': [run_out(r) for r in runs]}


@router.get('/runs/{run_id}/metrics')
def run_metrics(run_id: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return svc.live_metrics(db, svc.get_run(db, run_id))


@router.get('/runs/{run_id}/proposals')
def proposals(run_id: str, status: str | None = None, offer_id: str | None = None, student_id: str | None = None,
              reason: str | None = None, fallback: bool | None = None, limit: int = 50, offset: int = 0,
              db: Session = Depends(get_db), _: User = Depends(current_user)):
    run = svc.get_run(db, run_id)
    limit = max(1, min(limit, 1000))
    total, rows = svc.list_proposals(db, run, status, offer_id, student_id, reason, fallback, limit, offset)
    students = {s.student_id: s for s in db.scalars(
        select(Student).where(Student.cohort_id == run.cohort_id, Student.student_id.in_([p.student_id for p in rows])))}
    schools = _schools(db, run.cohort_id)
    return {'run_id': run.id, 'run_status': run.status, 'run_revision': run.revision, 'total': total, 'limit': limit,
            'offset': offset, 'proposals': [proposal_out(p, students.get(p.student_id), schools) for p in rows]}


def _score_breakdown(db: Session, request: Request, p: Proposal, run: PlacementRun, student: Student) -> dict | None:
    """Exact per-feature split of the fit score for a model-chosen offer, using the model the run recorded."""
    model = request.app.state.registry.get(run.model_key) if run.model_key else None
    if not (p.fallback_used and p.offer_id and model and model.explainable):
        return None
    inputs = cohort_svc.load_inputs(db, db.get(Cohort, p.cohort_id))
    s = next(x for x in inputs.students if x.student_id == student.student_id)
    o = next(x for x in inputs.offers if x.offer_id == p.offer_id)
    return model.breakdown(pair_features(s, o))


@router.get('/proposals/{proposal_id}')
def proposal_detail(proposal_id: str, request: Request, db: Session = Depends(get_db), _: User = Depends(current_user)):
    p = dec_svc.get_proposal(db, proposal_id)
    run = p.run
    student = db.get(Student, (p.cohort_id, p.student_id))
    schools = _schools(db, p.cohort_id)
    total = len(run.proposals)
    choices = [{'rank': c.rank, 'offer_id': c.offer_id, 'school_name': schools.get(c.offer_id)}
               for c in db.scalars(select(Preference).where(Preference.cohort_id == p.cohort_id,
                                                           Preference.student_id == p.student_id)
                                   .order_by(Preference.rank))]
    history = db.scalars(select(AuditEvent).where(AuditEvent.run_id == run.id, AuditEvent.student_id == p.student_id)
                         .order_by(AuditEvent.at)).all()
    return {**proposal_out(p, student, schools), 'choices': choices, 'trace': p.trace,
            'explanation': explain(p, run, total, student.overall_score, schools),
            'score_breakdown': _score_breakdown(db, request, p, run, student),
            'provenance': {'rule_version': run.rule_version, 'input_version': run.input_version,
                           'model_version': run.model_version, 'mode': run.mode},
            'history': [_audit_out(e) for e in history]}


@router.get('/proposals/{proposal_id}/alternatives')
def proposal_alternatives(proposal_id: str, request: Request, compare_models: bool = False,
                          db: Session = Depends(get_db), _: User = Depends(current_user)):
    return dec_svc.alternatives(db, dec_svc.get_proposal(db, proposal_id), request.app.state.registry, compare_models)


@router.post('/proposals/{proposal_id}/decision')
def decision(proposal_id: str, body: DecisionIn, request: Request, db: Session = Depends(get_db),
             user: User = Depends(current_user)):
    p = dec_svc.decide(db, proposal_id, body.action, body.offer_id, body.reason, body.expected_revision, user,
                       request.app.state.registry)
    db.commit()
    return {**proposal_out(p, None, _schools(db, p.cohort_id)), 'run_status': p.run.status,
            'run_revision': p.run.revision}


@router.post('/runs/{run_id}/bulk-approve')
def bulk_approve(run_id: str, body: BulkApproveIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    result = dec_svc.bulk_approve(db, svc.get_run(db, run_id), body.expected_run_revision, user)
    db.commit()
    return result


def _csv(content: str, filename: str, rows: int) -> Response:
    return Response(content, media_type='text/csv; charset=utf-8',
                    headers={'Content-Disposition': f'attachment; filename="{filename}"', 'X-Row-Count': str(rows)})


@router.get('/runs/{run_id}/export.csv')
def export_approved(run_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    run = svc.get_run(db, run_id)
    content, n = export_svc.approved_csv(db, run)
    from ..services import audit
    audit.record(db, user, 'EXPORTED', cohort_id=run.cohort_id, run_id=run.id, rows=n, kind='approved'); db.commit()
    return _csv(content, f'edumatch_approved_{run.cohort_id}_{run.id[:8]}.csv', n)


@router.get('/runs/{run_id}/exceptions.csv')
def export_exceptions(run_id: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    run = svc.get_run(db, run_id)
    content, n = export_svc.exceptions_csv(db, run)
    return _csv(content, f'edumatch_exceptions_{run.cohort_id}_{run.id[:8]}.csv', n)


def _audit_out(e: AuditEvent) -> dict:
    return {'id': e.id, 'at': e.at, 'actor': e.actor, 'role': e.role, 'action': e.action, 'cohort_id': e.cohort_id,
            'run_id': e.run_id, 'proposal_id': e.proposal_id, 'student_id': e.student_id,
            'old_offer_id': e.old_offer_id, 'new_offer_id': e.new_offer_id, 'reason': e.reason, 'details': e.details}


@router.get('/audit')
def audit_log(cohort_id: str | None = None, run_id: str | None = None, student_id: str | None = None,
              action: str | None = None, limit: int = 100, offset: int = 0, db: Session = Depends(get_db),
              _: User = Depends(current_user)):
    q = select(AuditEvent)
    for col, val in [(AuditEvent.cohort_id, cohort_id), (AuditEvent.run_id, run_id),
                     (AuditEvent.student_id, student_id), (AuditEvent.action, action)]:
        if val:
            q = q.where(col == val)
    rows = db.scalars(q.order_by(AuditEvent.id.desc()).limit(max(1, min(limit, 1000))).offset(offset)).all()
    return {'events': [_audit_out(e) for e in rows]}
