"""Fast practice-mode study coach grounded on exam-bank data."""

from __future__ import annotations

import asyncio
import logging

from app.ports.llm_port import LLMPort

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are Tele-Exit, a sharp exit-exam study coach. "
    "Use ONLY the provided question, choices, correct answer, and explanation. "
    "Never invent a different correct option. If Correct answer says D, talk about D — "
    "never default to C. "
    "Be concise (max ~120 words). Prefer hints first unless the student asks to "
    "reveal or explain the answer. Correct misconceptions briefly. No fluff. "
    "Format with Markdown (bold, short numbered lists). For math use $...$ inline LaTeX."
)

_VOICE_SYSTEM = (
    "You are Tele-Exit on a live video study call. "
    "Speak like a real tutor: warm, clear, fast, and encouraging. "
    "Always appreciate the student's effort first when they try an answer or idea "
    "(even if they are wrong) — e.g. 'Nice try', 'Good thinking', 'I like that approach' — "
    "then gently correct or guide. "
    "Use ONLY the provided question, choices, correct answer, and explanation. "
    "Never invent a different correct option. "
    "When learner memory is provided, briefly use weak topics / readiness to personalize "
    "(one short nod max) — do not dump the whole profile. "
    "Reply in 1–2 short spoken sentences (max ~40 words). "
    "No markdown, no bullet lists, no LaTeX. "
    "Prefer a hint or next step unless they ask for the full answer. "
    "If they are correct, say so clearly (e.g. 'That's correct!') and invite the next question. "
    "If they ask to move on / next question, briefly agree — the app will change the slide. "
    "If they say they are ready, ask one focused question about the shared screen."
)

_VOICE_LLM_TIMEOUT_S = 6.0


def _format_choices(choices: list[str] | None) -> str:
    if not choices:
        return "(open response)"
    return "\n".join(f"- {c}" for c in choices)


def grounded_reply(question: dict, message: str, *, voice: bool = False) -> str:
    """Instant bank-grounded reply when the LLM is unavailable."""
    answer = (question.get("reference_answer") or "").strip()
    explanation = (question.get("explanation") or "").strip()
    msg = message.lower()

    wants_hint = any(w in msg for w in ("hint", "clue", "help", "stuck", "start"))
    ready = any(w in msg for w in ("ready", "yes", "okay", "ok", "sure", "let's", "lets"))
    trying = any(
        w in msg
        for w in ("i think", "maybe", "i believe", "my answer", "option", "because")
    )

    if ready:
        return "Love the energy — you're ready. What’s your first instinct on this question?"
    if wants_hint and explanation:
        first = explanation.split(".")[0].strip()
        return f"Good ask — here’s a hint: focus on this — {first}."
    if wants_hint:
        return "Nice — you’re thinking. Hint: eliminate options that contradict the question stem."
    if trying and explanation:
        first = explanation.split(".")[0].strip()
        return f"Nice try — I like that you're reasoning out loud. Think about this: {first}."
    if trying:
        return "Nice try — keep that going. What part of the shared question feels most important?"

    if explanation and answer:
        if voice:
            return (
                f"I appreciate you working through it. "
                f"The bank answer is {answer}. {explanation.split('.')[0].strip()}."
            )
        return f"Correct answer: {answer}\n\n{explanation}"
    if answer:
        return (
            f"Solid effort. The correct answer is {answer}."
            if voice
            else f"The correct answer is {answer}."
        )
    return "Nice try — keep going. Look at the shared question and tell me your next thought."


def build_practice_prompt(
    question: dict,
    message: str,
    *,
    profile: dict | None = None,
) -> str:
    from app.domain.prompts import learner_context_block

    answer = (question.get("reference_answer") or "n/a").strip()
    letter = ""
    if answer and answer[0].upper() in "ABCD":
        letter = answer[0].upper()
    memory = learner_context_block(profile)
    memory_line = f"{memory}\n" if memory else ""
    return (
        f"Topic: {question.get('topic') or 'General'}\n"
        f"Question: {question.get('question_text') or ''}\n"
        f"Choices:\n{_format_choices(question.get('choices'))}\n"
        f"Correct answer: {answer}\n"
        f"Correct option letter: {letter or 'n/a'}\n"
        f"Bank explanation: {question.get('explanation') or 'n/a'}\n"
        f"{memory_line}"
        f"Student: {message.strip()}\n"
        "Reply as the coach. Ground every claim on the correct answer above."
    )


async def coach_reply(
    llm: LLMPort,
    question: dict,
    message: str,
    *,
    mode: str | None = None,
    profile: dict | None = None,
) -> str:
    """LLM reply grounded on bank data, with instant fallback."""
    voice = (mode or "").lower() == "voice"
    system = _VOICE_SYSTEM if voice else _SYSTEM
    prompt = build_practice_prompt(question, message, profile=profile)
    if voice:
        prompt += "\nRespond for spoken video call — short and natural."

    try:
        if voice:
            text = (
                await asyncio.wait_for(
                    llm.generate(prompt, system=system),
                    timeout=_VOICE_LLM_TIMEOUT_S,
                )
            ).strip()
        else:
            text = (await llm.generate(prompt, system=system)).strip()
        if text:
            return text
    except asyncio.TimeoutError:
        logger.warning("Coach LLM timed out (voice=%s); using bank fallback", voice)
    except Exception:
        logger.exception("Coach LLM failed; using bank fallback")

    return grounded_reply(question, message, voice=voice)
