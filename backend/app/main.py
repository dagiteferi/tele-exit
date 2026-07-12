from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.core.di import (
    bootstrap_admin,
    build_container,
    reset_container,
)
from app.routes import (
    auth_router,
    question_router,
    report_router,
    student_router,
    ws_router,
)
from app.schemas import HealthResponse


class RuntimeHealthResponse(HealthResponse):
    use_fakes: bool = True


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.config import clear_settings_cache

    clear_settings_cache()
    settings = get_settings()
    container = build_container(settings)
    app.state.container = container
    app.state.admin_id = await bootstrap_admin(container)
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
    app.include_router(auth_router)
    app.include_router(question_router)
    app.include_router(student_router)
    app.include_router(report_router)
    app.include_router(ws_router)

    @app.get("/health", response_model=RuntimeHealthResponse)
    async def health():
        return RuntimeHealthResponse(use_fakes=get_settings().use_fakes)

    return app


app = create_app()
