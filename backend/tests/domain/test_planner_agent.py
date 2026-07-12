from datetime import datetime

import pytest

from app.domain.agents.planner_agent import PlannerAgent
from app.domain.agents.types import AgentState
from tests.fakes import (
    FakeCalendar,
    FakeRepository,
)


@pytest.mark.asyncio
async def test_schedule_weak_topics_creates_events_and_outbox():
    repo = FakeRepository()
    calendar = FakeCalendar()
    agent = PlannerAgent(repo, calendar, study_minutes=45)
    created = await agent.schedule_weak_topics(
        "s1",
        ["Graphs", "Trees", "DP", "Ignored"],
        start_from=datetime(2026, 7, 11, 8, 0, 0),
    )
    assert len(created) == 3
    assert len(calendar.events) == 3
    assert len(repo.outbox) == 3
    assert created[0]["duration_minutes"] == 45
    assert created[0]["topic"] == "Graphs"


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
        transcript="plan my week",
        profile={"weak_topics": ["Sorting"]},
    )
    result = await agent.handle(state)
    assert result.agent_used == "planner"
    assert "Sorting" in result.text
    assert len(result.metadata["scheduled"]) == 1


@pytest.mark.asyncio
async def test_handle_loads_profile_when_missing_on_state():
    repo = FakeRepository({"student_id": "s1", "weak_topics": []})
    agent = PlannerAgent(repo, FakeCalendar())
    result = await agent.handle(AgentState(student_id="s1", transcript="plan"))
    assert result.text == "No weak topics to schedule right now."


@pytest.mark.asyncio
async def test_planner_requires_student_id():
    agent = PlannerAgent(FakeRepository(), FakeCalendar())
    with pytest.raises(ValueError, match="student_id"):
        await agent.schedule_weak_topics("", ["Graphs"])
    with pytest.raises(ValueError, match="student_id"):
        await agent.handle(AgentState(student_id="", transcript="plan"))
