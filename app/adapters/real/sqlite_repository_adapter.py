from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path
from typing import Any

from app.domain.models import (
    MAX_OUTBOX_ATTEMPTS,
    WEAK_ACCURACY_THRESHOLD,
    MIN_ATTEMPTS_FOR_WEAK,
    LearnerProfile,
    TopicScore,
)
from app.ports.repository_port import RepositoryPort

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "db" / "schema.sql"


class SQLiteRepositoryAdapter(RepositoryPort):
    def __init__(self, db_path: str = "./tele_exit.db") -> None:
        self.db_path = db_path
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _ensure_schema(self) -> None:
        schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
        with self._connect() as connection:
            connection.executescript(schema_sql)
            connection.commit()

    async def create_user(
        self,
        email,
        password_hash,
        name,
        field_of_study,
        exam_date,
        report_frequency,
        role: str = "student",
    ) -> str:
        user_id = str(uuid.uuid4())
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO users (
                    id, email, password_hash, name,
                    field_of_study, exam_date, report_frequency, role
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    email,
                    password_hash,
                    name,
                    field_of_study,
                    exam_date,
                    report_frequency or "weekly",
                    role,
                ),
            )
            connection.execute(
                """
                INSERT INTO learner_profiles (student_id, sessions_completed)
                VALUES (?, 0)
                """,
                (user_id,),
            )
            connection.commit()
        return user_id

    async def get_user_by_email(self, email: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE email = ?",
                (email,),
            ).fetchone()
        return dict(row) if row else None

    async def get_user_by_id(self, user_id: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
        return dict(row) if row else None

    async def get_profile(self, student_id: str) -> dict:
        with self._connect() as connection:
            user = connection.execute(
                "SELECT * FROM users WHERE id = ?",
                (student_id,),
            ).fetchone()
            if user is None:
                return {}

            profile = connection.execute(
                "SELECT * FROM learner_profiles WHERE student_id = ?",
                (student_id,),
            ).fetchone()
            if profile is None:
                connection.execute(
                    """
                    INSERT INTO learner_profiles (student_id, sessions_completed)
                    VALUES (?, 0)
                    """,
                    (student_id,),
                )
                connection.commit()
                sessions_completed = 0
                last_session_at = None
            else:
                sessions_completed = int(profile["sessions_completed"])
                last_session_at = profile["last_session_at"]

            score_rows = connection.execute(
                """
                SELECT topic, correct, attempted
                FROM topic_scores
                WHERE student_id = ?
                """,
                (student_id,),
            ).fetchall()

        topic_scores: dict[str, dict] = {}
        weak_topics: list[str] = []
        for row in score_rows:
            attempted = int(row["attempted"])
            correct = int(row["correct"])
            accuracy = correct / attempted if attempted else 0.0
            topic_scores[row["topic"]] = {
                "topic": row["topic"],
                "correct": correct,
                "attempted": attempted,
                "accuracy": accuracy,
            }
            if (
                attempted >= MIN_ATTEMPTS_FOR_WEAK
                and accuracy < WEAK_ACCURACY_THRESHOLD
            ):
                weak_topics.append(row["topic"])

        readiness = _readiness_percent(topic_scores, weak_topics)
        return {
            "student_id": student_id,
            "email": user["email"],
            "weak_topics": sorted(weak_topics),
            "topic_scores": topic_scores,
            "sessions_completed": sessions_completed,
            "last_session_at": last_session_at,
            "readiness_percent": readiness,
        }

    async def save_profile(self, profile: Any) -> None:
        if isinstance(profile, LearnerProfile):
            student_id = profile.student_id
            sessions_completed = profile.sessions_completed
            last_session_at = profile.last_session_at
            scores = profile.topic_scores
        else:
            student_id = profile["student_id"]
            sessions_completed = int(profile.get("sessions_completed", 0))
            last_session_at = profile.get("last_session_at")
            scores = profile.get("topic_scores") or {}

        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO learner_profiles (
                    student_id, last_session_at, sessions_completed
                ) VALUES (?, ?, ?)
                ON CONFLICT(student_id) DO UPDATE SET
                    last_session_at = excluded.last_session_at,
                    sessions_completed = excluded.sessions_completed
                """,
                (student_id, last_session_at, sessions_completed),
            )
            for topic, score in scores.items():
                if isinstance(score, TopicScore):
                    correct = score.correct
                    attempted = score.attempted
                    topic_name = score.topic
                else:
                    topic_name = score.get("topic", topic)
                    correct = int(score.get("correct", 0))
                    attempted = int(score.get("attempted", 0))
                connection.execute(
                    """
                    INSERT INTO topic_scores (
                        student_id, topic, correct, attempted
                    ) VALUES (?, ?, ?, ?)
                    ON CONFLICT(student_id, topic) DO UPDATE SET
                        correct = excluded.correct,
                        attempted = excluded.attempted
                    """,
                    (student_id, topic_name, correct, attempted),
                )
            connection.commit()

    async def record_session_event(self, event) -> None:
        event_id = str(uuid.uuid4())
        if hasattr(event, "student_id"):
            student_id = event.student_id
            question_id = event.question_id
            topic = event.topic
            transcript = event.student_answer_transcript
            was_correct = 1 if event.was_correct else 0
            agent_used = event.agent_used
            occurred_at = event.occurred_at
        else:
            student_id = event["student_id"]
            question_id = event["question_id"]
            topic = event["topic"]
            transcript = event.get("student_answer_transcript")
            was_correct = 1 if event["was_correct"] else 0
            agent_used = event["agent_used"]
            occurred_at = event.get("occurred_at")

        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO session_events (
                    id, student_id, question_id, topic,
                    student_answer_transcript, was_correct, agent_used, occurred_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
                """,
                (
                    event_id,
                    student_id,
                    question_id,
                    topic,
                    transcript,
                    was_correct,
                    agent_used,
                    occurred_at,
                ),
            )
            connection.execute(
                """
                INSERT INTO topic_scores (student_id, topic, correct, attempted)
                VALUES (?, ?, ?, 1)
                ON CONFLICT(student_id, topic) DO UPDATE SET
                    correct = correct + excluded.correct,
                    attempted = attempted + 1
                """,
                (student_id, topic, was_correct),
            )
            connection.commit()

    async def update_settings(
        self,
        student_id: str,
        report_frequency: str,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE users
                SET report_frequency = ?
                WHERE id = ?
                """,
                (report_frequency, student_id),
            )
            connection.commit()

    async def list_calendar_events(self, student_id: str) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, topic, start_iso, duration_minutes, external_event_id
                FROM calendar_events
                WHERE student_id = ?
                ORDER BY start_iso
                """,
                (student_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    async def write_outbox_record(
        self,
        event_type: str,
        payload: dict,
    ) -> None:
        record_id = str(uuid.uuid4())
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO outbox (id, event_type, payload, status, attempts)
                VALUES (?, ?, ?, 'pending', 0)
                """,
                (record_id, event_type, json.dumps(payload)),
            )
            if event_type == "create_calendar_event":
                connection.execute(
                    """
                    INSERT INTO calendar_events (
                        id, student_id, topic, start_iso,
                        duration_minutes, external_event_id
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        payload["student_id"],
                        payload["topic"],
                        payload["start_iso"],
                        int(payload["duration_minutes"]),
                        payload.get("external_event_id"),
                    ),
                )
            connection.commit()

    async def get_pending_outbox_records(self) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, event_type, payload, status, attempts, created_at
                FROM outbox
                WHERE status = 'pending' AND attempts < ?
                ORDER BY created_at
                """,
                (MAX_OUTBOX_ATTEMPTS,),
            ).fetchall()
        results = []
        for row in rows:
            item = dict(row)
            item["payload"] = json.loads(item["payload"])
            results.append(item)
        return results

    async def mark_outbox_sent(self, record_id: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE outbox
                SET status = 'sent'
                WHERE id = ?
                """,
                (record_id,),
            )
            connection.commit()

    async def mark_outbox_failed(self, record_id: str) -> None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT attempts FROM outbox WHERE id = ?",
                (record_id,),
            ).fetchone()
            if row is None:
                return
            attempts = int(row["attempts"]) + 1
            status = "failed" if attempts >= MAX_OUTBOX_ATTEMPTS else "pending"
            connection.execute(
                """
                UPDATE outbox
                SET attempts = ?, status = ?
                WHERE id = ?
                """,
                (attempts, status, record_id),
            )
            connection.commit()


def _readiness_percent(
    topic_scores: dict[str, dict],
    weak_topics: list[str],
) -> int:
    if not topic_scores:
        return 0
    accuracies = [score["accuracy"] for score in topic_scores.values()]
    average = sum(accuracies) / len(accuracies)
    weak_penalty = min(len(weak_topics) * 5, 30)
    raw = round(average * 100) - weak_penalty
    return max(0, min(100, raw))
