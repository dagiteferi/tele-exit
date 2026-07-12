"""Voice study-call turns: route to YouTube / search / curriculum coach."""

from __future__ import annotations

import asyncio
import logging

from app.domain.agents.search_agent import SearchAgent
from app.domain.agents.types import AgentState
from app.domain.practice_coach import coach_reply, grounded_reply
from app.ports.llm_port import LLMPort
from app.ports.video_search_port import VideoSearchPort
from app.ports.web_search_port import WebSearchPort

logger = logging.getLogger(__name__)

_VIDEO_SEARCH_TIMEOUT_S = 5.0
_SEARCH_TIMEOUT_S = 5.0


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


def _wants_web_search(transcript: str) -> bool:
    t = transcript.lower()
    return any(
        w in t
        for w in (
            "search the web",
            "search online",
            "look up",
            "google",
            "on the internet",
            "web search",
            "browse",
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


async def _coach_turn(llm: LLMPort, question: dict, transcript: str) -> dict:
    reply = await coach_reply(llm, question, transcript, mode="voice")
    return {
        "reply": reply,
        "agent_used": "curriculum",
        "action": None,
        "video": None,
    }


async def _fast_youtube_turn(
    *,
    video_search: VideoSearchPort,
    question: dict,
    transcript: str,
) -> dict | None:
    """Find a video quickly without a second LLM round-trip (keeps call snappy)."""
    topic = _topic_from_question(question, transcript)
    try:
        video = await asyncio.wait_for(
            video_search.find_video(topic),
            timeout=_VIDEO_SEARCH_TIMEOUT_S,
        )
    except Exception:
        logger.exception("YouTube find_video failed")
        return None

    if not isinstance(video, dict) or not video.get("url"):
        return None

    title = (video.get("title") or "a helpful clip").strip()
    return {
        "reply": (
            f"Great ask — I found “{title}” for this question. "
            "Watch it on the shared screen, then tell me what stood out."
        ),
        "agent_used": "youtube",
        "action": "finding_video",
        "video": video,
    }


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

    External agent failures never crash the call — we fall back to the exam-bank coach.
    """
    transcript = (message or "").strip()
    state = AgentState(
        student_id=student_id,
        transcript=transcript,
        context={"topic": _topic_from_question(question, transcript)},
    )

    if _wants_video(transcript):
        yt = await _fast_youtube_turn(
            video_search=video_search,
            question=question,
            transcript=transcript,
        )
        if yt:
            return yt
        logger.warning("YouTube path empty; falling back to coach")
        return await _coach_turn(llm, question, transcript)

    if _wants_web_search(transcript):
        try:
            result = await asyncio.wait_for(
                SearchAgent(llm, search).handle(state),
                timeout=_SEARCH_TIMEOUT_S,
            )
            text = (result.text or "").strip()
            # Empty / "no results" → coach so the student isn't stranded.
            if text and "no web results" not in text.lower():
                return {
                    "reply": text,
                    "agent_used": "search",
                    "action": result.action or "searching_web",
                    "video": None,
                }
        except Exception:
            logger.exception("Search agent failed; falling back to coach")
        return await _coach_turn(llm, question, transcript)

    try:
        return await _coach_turn(llm, question, transcript)
    except Exception:
        logger.exception("Coach reply failed")
        return {
            "reply": grounded_reply(question, transcript, voice=True),
            "agent_used": "curriculum",
            "action": None,
            "video": None,
        }
