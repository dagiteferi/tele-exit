"""Voice study-call turns: route memory / planner / YouTube / search / curriculum coach."""

from __future__ import annotations

import asyncio
import logging

from app.domain.agents.memory_agent import MemoryAgent
from app.domain.agents.planner_agent import PlannerAgent
from app.domain.agents.search_agent import SearchAgent
from app.domain.agents.types import AgentState
from app.domain.practice_coach import coach_reply, grounded_reply
from app.ports.calendar_port import CalendarPort
from app.ports.llm_port import LLMPort
from app.ports.repository_port import RepositoryPort
from app.ports.video_search_port import VideoSearchPort
from app.ports.web_search_port import WebSearchPort

logger = logging.getLogger(__name__)

_VIDEO_SEARCH_TIMEOUT_S = 5.0
_SEARCH_TIMEOUT_S = 5.0
_PLANNER_TIMEOUT_S = 8.0
_MEMORY_TIMEOUT_S = 3.0


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


def _wants_progress(transcript: str) -> bool:
    t = transcript.lower()
    return any(
        phrase in t
        for phrase in (
            "how am i doing",
            "how's my progress",
            "how is my progress",
            "my progress",
            "weak topics",
            "my weak",
            "readiness",
            "my status",
            "how ready am i",
            "am i ready",
        )
    )


def _wants_schedule(transcript: str) -> bool:
    t = transcript.lower()
    return any(
        phrase in t
        for phrase in (
            "schedule",
            "calendar",
            "plan my",
            "plan a study",
            "remind me",
            "book a session",
            "next session",
            "study session for",
            "add this to my calendar",
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


def _profile_dict(result_metadata: dict | None) -> dict | None:
    if not isinstance(result_metadata, dict):
        return None
    profile = result_metadata.get("profile")
    return profile if isinstance(profile, dict) else None


async def _coach_turn(
    llm: LLMPort,
    question: dict,
    transcript: str,
    *,
    profile: dict | None = None,
) -> dict:
    reply = await coach_reply(
        llm,
        question,
        transcript,
        mode="voice",
        profile=profile,
    )
    return {
        "reply": reply,
        "agent_used": "curriculum",
        "action": None,
        "video": None,
        "scheduled": None,
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
        "scheduled": None,
    }


async def voice_call_turn(
    *,
    llm: LLMPort,
    search: WebSearchPort,
    video_search: VideoSearchPort,
    student_id: str,
    question: dict,
    message: str,
    repo: RepositoryPort | None = None,
    calendar: CalendarPort | None = None,
) -> dict:
    """
    Returns { reply, agent_used, action, video?, scheduled? } for a spoken study-call turn.

    External agent failures never crash the call — we fall back to the exam-bank coach.
    """
    transcript = (message or "").strip()
    topic = _topic_from_question(question, transcript)
    state = AgentState(
        student_id=student_id,
        transcript=transcript,
        context={"topic": topic, "fallback_topic": topic},
    )

    profile: dict | None = None
    if repo is not None:
        try:
            memory_result = await asyncio.wait_for(
                MemoryAgent(repo).handle(state),
                timeout=_MEMORY_TIMEOUT_S,
            )
            profile = _profile_dict(memory_result.metadata)
            state.profile = profile
            if _wants_progress(transcript):
                return {
                    "reply": memory_result.text,
                    "agent_used": "memory",
                    "action": "checking_progress",
                    "video": None,
                    "scheduled": None,
                }
        except Exception:
            logger.exception("Memory agent failed; continuing without profile")

    if _wants_schedule(transcript) and repo is not None and calendar is not None:
        try:
            result = await asyncio.wait_for(
                PlannerAgent(repo, calendar).handle(state),
                timeout=_PLANNER_TIMEOUT_S,
            )
            scheduled = result.metadata.get("scheduled")
            return {
                "reply": result.text,
                "agent_used": "planner",
                "action": result.action or "scheduling",
                "video": None,
                "scheduled": scheduled if isinstance(scheduled, list) else [],
            }
        except Exception:
            logger.exception("Planner agent failed; falling back to coach")

    if _wants_video(transcript):
        yt = await _fast_youtube_turn(
            video_search=video_search,
            question=question,
            transcript=transcript,
        )
        if yt:
            return yt
        logger.warning("YouTube path empty; falling back to coach")
        return await _coach_turn(llm, question, transcript, profile=profile)

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
                    "scheduled": None,
                }
        except Exception:
            logger.exception("Search agent failed; falling back to coach")
        return await _coach_turn(llm, question, transcript, profile=profile)

    try:
        return await _coach_turn(llm, question, transcript, profile=profile)
    except Exception:
        logger.exception("Coach reply failed")
        return {
            "reply": grounded_reply(question, transcript, voice=True),
            "agent_used": "curriculum",
            "action": None,
            "video": None,
            "scheduled": None,
        }
