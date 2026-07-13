# Tele-Exit Backend

FastAPI service for Tele-Exit: auth, admin ingestion, field-filtered exams, multi-agent study coaching, calendar invites, and reports.

<p>
  <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License" />
</p>

| | |
|---|---|
| **Live Swagger** | https://heavenonearth7-tele-exit-backend.hf.space/docs |
| **Live health** | https://heavenonearth7-tele-exit-backend.hf.space/health |
| **HF Space** | https://huggingface.co/spaces/Heavenonearth7/tele-exit-backend |
| **Walkthrough video** | [Tele-Exit-demo.mp4](https://drive.google.com/file/d/1DPe5VJwmOw3D7YBCDjs0hBf8bFsUuxpI/view?usp=sharing) |

## Features

- JWT auth (students + admins)
- Exam bank upload scoped by `field_of_study`
- Multi-agent study call (Curriculum, Memory, Search, YouTube, Planner)
- Calendar suggestions + SMTP `.ics` delivery
- Hexagonal architecture (domain / ports / adapters)

## Quick start

```bash
# from repo root
python3 -m venv .venv
source .venv/bin/activate
cd backend
pip install -r requirements.txt
cp .env.example .env
# configure .env (see below)
uvicorn app.main:app --reload --port 8000
```

| | |
|---|---|
| API | http://127.0.0.1:8000 |
| OpenAPI | http://127.0.0.1:8000/docs |
| Health | http://127.0.0.1:8000/health |

## Configuration

Copy `.env.example` → `.env`:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Sign access tokens |
| `USE_FAKES` | `false` for real Gemini/Tavily/YouTube/SMTP |
| `DB_PATH` | SQLite file (default `./tele_exit.db`) |
| `CORS_ORIGINS` | Frontend origins |
| `GEMINI_API_KEY` | LLM + embeddings |
| `TAVILY_API_KEY` | Web search |
| `YOUTUBE_API_KEY` | Video search |
| `SMTP_*` | Calendar invite + report email |
| `ADMIN_BOOTSTRAP_EMAIL` / `PASSWORD` | Create admin on startup |
| `FRONTEND_URL` | Password-reset links |
| `LIVEKIT_*` | Optional video rooms |
| `GOOGLE_CREDENTIALS_PATH` | Optional Google Calendar API |

Startup log example:

```text
Tele-Exit ready — use_fakes=False smtp=True gemini=True
```

## Package layout

```text
app/
├── auth/           # JWT, bcrypt, student/admin dependencies
├── domain/         # models, agents, voice_call, practice_coach, wrap-up
├── ports/          # interfaces
├── adapters/fakes/ # unit-test doubles
├── adapters/real/  # Gemini, Tavily, YouTube, SMTP, SQLite, LiveKit, …
├── ingestion/      # CSV/JSON parse + embedding pipeline
├── core/           # di, orchestrator, outbox, saga
├── routes/         # HTTP + WebSocket
├── schemas.py
├── config.py
└── main.py
```

## Tests

```bash
cd backend
pytest -q
```

Agent and voice-call coverage lives under `tests/domain/`.

## Sample exam upload

See `docs/sample_exam_computer_science.json`. Upload via admin UI or `POST /admin/exams/upload` with `field_of_study` matching student onboarding.

## Hugging Face deploy

```bash
export HF_TOKEN=hf_xxx
./scripts/deploy_hf_space.sh
```

Entry: `app_hf.py` · optional `Dockerfile` for Docker Spaces (requires HF PRO for free CPU).

## Product copy (support chatbot)

`docs/product/website.md` is indexed for the public support assistant.

## Further reading

- [Architecture](../docs/ARCHITECTURE.md)
- [API reference](../docs/API.md)
- [User guide](../docs/USAGE.md)
- [Contributing](../docs/CONTRIBUTING.md)
- Spec v3: `../docs/.specs/`
