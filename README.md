# Tele-Exit

### AI exit-exam study coach for Ethiopian university students

Tele-Exit is a full-stack AI automation product that replaces fragmented exam prep with a **one-on-one live study call**. Students practice real previous-year exit exam questions with a multi-agent coach that tutors, searches the web, finds videos, remembers weak topics, and schedules follow-up sessions — then delivers calendar invites by email.

| | |
|---|---|
| **Role automated** | Exit-exam study coach / tutor |
| **Industry** | Higher education (Ethiopia) |
| **Frontend** | TanStack Start · React · Vite · Tailwind |
| **Backend** | FastAPI · hexagonal architecture · SQLite |
| **AI & tools** | Gemini · Tavily · YouTube · Gmail SMTP |
| **Status** | Demo-ready |

---

## Live demo

| Surface | URL |
|---------|-----|
| **Demo video** | [Watch on Google Drive](https://drive.google.com/file/d/1DPe5VJwmOw3D7YBCDjs0hBf8bFsUuxpI/view?usp=sharing) |
| **Web app** | [https://tele-exit.vercel.app/](https://tele-exit.vercel.app/) |
| **API Swagger** | [https://heavenonearth7-tele-exit-backend.hf.space/docs](https://heavenonearth7-tele-exit-backend.hf.space/docs) |
| **API health** | [https://heavenonearth7-tele-exit-backend.hf.space/health](https://heavenonearth7-tele-exit-backend.hf.space/health) |
| **Backend Space** | [Heavenonearth7/tele-exit-backend](https://huggingface.co/spaces/Heavenonearth7/tele-exit-backend) |

> **Important for demos:** students only see exams for their registered **field of study**. Upload as admin with e.g. `Computer Science`, then log in as a student registered for **Computer Science** (not Software Engineering).

---

## Why it exists

Final-year students preparing for national exit exams often face large question banks, little personal tutoring, and weak topics that stay invisible until exam day. Tele-Exit automates the **study-coach role**: live coaching on real items, progress memory, research when needed, and calendar follow-ups the student can accept.

---

## What you can demo

### Students
- Field-filtered exam library (department-scoped banks)
- Practice mode with AI help · exam mode for self-assessment
- **Live study call** — browser speech in, coach voice out, shared question screen
- Multi-agent coaching in one turn:
  - **Curriculum** — grounded in the uploaded bank
  - **Memory** — readiness & weak topics
  - **Search** — live web research (Tavily)
  - **YouTube** — clips on the shared screen
  - **Planner** — calendar **suggestions** (student Accepts)
- Calendar Accept → real **`.ics` email invite** (Gmail SMTP)
- Progress, session wrap-up, coach voice/avatar settings
- Password reset by email

### Admins
- Upload JSON exam packs tagged by `field_of_study`
- Browse exams, topics, and questions
- Manage users / invite admins

### Landing
- Product support chatbot grounded in site + product docs

---

## Architecture

```
┌──────────────────────┐   JWT    ┌─────────────────────────────────┐
│  Vercel frontend     │ ───────► │  Hugging Face Space (FastAPI)   │
│  TanStack Start      │          │  routes → domain → ports        │
│  tele-exit.vercel.app│          │         ↓                       │
└──────────────────────┘          │  Gemini · Tavily · YouTube      │
                                  │  SMTP · SQLite · (optional GCal)│
                                  └─────────────────────────────────┘
```

Hexagonal layout: **domain** (agents, coach, wrap-up, ICS) · **ports** · **adapters** (real or fakes via `USE_FAKES`).

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 5-minute demo script

1. Open [tele-exit.vercel.app](https://tele-exit.vercel.app/) → register a **Computer Science** student (or use an existing CS account).
2. As **admin**, open **Exams** → confirm packs show **Computer Science** (re-upload if the Space restarted — SQLite on free HF can reset).
3. As the CS student → **Exams** → open a pack → **Practice** → **Start study call**.
4. Speak or type: ask for a hint, “How am I doing?”, “Search the web for …”, or “Schedule me for tomorrow.”
5. **Calendar** → **Accept** a suggestion → check email for the `.ics` invite.
6. Optional: show [Swagger](https://heavenonearth7-tele-exit-backend.hf.space/docs) and [ARCHITECTURE](docs/ARCHITECTURE.md).

Full script: [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md)

---

## Local development

### Prerequisites
- Python 3.11+
- Node.js 20+
- Gemini API key ([Google AI Studio](https://ai.google.dev))
- Optional: Tavily, YouTube Data API, Gmail App Password

### Backend

```bash
cd backend
python3 -m venv ../.venv
source ../.venv/bin/activate   # Windows: ..\.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Set JWT_SECRET, USE_FAKES=false, GEMINI_API_KEY, SMTP_*, ADMIN_BOOTSTRAP_*
uvicorn app.main:app --reload --port 8000
```

Health: http://127.0.0.1:8000/health · Docs: http://127.0.0.1:8000/docs

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Local API:  VITE_API_URL=http://127.0.0.1:8000
# Live API:   VITE_API_URL=https://heavenonearth7-tele-exit-backend.hf.space
npm run dev
```

App: http://localhost:3000

### First admin & exam
1. Set `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` → restart backend.
2. Admin → **Exams** → upload JSON with matching `field_of_study` (sample: `backend/docs/sample_exam_computer_science.json`).
3. Register a student with the **same field** → open exam → start study call.

---

## Deployment

| Piece | Host | Notes |
|-------|------|--------|
| Frontend | [Vercel](https://tele-exit.vercel.app/) | Set `VITE_API_URL` to the Space API base |
| Backend | [Hugging Face Space](https://huggingface.co/spaces/Heavenonearth7/tele-exit-backend) | Gradio/ZeroGPU shell serving FastAPI; secrets in Space Settings |
| Redeploy backend | `./scripts/deploy_hf_space.sh` | Needs `HF_TOKEN` with write access |

Space secrets (minimum): `JWT_SECRET`, `USE_FAKES=false`, `GEMINI_API_KEY`, SMTP_*, `ADMIN_BOOTSTRAP_*`, `CORS_ORIGINS` (include `https://tele-exit.vercel.app`), `FRONTEND_URL`.

---

## Multi-agent study call

| You say | Agent | Result |
|---------|--------|--------|
| “Give me a hint” | Curriculum | Bank-grounded coaching |
| “How am I doing?” | Memory | Weak topics / readiness |
| “Search the web for …” | Search | Live web summary |
| “Show me a YouTube video” | YouTube | Clip on shared screen |
| “Schedule me for tomorrow” | Planner | Calendar **suggestion** |

Then **Calendar → Accept** → real invite email.

---

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, agents, data flow |
| [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md) | Step-by-step demo script |
| [docs/API.md](docs/API.md) | Endpoint reference |
| [docs/ASSIGNMENT.md](docs/ASSIGNMENT.md) | Assignment mapping |
| [backend/README.md](backend/README.md) | Backend setup & tests |
| [frontend/README.md](frontend/README.md) | Frontend setup & routes |

---

## Tests

```bash
source .venv/bin/activate
cd backend
pytest -q
```

---

## Repository layout

```
Tele-Exit/
├── README.md
├── docs/                 # Architecture, demo, API, assignment
├── scripts/              # HF Space deploy helper
├── backend/
│   ├── app/              # FastAPI (domain, ports, adapters, routes)
│   ├── app_hf.py         # Hugging Face Space entry
│   ├── Dockerfile        # Optional Docker / PRO path
│   ├── db/schema.sql
│   ├── docs/             # Product copy + sample exam
│   └── tests/
└── frontend/
    ├── src/routes/       # Dashboard, exams, call, calendar, admin…
    └── src/lib/          # API client, speech, auth
```

---

## Author

Built for the Full Stack AI Automation assignment.  
**Dagmawi Teferi**
