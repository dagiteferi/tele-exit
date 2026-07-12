# Tele-Exit Frontend

Responsive web client for Tele-Exit: student study flows, live study call, calendar Accept, and admin exam management.

Built with **TanStack Start**, **React**, **Vite**, and **Tailwind CSS**.

**Live app:** https://tele-exit.vercel.app/  
**API Swagger:** https://heavenonearth7-tele-exit-backend.hf.space/docs

## Run locally

```bash
cd frontend
npm install
cp .env.example .env
# VITE_API_URL=http://127.0.0.1:8000
npm run dev
```

App: http://localhost:3000  

Vite proxies `/api` → `http://127.0.0.1:8000` when using same-origin fetch; `VITE_API_URL` points the client at the backend directly.

## Environment

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend base URL (no trailing slash), e.g. `http://127.0.0.1:8000` |

## Main routes

| Path | Audience | Purpose |
|------|----------|---------|
| `/` | Public | Landing, about, support chatbot |
| `/login`, `/register` | Public | Auth + field/exam-date onboarding |
| `/forgot-password`, `/reset-password` | Public | Email reset flow |
| `/dashboard` | Student | Readiness & shortcuts |
| `/exams`, `/exams/$examId` | Student | Field-filtered practice / exam |
| `/call` | Student | Live AI study call |
| `/calendar` | Student | Suggestions + Accept |
| `/progress` | Student | Topic accuracy |
| `/session-recap` | Student | Post-call summary |
| `/settings` | Student | Coach voice/avatar, reports |
| `/admin/users`, `/admin/questions` | Admin | Users & uploads |

## Key libraries (`src/lib`)

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

## More docs

- [../README.md](../README.md)
- [../docs/DEMO_GUIDE.md](../docs/DEMO_GUIDE.md)
- [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
