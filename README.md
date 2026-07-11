# Tele-Exit Backend

Exam-prep tutoring backend (FastAPI + hexagonal architecture).

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Health check: `GET /health`

## Spec alignment

Implements Tele-Exit Backend Spec v3:

- Auth: register / login / me (Student + Admin JWT roles)
- Admin question upload: `POST /questions/upload`
- Student APIs: profile, settings, calendar, session start/end
- WebSocket live call: `WS /ws/call?token=<jwt>`
- Ingestion pipeline + durable SQLite vector store
- Agents + orchestrator (curriculum / search / youtube)
- Outbox dispatcher + report saga
- Fake adapters by default (`USE_FAKES=true`); real adapters when keys are set

## Environment

See `.env.example`. Important:

- `USE_FAKES=true` — local demo without external APIs
- `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` — create admin on startup
- `DB_PATH` — SQLite database file

## Tests

```bash
pytest
```
