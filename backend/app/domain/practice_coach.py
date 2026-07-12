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


def _format_choices(choices: list[str] | None) -> str:
    if not choices:
        return "(open response)"
    return "\n".join(f"- {c}" for c in choices)


def grounded_reply(question: dict, message: str) -> str:
    """Instant bank-grounded reply when the LLM is unavailable."""
    answer = (question.get("reference_answer") or "").strip()
    explanation = (question.get("explanation") or "").strip()
    msg = message.lower()

    wants_hint = any(w in msg for w in ("hint", "clue", "help", "stuck", "start"))
    if wants_hint and explanation:
        first = explanation.split(".")[0].strip()
        return f"Hint: focus on this idea — {first}."
    if wants_hint:
        return "Hint: eliminate options that contradict the definition in the question stem."

    if explanation and answer:
        return f"Correct answer: {answer}\n\n{explanation}"
    if answer:
        return f"Correct answer from the exam bank: {answer}"
    return "I don't have a stored explanation for this item yet — try again in a moment."


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


async def coach_reply(llm: LLMPort, question: dict, message: str) -> str:
    """LLM reply grounded on bank data, with instant fallback."""
    prompt = build_practice_prompt(question, message)
    try:
        text = (await llm.generate(prompt, system=_SYSTEM)).strip()
        if text:
            return text
    except Exception:
        pass
    return grounded_reply(question, message)
