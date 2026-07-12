from __future__ import annotations

import json
import sqlite3
from typing import Any

from app.db import ensure_schema
from app.ports.embedding_port import EmbeddingPort
from app.ports.vector_store_port import VectorStorePort


class LocalVectorStoreAdapter(VectorStorePort):
    """Durable local vector store using SQLite (JSON embeddings)."""

    def __init__(self, db_path: str = "./tele_exit.db") -> None:
        self.db_path = db_path
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _ensure_schema(self) -> None:
        with self._connect() as connection:
            ensure_schema(connection)

    async def store(self, question, embedding: list[float]) -> None:
        if hasattr(question, "question_text"):
            record = {
                "id": getattr(question, "id", ""),
                "exam_id": getattr(question, "exam_id", None),
                "field_of_study": getattr(question, "field_of_study", None),
                "topic": getattr(question, "topic", ""),
                "year": int(getattr(question, "year", 0)),
                "question_text": question.question_text,
                "reference_answer": getattr(question, "reference_answer", ""),
                "choices": getattr(question, "choices", None),
                "source": getattr(question, "source", "user_uploaded"),
            }
        elif isinstance(question, dict):
            record = {
                "id": question["id"],
                "exam_id": question.get("exam_id"),
                "field_of_study": question.get("field_of_study"),
                "topic": question.get("topic", ""),
                "year": int(question.get("year", 0)),
                "question_text": question["question_text"],
                "reference_answer": question.get("reference_answer", ""),
                "choices": question.get("choices"),
                "source": question.get("source", "user_uploaded"),
            }
        else:
            raise TypeError("question must be an ExamQuestion-like object or dict")

        choices_json = (
            json.dumps(record["choices"]) if record.get("choices") is not None else None
        )

        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO exam_questions (
                    id, exam_id, field_of_study, topic, year,
                    question_text, reference_answer, choices_json, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    exam_id = excluded.exam_id,
                    field_of_study = excluded.field_of_study,
                    topic = excluded.topic,
                    year = excluded.year,
                    question_text = excluded.question_text,
                    reference_answer = excluded.reference_answer,
                    choices_json = excluded.choices_json,
                    source = excluded.source
                """,
                (
                    record["id"],
                    record.get("exam_id"),
                    record.get("field_of_study"),
                    record["topic"],
                    record["year"],
                    record["question_text"],
                    record["reference_answer"],
                    choices_json,
                    record["source"],
                ),
            )
            connection.execute(
                """
                INSERT INTO question_embeddings (question_id, embedding)
                VALUES (?, ?)
                ON CONFLICT(question_id) DO UPDATE SET
                    embedding = excluded.embedding
                """,
                (record["id"], json.dumps(embedding)),
            )
            connection.commit()

    async def query(
        self,
        text: str,
        embedding_port: EmbeddingPort,
        top_k: int = 3,
        field_of_study: str | None = None,
    ) -> list[dict]:
        query_embedding = await embedding_port.embed(text)
        with self._connect() as connection:
            if field_of_study:
                rows = connection.execute(
                    """
                    SELECT
                        q.id,
                        q.exam_id,
                        q.field_of_study,
                        q.topic,
                        q.year,
                        q.question_text,
                        q.reference_answer,
                        q.choices_json,
                        e.embedding
                    FROM exam_questions q
                    JOIN question_embeddings e ON e.question_id = q.id
                    WHERE q.field_of_study IS NULL
                       OR lower(q.field_of_study) = lower(?)
                    """,
                    (field_of_study,),
                ).fetchall()
            else:
                rows = connection.execute(
                    """
                    SELECT
                        q.id,
                        q.exam_id,
                        q.field_of_study,
                        q.topic,
                        q.year,
                        q.question_text,
                        q.reference_answer,
                        q.choices_json,
                        e.embedding
                    FROM exam_questions q
                    JOIN question_embeddings e ON e.question_id = q.id
                    """
                ).fetchall()

        scored: list[tuple[float, dict[str, Any]]] = []
        for row in rows:
            stored = json.loads(row["embedding"])
            score = _cosine_similarity(query_embedding, stored)
            score += _keyword_overlap(text, row["question_text"])
            choices_raw = row["choices_json"]
            scored.append(
                (
                    score,
                    {
                        "id": row["id"],
                        "exam_id": row["exam_id"],
                        "field_of_study": row["field_of_study"],
                        "topic": row["topic"],
                        "year": row["year"],
                        "question_text": row["question_text"],
                        "reference_answer": row["reference_answer"],
                        "choices": json.loads(choices_raw) if choices_raw else None,
                    },
                )
            )
        scored.sort(key=lambda item: item[0], reverse=True)
        return [item for _, item in scored[:top_k]]


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    size = min(len(left), len(right))
    dot = sum(left[i] * right[i] for i in range(size))
    left_norm = sum(value * value for value in left[:size]) ** 0.5
    right_norm = sum(value * value for value in right[:size]) ** 0.5
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


def _keyword_overlap(query: str, document: str) -> float:
    query_terms = set(query.lower().split())
    doc_terms = set(document.lower().split())
    if not query_terms:
        return 0.0
    return len(query_terms & doc_terms) / len(query_terms)
