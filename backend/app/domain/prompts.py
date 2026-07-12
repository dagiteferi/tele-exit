CURRICULUM_SYSTEM = (
    "You are a curriculum tutor. Answer using only the provided exam-question "
    "context. If context is empty, say you need more uploaded questions. "
    "When learner memory is provided, gently prioritize weak topics and "
    "acknowledge readiness without lecturing."
)

SEARCH_SYSTEM = (
    "You are a research tutor. Summarize web search results for the student "
    "clearly and accurately."
)

YOUTUBE_SYSTEM = (
    "You are a warm video tutor on a live study call. "
    "Appreciate the student's request, then recommend the video in one short spoken sentence."
)

NO_SEARCH_RESULTS = "No web results found for that query."
NO_WEAK_TOPICS_TO_SCHEDULE = (
    "I don't have weak topics saved yet — keep practicing and I'll schedule them next time."
)
EMPTY_CURRICULUM_CONTEXT = "(no matches)"

_INTENT_LABELS = ("curriculum", "search", "youtube", "memory", "planner")


def intent_classify_prompt(transcript: str) -> str:
    return (
        "Classify the student intent as exactly one of: "
        "curriculum, search, youtube, memory, planner.\n"
        "Use memory for progress / readiness / how am I doing / weak topics status.\n"
        "Use planner for schedule / calendar / plan study / tomorrow / next session.\n"
        "Use youtube for video / watch / clip requests.\n"
        "Use search for web / google / look up online.\n"
        "Otherwise use curriculum.\n"
        f"Transcript: {transcript}\n"
        "Reply with only the label."
    )


def parse_intent_label(raw: str) -> str:
    text = (raw or "").strip().lower()
    for label in _INTENT_LABELS:
        if label in text:
            return label
    return "curriculum"


def learner_context_block(profile: dict | None) -> str:
    if not profile:
        return ""
    weak = profile.get("weak_topics") or []
    weak_text = ", ".join(str(t) for t in weak) if weak else "none yet"
    readiness = profile.get("readiness_percent")
    if readiness is None:
        readiness = "n/a"
    sessions = int(profile.get("sessions_completed") or 0)
    return (
        f"Learner memory — sessions completed: {sessions}; "
        f"weak topics: {weak_text}; readiness: {readiness}%."
    )


def curriculum_user_prompt(
    transcript: str,
    context: str,
    *,
    learner_context: str = "",
) -> str:
    memory = (
        f"\n\n{learner_context}\n"
        if learner_context.strip()
        else ""
    )
    return (
        f"Student said: {transcript}\n\n"
        f"Retrieved curriculum context:\n{context}"
        f"{memory}\n"
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
        "Recommend this video in one or two spoken sentences. "
        "Start by appreciating that they asked for a video."
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


def planner_scheduled_message(topics: list[str], *, start_hint: str = "") -> str:
    names = ", ".join(topics)
    when = f" starting {start_hint}" if start_hint else ""
    return (
        f"I added study suggestions for: {names}{when}. "
        "Open Calendar and tap Accept to confirm them."
    )


def format_curriculum_match(topic: str, question: str, answer: str) -> str:
    return f"Topic: {topic}\nQuestion: {question}\nReference: {answer}"


def format_search_result(title: str, snippet: str, url: str) -> str:
    return f"- {title}: {snippet} ({url})"
