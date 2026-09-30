"""Create backend/.env with a random secret key and random demo passwords (never committed).

Usage:  python scripts/init_env.py [--force]
"""
import secrets
import sys
from pathlib import Path

ENV = Path(__file__).resolve().parents[1] / '.env'

if ENV.exists() and '--force' not in sys.argv:
    sys.exit(f'{ENV} already exists; pass --force to regenerate (this changes the demo passwords).')

ENV.write_text(
    '# Local secrets for the EduMatch AI demo. Do not commit.\n'
    f'EDUMATCH_SECRET_KEY={secrets.token_urlsafe(48)}\n'
    'EDUMATCH_ADMIN_USERNAME=admin\n'
    f'EDUMATCH_ADMIN_PASSWORD={secrets.token_urlsafe(12)}\n'
    'EDUMATCH_OFFICER_USERNAME=officer\n'
    f'EDUMATCH_OFFICER_PASSWORD={secrets.token_urlsafe(12)}\n'
    '# EDUMATCH_ACTIVE_MODEL=random_forest   # uncomment to override the registry champion\n'
    '# EDUMATCH_COOKIE_SECURE=true           # when served over HTTPS\n',
    encoding='utf-8')
print(f'Wrote {ENV}. Demo sign-in credentials are in that file.')
