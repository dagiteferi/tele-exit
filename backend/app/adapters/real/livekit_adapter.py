from __future__ import annotations

import hmac
import hashlib
import json
import time
from base64 import urlsafe_b64encode

from app.ports.video_session_port import VideoSessionPort


class LiveKitAdapter(VideoSessionPort):
    def __init__(
        self,
        url: str = "",
        api_key: str = "",
        api_secret: str = "",
    ) -> None:
        self.url = url
        self.api_key = api_key or "devkey"
        self.api_secret = api_secret or "secret"

    async def create_room(self, student_id: str) -> dict:
        room_name = f"tele-exit-{student_id[:8]}"
        if not self.url:
            return {
                "room_name": room_name,
                "access_token": f"dev-livekit-token-{student_id}",
            }
        token = _mint_jwt(
            api_key=self.api_key,
            api_secret=self.api_secret,
            identity=student_id,
            room=room_name,
        )
        return {
            "room_name": room_name,
            "access_token": token,
            "url": self.url,
        }


def _mint_jwt(api_key: str, api_secret: str, identity: str, room: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "iss": api_key,
        "sub": identity,
        "nbf": now,
        "exp": now + 60 * 60,
        "video": {
            "roomJoin": True,
            "room": room,
            "canPublish": True,
            "canSubscribe": True,
        },
    }
    segments = [
        _b64(json.dumps(header, separators=(",", ":")).encode("utf-8")),
        _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
    ]
    signing_input = ".".join(segments).encode("utf-8")
    signature = hmac.new(
        api_secret.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    segments.append(_b64(signature))
    return ".".join(segments)


def _b64(raw: bytes) -> str:
    return urlsafe_b64encode(raw).rstrip(b"=").decode("utf-8")
