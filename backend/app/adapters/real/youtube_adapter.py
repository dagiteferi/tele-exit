from __future__ import annotations

import httpx

from app.ports.video_search_port import VideoSearchPort


class YouTubeAdapter(VideoSearchPort):
    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("YOUTUBE_API_KEY is required")
        self.api_key = api_key

    async def find_video(self, topic: str) -> dict:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(
                    "https://www.googleapis.com/youtube/v3/search",
                    params={
                        "part": "snippet",
                        "q": topic,
                        "type": "video",
                        "maxResults": 3,
                        "safeSearch": "strict",
                        "key": self.api_key,
                    },
                )
                response.raise_for_status()
                data = response.json()
        except Exception:
            # Keep the call usable if YouTube API is down / quota exhausted.
            return {
                "title": f"{topic} — search on YouTube",
                "url": f"https://www.youtube.com/results?search_query={topic.replace(' ', '+')}",
                "timestamp": "0:00",
                "description": "Open this search to pick a video.",
                "video_id": "",
            }

        items = data.get("items") or []
        if not items:
            return {
                "title": f"{topic} (no video found)",
                "url": f"https://www.youtube.com/results?search_query={topic.replace(' ', '+')}",
                "timestamp": "0:00",
                "description": "",
                "video_id": "",
            }

        item = items[0]
        video_id = item["id"]["videoId"]
        snippet = item.get("snippet", {})
        return {
            "title": snippet.get("title", topic),
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "timestamp": "0:00",
            "description": snippet.get("description", ""),
            "video_id": video_id,
        }
