from app.ports.llm_port import LLMPort


class FakeLLM(LLMPort):
    def __init__(
        self,
        intent: str = "curriculum",
        response: str = "This is a fake tutor response for local development.",
    ) -> None:
        self.intent = intent
        self.response = response
        self.generate_calls: list[tuple[str, str]] = []
        self.classify_calls: list[str] = []

    async def generate(self, prompt: str, system: str = "") -> str:
        self.generate_calls.append((prompt, system))
        return self.response

    async def classify_intent(self, transcript: str) -> str:
        self.classify_calls.append(transcript)
        lowered = transcript.lower()
        if any(word in lowered for word in ("video", "youtube", "watch")):
            return "youtube"
        if any(word in lowered for word in ("search", "google", "web", "online")):
            return "search"
        if any(
            phrase in lowered
            for phrase in (
                "how am i doing",
                "my progress",
                "weak topics",
                "readiness",
                "my status",
            )
        ):
            return "memory"
        if any(
            phrase in lowered
            for phrase in (
                "schedule",
                "calendar",
                "plan my",
                "plan a study",
                "remind me",
                "book a session",
                "next session",
            )
        ):
            return "planner"
        return self.intent
