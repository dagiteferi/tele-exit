# Tele-Exit Frontend

Web client for Tele-Exit: student study flows, live study call, calendar Accept, and admin exam management.

<p>
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TanStack_Start-FF4154?logo=reactquery&logoColor=white" alt="TanStack" />
  <img src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License" />
</p>

Built with **TanStack Start**, **React**, **Vite**, and **Tailwind CSS**.

| | |
|---|---|
| **Live app** | https://tele-exit.vercel.app/ |
| **API Swagger** | https://heavenonearth7-tele-exit-backend.hf.space/docs |
| **Walkthrough video** | [Tele-Exit-demo.mp4](https://drive.google.com/file/d/1DPe5VJwmOw3D7YBCDjs0hBf8bFsUuxpI/view?usp=sharing) |

> Students only see exams for their registered **field of study**. Match the admin upload field to the student department.

## Quick start

```bash
cd frontend
npm install
cp .env.example .env
# VITE_API_URL=http://127.0.0.1:8000
npm run dev
```

App: http://localhost:3000

Vite can proxy `/api` → `http://127.0.0.1:8000`. Prefer `VITE_API_URL` to point the client at the API directly.

## Environment

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend base URL (no trailing slash) |

Examples:

```bash
VITE_API_URL=http://127.0.0.1:8000
# VITE_API_URL=https://heavenonearth7-tele-exit-backend.hf.space
```

## Routes

| Path | Audience | Purpose |
|------|----------|---------|
| `/` | Public | Landing, about, support chatbot |
| `/login`, `/register` | Public | Auth + field / exam-date onboarding |
| `/forgot-password`, `/reset-password` | Public | Email reset flow |
| `/dashboard` | Student | Readiness & shortcuts |
| `/exams`, `/exams/$examId` | Student | Field-filtered practice / exam |
| `/call` | Student | Live AI study call |
| `/calendar` | Student | Suggestions + Accept |
| `/progress` | Student | Topic accuracy |
| `/session-recap` | Student | Post-call summary |
| `/settings` | Student | Coach voice/avatar, reports |
| `/admin/users`, `/admin/questions` | Admin | Users & uploads |

## Libraries (`src/lib`)

| Module | Role |
|--------|------|
| `api.ts` | Typed REST client |
| `auth.ts` / `auth-storage.ts` | Session + JWT |
| `speech.ts` | Coach TTS (Web Speech) |
| `speechListen.ts` | Student STT captions |
| `coachPrefs.ts` | Avatar / voice / caption prefs |

## Study call flow

1. Practice exam → **Start study call**
2. Handoff payload in `sessionStorage` → navigate `/call`
3. Speech → `practiceChat(..., { mode: "voice" })`
4. Agents return reply (+ optional video / scheduled sessions)
5. End call → wrap-up → calendar suggestions

## Scripts

```bash
npm run dev       # development
npm run build     # production bundle
npm run preview   # preview build
npm run lint      # ESLint
```

## Further reading

- [Root README](../README.md)
- [User guide](../docs/USAGE.md)
- [Architecture](../docs/ARCHITECTURE.md)
- [Contributing](../docs/CONTRIBUTING.md)
