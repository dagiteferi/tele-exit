from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Request

from app.adapters.fakes.fake_llm import FakeLLM
from app.adapters.fakes.fake_search import FakeSearch
from app.adapters.fakes.fake_vector_search import (
    FakeEmbedding,
    FakeVectorSearch,
)
from app.adapters.fakes.fake_video_search import FakeVideoSearch
from app.adapters.real.sqlite_repository_adapter import SQLiteRepositoryAdapter
from app.auth.security import hash_password
from app.config import (
    Settings,
    get_settings,
)
from app.ports.embedding_port import EmbeddingPort
from app.ports.llm_port import LLMPort
from app.ports.repository_port import RepositoryPort
from app.ports.vector_store_port import VectorStorePort
from app.ports.video_search_port import VideoSearchPort
from app.ports.web_search_port import WebSearchPort


@dataclass
class AppContainer:
    llm: LLMPort
    search: WebSearchPort
    video_search: VideoSearchPort
    embedding: EmbeddingPort
    vector_store: VectorStorePort
    repo: RepositoryPort
    settings: Settings

    def __getitem__(self, key: str) -> Any:
        try:
            return getattr(self, key)
        except AttributeError as exc:
            raise KeyError(key) from exc


_container: AppContainer | None = None


def build_container(settings: Settings | None = None) -> AppContainer:
    settings = settings or get_settings()

    if settings.use_fakes:
        llm: LLMPort = FakeLLM()
        search: WebSearchPort = FakeSearch()
        video_search: VideoSearchPort = FakeVideoSearch()
        embedding: EmbeddingPort = FakeEmbedding()
        vector_store: VectorStorePort = FakeVectorSearch()
    else:
        llm, search, video_search, embedding, vector_store = _build_real_adapters(
            settings
        )

    repo = SQLiteRepositoryAdapter(db_path=settings.db_path)
    return AppContainer(
        llm=llm,
        search=search,
        video_search=video_search,
        embedding=embedding,
        vector_store=vector_store,
        repo=repo,
        settings=settings,
    )


def _build_real_adapters(settings: Settings) -> tuple[
    LLMPort,
    WebSearchPort,
    VideoSearchPort,
    EmbeddingPort,
    VectorStorePort,
]:
    missing = []
    if not settings.gemini_api_key:
        missing.append("GEMINI_API_KEY")
    if not settings.tavily_api_key:
        missing.append("TAVILY_API_KEY")
    if not settings.youtube_api_key:
        missing.append("YOUTUBE_API_KEY")
    if missing:
        raise RuntimeError(
            "USE_FAKES=false but required API keys are missing: "
            + ", ".join(missing)
            + ". Real adapters are not fully wired yet; keep USE_FAKES=true "
            "until Gemini/Tavily/YouTube adapters are implemented."
        )
    raise RuntimeError(
        "Real adapters (Gemini/Tavily/YouTube/vector store) are not implemented yet. "
        "Set USE_FAKES=true for local development."
    )


async def bootstrap_admin(container: AppContainer) -> str | None:
    """Create a single admin account from env if one does not already exist."""
    email = container.settings.admin_bootstrap_email.strip()
    password = container.settings.admin_bootstrap_password
    if not email or not password:
        return None

    existing = await container.repo.get_user_by_email(email)
    if existing is not None:
        return existing["id"]

    return await container.repo.create_user(
        email=email,
        password_hash=hash_password(password),
        name="Admin",
        field_of_study=None,
        exam_date=None,
        report_frequency="weekly",
        role="admin",
    )


def get_container(request: Request) -> AppContainer:
    container = getattr(request.app.state, "container", None)
    if container is None:
        container = build_container()
        request.app.state.container = container
    return container


def set_container(container: AppContainer) -> None:
    global _container
    _container = container


def reset_container() -> None:
    global _container
    _container = None
