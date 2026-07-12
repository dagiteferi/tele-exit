"""Product / docs knowledge store (separate from exam-question RAG)."""

from __future__ import annotations

import json
import math
import re
import sqlite3
from typing import Any

from app.db import ensure_schema
from app.ingestion.fast_embed import fast_embed


class ProductKnowledgeStore:
    """SQLite-backed chunks for product FAQ + backend spec + optional web digests."""

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
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS product_chunks (
                    id TEXT PRIMARY KEY,
                    source TEXT NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    body TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS product_embeddings (
                    chunk_id TEXT PRIMARY KEY,
                    embedding TEXT NOT NULL,
                    FOREIGN KEY (chunk_id) REFERENCES product_chunks(id) ON DELETE CASCADE
                )
                """
            )
            connection.commit()

    def count(self) -> int:
        with self._connect() as connection:
            row = connection.execute("SELECT COUNT(*) AS n FROM product_chunks").fetchone()
            return int(row["n"] if row else 0)

    def clear(self) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM product_embeddings")
            connection.execute("DELETE FROM product_chunks")
            connection.commit()

    def upsert_chunk(
        self,
        *,
        chunk_id: str,
        source: str,
        title: str,
        body: str,
        embedding: list[float] | None = None,
    ) -> None:
        vec = embedding if embedding is not None else fast_embed(f"{title}\n{body}")
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO product_chunks (id, source, title, body)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    source = excluded.source,
                    title = excluded.title,
                    body = excluded.body
                """,
                (chunk_id, source, title, body),
            )
            connection.execute(
                """
                INSERT INTO product_embeddings (chunk_id, embedding)
                VALUES (?, ?)
                ON CONFLICT(chunk_id) DO UPDATE SET embedding = excluded.embedding
                """,
                (chunk_id, json.dumps(vec)),
            )
            connection.commit()

    def query(self, text: str, top_k: int = 5) -> list[dict[str, Any]]:
        query_embedding = fast_embed(text)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT c.id, c.source, c.title, c.body, e.embedding
                FROM product_chunks c
                JOIN product_embeddings e ON e.chunk_id = c.id
                """
            ).fetchall()

        scored: list[tuple[float, dict[str, Any]]] = []
        for row in rows:
            stored = json.loads(row["embedding"])
            score = _cosine(query_embedding, stored)
            score += _keyword_overlap(text, f"{row['title']} {row['body']}")
            scored.append(
                (
                    score,
                    {
                        "id": row["id"],
                        "source": row["source"],
                        "title": row["title"],
                        "body": row["body"],
                        "score": score,
                    },
                )
            )
        scored.sort(key=lambda item: item[0], reverse=True)
        return [item for _, item in scored[:top_k]]


def _cosine(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    size = min(len(left), len(right))
    dot = sum(left[i] * right[i] for i in range(size))
    ln = math.sqrt(sum(v * v for v in left[:size])) or 1.0
    rn = math.sqrt(sum(v * v for v in right[:size])) or 1.0
    return dot / (ln * rn)


_TOKEN_RE = re.compile(r"[a-z0-9_]+")


def _keyword_overlap(query: str, document: str) -> float:
    query_terms = set(_TOKEN_RE.findall(query.lower()))
    doc_terms = set(_TOKEN_RE.findall(document.lower()))
    # Drop very common words
    stop = {"the", "a", "an", "and", "or", "to", "of", "in", "for", "is", "how", "what", "do"}
    query_terms -= stop
    if not query_terms:
        return 0.0
    return len(query_terms & doc_terms) / len(query_terms)
