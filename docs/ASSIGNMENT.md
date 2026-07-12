# Assignment Mapping

How **Tele-Exit** satisfies the **AI Automation Assignment – Full Stack AI Web Developer** brief.

## Role & industry

| Assignment ask | Tele-Exit choice |
|----------------|------------------|
| Specific role | **AI exit-exam study coach / tutor** |
| Industry | **Higher education** (Ethiopian university exit exams) |
| Avoid HR / recruiting | ✓ Education domain |

**Why this role:** High-impact, repetitive coaching workflows (hints, progress tracking, research, scheduling) that benefit from multi-agent AI and real outbound actions (email invites).

---

## Step 1 — Research & breakdown

| Coach sub-function | Prioritized? | Product surface |
|--------------------|--------------|-----------------|
| Tutor from past papers | High | Curriculum agent + practice call |
| Track weak topics | High | Memory + progress |
| Clarify with external material | Medium | Search + YouTube |
| Schedule follow-up study | High | Planner + Calendar Accept |
| Progress reporting | Medium | Report email / wrap-up |
| Content administration | High (platform) | Admin upload by field |

---

## Step 2 — Solution design & documentation

| Deliverable | Location |
|-------------|----------|
| Backend implementation spec | `docs/.specs/Tele-Exit-Backend-Spec-v3 .md` |
| Architecture | `docs/ARCHITECTURE.md` |
| API reference | `docs/API.md` |
| Demo script | `docs/DEMO_GUIDE.md` |
| Product overview | Root `README.md`, `backend/docs/product/website.md` |

**Third-party / free-tier integrations**

| API / service | Use |
|---------------|-----|
| Google Gemini (AI Studio) | LLM coaching, intent, embeddings |
| Tavily | Web search for Search agent |
| YouTube Data API | Video recommendations |
| Gmail SMTP (App Password) | Progress reports + calendar `.ics` invites |
| Google Calendar API | Optional live create on Accept |
| LiveKit | Optional study-call room tokens |

---

## Step 3 — Build & implement

| Requirement | Evidence |
|-------------|---------|
| Automate role tasks | Multi-agent study call |
| ≥2 free third-party APIs | Gemini + Tavily + YouTube + SMTP |
| Meaningful actions | Schedule suggestions; Accept → real email invite; reports |
| Full-stack UI + backend | React/TanStack + FastAPI |
| Proactive actions | Planner suggestions + wrap-up recommendations; manual report trigger (cron is stretch) |

**Note on Cloud Scheduler:** Weekly/monthly auto-reports can be added as a GCP Scheduler job calling `POST /students/me/report`. The demo path uses explicit user actions for reliability.

---

## Step 4 — Presentation & submission

| Item | Status |
|------|--------|
| Video: problem → design → UI demo → code walkthrough | [Tele-Exit demo video](https://drive.google.com/file/d/1DPe5VJwmOw3D7YBCDjs0hBf8bFsUuxpI/view?usp=sharing) · script in `docs/DEMO_GUIDE.md` |
| Live app | https://tele-exit.vercel.app/ |
| API docs | https://heavenonearth7-tele-exit-backend.hf.space/docs |
| Source code | This repository |
| Documentation | `README.md` + `docs/*` |
| Send to kidus@brain3.ai | Per assignment instructions |

---

## Evaluation criteria (self-check)

| Criterion | How Tele-Exit speaks to it |
|-----------|----------------------------|
| **Value proposition** | Personalized exit-exam coaching at scale; field-specific banks |
| **Automation effectiveness** | One call: tutor + research + video + memory + schedule |
| **Technical execution** | Hexagonal backend, typed API client, role-based auth, real SMTP delivery |
| **Problem-solving** | Education domain (not recruiter template); Accept-to-email honesty; dual call paths |

---

## Pitfalls avoided

| Pitfall | Tele-Exit |
|---------|-----------|
| Generic FAQ chatbot | Agents act on exam bank, calendar, email |
| Frontend-only polish | Domain agents, ingestion, outbox, JWT auth |
| Paid-only APIs | Gemini free tier + SMTP App Password + free search/video keys |
| HR/recruiter role | Explicitly education / tutoring |
