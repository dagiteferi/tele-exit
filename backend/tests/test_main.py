import asyncio

from fastapi.testclient import TestClient

from app.config import (
    Settings,
    clear_settings_cache,
)
from app.core.di import (
    build_container,
    reset_container,
)
from app.main import create_app


def test_health_endpoint(tmp_path, monkeypatch):
    clear_settings_cache()
    reset_container()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "main.db"))
    monkeypatch.setenv("USE_FAKES", "true")
    clear_settings_cache()

    app = create_app()
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "use_fakes": True}

    reset_container()
    clear_settings_cache()


def test_app_bootstraps_admin_from_settings(tmp_path, monkeypatch):
    clear_settings_cache()
    reset_container()
    db_path = str(tmp_path / "boot.db")
    monkeypatch.setenv("DB_PATH", db_path)
    monkeypatch.setenv("USE_FAKES", "true")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAIL", "boot@tele.exit")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "boot-secret")
    clear_settings_cache()

    app = create_app()
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert app.state.admin_id is not None
        assert app.state.container is not None

    container = build_container(
        Settings(
            use_fakes=True,
            db_path=db_path,
        )
    )
    user = asyncio.run(container.repo.get_user_by_email("boot@tele.exit"))
    assert user is not None
    assert user["role"] == "admin"

    reset_container()
    clear_settings_cache()
