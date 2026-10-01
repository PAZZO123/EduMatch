from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..domain.allocation import rank_alternatives
from ..domain.validation import ImportErrors, validate_import
from ..errors import ApiError
from ..models import Cohort, Preference, Student, User
from ..schemas import OfferPatch, ResetIn, RulesPatch, SeedIn, SimulateIn, StudentPatch, WhatIfIn
from ..security import current_user, get_db, require_admin
from ..services import cohorts as svc
from ..services import runs as run_svc
from ..services.runs import reservations

router = APIRouter(tags=['cohorts'])


@router.get('/demo/fixtures')
def fixtures(_: User = Depends(require_admin)):
    return {'fixtures': sorted(svc.FIXTURES)}


@router.post('/demo/seed')
def seed(body: SeedIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    cohort = svc.seed(db, body.fixture, body.reset, user)
    db.commit()
    return svc.summary(db, cohort)


async def _read_upload(file: UploadFile | None, name: str, required: bool) -> bytes | None:
    if file is None:
        if required:
            raise ApiError(400, 'MISSING_FILE', f'{name} is required.')
        return None
    limit = get_settings().max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise ApiError(413, 'FILE_TOO_LARGE', f'{name} exceeds {limit // (1024 * 1024)} MB.')
    return data


@router.post('/cohorts/import')
async def import_cohort(students: UploadFile = File(...), offers: UploadFile = File(...),
                        preferences: UploadFile | None = File(None), rules: UploadFile | None = File(None),
                        replace: bool = False, dry_run: bool = False,
                        db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Choices come from preferences.csv or, if omitted, from students.csv choice_1..choice_3 columns.
    dry_run=true validates the whole batch and reports what would be imported, without saving anything."""
    raw = [await _read_upload(students, 'students.csv', True), await _read_upload(offers, 'offers.csv', True),
           await _read_upload(preferences, 'preferences.csv', False), await _read_upload(rules, 'rules.json', False)]
    try:
        cohort_id, inputs = validate_import(*raw)
    except ImportErrors as exc:
        raise ApiError(422, 'VALIDATION_FAILED', f'{len(exc.errors)} problem(s) found; nothing was imported.',
                       {'errors': exc.errors}) from None
    if dry_run:
        return svc.preview(db, cohort_id, inputs)
    cohort = svc.create_cohort(db, cohort_id, inputs, 'IMPORT', user, replace_existing=replace)
    db.commit()
    return svc.summary(db, cohort)


@router.get('/cohorts')
def list_cohorts(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return {'cohorts': [svc.summary(db, c) for c in db.scalars(select(Cohort).order_by(Cohort.created_at.desc()))]}


@router.get('/cohorts/{cohort_id}/summary')
def cohort_summary(cohort_id: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return svc.summary(db, svc.get_cohort(db, cohort_id))


@router.get('/offers')
def offers(cohort_id: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    cohort = svc.get_cohort(db, cohort_id)
    return {'cohort_id': cohort_id, 'input_version': cohort.input_version, 'active_run_id': cohort.active_run_id,
            'offers': svc.offers_with_reservations(db, cohort)}


@router.get('/cohorts/{cohort_id}/students')
def students(cohort_id: str, search: str | None = None, limit: int = 50, offset: int = 0,
             db: Session = Depends(get_db), _: User = Depends(current_user)):
    svc.get_cohort(db, cohort_id)
    limit = max(1, min(limit, 500))
    q = select(Student).where(Student.cohort_id == cohort_id)
    if search:
        q = q.where(Student.student_id.contains(search) | Student.display_name.contains(search))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(Student.overall_score.desc(), Student.student_id).limit(limit).offset(offset)).all()
    prefs = {}
    for p in db.scalars(select(Preference).where(Preference.cohort_id == cohort_id,
                                                  Preference.student_id.in_([s.student_id for s in rows]))
                        .order_by(Preference.rank)):
        prefs.setdefault(p.student_id, []).append({'rank': p.rank, 'offer_id': p.offer_id})
    return {'total': total, 'limit': limit, 'offset': offset, 'students': [
        {'student_id': s.student_id, 'display_name': s.display_name, 'province': s.province,
         'overall_score': s.overall_score, 'math_score': s.math_score, 'science_score': s.science_score,
         'language_score': s.language_score, 'allow_fallback': s.allow_fallback,
         'choices': prefs.get(s.student_id, [])} for s in rows]}


@router.patch('/offers/{offer_id}')
def patch_offer(offer_id: str, cohort_id: str, body: OfferPatch, db: Session = Depends(get_db),
                user: User = Depends(require_admin)):
    cohort = svc.get_cohort(db, cohort_id)
    changes = body.model_dump(exclude_unset=True, exclude={'expected_input_version', 'clear_subject_minimums'})
    changes = {k: v for k, v in changes.items() if v is not None}
    for sub in body.clear_subject_minimums:
        changes[f'subject_min_{sub}'] = None
    if not changes:
        raise ApiError(400, 'NO_CHANGES', 'Provide at least one field to change.')
    svc.update_offer(db, cohort, offer_id, changes, body.expected_input_version, user)
    db.commit()
    return {'input_version': cohort.input_version,
            'offer': next(o for o in svc.offers_with_reservations(db, cohort) if o['offer_id'] == offer_id)}


@router.patch('/cohorts/{cohort_id}/rules')
def patch_rules(cohort_id: str, body: RulesPatch, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    cohort = svc.get_cohort(db, cohort_id)
    changes = {k: v for k, v in body.model_dump(exclude={'expected_input_version'}).items() if v is not None}
    if not changes:
        raise ApiError(400, 'NO_CHANGES', 'Provide at least one rule to change.')
    svc.update_rules(db, cohort, changes, body.expected_input_version, user)
    db.commit()
    return {'input_version': cohort.input_version, 'rules': cohort.rules}


@router.patch('/cohorts/{cohort_id}/students/{student_id}')
def patch_student(cohort_id: str, student_id: str, body: StudentPatch, db: Session = Depends(get_db),
                  user: User = Depends(require_admin)):
    cohort = svc.get_cohort(db, cohort_id)
    changes = {k: v for k, v in body.model_dump(exclude={'expected_input_version'}).items() if v is not None}
    if not changes:
        raise ApiError(400, 'NO_CHANGES', 'Provide at least one field to change.')
    svc.update_student(db, cohort, student_id, changes, body.expected_input_version, user)
    db.commit()
    return {'input_version': cohort.input_version, 'student_id': student_id, 'changed': changes}


@router.post('/cohorts/{cohort_id}/delete')
def delete_cohort(cohort_id: str, body: ResetIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Permanently remove a cohort and its runs (requires {"confirm": true}). The audit log keeps its history."""
    result = svc.delete_cohort(db, svc.get_cohort(db, cohort_id), user)
    db.commit()
    return result


@router.post('/cohorts/{cohort_id}/reset')
def reset(cohort_id: str, body: ResetIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    cohort = svc.reset_cohort(db, svc.get_cohort(db, cohort_id), user)
    db.commit()
    return svc.summary(db, cohort)


@router.post('/cohorts/{cohort_id}/simulate')
def simulate(cohort_id: str, body: SimulateIn, request: Request, db: Session = Depends(get_db),
             _: User = Depends(current_user)):
    cohort = svc.get_cohort(db, cohort_id)
    return run_svc.simulate(db, cohort, body.mode, body.model_key, body.capacity_overrides, request.app.state.registry)


@router.post('/cohorts/{cohort_id}/what-if')
def what_if(cohort_id: str, body: WhatIfIn, request: Request, db: Session = Depends(get_db),
            _: User = Depends(current_user)):
    """Re-rank one student's alternatives with hypothetical scores. Read-only: nothing is saved."""
    cohort = svc.get_cohort(db, cohort_id)
    registry = request.app.state.registry
    model = registry.get(body.model_key)
    if body.model_key and model is None:
        raise ApiError(422, 'UNKNOWN_MODEL', f'Model "{body.model_key}" is not loaded.')
    overrides = {k: v for k, v in body.model_dump(exclude={'student_id', 'model_key'}).items() if v is not None}
    inputs, student = svc.with_student_override(svc.load_inputs(db, cohort), body.student_id, overrides)
    held = reservations(db, cohort.active_run_id) if cohort.active_run_id else {}
    free = {o.offer_id: o.capacity - held.get(o.offer_id, 0) for o in inputs.offers}
    all_seats = {o.offer_id: max(o.capacity, 1) for o in inputs.offers}
    score = model.score if model else None
    return {'student_id': student.student_id, 'overrides': overrides,
            'model_version': model.model_version if model else None, 'persisted': False,
            'ranking_ignoring_capacity': rank_alternatives(student, inputs, all_seats, score),
            'ranking_with_current_reservations': rank_alternatives(student, inputs, free, score)}
