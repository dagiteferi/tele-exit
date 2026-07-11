from app.domain.prompts import (
    CURRICULUM_SYSTEM,
    EMPTY_CURRICULUM_CONTEXT,
    NO_SEARCH_RESULTS,
    NO_WEAK_TOPICS_TO_SCHEDULE,
    SEARCH_SYSTEM,
    YOUTUBE_SYSTEM,
    curriculum_user_prompt,
    format_curriculum_match,
    format_search_result,
    memory_status_message,
    planner_scheduled_message,
    search_user_prompt,
    youtube_user_prompt,
)


def test_system_prompts_are_non_empty():
    assert CURRICULUM_SYSTEM
    assert SEARCH_SYSTEM
    assert YOUTUBE_SYSTEM


def test_curriculum_user_prompt():
    prompt = curriculum_user_prompt("explain BFS", EMPTY_CURRICULUM_CONTEXT)
    assert "explain BFS" in prompt
    assert EMPTY_CURRICULUM_CONTEXT in prompt


def test_search_and_youtube_user_prompts():
    search = search_user_prompt("BFS", "- title: snippet (url)")
    assert "BFS" in search
    assert "snippet" in search

    youtube = youtube_user_prompt(
        transcript="show video",
        title="Graphs",
        url="https://example.com",
        timestamp="1:00",
        description="intro",
    )
    assert "Graphs" in youtube
    assert "1:00" in youtube


def test_spoken_messages_and_formatters():
    assert NO_SEARCH_RESULTS
    assert NO_WEAK_TOPICS_TO_SCHEDULE
    assert "none yet" in memory_status_message(0, [], 0)
    assert "DP" in memory_status_message(2, ["DP"], 40)
    assert "Graphs" in planner_scheduled_message(["Graphs"])
    assert "Topic: Trees" in format_curriculum_match("Trees", "Q?", "A")
    assert format_search_result("T", "S", "U").startswith("- T:")
