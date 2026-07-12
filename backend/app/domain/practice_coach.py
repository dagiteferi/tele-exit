"""Fast practice-mode study coach grounded on exam-bank data."""

from __future__ import annotations

from app.ports.llm_port import LLMPort

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
    "Speak like a real tutor: warm, clear, fast. "
    "Use ONLY the provided question, choices, correct answer, and explanation. "
    "Never invent a different correct option. "
    "Reply in 1–2 short spoken sentences (max ~45 words). "
    "No markdown, no bullet lists, no LaTeX. "
    "Prefer a hint or next step unless they ask for the full answer. "
    "If they say they are ready, ask one focused question about the shared screen."
)


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

    if ready:
        return "Great — what’s your first instinct on this question?"
    if wants_hint and explanation:
        first = explanation.split(".")[0].strip()
        return f"Hint: focus on this — {first}."
    if wants_hint:
        return "Hint: eliminate options that contradict the question stem."

    if explanation and answer:
        if voice:
            return f"The bank answer is {answer}. {explanation.split('.')[0].strip()}."
        return f"Correct answer: {answer}\n\n{explanation}"
    if answer:
        return f"The correct answer is {answer}."
    return "I don't have a stored explanation yet — try saying that again."


def build_practice_prompt(question: dict, message: str) -> str:
    answer = (question.get("reference_answer") or "n/a").strip()
    letter = ""
    if answer and answer[0].upper() in "ABCD":
        letter = answer[0].upper()
    return (
        f"Topic: {question.get('topic') or 'General'}\n"
        f"Question: {question.get('question_text') or ''}\n"
        f"Choices:\n{_format_choices(question.get('choices'))}\n"
        f"Correct answer: {answer}\n"
        f"Correct option letter: {letter or 'n/a'}\n"
        f"Bank explanation: {question.get('explanation') or 'n/a'}\n"
        f"Student: {message.strip()}\n"
        "Reply as the coach. Ground every claim on the correct answer above."
    )


async def coach_reply(
    llm: LLMPort,
    question: dict,
    message: str,
    *,
    mode: str | None = None,
) -> str:
    """LLM reply grounded on bank data, with instant fallback."""
    voice = (mode or "").lower() == "voice"
    system = _VOICE_SYSTEM if voice else _SYSTEM
    prompt = build_practice_prompt(question, message)
    if voice:
        prompt += "\nRespond for spoken video call — short and natural."
    try:
        text = (await llm.generate(prompt, system=system)).strip()
        if text:
            return text
    except Exception:
        pass
    return grounded_reply(question, message, voice=voice)
