import os

from app.config import (
    clear_settings_cache,
    get_settings,
)


def test_get_settings_reads_environment(monkeypatch):
    clear_settings_cache()
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("USE_FAKES", "false")
    monkeypatch.setenv("DB_PATH", "./custom.db")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAIL", "admin@tele.exit")

    settings = get_settings()
    assert settings.jwt_secret == "test-secret"
    assert settings.use_fakes is False
    assert settings.db_path == "./custom.db"
    assert settings.admin_bootstrap_email == "admin@tele.exit"
    clear_settings_cache()


def test_use_fakes_defaults_true(monkeypatch):
    clear_settings_cache()
    monkeypatch.delenv("USE_FAKES", raising=False)
    assert get_settings().use_fakes is True
    clear_settings_cache()
