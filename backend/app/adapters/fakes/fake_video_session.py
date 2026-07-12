from app.ports.video_session_port import VideoSessionPort


class FakeVideoSession(VideoSessionPort):
    async def create_room(self, student_id: str) -> dict:
        return {
            "room_name": f"tele-exit-{student_id[:8]}",
            "access_token": f"fake-livekit-token-{student_id}",
        }
