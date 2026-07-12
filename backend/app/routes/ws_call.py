import json

from fastapi import (
    APIRouter,
    WebSocket,
    WebSocketDisconnect,
    status,
)

from app.auth.security import decode_access_token
from app.core.di import get_container
from app.core.orchestrator import Orchestrator

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/call")
async def ws_call(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        student_id = decode_access_token(token)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    container = get_container(websocket)
    orchestrator = Orchestrator(
        llm=container.llm,
        search=container.search,
        video_search=container.video_search,
        embedding=container.embedding,
        vector_store=container.vector_store,
        repo=container.repo,
        calendar=container.calendar,
    )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json(
                    {"type": "error", "message": "Invalid JSON payload"}
                )
                continue

            if message.get("type") != "user_transcript":
                await websocket.send_json(
                    {"type": "error", "message": "Unsupported message type"}
                )
                continue

            text = str(message.get("text", "")).strip()
            if not text:
                await websocket.send_json(
                    {"type": "error", "message": "Transcript text is required"}
                )
                continue

            try:
                outbound = await orchestrator.handle_transcript(student_id, text)
                for item in outbound:
                    await websocket.send_json(item)
            except Exception as exc:
                await websocket.send_json(
                    {"type": "error", "message": str(exc)}
                )
    except WebSocketDisconnect:
        return
