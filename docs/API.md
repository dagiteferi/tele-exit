# API reference

Interactive OpenAPI UI:

| Environment | URL |
|-------------|-----|
| Local | http://127.0.0.1:8000/docs |
| Production | https://heavenonearth7-tele-exit-backend.hf.space/docs |

**Base URLs**

| Environment | Base |
|-------------|------|
| Local | `http://127.0.0.1:8000` |
| Production | `https://heavenonearth7-tele-exit-backend.hf.space` |

Local Vite may proxy `/api` → the backend.  
Auth: `Authorization: Bearer <access_token>` unless noted.

---

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Liveness + `use_fakes`, `smtp_configured`, `gemini_configured` |

---

## Auth (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/register` | No | Create student (`email`, `password`, `name`, `field_of_study`, `exam_date`) |
| `POST` | `/auth/login` | No | Returns JWT |
| `POST` | `/auth/token` | No | OAuth2 form login (Swagger) |
| `GET` | `/auth/me` | Yes | Current user + `role` |
| `POST` | `/auth/forgot-password` | No | Email reset link |
| `POST` | `/auth/reset-password` | No | Set new password with token |

---

## Students (`/students/me`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/students/me/profile` | Weak topics, scores, readiness, practice progress |
| `PATCH` | `/students/me/settings` | `report_frequency`: `weekly` \| `monthly` |
| `GET` | `/students/me/calendar` | Suggested & accepted study sessions |
| `POST` | `/students/me/calendar/events/{id}/accept` | Accept suggestion → Calendar attempt + **SMTP `.ics` email** |
| `POST` | `/students/me/session/start` | LiveKit room + opening question |
| `POST` | `/students/me/session/end` | Batch session events → update profile |
| `POST` | `/students/me/session/wrap-up` | Summary + calendar recommendations |
| `POST` | `/students/me/report` | Progress report saga + outbox dispatch |

---

## Exams (`/exams`)

Filtered by the authenticated student’s `field_of_study`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/exams` | List exams for student’s field |
| `GET` | `/exams/{exam_id}` | Exam + questions (`mode=practice\|exam`) |
| `POST` | `/exams/{exam_id}/attempts` | Start attempt |
| `PATCH` | `/exams/attempts/{id}/progress` | Save progress index |
| `POST` | `/exams/attempts/{id}/submit` | Grade & complete |
| `POST` | `/exams/attempts/{id}/chat` | Practice coach; `mode=voice` → multi-agent study call |
| `POST` | `/exams/attempts/{id}/study-call` | Room metadata for call handoff |
| `GET` | `/exams/attempts/mine` | Student’s attempts |

### Voice chat body (study call)

```json
{
  "question_id": "<uuid>",
  "message": "Schedule me for tomorrow",
  "mode": "voice"
}
```

Response may include `reply`, `agent_used`, `video`, `scheduled`.

---

## Admin (`/admin`)

Requires `role=admin`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/users` | List users |
| `POST` | `/admin/invite` | Invite admin |
| `GET` | `/admin/exams` | All exams |
| `GET` | `/admin/exams/{id}` | Exam detail |
| `POST` | `/admin/exams/upload` | Upload exam pack (multipart + `field_of_study`) |
| `GET` | `/admin/questions` | List questions |
| `POST` | `/questions/upload` | Legacy admin ingestion endpoint |

---

## Support (public)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/support/chat` | Product chatbot |
| `POST` | `/support/chat/stream` | SSE streaming replies |
| `POST` | `/support/reindex` | Rebuild product knowledge index |

---

## WebSocket

```text
WS /ws/call?token=<jwt>
```

**Client → server**

```json
{ "type": "user_transcript", "text": "..." }
```

**Server → client** (examples)

```json
{ "type": "action_indicator", "action": "thinking" }
{ "type": "question_card", "question_id": "...", "topic": "...", "text": "..." }
{ "type": "agent_response", "text": "...", "agent_used": "curriculum" }
{ "type": "video_card", "title": "...", "url": "...", "timestamp": "0:00" }
{ "type": "schedule_card", "sessions": [ ... ] }
{ "type": "error", "message": "..." }
```

The primary UI study call uses HTTP voice chat; WebSocket is the Spec v3 live path.

---

## Errors

| Status | Meaning |
|--------|---------|
| `401` | Missing/invalid JWT |
| `403` | Student hitting admin route, or wrong exam field |
| `404` | Exam/attempt/event not found (or not owned) |
| `503` | Calendar Accept could not deliver a real invite (SMTP/Google) |

Full schemas: Backend Spec v3 Appendix A in `docs/.specs/`.
