"""Create backend/.env with a random secret key and random demo passwords (never committed).

The four demo accounts match the frontend's sign-in screen (email usernames, one per UI role).
Usage:  python scripts/init_env.py [--force]
"""
import secrets
import sys
from pathlib import Path

ENV = Path(__file__).resolve().parents[1] / '.env'

if ENV.exists() and '--force' not in sys.argv:
    sys.exit(f'{ENV} already exists; pass --force to regenerate (this changes the demo passwords).')

pw = lambda: secrets.token_urlsafe(12)  # noqa: E731
ENV.write_text(
    '# Local secrets for the EduMatch AI demo. Do not commit.\n'
    f'EDUMATCH_SECRET_KEY={secrets.token_urlsafe(48)}\n'
    '# Super Administrator\n'
    'EDUMATCH_ADMIN_USERNAME=superadmin@edumatch.rw\n'
    f'EDUMATCH_ADMIN_PASSWORD={pw()}\n'
    '# Placement Administrator\n'
    'EDUMATCH_PLACEMENT_ADMIN_USERNAME=placement@edumatch.rw\n'
    f'EDUMATCH_PLACEMENT_ADMIN_PASSWORD={pw()}\n'
    '# Placement Officer\n'
    'EDUMATCH_OFFICER_USERNAME=officer@edumatch.rw\n'
    f'EDUMATCH_OFFICER_PASSWORD={pw()}\n'
    '# School Administrator (read-only)\n'
    'EDUMATCH_SCHOOL_ADMIN_USERNAME=school@edumatch.rw\n'
    f'EDUMATCH_SCHOOL_ADMIN_PASSWORD={pw()}\n'
    '# EDUMATCH_ACTIVE_MODEL=random_forest   # uncomment to override the registry champion\n'
    '# EDUMATCH_COOKIE_SECURE=true           # when served over HTTPS\n',
    encoding='utf-8')
print(f'Wrote {ENV}. Demo sign-in credentials are in that file.')
