from __future__ import annotations

import uuid
from dataclasses import (
    dataclass,
    field,
)

from app.domain.models import ExamQuestion
from app.ports.embedding_port import EmbeddingPort
from app.ports.vector_store_port import VectorStorePort

REQUIRED_FIELDS = (
    "topic",
    "year",
    "question_text",
    "reference_answer",
)


@dataclass
class IngestResult:
    ingested: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)


def _validate_raw_question(raw: dict, index: int) -> dict:
    missing = [name for name in REQUIRED_FIELDS if not str(raw.get(name, "")).strip()]
    if missing:
        raise ValueError(
            f"row {index}: missing required fields: {', '.join(missing)}"
        )

    try:
        year = int(raw["year"])
    except (TypeError, ValueError) as exc:
        raise ValueError(f"row {index}: year must be an integer") from exc

    return {
        "topic": str(raw["topic"]).strip(),
        "year": year,
        "question_text": str(raw["question_text"]).strip(),
        "reference_answer": str(raw["reference_answer"]).strip(),
    }


async def ingest_questions(
    raw_questions: list[dict],
    embedding_port: EmbeddingPort,
    vector_store_adapter: VectorStorePort,
) -> IngestResult:
    """Embed and store real exam questions. Skips invalid rows with error details."""
    result = IngestResult()

    for index, raw in enumerate(raw_questions, start=1):
        try:
            validated = _validate_raw_question(raw, index)
            question = ExamQuestion(
                id=str(uuid.uuid4()),
                topic=validated["topic"],
                year=validated["year"],
                question_text=validated["question_text"],
                reference_answer=validated["reference_answer"],
            )
            embedding = await embedding_port.embed(question.question_text)
            await vector_store_adapter.store(question, embedding)
            result.ingested += 1
        except Exception as exc:
            result.skipped += 1
            result.errors.append(str(exc))

    return result
