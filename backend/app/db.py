"""Shared SQLite helpers: schema apply + lightweight migrations for existing DBs."""

from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "db" / "schema.sql"


def ensure_schema(connection: sqlite3.Connection) -> None:
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    connection.executescript(schema_sql)
    # Existing DBs already have exam_questions without newer columns —
    # migrate before creating indexes that reference them.
    _migrate_exam_question_columns(connection)
    _migrate_exam_attempt_progress(connection)
    _migrate_calendar_and_summaries(connection)
    _migrate_product_knowledge(connection)
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions(exam_id)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_exam_questions_field ON exam_questions(field_of_study)"
    )
    connection.commit()


def _column_names(connection: sqlite3.Connection, table: str) -> set[str]:
    rows = connection.execute(f"PRAGMA table_info({table})").fetchall()
    return {str(row[1]) for row in rows}


def _migrate_exam_question_columns(connection: sqlite3.Connection) -> None:
    """Add columns introduced after the first schema for already-created DBs."""
    cols = _column_names(connection, "exam_questions")
    if not cols:
        return
    if "exam_id" not in cols:
        connection.execute("ALTER TABLE exam_questions ADD COLUMN exam_id TEXT")
    if "field_of_study" not in cols:
        connection.execute("ALTER TABLE exam_questions ADD COLUMN field_of_study TEXT")
    if "choices_json" not in cols:
        connection.execute("ALTER TABLE exam_questions ADD COLUMN choices_json TEXT")
    if "explanation" not in cols:
        connection.execute("ALTER TABLE exam_questions ADD COLUMN explanation TEXT")


def _migrate_exam_attempt_progress(connection: sqlite3.Connection) -> None:
    cols = _column_names(connection, "exam_attempts")
    if not cols:
        return
    if "progress_index" not in cols:
        connection.execute(
            "ALTER TABLE exam_attempts ADD COLUMN progress_index INTEGER NOT NULL DEFAULT 0"
        )
    if "questions_visited" not in cols:
        connection.execute(
            "ALTER TABLE exam_attempts ADD COLUMN questions_visited INTEGER NOT NULL DEFAULT 1"
        )
    if "visited_json" not in cols:
        connection.execute(
            "ALTER TABLE exam_attempts ADD COLUMN visited_json TEXT NOT NULL DEFAULT '[0]'"
        )


def _migrate_calendar_and_summaries(connection: sqlite3.Connection) -> None:
    cal_cols = _column_names(connection, "calendar_events")
    if cal_cols and "status" not in cal_cols:
        connection.execute(
            "ALTER TABLE calendar_events ADD COLUMN status TEXT NOT NULL DEFAULT 'suggested'"
        )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS session_summaries (
            id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL,
            attempt_id TEXT,
            exam_id TEXT,
            exam_title TEXT NOT NULL DEFAULT '',
            questions_visited INTEGER NOT NULL DEFAULT 0,
            questions_attempted INTEGER NOT NULL DEFAULT 0,
            questions_correct INTEGER NOT NULL DEFAULT 0,
            topics_json TEXT NOT NULL DEFAULT '[]',
            summary_text TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(id)
        )
        """
    )


def _migrate_product_knowledge(connection: sqlite3.Connection) -> None:
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
