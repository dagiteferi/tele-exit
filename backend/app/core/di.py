from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Request

from app.adapters.fakes.fake_calendar import FakeCalendar
from app.adapters.fakes.fake_email import FakeEmail
from app.adapters.fakes.fake_llm import FakeLLM
from app.adapters.fakes.fake_search import FakeSearch
from app.adapters.fakes.fake_vector_search import FakeEmbedding
from app.adapters.fakes.fake_video_search import FakeVideoSearch
from app.adapters.fakes.fake_video_session import FakeVideoSession
from app.adapters.real.gemini_embedding_adapter import GeminiEmbeddingAdapter
from app.adapters.real.gemini_llm_adapter import GeminiLLMAdapter
from app.adapters.real.gmail_email_adapter import GmailEmailAdapter
from app.adapters.real.google_calendar_adapter import GoogleCalendarAdapter
from app.adapters.real.livekit_adapter import LiveKitAdapter
from app.adapters.real.smtp_email_adapter import SmtpEmailAdapter
from app.adapters.real.sqlite_repository_adapter import SQLiteRepositoryAdapter
from app.adapters.real.tavily_search_adapter import TavilySearchAdapter
from app.adapters.real.vector_store_adapter import LocalVectorStoreAdapter
from app.adapters.real.product_knowledge_adapter import ProductKnowledgeStore
from app.adapters.real.youtube_adapter import YouTubeAdapter
from app.auth.security import hash_password
from app.config import (
    Settings,
    get_settings,
)
from app.ports.calendar_port import CalendarPort
from app.ports.email_port import EmailPort
from app.ports.embedding_port import EmbeddingPort
from app.ports.llm_port import LLMPort
from app.ports.repository_port import RepositoryPort
from app.ports.vector_store_port import VectorStorePort
from app.ports.video_search_port import VideoSearchPort
from app.ports.video_session_port import VideoSessionPort
from app.ports.web_search_port import WebSearchPort


@dataclass
class AppContainer:
    llm: LLMPort
    search: WebSearchPort
    video_search: VideoSearchPort
    embedding: EmbeddingPort
    vector_store: VectorStorePort
    product_knowledge: ProductKnowledgeStore
    repo: RepositoryPort
    calendar: CalendarPort
    email: EmailPort
    video_session: VideoSessionPort
    settings: Settings

    def __getitem__(self, key: str) -> Any:
        try:
            return getattr(self, key)
        except AttributeError as exc:
            raise KeyError(key) from exc


_container: AppContainer | None = None


def _build_email(settings: Settings) -> EmailPort:
    """Prefer SMTP (best for demos), then Workspace Gmail, else stub Gmail adapter."""
    if settings.smtp_user.strip() and settings.smtp_password.strip():
        return SmtpEmailAdapter(
            host=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user.strip(),
            password=settings.smtp_password,
            from_email=(settings.smtp_from or settings.smtp_user).strip(),
            use_tls=settings.smtp_use_tls,
        )
    return GmailEmailAdapter(
        credentials_path=settings.google_credentials_path,
        delegated_user=settings.google_delegated_user,
    )


def build_container(settings: Settings | None = None) -> AppContainer:
    settings = settings or get_settings()

    if settings.use_fakes:
        llm: LLMPort = FakeLLM()
        search: WebSearchPort = FakeSearch()
        video_search: VideoSearchPort = FakeVideoSearch()
        embedding: EmbeddingPort = FakeEmbedding()
        # Still allow real SMTP in "fakes" mode when configured — useful for demos.
        if settings.smtp_user.strip() and settings.smtp_password.strip():
            calendar: CalendarPort = GoogleCalendarAdapter(
                credentials_path=settings.google_credentials_path,
                calendar_id=settings.google_calendar_id,
                delegated_user=settings.google_delegated_user,
            )
            email: EmailPort = _build_email(settings)
        else:
            calendar = FakeCalendar()
            email = FakeEmail()
        video_session: VideoSessionPort = FakeVideoSession()
    else:
        llm = GeminiLLMAdapter(api_key=settings.gemini_api_key)
        search = TavilySearchAdapter(api_key=settings.tavily_api_key)
        video_search = YouTubeAdapter(api_key=settings.youtube_api_key)
        embedding = GeminiEmbeddingAdapter(api_key=settings.gemini_api_key)
        calendar = GoogleCalendarAdapter(
            credentials_path=settings.google_credentials_path,
            calendar_id=settings.google_calendar_id,
            delegated_user=settings.google_delegated_user,
        )
        email = _build_email(settings)
        video_session = LiveKitAdapter(
            url=settings.livekit_url,
            api_key=settings.livekit_api_key,
            api_secret=settings.livekit_api_secret,
        )

    repo = SQLiteRepositoryAdapter(db_path=settings.db_path)
    vector_store = LocalVectorStoreAdapter(db_path=settings.db_path)
    product_knowledge = ProductKnowledgeStore(db_path=settings.db_path)

    return AppContainer(
        llm=llm,
        search=search,
        video_search=video_search,
        embedding=embedding,
        vector_store=vector_store,
        product_knowledge=product_knowledge,
        repo=repo,
        calendar=calendar,
        email=email,
        video_session=video_session,
        settings=settings,
    )


async def bootstrap_admin(container: AppContainer) -> str | None:
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
