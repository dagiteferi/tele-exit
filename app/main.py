from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.core.di import (
    bootstrap_admin,
    build_container,
    reset_container,
)
from app.routes.question_routes import router as question_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    container = build_container(settings)
    app.state.container = container
    app.state.admin_id = await bootstrap_admin(container)
    yield
    reset_container()
    app.state.container = None


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )
    app.include_router(question_router)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
