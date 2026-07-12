from app.ports.video_search_port import VideoSearchPort


class FakeVideoSearch(VideoSearchPort):
    def __init__(self, video: dict | None = None) -> None:
        self._fixed_video = video
        self.calls: list[str] = []

    async def find_video(self, topic: str) -> dict:
        self.calls.append(topic)
        if self._fixed_video is not None:
            return dict(self._fixed_video)
        slug = topic.replace(" ", "-").lower()
        return {
            "title": f"{topic} Explained",
            "url": f"https://youtube.com/watch?v=fake-{slug}",
            "timestamp": "1:30",
            "description": f"A short walkthrough of {topic} for exit-exam review.",
        }
