from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from app.db import ensure_schema
from app.domain.models import (
    MAX_OUTBOX_ATTEMPTS,
    WEAK_ACCURACY_THRESHOLD,
    MIN_ATTEMPTS_FOR_WEAK,
    LearnerProfile,
    TopicScore,
)
from app.ports.repository_port import RepositoryPort


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


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
        with self._connect() as connection:
            ensure_schema(connection)

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
        weak_topics.sort(
            key=lambda topic: topic_scores.get(topic, {}).get("accuracy", 1.0),
        )
        return {
            "student_id": student_id,
            "email": user["email"],
            "name": user["name"],
            "field_of_study": user["field_of_study"],
            "exam_date": user["exam_date"],
            "report_frequency": user["report_frequency"] or "weekly",
            "role": user["role"] if "role" in user.keys() else "student",
            "weak_topics": weak_topics,
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
                SELECT id, topic, start_iso, duration_minutes, external_event_id, status
                FROM calendar_events
                WHERE student_id = ?
                ORDER BY start_iso
                """,
                (student_id,),
            ).fetchall()
        results = []
        for row in rows:
            item = dict(row)
            item["status"] = item.get("status") or "suggested"
            results.append(item)
        return results

    async def create_calendar_suggestion(
        self,
        student_id: str,
        topic: str,
        start_iso: str,
        duration_minutes: int,
    ) -> dict:
        event_id = str(uuid.uuid4())
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO calendar_events (
                    id, student_id, topic, start_iso,
                    duration_minutes, external_event_id, status
                ) VALUES (?, ?, ?, ?, ?, NULL, 'suggested')
                """,
                (event_id, student_id, topic, start_iso, int(duration_minutes)),
            )
            connection.commit()
        return {
            "id": event_id,
            "student_id": student_id,
            "topic": topic,
            "start_iso": start_iso,
            "duration_minutes": int(duration_minutes),
            "external_event_id": None,
            "status": "suggested",
        }

    async def accept_calendar_event(
        self,
        student_id: str,
        event_id: str,
        external_event_id: str | None = None,
    ) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, topic, start_iso, duration_minutes, external_event_id, status
                FROM calendar_events
                WHERE id = ? AND student_id = ?
                """,
                (event_id, student_id),
            ).fetchone()
            if row is None:
                return None
            connection.execute(
                """
                UPDATE calendar_events
                SET status = 'accepted',
                    external_event_id = COALESCE(?, external_event_id)
                WHERE id = ? AND student_id = ?
                """,
                (external_event_id, event_id, student_id),
            )
            connection.commit()
            updated = connection.execute(
                """
                SELECT id, topic, start_iso, duration_minutes, external_event_id, status
                FROM calendar_events
                WHERE id = ?
                """,
                (event_id,),
            ).fetchone()
        item = dict(updated)
        item["status"] = item.get("status") or "accepted"
        return item

    async def save_session_summary(self, summary: dict) -> dict:
        summary_id = str(uuid.uuid4())
        topics = summary.get("topics") or []
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO session_summaries (
                    id, student_id, attempt_id, exam_id, exam_title,
                    questions_visited, questions_attempted, questions_correct,
                    topics_json, summary_text
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    summary_id,
                    summary["student_id"],
                    summary.get("attempt_id"),
                    summary.get("exam_id"),
                    summary.get("exam_title") or "",
                    int(summary.get("questions_visited") or 0),
                    int(summary.get("questions_attempted") or 0),
                    int(summary.get("questions_correct") or 0),
                    json.dumps(topics),
                    summary.get("summary_text") or "",
                ),
            )
            connection.commit()
        return {
            "id": summary_id,
            "student_id": summary["student_id"],
            "attempt_id": summary.get("attempt_id"),
            "exam_id": summary.get("exam_id"),
            "exam_title": summary.get("exam_title") or "",
            "questions_visited": int(summary.get("questions_visited") or 0),
            "questions_attempted": int(summary.get("questions_attempted") or 0),
            "questions_correct": int(summary.get("questions_correct") or 0),
            "topics": topics,
            "summary_text": summary.get("summary_text") or "",
            "created_at": _utc_now(),
        }

    async def list_session_summaries(self, student_id: str, limit: int = 12) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM session_summaries
                WHERE student_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (student_id, limit),
            ).fetchall()
        results = []
        for row in rows:
            item = dict(row)
            try:
                item["topics"] = json.loads(item.pop("topics_json") or "[]")
            except json.JSONDecodeError:
                item["topics"] = []
                item.pop("topics_json", None)
            results.append(item)
        return results

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
                if not payload.get("_skip_insert"):
                    connection.execute(
                        """
                        INSERT INTO calendar_events (
                            id, student_id, topic, start_iso,
                            duration_minutes, external_event_id, status
                        ) VALUES (?, ?, ?, ?, ?, ?, 'accepted')
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

    # -- admin / exams --------------------------------------------------------

    async def list_users(self) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, email, name, field_of_study, exam_date, role, created_at
                FROM users
                ORDER BY created_at DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    async def create_exam(
        self,
        title: str,
        field_of_study: str,
        year: int | None,
        description: str | None,
        created_by: str | None,
    ) -> str:
        exam_id = str(uuid.uuid4())
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO exams (
                    id, title, field_of_study, year, description, created_by
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (exam_id, title, field_of_study, year, description, created_by),
            )
            connection.commit()
        return exam_id

    async def list_exams(self, field_of_study: str | None = None) -> list[dict]:
        with self._connect() as connection:
            if field_of_study:
                rows = connection.execute(
                    """
                    SELECT e.*, COUNT(q.id) AS question_count
                    FROM exams e
                    LEFT JOIN exam_questions q ON q.exam_id = e.id
                    WHERE lower(e.field_of_study) = lower(?)
                    GROUP BY e.id
                    ORDER BY e.created_at DESC
                    """,
                    (field_of_study,),
                ).fetchall()
            else:
                rows = connection.execute(
                    """
                    SELECT e.*, COUNT(q.id) AS question_count
                    FROM exams e
                    LEFT JOIN exam_questions q ON q.exam_id = e.id
                    GROUP BY e.id
                    ORDER BY e.created_at DESC
                    """
                ).fetchall()
        return [dict(row) for row in rows]

    async def get_exam(self, exam_id: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM exams WHERE id = ?",
                (exam_id,),
            ).fetchone()
        return dict(row) if row else None

    async def list_exam_questions(self, exam_id: str) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, exam_id, field_of_study, topic, year,
                       question_text, reference_answer, explanation, choices_json, source
                FROM exam_questions
                WHERE exam_id = ?
                ORDER BY created_at, topic
                """,
                (exam_id,),
            ).fetchall()
        results = []
        for row in rows:
            item = dict(row)
            raw = item.pop("choices_json", None)
            item["choices"] = json.loads(raw) if raw else None
            results.append(item)
        return results

    async def list_all_questions(self, limit: int = 200) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, exam_id, field_of_study, topic, year,
                       question_text, reference_answer, explanation, choices_json, source
                FROM exam_questions
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        results = []
        for row in rows:
            item = dict(row)
            raw = item.pop("choices_json", None)
            item["choices"] = json.loads(raw) if raw else None
            results.append(item)
        return results

    async def create_exam_attempt(
        self,
        exam_id: str,
        student_id: str,
        mode: str,
    ) -> str:
        attempt_id = str(uuid.uuid4())
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO exam_attempts (
                    id, exam_id, student_id, mode, answers_json
                ) VALUES (?, ?, ?, ?, '[]')
                """,
                (attempt_id, exam_id, student_id, mode),
            )
            connection.commit()
        return attempt_id

    async def get_exam_attempt(self, attempt_id: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM exam_attempts WHERE id = ?",
                (attempt_id,),
            ).fetchone()
        if row is None:
            return None
        item = dict(row)
        item["answers"] = json.loads(item.pop("answers_json") or "[]")
        raw_visited = item.pop("visited_json", None) or "[0]"
        try:
            item["visited"] = json.loads(raw_visited)
        except json.JSONDecodeError:
            item["visited"] = [0]
        item["progress_index"] = int(item.get("progress_index") or 0)
        item["questions_visited"] = int(item.get("questions_visited") or 1)
        return item

    async def update_attempt_progress(
        self,
        attempt_id: str,
        progress_index: int,
        question_id: str | None = None,
    ) -> dict | None:
        """Remember last question + unique questions opened for resume/profile."""
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM exam_attempts WHERE id = ?",
                (attempt_id,),
            ).fetchone()
            if row is None:
                return None
            current = dict(row)
            try:
                visited = set(json.loads(current.get("visited_json") or "[0]"))
            except json.JSONDecodeError:
                visited = {0}
            # One marker per question — prefer id, else index token.
            if question_id and question_id.strip():
                marker: int | str = question_id.strip()
            else:
                marker = int(progress_index)
            # Drop legacy numeric twin when we now have an id for this slot.
            if isinstance(marker, str):
                visited.discard(int(progress_index))
                visited.discard(str(progress_index))
            visited.add(marker)
            visited_list = sorted(
                visited,
                key=lambda x: (0, x) if isinstance(x, int) else (1, str(x)),
            )
            connection.execute(
                """
                UPDATE exam_attempts
                SET progress_index = ?,
                    questions_visited = ?,
                    visited_json = ?
                WHERE id = ?
                """,
                (
                    int(progress_index),
                    len(visited),
                    json.dumps(visited_list),
                    attempt_id,
                ),
            )
            connection.commit()
            updated = connection.execute(
                "SELECT * FROM exam_attempts WHERE id = ?",
                (attempt_id,),
            ).fetchone()
        item = dict(updated)
        item["answers"] = json.loads(item.pop("answers_json") or "[]")
        item["visited"] = json.loads(item.pop("visited_json") or "[]")
        item["progress_index"] = int(item.get("progress_index") or 0)
        item["questions_visited"] = int(item.get("questions_visited") or 1)
        return item

    async def list_practice_progress(self, student_id: str) -> list[dict]:
        """Open practice attempts with furthest position for profile resume cards."""
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    a.id AS attempt_id,
                    a.exam_id,
                    a.progress_index,
                    a.questions_visited,
                    a.started_at,
                    a.completed_at,
                    e.title AS exam_title,
                    (
                        SELECT COUNT(*) FROM exam_questions q WHERE q.exam_id = a.exam_id
                    ) AS question_total
                FROM exam_attempts a
                JOIN exams e ON e.id = a.exam_id
                WHERE a.student_id = ?
                  AND a.mode = 'practice'
                  AND a.completed_at IS NULL
                ORDER BY a.started_at DESC
                """,
                (student_id,),
            ).fetchall()
        # One card per exam — keep the most recent open attempt.
        seen: set[str] = set()
        results: list[dict] = []
        for row in rows:
            exam_id = str(row["exam_id"])
            if exam_id in seen:
                continue
            seen.add(exam_id)
            total = int(row["question_total"] or 0)
            idx = int(row["progress_index"] or 0)
            visited = int(row["questions_visited"] or 1)
            results.append(
                {
                    "attempt_id": str(row["attempt_id"]),
                    "exam_id": exam_id,
                    "exam_title": str(row["exam_title"] or "Practice exam"),
                    "progress_index": idx,
                    "question_number": min(idx + 1, max(total, 1)),
                    "questions_visited": min(visited, total) if total else visited,
                    "question_total": total,
                    "started_at": str(row["started_at"] or ""),
                }
            )
        return results

    async def complete_exam_attempt(
        self,
        attempt_id: str,
        answers: list[dict],
        score_correct: int,
        score_total: int,
    ) -> dict:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE exam_attempts
                SET answers_json = ?,
                    score_correct = ?,
                    score_total = ?,
                    completed_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (json.dumps(answers), score_correct, score_total, attempt_id),
            )
            connection.commit()
            row = connection.execute(
                "SELECT * FROM exam_attempts WHERE id = ?",
                (attempt_id,),
            ).fetchone()
        item = dict(row)
        item["answers"] = json.loads(item.pop("answers_json") or "[]")
        return item

    async def list_student_attempts(self, student_id: str) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT a.*, e.title AS exam_title, e.field_of_study
                FROM exam_attempts a
                JOIN exams e ON e.id = a.exam_id
                WHERE a.student_id = ?
                ORDER BY a.started_at DESC
                """,
                (student_id,),
            ).fetchall()
        results = []
        for row in rows:
            item = dict(row)
            item["answers"] = json.loads(item.pop("answers_json") or "[]")
            results.append(item)
        return results

    async def list_recent_sessions(self, student_id: str, limit: int = 8) -> list[dict]:
        """Recent completed exam/practice attempts for the dashboard."""
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    a.id,
                    COALESCE(e.title, 'Exam') AS exam_title,
                    a.mode,
                    a.score_correct AS correct,
                    a.score_total AS attempted,
                    COALESCE(a.completed_at, a.started_at) AS date
                FROM exam_attempts a
                LEFT JOIN exams e ON e.id = a.exam_id
                WHERE a.student_id = ?
                  AND a.completed_at IS NOT NULL
                  AND a.score_total > 0
                ORDER BY datetime(COALESCE(a.completed_at, a.started_at)) DESC
                LIMIT ?
                """,
                (student_id, limit),
            ).fetchall()
        results = []
        for row in rows:
            mode = str(row["mode"] or "practice").capitalize()
            results.append(
                {
                    "id": row["id"],
                    "topic": f"{row['exam_title']} · {mode}",
                    "correct": int(row["correct"]),
                    "attempted": int(row["attempted"]),
                    "date": row["date"],
                }
            )
        return results


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
