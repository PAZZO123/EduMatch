from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..models import User
from ..security import current_user, get_db
from ..services import history as svc

router = APIRouter(prefix='/history', tags=['history'])


@router.get('')
def list_history(cohort_id: str | None = None, db: Session = Depends(get_db), _: User = Depends(current_user)):
    """Previous placement runs (newest first) with their headline results."""
    return {'history': svc.list_history(db, cohort_id)}


@router.get('/{history_id}')
def history_detail(history_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    """One archived run: metrics and every student's result with its reason."""
    return svc.detail(db, history_id)


@router.get('/{history_id}/export.csv')
def history_export(history_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    content, rows = svc.export_csv(db, history_id)
    return Response(content, media_type='text/csv; charset=utf-8',
                    headers={'Content-Disposition': f'attachment; filename="placement_history_{history_id}.csv"',
                             'X-Row-Count': str(rows)})
