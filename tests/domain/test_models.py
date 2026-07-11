import pytest

from app.domain.models import (
    MAX_OUTBOX_ATTEMPTS,
    ExamQuestion,
    LearnerProfile,
    OutboxRecord,
    OutboxStatus,
    ReportFrequency,
    SessionEvent,
    TopicScore,
    User,
    UserRole,
)


class TestUser:
    def test_student_requires_field_and_exam_date(self):
        with pytest.raises(ValueError, match="field_of_study"):
            User(
                id="1",
                email="a@b.com",
                password_hash="x",
                name="Ada",
                exam_date="2026-12-01",
            )
        with pytest.raises(ValueError, match="exam_date"):
            User(
                id="1",
                email="a@b.com",
                password_hash="x",
                name="Ada",
                field_of_study="CS",
            )

    def test_admin_may_omit_student_fields(self):
        admin = User(
            id="admin-1",
            email="owner@tele.exit",
            password_hash="hash",
            name="Owner",
            role=UserRole.ADMIN,
        )
        assert admin.is_admin is True
        assert admin.is_student is False

    def test_coerces_string_enums(self):
        user = User(
            id="s1",
            email="s@tele.exit",
            password_hash="hash",
            name="Sam",
            field_of_study="CS",
            exam_date="2026-11-01",
            report_frequency="monthly",
            role="student",
        )
        assert user.report_frequency is ReportFrequency.MONTHLY
        assert user.role is UserRole.STUDENT
        assert user.is_student is True


class TestTopicScore:
    def test_accuracy_zero_when_no_attempts(self):
        assert TopicScore(topic="Graphs").accuracy == 0.0

    def test_accuracy_and_weak_flag(self):
        score = TopicScore(topic="Trees", correct=1, attempted=3)
        assert score.accuracy == pytest.approx(1 / 3)
        assert score.is_weak is True

    def test_not_weak_with_high_accuracy(self):
        score = TopicScore(topic="Sorting", correct=5, attempted=5)
        assert score.is_weak is False

    def test_not_weak_until_min_attempts(self):
        score = TopicScore(topic="Hashing", correct=0, attempted=1)
        assert score.is_weak is False

    def test_record_attempt(self):
        score = TopicScore(topic="DP")
        score.record_attempt(True)
        score.record_attempt(False)
        assert score.correct == 1
        assert score.attempted == 2

    def test_rejects_invalid_counts(self):
        with pytest.raises(ValueError):
            TopicScore(topic="X", correct=-1, attempted=0)
        with pytest.raises(ValueError):
            TopicScore(topic="X", correct=3, attempted=2)


class TestLearnerProfile:
    def test_apply_session_updates_scores_and_weak_topics(self):
        profile = LearnerProfile(student_id="s1")
        profile.apply_session_event("Graphs", False)
        profile.apply_session_event("Graphs", False)
        assert profile.topic_scores["Graphs"].attempted == 2
        assert profile.weak_topics == ["Graphs"]

    def test_mark_session_completed(self):
        profile = LearnerProfile(student_id="s1")
        profile.mark_session_completed(occurred_at="2026-07-11T10:00:00")
        assert profile.sessions_completed == 1
        assert profile.last_session_at == "2026-07-11T10:00:00"

    def test_readiness_empty_profile(self):
        assert LearnerProfile(student_id="s1").readiness_percent() == 0

    def test_readiness_penalizes_weak_topics(self):
        profile = LearnerProfile(student_id="s1")
        profile.topic_scores["A"] = TopicScore(topic="A", correct=10, attempted=10)
        profile.topic_scores["B"] = TopicScore(topic="B", correct=0, attempted=4)
        profile.recompute_weak_topics()
        readiness = profile.readiness_percent()
        assert 0 <= readiness <= 100
        assert readiness < 100


class TestExamQuestion:
    def test_valid_question(self):
        q = ExamQuestion(
            id="q1",
            topic="Graphs",
            year=2023,
            question_text="Define BFS.",
            reference_answer="Breadth-first search...",
        )
        assert q.source == "user_uploaded"

    def test_rejects_blank_fields_and_bad_year(self):
        with pytest.raises(ValueError, match="topic"):
            ExamQuestion(
                id="q1",
                topic=" ",
                year=2023,
                question_text="Q",
                reference_answer="A",
            )
        with pytest.raises(ValueError, match="question_text"):
            ExamQuestion(
                id="q1",
                topic="Graphs",
                year=2023,
                question_text="",
                reference_answer="A",
            )
        with pytest.raises(ValueError, match="reference_answer"):
            ExamQuestion(
                id="q1",
                topic="Graphs",
                year=2023,
                question_text="Q",
                reference_answer=" ",
            )
        with pytest.raises(ValueError, match="year"):
            ExamQuestion(
                id="q1",
                topic="Graphs",
                year=1800,
                question_text="Q",
                reference_answer="A",
            )


class TestSessionEvent:
    def test_valid_event(self):
        event = SessionEvent(
            student_id="s1",
            question_id="q1",
            topic="Graphs",
            student_answer_transcript="BFS visits level by level",
            was_correct=True,
            agent_used="curriculum",
        )
        assert event.occurred_at

    def test_rejects_invalid_agent(self):
        with pytest.raises(ValueError, match="agent_used"):
            SessionEvent(
                student_id="s1",
                question_id="q1",
                topic="Graphs",
                student_answer_transcript="x",
                was_correct=False,
                agent_used="memory",
            )

    def test_rejects_missing_identity_fields(self):
        with pytest.raises(ValueError, match="student_id"):
            SessionEvent(
                student_id="",
                question_id="q1",
                topic="Graphs",
                student_answer_transcript="x",
                was_correct=True,
                agent_used="search",
            )
        with pytest.raises(ValueError, match="question_id"):
            SessionEvent(
                student_id="s1",
                question_id="",
                topic="Graphs",
                student_answer_transcript="x",
                was_correct=True,
                agent_used="youtube",
            )
        with pytest.raises(ValueError, match="topic"):
            SessionEvent(
                student_id="s1",
                question_id="q1",
                topic="  ",
                student_answer_transcript="x",
                was_correct=True,
                agent_used="curriculum",
            )


class TestOutboxRecord:
    def test_lifecycle_sent(self):
        record = OutboxRecord(id="o1", event_type="send_report_email", payload={"to": "a"})
        assert record.is_pending is True
        assert record.can_retry is True
        record.mark_sent()
        assert record.status == OutboxStatus.SENT.value
        assert record.can_retry is False

    def test_retries_then_fails(self):
        record = OutboxRecord(id="o2", event_type="create_calendar_event", payload={})
        for _ in range(MAX_OUTBOX_ATTEMPTS - 1):
            record.mark_failed()
            assert record.status == OutboxStatus.PENDING.value
        record.mark_failed()
        assert record.status == OutboxStatus.FAILED.value
        assert record.attempts == MAX_OUTBOX_ATTEMPTS
        assert record.can_retry is False

    def test_rejects_empty_event_type_or_null_payload(self):
        with pytest.raises(ValueError, match="event_type"):
            OutboxRecord(id="o3", event_type="", payload={})
        with pytest.raises(ValueError, match="payload"):
            OutboxRecord(id="o4", event_type="send_report_email", payload=None)
