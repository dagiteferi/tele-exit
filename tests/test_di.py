import pytest

from app.adapters.fakes.fake_llm import FakeLLM
from app.adapters.real.sqlite_repository_adapter import SQLiteRepositoryAdapter
from app.config import (
    Settings,
    clear_settings_cache,
)
from app.core.di import (
    bootstrap_admin,
    build_container,
    reset_container,
)


@pytest.fixture(autouse=True)
def _clean_settings():
    clear_settings_cache()
    reset_container()
    yield
    clear_settings_cache()
    reset_container()


def test_build_container_uses_fakes_by_default(tmp_path):
    settings = Settings(use_fakes=True, db_path=str(tmp_path / "di.db"))
    container = build_container(settings)
    assert isinstance(container.llm, FakeLLM)
    assert isinstance(container.repo, SQLiteRepositoryAdapter)
    assert container["embedding"] is container.embedding


def test_build_container_rejects_real_mode_without_keys(tmp_path):
    settings = Settings(
        use_fakes=False,
        db_path=str(tmp_path / "di.db"),
        gemini_api_key="",
    )
    with pytest.raises(RuntimeError, match="USE_FAKES=false"):
        build_container(settings)


@pytest.mark.asyncio
async def test_bootstrap_admin_creates_once(tmp_path):
    settings = Settings(
        use_fakes=True,
        db_path=str(tmp_path / "admin.db"),
        admin_bootstrap_email="owner@tele.exit",
        admin_bootstrap_password="admin-secret",
    )
    container = build_container(settings)
    first = await bootstrap_admin(container)
    second = await bootstrap_admin(container)
    assert first is not None
    assert second == first
    user = await container.repo.get_user_by_email("owner@tele.exit")
    assert user["role"] == "admin"
