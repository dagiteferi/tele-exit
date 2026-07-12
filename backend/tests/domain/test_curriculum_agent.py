import pytest

from app.domain.agents.curriculum_agent import CurriculumAgent
from app.domain.agents.types import AgentState
from app.domain.prompts import CURRICULUM_SYSTEM
from tests.fakes import (
    FakeEmbedding,
    FakeLLM,
    FakeVectorStore,
)


@pytest.mark.asyncio
async def test_curriculum_uses_retrieved_context():
    matches = [
        {
            "topic": "Graphs",
            "question_text": "What is BFS?",
            "reference_answer": "Level-order traversal",
        }
    ]
    llm = FakeLLM(response="BFS visits nodes level by level.")
    agent = CurriculumAgent(llm, FakeEmbedding(), FakeVectorStore(matches))
    result = await agent.handle(
        AgentState(student_id="s1", transcript="explain BFS")
    )

    assert result.agent_used == "curriculum"
    assert result.action == "thinking"
    assert "BFS" in result.text
    assert result.metadata["match_count"] == 1
    assert "Retrieved curriculum context" in llm.generate_calls[0][0]
    assert llm.generate_calls[0][1] == CURRICULUM_SYSTEM


@pytest.mark.asyncio
async def test_curriculum_handles_no_matches():
    llm = FakeLLM(response="I need more uploaded questions.")
    agent = CurriculumAgent(llm, FakeEmbedding(), FakeVectorStore([]))
    result = await agent.handle(
        AgentState(student_id="s1", transcript="explain Dijkstra")
    )
    assert result.metadata["match_count"] == 0
    assert "(no matches)" in llm.generate_calls[0][0]


@pytest.mark.asyncio
async def test_curriculum_injects_learner_memory():
    llm = FakeLLM(response="Let's reinforce Graphs.")
    agent = CurriculumAgent(llm, FakeEmbedding(), FakeVectorStore([]))
    result = await agent.handle(
        AgentState(
            student_id="s1",
            transcript="help me",
            profile={
                "weak_topics": ["Graphs"],
                "sessions_completed": 3,
                "readiness_percent": 42,
            },
        )
    )
    prompt = llm.generate_calls[0][0]
    assert "weak topics: Graphs" in prompt
    assert result.metadata["used_memory"] is True


@pytest.mark.asyncio
async def test_curriculum_requires_student_and_transcript():
    agent = CurriculumAgent(FakeLLM(), FakeEmbedding(), FakeVectorStore())
    with pytest.raises(ValueError, match="student_id"):
        await agent.handle(AgentState(student_id="", transcript="hi"))
    with pytest.raises(ValueError, match="transcript"):
        await agent.handle(AgentState(student_id="s1", transcript=""))
