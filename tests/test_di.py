import pytest

from app.adapters.fakes.fake_llm import FakeLLM
from app.adapters.real.sqlite_repository_adapter import SQLiteRepositoryAdapter
from app.adapters.real.vector_store_adapter import LocalVectorStoreAdapter
from app.config import (
    Settings,
    clear_settings_cache,
)
from app.core.di import (
    bootstrap_admin,
    build_container,
    reset_container,
)
from app.core.orchestrator import Orchestrator
from app.domain.models import ExamQuestion


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
    assert isinstance(container.vector_store, LocalVectorStoreAdapter)
    assert container["embedding"] is container.embedding
    assert container.calendar is not None
    assert container.email is not None
    assert container.video_session is not None


def test_build_container_rejects_real_mode_without_keys(tmp_path):
    settings = Settings(
        use_fakes=False,
        db_path=str(tmp_path / "di.db"),
        gemini_api_key="",
        tavily_api_key="",
        youtube_api_key="",
    )
    with pytest.raises(ValueError):
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


@pytest.mark.asyncio
async def test_orchestrator_returns_ws_messages(tmp_path):
    settings = Settings(use_fakes=True, db_path=str(tmp_path / "orch.db"))
    container = build_container(settings)
    question = ExamQuestion(
        id="q1",
        topic="Graphs",
        year=2023,
        question_text="What is BFS?",
        reference_answer="Breadth-first search",
    )
    embedding = await container.embedding.embed(question.question_text)
    await container.vector_store.store(question, embedding)

    orchestrator = Orchestrator(
        llm=container.llm,
        search=container.search,
        video_search=container.video_search,
        embedding=container.embedding,
        vector_store=container.vector_store,
        repo=container.repo,
        calendar=container.calendar,
    )
    messages = await orchestrator.handle_transcript("s1", "explain BFS")
    types = [item["type"] for item in messages]
    assert "action_indicator" in types
    assert "agent_response" in types
