CURRICULUM_SYSTEM = (
    "You are a curriculum tutor. Answer using only the provided exam-question "
    "context. If context is empty, say you need more uploaded questions."
)

SEARCH_SYSTEM = (
    "You are a research tutor. Summarize web search results for the student "
    "clearly and accurately."
)

YOUTUBE_SYSTEM = (
    "You are a video tutor. Recommend the best video segment for the student "
    "and explain why it helps."
)

NO_SEARCH_RESULTS = "No web results found for that query."
NO_WEAK_TOPICS_TO_SCHEDULE = "No weak topics to schedule right now."
EMPTY_CURRICULUM_CONTEXT = "(no matches)"


def curriculum_user_prompt(transcript: str, context: str) -> str:
    return (
        f"Student said: {transcript}\n\n"
        f"Retrieved curriculum context:\n{context}\n\n"
        "Respond helpfully and concisely."
    )


def search_user_prompt(transcript: str, digest: str) -> str:
    return (
        f"Student asked: {transcript}\n\n"
        f"Search results:\n{digest}\n\n"
        "Write a short spoken answer for the student."
    )


def youtube_user_prompt(
    transcript: str,
    title: str,
    url: str,
    timestamp: str,
    description: str,
) -> str:
    return (
        f"Student asked: {transcript}\n\n"
        f"Video: {title}\nURL: {url}\nTimestamp: {timestamp}\n"
        f"Description: {description}\n\n"
        "Recommend this video in one or two spoken sentences."
    )


def memory_status_message(
    sessions_completed: int,
    weak_topics: list[str],
    readiness_percent: int,
) -> str:
    weak = ", ".join(weak_topics) if weak_topics else "none yet"
    return (
        f"You've completed {sessions_completed} sessions. "
        f"Current weak topics: {weak}. "
        f"Readiness is about {readiness_percent} percent."
    )


def planner_scheduled_message(topics: list[str]) -> str:
    names = ", ".join(topics)
    return f"I scheduled study sessions for: {names}."


def format_curriculum_match(topic: str, question: str, answer: str) -> str:
    return f"Topic: {topic}\nQuestion: {question}\nReference: {answer}"


def format_search_result(title: str, snippet: str, url: str) -> str:
    return f"- {title}: {snippet} ({url})"
