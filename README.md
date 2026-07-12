# Tele-Exit

**AI study coach for Ethiopian university exit-exam preparation.**

Tele-Exit turns a fragmented, high-stakes study problem into a focused one-on-one practice experience: students work through real previous-year exam questions with an AI coach that can tutor, search the web, find videos, remember weak topics, and schedule follow-up study sessions — all inside a responsive web app.

| | |
|---|---|
| **Role automated** | Exit-exam study coach / tutor |
| **Industry** | Higher education (Ethiopia) |
| **Stack** | FastAPI (Python) · TanStack Start / React · SQLite · Gemini · Tavily · YouTube · Gmail SMTP |
| **Status** | Demo-ready |

### Live demo

| Surface | URL |
|---------|-----|
| **Frontend** (Vercel) | https://tele-exit.vercel.app/ |
| **Backend API docs** (Swagger) | https://heavenonearth7-tele-exit-backend.hf.space/docs |
| **Backend health** | https://heavenonearth7-tele-exit-backend.hf.space/health |
| **Backend Space** | https://huggingface.co/spaces/Heavenonearth7/tele-exit-backend |

---

## Why Tele-Exit

Final-year students preparing for national exit exams often face:

- Large question banks with little personal tutoring
- Weak topics that go unnoticed until exam day
- No structured follow-up after a practice session

Tele-Exit automates the **study-coach role**: live coaching on real exam items, progress memory, web/video research when needed, and calendar study suggestions the student can accept.

---

## Features

### For students
- **Field-aware exams** — at registration, students choose their department (e.g. Computer Science). They only see exams for that field.
- **Practice & exam modes** — practice with AI help; exam mode for timed self-assessment.
- **Live study call** — browser speech + coach voice; shared question screen.
- **Multi-agent coaching** in one session:
  - **Curriculum** — grounded answers from the uploaded exam bank
  - **Memory** — readiness, weak topics, session history
  - **Search** — live web research (Tavily)
  - **YouTube** — relevant study clips on the shared screen
  - **Planner** — suggested study blocks (student **Accepts** on Calendar)
- **Calendar + real invites** — Accept emails a `.ics` calendar invite (Gmail SMTP).
- **Progress & session wrap-up** — readiness ring, topic scores, post-call recap.
- **Settings** — coach avatar, voice, captions, report frequency.
- **Password reset** via email.

### For admins
- Upload exam packs (JSON/CSV) tagged by `field_of_study`
- Manage users / invite admins
- Question corpus powers the Curriculum agent for every matching student

### Home support chatbot
- Product Q&A grounded in site + product docs (optional web supplement)

---

## Architecture (high level)

```
┌─────────────────┐     JWT      ┌──────────────────────────────┐
│  React / TanStack│ ──────────► │  FastAPI (hexagonal)         │
│  Start frontend  │  /api proxy │  routes → domain → ports     │
└─────────────────┘              │         ↓                    │
                                 │  adapters: Gemini, Tavily,   │
                                 │  YouTube, SMTP, SQLite,      │
                                 │  Google Calendar, LiveKit    │
                                 └──────────────────────────────┘
```

- **Domain** owns agents, practice coach, wrap-up, ICS invites.
- **Ports** isolate LLM, search, video, email, calendar, repository.
- **Adapters** swap fakes ↔ real providers via `USE_FAKES`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detail.

---

## Quick start

### Prerequisites
- Python 3.11+
- Node.js 20+
- Gemini API key ([Google AI Studio](https://ai.google.dev))
- Optional for full demo: Tavily, YouTube Data API, Gmail App Password

### 1. Backend

```bash
cd backend
python3 -m venv ../.venv
source ../.venv/bin/activate   # Windows: ..\.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — set JWT_SECRET, USE_FAKES=false, GEMINI_API_KEY, SMTP_*, ADMIN_BOOTSTRAP_*
uvicorn app.main:app --reload --port 8000
```

Health: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL=http://127.0.0.1:8000
npm run dev
```

App: [http://localhost:3000](http://localhost:3000)

### 3. First admin & exam
1. Set `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` in `backend/.env`, restart backend.
2. Log in as admin → **Questions / Exams** → upload a pack with `field_of_study` (see `backend/docs/sample_exam_computer_science.json`).
3. Register a student with the **same field** → open that exam → **Start study call**.

---

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, agents, data flow |
| [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md) | Step-by-step demo script |
| [docs/API.md](docs/API.md) | Endpoint reference |
| [docs/ASSIGNMENT.md](docs/ASSIGNMENT.md) | How Tele-Exit maps to the AI Automation assignment |
| [backend/README.md](backend/README.md) | Backend setup, tests, env |
| [frontend/README.md](frontend/README.md) | Frontend setup & routes |
| [docs/.specs/Tele-Exit-Backend-Spec-v3 .md](docs/.specs/Tele-Exit-Backend-Spec-v3%20.md) | Full backend specification v3 |

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | TanStack Start, React, Vite, Tailwind |
| Backend | FastAPI, Pydantic, Passlib/JWT |
| Data | SQLite (users, exams, profiles, calendar, embeddings as JSON vectors) |
| AI | Google Gemini (LLM + embeddings) |
| Web search | Tavily |
| Video | YouTube Data API |
| Email | Gmail SMTP + App Password (`.ics` invites & reports) |
| Calendar | Suggested in-app → Accept → SMTP invite (± Google Calendar API) |
| Video rooms | LiveKit (optional) |

---

## Multi-agent study call (one session)

| You say | Agent | Result |
|---------|--------|--------|
| “Give me a hint” | Curriculum | Bank-grounded coaching |
| “How am I doing?” | Memory | Weak topics / readiness |
| “Search the web for …” | Search | Live web summary |
| “Show me a YouTube video” | YouTube | Clip on shared screen |
| “Schedule me for tomorrow” | Planner | Calendar **suggestion** |

Then open **Calendar** → **Accept** → real invite email.

---

## Tests

```bash
source .venv/bin/activate
cd backend
pytest -q
```

---

## Project layout

```
Tele-Exit/
├── README.md                 ← you are here
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEMO_GUIDE.md
│   ├── API.md
│   ├── ASSIGNMENT.md
│   └── .specs/               ← Backend Spec v3
├── backend/
│   ├── app/                  ← FastAPI app (domain, ports, adapters, routes)
│   ├── db/schema.sql
│   ├── docs/                 ← product copy + sample exam
│   ├── tests/
│   └── .env.example
└── frontend/
    ├── src/routes/           ← pages (dashboard, exams, call, calendar, …)
    ├── src/lib/              ← API client, speech, auth
    └── .env.example
```

---

## License & authorship

Built for the Full Stack AI Automation assignment.  
Designer / engineer: **Dagmawi Teferi**.

---

## Support

- Backend health & adapter flags: `GET /health`
- Product chatbot on the landing page (site-scoped)
- Spec questions: see `docs/.specs/`
