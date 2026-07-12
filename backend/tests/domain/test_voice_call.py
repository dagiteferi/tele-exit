import pytest

from app.domain.voice_call import voice_call_turn
from tests.fakes import (
    FakeCalendar,
    FakeLLM,
    FakeRepository,
    FakeSearch,
    FakeVideoSearch,
)


QUESTION = {
    "id": "q1",
    "topic": "Graphs",
    "question_text": "What is BFS?",
    "choices": ["A", "B", "C", "D"],
    "reference_answer": "A",
    "explanation": "Breadth-first search expands level by level.",
}


@pytest.mark.asyncio
async def test_voice_call_progress_uses_memory():
    turn = await voice_call_turn(
        llm=FakeLLM(),
        search=FakeSearch(),
        video_search=FakeVideoSearch(),
        student_id="s1",
        question=QUESTION,
        message="how am I doing?",
        repo=FakeRepository(
            {
                "student_id": "s1",
                "weak_topics": ["Graphs"],
                "sessions_completed": 2,
                "topic_scores": {"Graphs": {"correct": 0, "attempted": 3}},
            }
        ),
        calendar=FakeCalendar(),
    )
    assert turn["agent_used"] == "memory"
    assert "Graphs" in turn["reply"]


@pytest.mark.asyncio
async def test_voice_call_schedule_uses_planner():
    calendar = FakeCalendar()
    turn = await voice_call_turn(
        llm=FakeLLM(),
        search=FakeSearch(),
        video_search=FakeVideoSearch(),
        student_id="s1",
        question=QUESTION,
        message="schedule me for tomorrow",
        repo=FakeRepository(
            {
                "student_id": "s1",
                "weak_topics": ["DP"],
                "sessions_completed": 1,
            }
        ),
        calendar=calendar,
    )
    assert turn["agent_used"] == "planner"
    assert "DP" in turn["reply"]
    assert turn["scheduled"]
    assert len(calendar.events) == 1


@pytest.mark.asyncio
async def test_voice_call_coach_gets_memory_profile():
    llm = FakeLLM(response="Nice try — Graphs is a weak area, so let's focus.")
    await voice_call_turn(
        llm=llm,
        search=FakeSearch(),
        video_search=FakeVideoSearch(),
        student_id="s1",
        question=QUESTION,
        message="I think the answer is B",
        repo=FakeRepository(
            {
                "student_id": "s1",
                "weak_topics": ["Graphs"],
                "sessions_completed": 4,
                "readiness_percent": 55,
            }
        ),
        calendar=FakeCalendar(),
    )
    prompt = llm.generate_calls[0][0]
    assert "weak topics: Graphs" in prompt
