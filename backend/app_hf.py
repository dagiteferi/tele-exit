"""Hugging Face Space entry — Gradio SDK + ZeroGPU.

ZeroGPU requires a real Gradio `demo` with `@spaces.GPU` on a click/submit
handler. Tele-Exit FastAPI is reached via ASGI middleware so Gradio's SPA
catch-all cannot steal `/health`, `/docs`, `/auth`, etc.
"""

from __future__ import annotations

import spaces
import gradio as gr
from gradio.routes import App
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.main import app as api_app

_API_EXACT = {
    "/health",
    "/docs",
    "/docs/",
    "/redoc",
    "/redoc/",
    "/openapi.json",
}
_API_PREFIXES = (
    "/auth",
    "/admin",
    "/exams",
    "/students",
    "/reports",
    "/support",
    "/ws",
    "/questions",
)


def _is_api_path(path: str) -> bool:
    if path in _API_EXACT:
        return True
    return any(path == p or path.startswith(p + "/") for p in _API_PREFIXES)


async def _asgi_to_response(app, request: Request) -> Response:
    status_code = 500
    response_headers: list[tuple[bytes, bytes]] = []
    body = bytearray()

    async def send(message) -> None:  # noqa: ANN001
        nonlocal status_code, response_headers
        if message["type"] == "http.response.start":
            status_code = message["status"]
            response_headers = list(message.get("headers") or [])
        elif message["type"] == "http.response.body":
            body.extend(message.get("body") or b"")

    await app(request.scope, request.receive, send)
    headers = {
        k.decode("latin-1"): v.decode("latin-1")
        for k, v in response_headers
        if k.lower() not in {b"content-length", b"transfer-encoding"}
    }
    return Response(content=bytes(body), status_code=status_code, headers=headers)


class PreferTeleExitApiMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if _is_api_path(request.url.path):
            return await _asgi_to_response(api_app, request)
        return await call_next(request)


@spaces.GPU(duration=30)
def gpu_warmup(text: str) -> str:
    """Bound to Gradio so ZeroGPU startup detection succeeds."""
    return f"ok:{text}"


with gr.Blocks(title="Tele-Exit Backend") as demo:
    gr.Markdown(
        """
        # Tele-Exit Backend
        FastAPI study-coach API for exit-exam preparation.

        - [/health](/health) — liveness  
        - [/docs](/docs) — OpenAPI  
        - [/redoc](/redoc) — ReDoc  
        """
    )
    warmup_in = gr.Textbox(value="ping", label="ZeroGPU warmup")
    warmup_out = gr.Textbox(label="Result")
    warmup_btn = gr.Button("Warmup")
    warmup_btn.click(fn=gpu_warmup, inputs=warmup_in, outputs=warmup_out)
    warmup_in.submit(fn=gpu_warmup, inputs=warmup_in, outputs=warmup_out)


_original_create_app = App.create_app


def _create_app_with_api(*args, **kwargs):
    from contextlib import asynccontextmanager

    from fastapi.middleware.cors import CORSMiddleware

    from app.config import get_settings

    gr_app = _original_create_app(*args, **kwargs)

    gr_lifespan = gr_app.router.lifespan_context
    api_lifespan = api_app.router.lifespan_context

    @asynccontextmanager
    async def combined_lifespan(app):
        async with api_lifespan(api_app):
            app.state.container = getattr(api_app.state, "container", None)
            app.state.admin_id = getattr(api_app.state, "admin_id", None)
            app.state.product_chunks = getattr(api_app.state, "product_chunks", None)
            async with gr_lifespan(app):
                yield

    gr_app.router.lifespan_context = combined_lifespan

    settings = get_settings()
    # Outermost: send API traffic to Tele-Exit FastAPI first.
    gr_app.add_middleware(PreferTeleExitApiMiddleware)
    gr_app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
        max_age=600,
    )
    return gr_app


App.create_app = staticmethod(_create_app_with_api)  # type: ignore[method-assign, assignment]

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
