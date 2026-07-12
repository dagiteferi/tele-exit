from __future__ import annotations

import httpx

from app.ports.video_search_port import VideoSearchPort


class YouTubeAdapter(VideoSearchPort):
    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("YOUTUBE_API_KEY is required")
        self.api_key = api_key

    async def find_video(self, topic: str) -> dict:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                "https://www.googleapis.com/youtube/v3/search",
                params={
                    "part": "snippet",
                    "q": topic,
                    "type": "video",
                    "maxResults": 1,
                    "key": self.api_key,
                },
            )
            response.raise_for_status()
            data = response.json()

        items = data.get("items") or []
        if not items:
            return {
                "title": f"{topic} (no video found)",
                "url": "",
                "timestamp": "0:00",
                "description": "",
            }

        item = items[0]
        video_id = item["id"]["videoId"]
        snippet = item.get("snippet", {})
        return {
            "title": snippet.get("title", topic),
            "url": f"https://youtube.com/watch?v={video_id}",
            "timestamp": "0:00",
            "description": snippet.get("description", ""),
        }
