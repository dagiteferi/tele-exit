"""Public support / product chatbot endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.core.di import AppContainer, get_container
from app.domain.product_chat import answer_product_question, stream_product_answer
from app.ingestion.product_docs_pipeline import ensure_product_knowledge, ingest_product_docs
from app.schemas import SupportChatRequest, SupportChatResponse, SupportChatSource

router = APIRouter(prefix="/support", tags=["support"])


@router.post("/chat", response_model=SupportChatResponse)
async def support_chat(
    body: SupportChatRequest,
    container: AppContainer = Depends(get_container),
) -> SupportChatResponse:
    """General Q&A about Tele-Exit (website + backend spec knowledge, optional web)."""
    store = container.product_knowledge
    await ensure_product_knowledge(store)

    result = await answer_product_question(
        message=body.message,
        llm=container.llm,
        knowledge=store,
        search=container.search,
        use_web=body.use_web if body.use_web is not None else False,
    )
    return SupportChatResponse(
        reply=result["reply"],
        agent_used=result.get("agent_used"),
        sources=[SupportChatSource(**s) for s in result.get("sources") or []],
    )


@router.post("/chat/stream")
async def support_chat_stream(
    body: SupportChatRequest,
    container: AppContainer = Depends(get_container),
) -> StreamingResponse:
    """SSE stream of home-page chatbot tokens (fast, typing-friendly)."""
    store = container.product_knowledge
    await ensure_product_knowledge(store)

    async def event_gen():
        try:
            async for event in stream_product_answer(
                message=body.message,
                llm=container.llm,
                knowledge=store,
                search=container.search,
                use_web=body.use_web if body.use_web is not None else False,
            ):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'sources': [], 'agent_used': 'product'})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/reindex")
async def support_reindex(
    container: AppContainer = Depends(get_container),
) -> dict:
    """Rebuild product knowledge from website.md + backend spec (dev/admin convenience)."""
    try:
        count = ingest_product_docs(container.product_knowledge, replace=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Reindex failed: {exc}") from exc
    return {"status": "ok", "chunks": count}
