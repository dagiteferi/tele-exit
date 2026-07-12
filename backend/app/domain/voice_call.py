"""Voice study-call turns: route to YouTube / search / curriculum coach."""

from __future__ import annotations

from app.domain.agents.search_agent import SearchAgent
from app.domain.agents.supervisor import Supervisor
from app.domain.agents.types import AgentState
from app.domain.agents.youtube_agent import YouTubeAgent
from app.domain.models import Intent
from app.domain.practice_coach import coach_reply
from app.ports.llm_port import LLMPort
from app.ports.video_search_port import VideoSearchPort
from app.ports.web_search_port import WebSearchPort


def _wants_video(transcript: str) -> bool:
    t = transcript.lower()
    return any(
        w in t
        for w in (
            "youtube",
            "video",
            "videos",
            "watch",
            "clip",
            "tutorial",
            "show me a video",
            "find a video",
        )
    )


def _topic_from_question(question: dict, transcript: str) -> str:
    topic = (question.get("topic") or "").strip()
    stem = (question.get("question_text") or "").strip()
    if topic and stem:
        return f"{topic}: {stem[:160]}"
    if topic:
        return topic
    if stem:
        return stem[:160]
    return transcript.strip()


async def voice_call_turn(
    *,
    llm: LLMPort,
    search: WebSearchPort,
    video_search: VideoSearchPort,
    student_id: str,
    question: dict,
    message: str,
) -> dict:
    """
    Returns { reply, agent_used, action, video? } for a spoken study-call turn.
    """
    transcript = (message or "").strip()
    state = AgentState(
        student_id=student_id,
        transcript=transcript,
        context={"topic": _topic_from_question(question, transcript)},
    )

    # Keyword shortcut — don't wait on a flaky classifier for obvious video asks.
    if _wants_video(transcript):
        intent = Intent.YOUTUBE
    else:
        try:
            intent = await Supervisor(llm).route(state)
        except Exception:
            intent = Intent.CURRICULUM

    if intent is Intent.YOUTUBE:
        result = await YouTubeAgent(llm, video_search).handle(state)
        video = result.metadata.get("video") if isinstance(result.metadata, dict) else None
        return {
            "reply": result.text
            or "I found a video for this topic — watch the clip on the shared screen.",
            "agent_used": "youtube",
            "action": "finding_video",
            "video": video if isinstance(video, dict) else None,
        }

    if intent is Intent.SEARCH:
        result = await SearchAgent(llm, search).handle(state)
        return {
            "reply": result.text or "Here’s what I found.",
            "agent_used": "search",
            "action": result.action or "searching_web",
            "video": None,
        }

    reply = await coach_reply(llm, question, transcript, mode="voice")
    return {
        "reply": reply,
        "agent_used": "curriculum",
        "action": None,
        "video": None,
    }
