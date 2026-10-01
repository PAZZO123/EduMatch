from fastapi import APIRouter, Depends, Request

from ..models import User
from ..security import require_admin
from ..services import acceptance

router = APIRouter(prefix='/acceptance', tags=['acceptance'])


@router.post('/run')
def run_acceptance_gate(request: Request, _: User = Depends(require_admin)):
    """Run SRS §20 AT-01..AT-08 against an isolated temporary copy of this backend. Live data is untouched."""
    return acceptance.run_for_live_app(request.app.state.registry)
