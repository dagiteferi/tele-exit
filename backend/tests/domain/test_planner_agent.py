from datetime import datetime

import pytest

from app.domain.agents.planner_agent import (
    PlannerAgent,
    parse_schedule_start,
)
from app.domain.agents.types import AgentState
from tests.fakes import (
    FakeCalendar,
    FakeRepository,
)


@pytest.mark.asyncio
async def test_schedule_weak_topics_creates_suggestions_only():
    repo = FakeRepository()
    calendar = FakeCalendar()
    agent = PlannerAgent(repo, calendar, study_minutes=45)
    created = await agent.schedule_weak_topics(
        "s1",
        ["Graphs", "Trees", "DP", "Ignored"],
        start_from=datetime(2026, 7, 11, 8, 0, 0),
    )
    assert len(created) == 3
    # Suggestions stay pending until the student clicks Accept.
    assert all(item["status"] == "suggested" for item in created)
    assert len(repo.calendar_suggestions) == 3
    assert len(calendar.events) == 0
    assert len(repo.outbox) == 0
    assert created[0]["duration_minutes"] == 45
    assert created[0]["topic"] == "Graphs"
    assert created[0]["start_iso"].startswith("2026-07-11T09:00:00")


@pytest.mark.asyncio
async def test_schedule_empty_topics():
    agent = PlannerAgent(FakeRepository(), FakeCalendar())
    assert await agent.schedule_weak_topics("s1", []) == []


@pytest.mark.asyncio
async def test_handle_with_state_profile():
    repo = FakeRepository()
    agent = PlannerAgent(repo, FakeCalendar())
    state = AgentState(
        student_id="s1",
        transcript="schedule me for tomorrow",
        profile={"weak_topics": ["Sorting"]},
    )
    result = await agent.handle(state)
    assert result.agent_used == "planner"
    assert "Sorting" in result.text
    assert "Accept" in result.text
    assert result.metadata["scheduled"][0]["status"] == "suggested"


@pytest.mark.asyncio
async def test_handle_falls_back_to_live_topic():
    repo = FakeRepository({"student_id": "s1", "weak_topics": []})
    agent = PlannerAgent(repo, FakeCalendar())
    result = await agent.handle(
        AgentState(
            student_id="s1",
            transcript="add this to my calendar",
            context={"topic": "Binary Trees"},
        )
    )
    assert result.agent_used == "planner"
    assert "Binary Trees" in result.text
    assert len(result.metadata["scheduled"]) == 1
    assert result.metadata["scheduled"][0]["status"] == "suggested"


@pytest.mark.asyncio
async def test_handle_loads_profile_when_missing_on_state():
    repo = FakeRepository({"student_id": "s1", "weak_topics": []})
    agent = PlannerAgent(repo, FakeCalendar())
    result = await agent.handle(AgentState(student_id="s1", transcript="plan my week"))
    assert "don't have weak topics" in result.text.lower()


@pytest.mark.asyncio
async def test_planner_requires_student_id():
    agent = PlannerAgent(FakeRepository(), FakeCalendar())
    with pytest.raises(ValueError, match="student_id"):
        await agent.schedule_weak_topics("", ["Graphs"])
    with pytest.raises(ValueError, match="student_id"):
        await agent.handle(AgentState(student_id="", transcript="plan"))


def test_parse_schedule_start_phrases():
    now = datetime(2026, 7, 12, 15, 0, 0)  # Sunday
    day, hint = parse_schedule_start("schedule me for tomorrow", now=now)
    assert hint == "tomorrow"
    assert day.day == 13
    day, hint = parse_schedule_start("plan for monday", now=now)
    assert hint == "Monday"
    assert day.weekday() == 0
