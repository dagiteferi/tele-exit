import pytest

from app.domain.agents.memory_agent import MemoryAgent
from app.domain.agents.types import AgentState
from app.domain.models import (
    LearnerProfile,
    SessionEvent,
    TopicScore,
)
from tests.fakes import FakeRepository


@pytest.mark.asyncio
async def test_load_profile_creates_empty_when_missing():
    repo = FakeRepository()
    agent = MemoryAgent(repo)
    profile = await agent.load_profile("s1")
    assert profile.student_id == "s1"
    assert "s1" in repo.profiles


@pytest.mark.asyncio
async def test_load_profile_from_dict_and_domain_object():
    repo = FakeRepository(
        {
            "student_id": "s1",
            "weak_topics": ["Graphs"],
            "topic_scores": {
                "Graphs": {"topic": "Graphs", "correct": 0, "attempted": 2}
            },
            "sessions_completed": 1,
        }
    )
    agent = MemoryAgent(repo)
    profile = await agent.load_profile("s1")
    assert profile.weak_topics == ["Graphs"]
    assert profile.topic_scores["Graphs"].attempted == 2

    domain_profile = LearnerProfile(
        student_id="s2",
        topic_scores={"Trees": TopicScore(topic="Trees", correct=1, attempted=1)},
    )
    await repo.save_profile(domain_profile)
    loaded = await agent.load_profile("s2")
    assert loaded.topic_scores["Trees"].correct == 1


@pytest.mark.asyncio
async def test_record_events_updates_profile_and_repo():
    repo = FakeRepository()
    agent = MemoryAgent(repo)
    events = [
        SessionEvent(
            student_id="s1",
            question_id="q1",
            topic="Graphs",
            student_answer_transcript="wrong",
            was_correct=False,
            agent_used="curriculum",
        ),
        SessionEvent(
            student_id="s1",
            question_id="q2",
            topic="Graphs",
            student_answer_transcript="still wrong",
            was_correct=False,
            agent_used="search",
        ),
    ]
    profile = await agent.record_events("s1", events)
    assert len(repo.events) == 2
    assert profile.sessions_completed == 1
    assert "Graphs" in profile.weak_topics


@pytest.mark.asyncio
async def test_record_events_rejects_mismatched_student():
    agent = MemoryAgent(FakeRepository())
    event = SessionEvent(
        student_id="other",
        question_id="q1",
        topic="Graphs",
        student_answer_transcript="x",
        was_correct=True,
        agent_used="curriculum",
    )
    with pytest.raises(ValueError, match="does not match"):
        await agent.record_events("s1", [event])


@pytest.mark.asyncio
async def test_handle_returns_summary():
    repo = FakeRepository(
        {
            "student_id": "s1",
            "weak_topics": ["DP"],
            "topic_scores": {"DP": {"correct": 0, "attempted": 3}},
            "sessions_completed": 2,
        }
    )
    agent = MemoryAgent(repo)
    state = AgentState(student_id="s1", transcript="how am I doing?")
    result = await agent.handle(state)
    assert result.agent_used == "memory"
    assert "DP" in result.text
    assert state.profile is not None
    assert state.profile["sessions_completed"] == 2


@pytest.mark.asyncio
async def test_load_profile_requires_student_id():
    with pytest.raises(ValueError, match="student_id"):
        await MemoryAgent(FakeRepository()).load_profile("")


@pytest.mark.asyncio
async def test_load_profile_accepts_topic_score_objects_in_dict():
    repo = FakeRepository(
        {
            "student_id": "s1",
            "topic_scores": {
                "Graphs": TopicScore(topic="Graphs", correct=2, attempted=2)
            },
        }
    )
    profile = await MemoryAgent(repo).load_profile("s1")
    assert profile.topic_scores["Graphs"].correct == 2


@pytest.mark.asyncio
async def test_record_events_requires_student_id():
    with pytest.raises(ValueError, match="student_id"):
        await MemoryAgent(FakeRepository()).record_events("", [])


@pytest.mark.asyncio
async def test_handle_with_no_weak_topics():
    repo = FakeRepository(
        {
            "student_id": "s1",
            "weak_topics": [],
            "topic_scores": {},
            "sessions_completed": 0,
        }
    )
    result = await MemoryAgent(repo).handle(
        AgentState(student_id="s1", transcript="status")
    )
    assert "none yet" in result.text


@pytest.mark.asyncio
async def test_unsupported_score_type():
    repo = FakeRepository(
        {
            "student_id": "s1",
            "topic_scores": {"Graphs": "bad"},
        }
    )
    with pytest.raises(TypeError):
        await MemoryAgent(repo).load_profile("s1")
