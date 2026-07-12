import pytest

from app.domain.agents.supervisor import Supervisor
from app.domain.agents.types import AgentState
from app.domain.models import Intent
from tests.fakes import FakeLLM


@pytest.mark.asyncio
async def test_classify_known_intent():
    supervisor = Supervisor(FakeLLM(intent="search"))
    assert await supervisor.classify("look this up online") is Intent.SEARCH


@pytest.mark.asyncio
async def test_classify_unknown_defaults_to_curriculum():
    supervisor = Supervisor(FakeLLM(intent="dance"))
    assert await supervisor.classify("whatever") is Intent.CURRICULUM


@pytest.mark.asyncio
async def test_route_requires_identity_and_transcript():
    supervisor = Supervisor(FakeLLM(intent="youtube"))
    with pytest.raises(ValueError, match="student_id"):
        await supervisor.route(AgentState(student_id="", transcript="hi"))
    with pytest.raises(ValueError, match="transcript"):
        await supervisor.route(AgentState(student_id="s1", transcript="  "))

    intent = await supervisor.route(
        AgentState(student_id="s1", transcript="show me a video")
    )
    assert intent is Intent.YOUTUBE


@pytest.mark.asyncio
async def test_classify_memory_and_planner_intents():
    supervisor = Supervisor(FakeLLM())
    assert await supervisor.classify("how am I doing?") is Intent.MEMORY
    assert await supervisor.classify("schedule me for tomorrow") is Intent.PLANNER


@pytest.mark.asyncio
async def test_thinking_indicator():
    result = await Supervisor(FakeLLM()).thinking_indicator()
    assert result.action == "thinking"
    assert result.agent_used == "supervisor"
