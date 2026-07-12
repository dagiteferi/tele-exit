from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.di import (
    bootstrap_admin,
    build_container,
    reset_container,
)
from app.routes import (
    admin_router,
    auth_router,
    exam_router,
    question_router,
    report_router,
    student_router,
    support_router,
    ws_router,
)
from app.schemas import HealthResponse


class RuntimeHealthResponse(HealthResponse):
    use_fakes: bool = False
    smtp_configured: bool = False
    gemini_configured: bool = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.config import clear_settings_cache
    from app.ingestion.product_docs_pipeline import ensure_product_knowledge
    import logging

    clear_settings_cache()
    settings = get_settings()
    container = build_container(settings)
    app.state.container = container
    app.state.admin_id = await bootstrap_admin(container)
    app.state.product_chunks = await ensure_product_knowledge(container.product_knowledge)
    logging.getLogger("uvicorn.error").info(
        "Tele-Exit ready — use_fakes=%s smtp=%s gemini=%s",
        settings.use_fakes,
        bool(settings.smtp_user and settings.smtp_password),
        bool(settings.gemini_api_key),
    )
    yield
    reset_container()
    app.state.container = None


def create_app() -> FastAPI:
    from app.config import clear_settings_cache

    clear_settings_cache()
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
        max_age=600,
    )
    app.include_router(auth_router)
    app.include_router(admin_router)
    app.include_router(exam_router)
    app.include_router(question_router)
    app.include_router(student_router)
    app.include_router(report_router)
    app.include_router(support_router)
    app.include_router(ws_router)

    @app.get("/health", response_model=RuntimeHealthResponse)
    async def health():
        s = get_settings()
        return RuntimeHealthResponse(
            use_fakes=s.use_fakes,
            smtp_configured=bool(s.smtp_user.strip() and s.smtp_password.strip()),
            gemini_configured=bool(s.gemini_api_key.strip()),
        )

    return app


app = create_app()
