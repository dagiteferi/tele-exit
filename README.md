# Tele-Exit

<p align="center">
  <img src="frontend/public/logo.svg" alt="Tele-Exit logo" width="72" height="72" />
</p>

<p align="center">
  <strong>AI exit-exam study coach for Ethiopian university students</strong>
</p>

<p align="center">
  Practice real previous-year exit exams in a live one-on-one call with a multi-agent AI coach —
  tutoring, web search, YouTube, memory, and calendar invites included.
</p>

<p align="center">
  <a href="https://tele-exit.vercel.app/"><img src="https://img.shields.io/badge/Live_Demo-Vercel-black?style=for-the-badge&logo=vercel" alt="Live Demo" /></a>
  <a href="https://drive.google.com/file/d/1DPe5VJwmOw3D7YBCDjs0hBf8bFsUuxpI/view?usp=sharing"><img src="https://img.shields.io/badge/Watch-Demo_Video-red?style=for-the-badge&logo=google-drive" alt="Demo Video" /></a>
  <a href="https://heavenonearth7-tele-exit-backend.hf.space/docs"><img src="https://img.shields.io/badge/API-Swagger-009688?style=for-the-badge&logo=fastapi" alt="API Docs" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TanStack_Start-FF4154?logo=reactquery&logoColor=white" alt="TanStack" />
  <img src="https://img.shields.io/badge/Gemini-AI-4285F4?logo=google&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License" />
</p>

---

## Table of contents

- [About](#about)
- [Demo](#demo)
- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Usage](#usage)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)
- [Authors](#authors)

---

## About

Tele-Exit automates the **exit-exam study coach** role for higher education in Ethiopia.

Students work through department-scoped previous-year questions with an AI partner that can:

- tutor from the uploaded exam bank
- recall weak topics and readiness
- search the live web
- surface YouTube study clips
- suggest calendar study blocks
- email a real `.ics` invite when the student Accepts

Built as a full-stack AI automation project (FastAPI + TanStack Start) with a hexagonal backend and multi-agent orchestration.

---

## Demo

| Resource | Link |
|----------|------|
| **Web app** | https://tele-exit.vercel.app/ |
| **Demo video** | [Tele-Exit-demo.mp4](https://drive.google.com/file/d/1DPe5VJwmOw3D7YBCDjs0hBf8bFsUuxpI/view?usp=sharing) |
| **API docs (Swagger)** | https://heavenonearth7-tele-exit-backend.hf.space/docs |
| **API health** | https://heavenonearth7-tele-exit-backend.hf.space/health |
| **Backend Space** | https://huggingface.co/spaces/Heavenonearth7/tele-exit-backend |

> **Field matching:** students only see exams for their registered `field_of_study`.  
> Upload as **Computer Science** → log in as a **Computer Science** student.

---

## Features

### Students
- Field-filtered exam library
- Practice & exam modes
- Live study call (speech in / coach voice out)
- Multi-agent coaching (Curriculum, Memory, Search, YouTube, Planner)
- Calendar suggestions + SMTP `.ics` invites
- Progress, session wrap-up, coach preferences
- Password reset via email

### Admins
- JSON exam bank upload scoped by department
- Exam / topic / question browser
- User management

### Product
- Landing-page support chatbot grounded in product docs

---

## Architecture

```text
┌─────────────────────┐     JWT      ┌──────────────────────────────┐
│  Frontend (Vercel)  │ ───────────► │  Backend (Hugging Face)      │
│  TanStack Start     │              │  FastAPI · hexagonal         │
│  React · Vite       │              │  domain → ports → adapters   │
└─────────────────────┘              │  Gemini · Tavily · YouTube   │
                                     │  SMTP · SQLite               │
                                     └──────────────────────────────┘
```

- **Domain** — agents, practice coach, wrap-up, ICS invites  
- **Ports** — LLM, search, video, email, calendar, repository  
- **Adapters** — real providers or fakes via `USE_FAKES`

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

### Multi-agent study call

| You say | Agent | Result |
|---------|--------|--------|
| “Give me a hint” | Curriculum | Bank-grounded coaching |
| “How am I doing?” | Memory | Weak topics / readiness |
| “Search the web for …” | Search | Live web summary |
| “Show me a YouTube video” | YouTube | Clip on shared screen |
| “Schedule me for tomorrow” | Planner | Calendar suggestion |

Then open **Calendar → Accept** for a real invite email.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | TanStack Start, React 19, Vite, Tailwind CSS |
| Backend | FastAPI, Pydantic, Passlib / JWT |
| Data | SQLite |
| AI | Google Gemini (LLM + embeddings) |
| Tools | Tavily, YouTube Data API, Gmail SMTP |
| Optional | Google Calendar API, LiveKit |

---

## Getting started

### Prerequisites

- Python **3.11+**
- Node.js **20+**
- [Gemini API key](https://ai.google.dev)
- Optional: Tavily, YouTube Data API, Gmail App Password

### 1. Clone

```bash
git clone https://github.com/dagiteferi/tele-exit.git
cd tele-exit
```

### 2. Backend

```bash
cd backend
python3 -m venv ../.venv
source ../.venv/bin/activate          # Windows: ..\.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — JWT_SECRET, USE_FAKES=false, GEMINI_API_KEY, SMTP_*, ADMIN_BOOTSTRAP_*
uvicorn app.main:app --reload --port 8000
```

- Health: http://127.0.0.1:8000/health  
- Swagger: http://127.0.0.1:8000/docs  

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
# VITE_API_URL=http://127.0.0.1:8000
npm run dev
```

- App: http://localhost:3000  

### 4. Seed an exam

1. Set `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` and restart the backend.  
2. Log in as admin → **Exams** → upload a JSON pack (sample: `backend/docs/sample_exam_computer_science.json`).  
3. Register a student with the **same** `field_of_study`.  
4. Open the exam → **Start study call**.

---

## Usage

Quick path on the live app:

1. Register as **Computer Science** (or match your uploaded field).  
2. Open **Exams** → Practice → **Start study call**.  
3. Ask for a hint, progress check, web search, video, or schedule.  
4. **Calendar → Accept** → check email for `.ics`.

Full walkthrough: [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md)

---

## Configuration

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Token signing secret |
| `USE_FAKES` | `false` for real Gemini / Tavily / YouTube / SMTP |
| `GEMINI_API_KEY` | Google AI Studio key |
| `TAVILY_API_KEY` | Optional web search |
| `YOUTUBE_API_KEY` | Optional video search |
| `SMTP_*` | Gmail App Password for invites / reports |
| `ADMIN_BOOTSTRAP_*` | First admin account |
| `CORS_ORIGINS` | Comma-separated frontend origins |
| `FRONTEND_URL` | Password-reset / link base URL |
| `DB_PATH` | SQLite path |

See `backend/.env.example`.

### Frontend (`frontend/.env`)

```bash
VITE_API_URL=http://127.0.0.1:8000
# Production example:
# VITE_API_URL=https://heavenonearth7-tele-exit-backend.hf.space
```

---

## Deployment

| Component | Host | URL |
|-----------|------|-----|
| Frontend | Vercel | https://tele-exit.vercel.app/ |
| Backend | Hugging Face Space | https://huggingface.co/spaces/Heavenonearth7/tele-exit-backend |

Redeploy backend (requires write `HF_TOKEN`):

```bash
export HF_TOKEN=hf_xxx
./scripts/deploy_hf_space.sh
```

Set Space secrets for JWT, Gemini, SMTP, admin bootstrap, `CORS_ORIGINS` (include `https://tele-exit.vercel.app`), and `FRONTEND_URL`.

> Free HF Spaces may reset `/tmp` SQLite on restart — re-upload exam packs before a live demo if needed.

---

## Project structure

```text
tele-exit/
├── README.md
├── docs/                      # Architecture, API, demo, assignment
├── scripts/                   # HF deploy helper
├── backend/
│   ├── app/                   # FastAPI app (domain, ports, adapters, routes)
│   ├── app_hf.py              # Hugging Face Space entry
│   ├── Dockerfile
│   ├── db/schema.sql
│   ├── docs/                  # Product copy + sample exam
│   └── tests/
└── frontend/
    ├── src/routes/            # Pages (dashboard, exams, call, calendar, admin)
    ├── src/lib/               # API client, auth, speech
    └── public/
```

---

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design & agents |
| [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md) | Live / video demo script |
| [docs/API.md](docs/API.md) | HTTP & WebSocket reference |
| [docs/ASSIGNMENT.md](docs/ASSIGNMENT.md) | Assignment mapping |
| [docs/README.md](docs/README.md) | Docs index |
| [backend/README.md](backend/README.md) | Backend setup |
| [frontend/README.md](frontend/README.md) | Frontend setup |

---

## Testing

```bash
source .venv/bin/activate
cd backend
pytest -q
```

---

## Contributing

Contributions are welcome.

1. Fork the repo  
2. Create a feature branch (`git checkout -b feature/my-change`)  
3. Commit with a clear message  
4. Open a pull request  

Please keep secrets out of git (`.env`, credentials). Use `.env.example` as the template.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Authors

**Dagmawi Teferi** — design & engineering  

Built for the Full Stack AI Automation assignment.

---

<p align="center">
  <a href="https://tele-exit.vercel.app/">Live app</a> ·
  <a href="https://drive.google.com/file/d/1DPe5VJwmOw3D7YBCDjs0hBf8bFsUuxpI/view?usp=sharing">Demo video</a> ·
  <a href="https://heavenonearth7-tele-exit-backend.hf.space/docs">API docs</a>
</p>
