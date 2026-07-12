# Demo Guide

Use this script for a live presentation or recorded submission video. Total runtime: **8–12 minutes**.

## Before you present

| Check | Action |
|-------|--------|
| Backend | `uvicorn app.main:app --reload --port 8000` |
| Frontend | `npm run dev` → http://localhost:3000 |
| Health | `GET /health` → `use_fakes: false`, `smtp_configured: true`, `gemini_configured: true` |
| Browser | **Chrome or Edge** (speech works best) |
| Accounts | Student with matching `field_of_study`; admin for upload if needed |
| Mic | Allow microphone when prompted |
| SMTP | Gmail App Password set; student email can receive mail |

Keep `backend/.env` with `USE_FAKES=false` and real keys.

---

## Narrative (30 seconds)

> “Tele-Exit is an AI study coach for Ethiopian exit exams. Students practice real previous-year questions in a live call. The coach tutors from the bank, can search the web, find YouTube clips, remember weak topics, and schedule follow-ups — which the student accepts onto their calendar with a real email invite.”

---

## Scene 1 — Product & auth (1 min)

1. Open `/` — landing + optional support chatbot (“How do study calls work?”).
2. Log in as student (field = e.g. Computer Science).
3. Show **Dashboard** readiness ring.

---

## Scene 2 — Field-filtered exams (1 min)

1. Open **Exams** — only CS (or chosen field) packs appear.
2. Open one exam → **Practice** mode.
3. Mention: *Admin uploaded this bank; Software Engineering students see different packs.*

---

## Scene 3 — Live study call + five agents (5–6 min)

Click **Start study call**. Unmute when ready. Say clearly:

| # | Line | Agent | Show |
|---|------|--------|------|
| 1 | “Give me a hint on this question.” | Curriculum | Spoken coaching on the shared question |
| 2 | “How am I doing?” | Memory | Weak topics / readiness |
| 3 | “Search the web for abstract classes in Java.” | Search | Web-backed explanation |
| 4 | “Show me a YouTube video about this.” | YouTube | Video on shared screen |
| 5 | “Schedule me for tomorrow.” | Planner | Banner: suggestion created |

Emphasize: **all agents in one session**, not separate apps.

**End call** → brief wrap-up / session recap if shown.

---

## Scene 4 — Calendar Accept (real action) (2 min)

1. Open **Calendar**.
2. Find the pending suggestion (status not yet Accepted).
3. Click **Accept**.
4. Show UI confirmation (invite emailed).
5. Open Gmail (student inbox) → `.ics` invite → “Add to Calendar”.

This proves **meaningful automation**: schedule → human confirm → real outbound email.

---

## Scene 5 — Admin (optional, 1 min)

1. Log in as admin.
2. Show exam/question upload with `field_of_study`.
3. Note: students cannot upload; corpus is platform-managed.

---

## Scene 6 — Code walkthrough (2–3 min)

**Backend**
- `app/domain/agents/` — specialists  
- `app/domain/voice_call.py` — live-call routing  
- `app/core/di.py` — real vs fake adapters  
- `app/routes/student_routes.py` — Accept + SMTP ICS  

**Frontend**
- `src/routes/call.tsx` — study call UI  
- `src/routes/calendar.tsx` — Accept  
- `src/lib/api.ts` — typed API client  

---

## Fallback if something fails

| Issue | Fallback |
|-------|----------|
| Speech recognition quiet | Type is not available on call — speak louder / Chrome |
| YouTube empty | Skip to Search; mention API quota |
| SMTP fail | Show Calendar suggestion still created; explain Accept needs SMTP |
| Wrong field / no exams | Switch student or upload matching field as admin |

---

## Assignment video outline

1. Problem & role (study coach, education)  
2. Solution design (multi-agent + field isolation)  
3. Live demo (Scenes 1–4)  
4. Code walkthrough (Scene 6)  
5. APIs used (Gemini, Tavily, YouTube, SMTP)  

Submit with source code + docs (`README`, `docs/*`, Backend Spec).
