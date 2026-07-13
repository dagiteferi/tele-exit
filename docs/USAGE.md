# User guide

End-to-end walkthrough for running and using Tele-Exit — locally or on the live deployment.

| | |
|---|---|
| **Live app** | https://tele-exit.vercel.app/ |
| **API docs** | https://heavenonearth7-tele-exit-backend.hf.space/docs |
| **Walkthrough video** | [Tele-Exit-demo.mp4](https://drive.google.com/file/d/1DPe5VJwmOw3D7YBCDjs0hBf8bFsUuxpI/view?usp=sharing) |

---

## Prerequisites

| Check | Notes |
|-------|--------|
| Backend | `USE_FAKES=false`, Gemini (+ optional Tavily / YouTube / SMTP) |
| Frontend | `VITE_API_URL` points at your API |
| Browser | Chrome or Edge recommended for speech |
| Accounts | Student `field_of_study` must match uploaded exam field |
| Mic | Allow microphone when prompted for study call |

---

## 1. Auth & dashboard

1. Open `/` — landing page and optional support chatbot.
2. Register or log in as a student (pick a field, e.g. **Computer Science**).
3. Open **Dashboard** for readiness and shortcuts.

---

## 2. Field-filtered exams

1. Open **Exams** — only packs for your department appear.
2. Open an exam → **Practice** or **Exam** mode.
3. Admins upload banks tagged with `field_of_study`; other fields never mix.

> If you see “No exams for your department,” either upload for that field as admin or use a student account with a matching field.

---

## 3. Live study call

From practice mode, click **Start study call**. Speak or use the coach flow:

| Try saying | Agent | What you should see |
|------------|--------|---------------------|
| “Give me a hint on this question.” | Curriculum | Coaching grounded in the bank |
| “How am I doing?” | Memory | Weak topics / readiness |
| “Search the web for …” | Search | Web-backed explanation |
| “Show me a YouTube video about this.” | YouTube | Clip on the shared screen |
| “Schedule me for tomorrow.” | Planner | Calendar suggestion created |

End the call to reach wrap-up / session recap when available.

---

## 4. Calendar Accept

1. Open **Calendar**.
2. Find a **suggested** session.
3. Click **Accept**.
4. Check email for an `.ics` invite and add it to your calendar.

Accept requires working SMTP (or Google Calendar credentials). The suggestion is still stored if delivery fails — fix SMTP and retry.

---

## 5. Admin: upload an exam bank

1. Log in as admin.
2. Open **Exams** → upload a JSON pack.
3. Set **Field / department** to match student registration (e.g. Computer Science).
4. Sample file: `backend/docs/sample_exam_computer_science.json`.

Students cannot upload; the corpus is platform-managed.

---

## 6. Code map (for contributors)

**Backend**

- `app/domain/agents/` — specialists  
- `app/domain/voice_call.py` — live-call routing  
- `app/core/di.py` — real vs fake adapters  
- `app/routes/student_routes.py` — Accept + SMTP ICS  

**Frontend**

- `src/routes/call.tsx` — study call UI  
- `src/routes/calendar.tsx` — Accept  
- `src/lib/api.ts` — typed API client  

See also [CONTRIBUTING.md](CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| No exams listed | Field mismatch — align student field and admin upload |
| Speech not working | Use Chrome/Edge; check mic permission |
| YouTube empty | API quota / key; Search agent still works |
| Accept returns 503 | Configure `SMTP_*` (or Google credentials) |
| Empty library on Hugging Face | Free Space SQLite under `/tmp` can reset — re-upload packs |

---

## Related

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [API.md](API.md)
- [../README.md](../README.md)
