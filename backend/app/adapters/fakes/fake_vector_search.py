from __future__ import annotations

from typing import Any

from app.ports.embedding_port import EmbeddingPort
from app.ports.vector_store_port import VectorStorePort


class FakeEmbedding(EmbeddingPort):
    async def embed(self, text: str) -> list[float]:
        tokens = text.lower().split()
        return [float(len(tokens)), float(len(text)), float(sum(map(ord, text[:20])))]


class FakeVectorSearch(VectorStorePort):
    def __init__(self, matches: list[dict] | None = None) -> None:
        self._preset_matches = matches
        self._records: list[dict[str, Any]] = []
        self.query_calls: list[tuple[str, int]] = []
        self.stored: list[tuple[Any, list[float]]] = []

    async def store(self, question, embedding: list[float]) -> None:
        self.stored.append((question, embedding))
        if hasattr(question, "question_text"):
            record = {
                "id": getattr(question, "id", ""),
                "topic": getattr(question, "topic", ""),
                "year": getattr(question, "year", 0),
                "question_text": question.question_text,
                "reference_answer": getattr(question, "reference_answer", ""),
                "embedding": embedding,
            }
        elif isinstance(question, dict):
            record = {
                **question,
                "embedding": embedding,
            }
        else:
            raise TypeError("question must be an ExamQuestion-like object or dict")
        self._records.append(record)

    async def query(
        self,
        text: str,
        embedding_port: EmbeddingPort,
        top_k: int = 3,
    ) -> list[dict]:
        self.query_calls.append((text, top_k))
        if self._preset_matches is not None:
            return self._preset_matches[:top_k]

        query_embedding = await embedding_port.embed(text)
        scored: list[tuple[float, dict]] = []
        for record in self._records:
            score = _cosine_similarity(query_embedding, record.get("embedding", []))
            keyword_bonus = _keyword_overlap(text, record.get("question_text", ""))
            scored.append((score + keyword_bonus, record))

        scored.sort(key=lambda item: item[0], reverse=True)
        results = []
        for _, record in scored[:top_k]:
            results.append(
                {
                    "id": record.get("id", ""),
                    "topic": record.get("topic", ""),
                    "year": record.get("year", 0),
                    "question_text": record.get("question_text", ""),
                    "reference_answer": record.get("reference_answer", ""),
                }
            )
        return results


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
