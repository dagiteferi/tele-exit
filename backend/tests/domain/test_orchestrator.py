import pytest

from app.core.orchestrator import Orchestrator
from app.domain.models import Intent
from tests.fakes import (
    FakeCalendar,
    FakeEmbedding,
    FakeLLM,
    FakeRepository,
    FakeSearch,
    FakeVectorStore,
    FakeVideoSearch,
)


def _orchestrator(
    *,
    intent: str = "curriculum",
    repo: FakeRepository | None = None,
) -> Orchestrator:
    return Orchestrator(
        llm=FakeLLM(intent=intent, response="Coach reply."),
        search=FakeSearch(),
        video_search=FakeVideoSearch(),
        embedding=FakeEmbedding(),
        vector_store=FakeVectorStore([]),
        repo=repo
        or FakeRepository(
            {
                "student_id": "s1",
                "weak_topics": ["Graphs"],
                "topic_scores": {"Graphs": {"correct": 0, "attempted": 3}},
                "sessions_completed": 2,
            }
        ),
        calendar=FakeCalendar(),
    )


@pytest.mark.asyncio
async def test_orchestrator_memory_intent_returns_progress():
    messages = await _orchestrator().handle_transcript("s1", "how am I doing?")
    response = next(m for m in messages if m["type"] == "agent_response")
    assert response["agent_used"] == "memory"
    assert "Graphs" in response["text"]


@pytest.mark.asyncio
async def test_orchestrator_planner_intent_schedules():
    messages = await _orchestrator().handle_transcript(
        "s1", "schedule me for tomorrow"
    )
    response = next(m for m in messages if m["type"] == "agent_response")
    assert response["agent_used"] == "planner"
    assert "Graphs" in response["text"]
    card = next(m for m in messages if m["type"] == "schedule_card")
    assert card["sessions"][0]["topic"] == "Graphs"


@pytest.mark.asyncio
async def test_orchestrator_curriculum_gets_memory_context():
    llm = FakeLLM(intent="curriculum", response="Let's reinforce Graphs.")
    orch = Orchestrator(
        llm=llm,
        search=FakeSearch(),
        video_search=FakeVideoSearch(),
        embedding=FakeEmbedding(),
        vector_store=FakeVectorStore([]),
        repo=FakeRepository(
            {
                "student_id": "s1",
                "weak_topics": ["Graphs"],
                "sessions_completed": 2,
                "readiness_percent": 40,
            }
        ),
        calendar=FakeCalendar(),
    )
    await orch.handle_transcript("s1", "explain this question")
    prompt = llm.generate_calls[-1][0]
    assert "weak topics: Graphs" in prompt
