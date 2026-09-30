"""Uniform error envelope {code, message, details}; internal stack traces never reach clients."""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger('edumatch')


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | list | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details


def _body(code, message, details=None, request_id=None):
    return {'code': code, 'message': message, 'details': details, 'request_id': request_id}


def install_error_handlers(app: FastAPI):
    @app.exception_handler(ApiError)
    async def _api(request: Request, exc: ApiError):
        return JSONResponse(_body(exc.code, exc.message, exc.details, getattr(request.state, 'request_id', None)),
                            status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        details = [{'field': '.'.join(str(p) for p in e.get('loc', []) if p != 'body'), 'message': e.get('msg')}
                   for e in exc.errors()]
        return JSONResponse(_body('BAD_REQUEST', 'Request body or parameters are malformed.', details,
                                  getattr(request.state, 'request_id', None)), status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        code = {404: 'NOT_FOUND', 405: 'METHOD_NOT_ALLOWED'}.get(exc.status_code, 'HTTP_ERROR')
        return JSONResponse(_body(code, str(exc.detail), None, getattr(request.state, 'request_id', None)),
                            status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception):
        rid = getattr(request.state, 'request_id', None)
        log.exception('unhandled error request_id=%s', rid)
        return JSONResponse(_body('INTERNAL_ERROR', 'Unexpected server error. Quote the request_id when reporting it.',
                                  None, rid), status_code=500)
