from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
# Do not override existing process env (keeps pytest monkeypatch working).
load_dotenv(_ENV_FILE, override=False)


@dataclass(frozen=True)
class Settings:
    jwt_secret: str = "change-me-to-a-real-secret"
    use_fakes: bool = True
    db_path: str = "./tele_exit.db"
    gemini_api_key: str = ""
    tavily_api_key: str = ""
    youtube_api_key: str = ""
    google_credentials_path: str = "./credentials/google_service_account.json"
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    admin_bootstrap_email: str = ""
    admin_bootstrap_password: str = ""
    app_name: str = "Tele-Exit"
    app_version: str = "0.1.0"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        jwt_secret=os.getenv("JWT_SECRET", "change-me-to-a-real-secret"),
        use_fakes=_env_bool("USE_FAKES", True),
        db_path=os.getenv("DB_PATH", "./tele_exit.db"),
        gemini_api_key=os.getenv("GEMINI_API_KEY", ""),
        tavily_api_key=os.getenv("TAVILY_API_KEY", ""),
        youtube_api_key=os.getenv("YOUTUBE_API_KEY", ""),
        google_credentials_path=os.getenv(
            "GOOGLE_CREDENTIALS_PATH",
            "./credentials/google_service_account.json",
        ),
        livekit_url=os.getenv("LIVEKIT_URL", ""),
        livekit_api_key=os.getenv("LIVEKIT_API_KEY", ""),
        livekit_api_secret=os.getenv("LIVEKIT_API_SECRET", ""),
        admin_bootstrap_email=os.getenv("ADMIN_BOOTSTRAP_EMAIL", ""),
        admin_bootstrap_password=os.getenv("ADMIN_BOOTSTRAP_PASSWORD", ""),
        app_name=os.getenv("APP_NAME", "Tele-Exit"),
        app_version=os.getenv("APP_VERSION", "0.1.0"),
    )


def clear_settings_cache() -> None:
    get_settings.cache_clear()
