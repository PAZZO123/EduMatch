"""Runtime settings. Secrets and demo credentials come from the environment / backend/.env, never source."""
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / '.env', env_prefix='EDUMATCH_', extra='ignore')

    environment: str = 'development'
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'edumatch.db').as_posix()}"
    secret_key: str = Field(min_length=32)

    # Demo accounts are created on startup if missing. Values live in .env (see scripts/init_env.py).
    admin_username: str = 'admin'                      # Super Administrator (ADMIN)
    admin_password: str = Field(min_length=10)
    officer_username: str = 'officer'                  # Placement Officer (OFFICER)
    officer_password: str = Field(min_length=10)
    placement_admin_username: str | None = None        # Placement Administrator (ADMIN), optional
    placement_admin_password: str | None = None
    school_admin_username: str | None = None           # School Administrator (VIEWER, read-only), optional
    school_admin_password: str | None = None
    allow_self_registration: bool = True               # self-registered accounts stay inactive until an admin activates them

    session_hours: int = 8
    cookie_secure: bool = False            # set true when served over HTTPS
    cors_origins: list[str] = ['http://localhost:5173', 'http://127.0.0.1:5173',
                               'http://localhost:3000', 'http://127.0.0.1:3000']
    auto_seed_fixture: str | None = None                # e.g. 'demo_200' to load a sample cohort into an empty database on start
    frontend_dist: Path = PROJECT_DIR / 'dist'          # served at / when built (one-process offline demo)

    model_dir: Path = PROJECT_DIR / 'ml' / 'models'
    active_model: str | None = None        # None = registry champion
    data_dir: Path = PROJECT_DIR / 'EduMatch_AI_Synthetic_Data'

    max_upload_bytes: int = 10 * 1024 * 1024
    login_max_failures: int = 5
    login_lockout_seconds: int = 300


_active: Settings | None = None


def use_settings(settings: Settings) -> None:
    """Make the settings an app was created with the process-wide settings."""
    global _active
    _active = settings


def get_settings() -> Settings:
    global _active
    if _active is None:
        _active = Settings()
    return _active
