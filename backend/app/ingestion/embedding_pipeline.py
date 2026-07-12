from __future__ import annotations

import asyncio
import uuid
from dataclasses import (
    dataclass,
    field,
)
from typing import Any

from app.domain.models import ExamQuestion
from app.ports.embedding_port import EmbeddingPort
from app.ports.vector_store_port import VectorStorePort


@dataclass
class IngestResult:
    ingested: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)


def _pick(raw: dict, *keys: str) -> Any:
    for key in keys:
        if key in raw and raw[key] is not None and str(raw[key]).strip() != "":
            return raw[key]
    return None


def _normalize_choices(raw: Any) -> list[str] | None:
    if raw is None or raw == "":
        return None
    # MCQ map: { "A": "...", "B": "..." } → ["A. ...", "B. ..."]
    if isinstance(raw, dict):
        items: list[str] = []
        for key in sorted(raw.keys(), key=lambda k: str(k)):
            label = str(key).strip()
            text = str(raw[key]).strip()
            if not text:
                continue
            items.append(f"{label}. {text}" if label else text)
        return items or None
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    if isinstance(raw, str):
        text = raw.strip()
        if text.startswith("["):
            import json

            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
                if isinstance(parsed, dict):
                    return _normalize_choices(parsed)
            except json.JSONDecodeError:
                pass
        parts = [p.strip() for p in text.replace(";", "|").split("|") if p.strip()]
        return parts or None
    return None


def _resolve_answer(raw: dict, choices: list[str] | None) -> Any:
    answer = _pick(raw, "reference_answer", "answer", "correct_answer", "solution")
    if answer is None:
        return None
    answer_str = str(answer).strip()
    options = raw.get("options")
    # Expand letter key (e.g. "C") using options map when present
    if isinstance(options, dict) and answer_str in options:
        return f"{answer_str}. {options[answer_str]}".strip()
    if choices and len(answer_str) <= 2:
        letter = answer_str.rstrip(").").upper()
        for choice in choices:
            if choice.upper().startswith(f"{letter}.") or choice.upper().startswith(f"{letter})"):
                return choice
    return answer_str


def _validate_raw_question(
    raw: dict,
    index: int,
    *,
    default_year: int | None = None,
    field_of_study: str | None = None,
) -> dict:
    topic = _pick(raw, "topic", "subject", "chapter", "course_name")
    question_text = _pick(raw, "question_text", "question", "prompt", "text")
    year_raw = _pick(raw, "year")
    if year_raw is None:
        year_raw = default_year

    choices = _normalize_choices(_pick(raw, "choices", "options"))
    reference_answer = _resolve_answer(raw, choices)

    missing = []
    if not topic:
        missing.append("topic|course_name")
    if not question_text:
        missing.append("question_text|question")
    if not reference_answer:
        missing.append("correct_answer|answer")
    if year_raw is None:
        missing.append("year")
    if missing:
        raise ValueError(f"row {index}: missing required fields: {', '.join(missing)}")

    try:
        # Accept Ethiopian years / numeric strings like "2015"
        year = int(str(year_raw).strip().split(".")[0])
    except (TypeError, ValueError) as exc:
        raise ValueError(f"row {index}: year must be an integer") from exc

    return {
        "topic": str(topic).strip(),
        "year": year,
        "question_text": str(question_text).strip(),
        "reference_answer": str(reference_answer).strip(),
        "choices": choices,
        "field_of_study": field_of_study or _pick(raw, "field_of_study", "department", "field"),
    }


async def ingest_questions(
    raw_questions: list[dict],
    embedding_port: EmbeddingPort,
    vector_store_adapter: VectorStorePort,
    *,
    exam_id: str | None = None,
    field_of_study: str | None = None,
    default_year: int | None = None,
    embed_mode: str = "fast",
    concurrency: int = 16,
) -> IngestResult:
    """
    Embed and store exam questions.

    embed_mode:
      - "fast": local hash embedding (instant — preferred for bulk exam upload)
      - "api": call embedding_port (slower; Gemini etc.)
    """
    from app.ingestion.fast_embed import fast_embed

    result = IngestResult()
    prepared: list[ExamQuestion] = []

    for index, raw in enumerate(raw_questions, start=1):
        try:
            validated = _validate_raw_question(
                raw,
                index,
                default_year=default_year,
                field_of_study=field_of_study,
            )
            prepared.append(
                ExamQuestion(
                    id=str(uuid.uuid4()),
                    topic=validated["topic"],
                    year=validated["year"],
                    question_text=validated["question_text"],
                    reference_answer=validated["reference_answer"],
                    exam_id=exam_id,
                    field_of_study=validated.get("field_of_study") or field_of_study,
                    choices=validated.get("choices"),
                )
            )
        except Exception as exc:
            result.skipped += 1
            result.errors.append(str(exc))

    if not prepared:
        return result

    sem = asyncio.Semaphore(max(1, concurrency))

    async def _store_one(question: ExamQuestion) -> None:
        async with sem:
            if embed_mode == "api":
                embedding = await embedding_port.embed(question.question_text)
            else:
                # Offload CPU hash embed to a thread so the event loop stays responsive
                embedding = await asyncio.to_thread(fast_embed, question.question_text)
            await vector_store_adapter.store(question, embedding)

    outcomes = await asyncio.gather(
        *[_store_one(q) for q in prepared],
        return_exceptions=True,
    )
    for question, outcome in zip(prepared, outcomes):
        if isinstance(outcome, Exception):
            result.skipped += 1
            result.errors.append(f"{question.topic}: {outcome}")
        else:
            result.ingested += 1

    return result
