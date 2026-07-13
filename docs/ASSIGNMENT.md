# Design rationale

Tele-Exit was originally built for a **Full Stack AI Automation** assignment. This page records the product choices and how they map to that brief. For day-to-day development, prefer [ARCHITECTURE.md](ARCHITECTURE.md) and [USAGE.md](USAGE.md).

## Role & industry

| Goal | Choice |
|------|--------|
| Specific role | AI exit-exam study coach / tutor |
| Industry | Higher education (Ethiopian university exit exams) |
| Avoid HR / recruiting templates | Education / tutoring domain |

**Why:** coaching workflows (hints, progress, research, scheduling) benefit from multi-agent AI and real outbound actions (email invites).

---

## Capability breakdown

| Coach sub-function | Priority | Product surface |
|--------------------|----------|-----------------|
| Tutor from past papers | High | Curriculum agent + practice call |
| Track weak topics | High | Memory + progress |
| Clarify with external material | Medium | Search + YouTube |
| Schedule follow-up study | High | Planner + Calendar Accept |
| Progress reporting | Medium | Report email / wrap-up |
| Content administration | High | Admin upload by field |

---

## Documentation & integrations

| Artifact | Location |
|----------|----------|
| Backend implementation spec | `docs/.specs/Tele-Exit-Backend-Spec-v3 .md` |
| Architecture | `docs/ARCHITECTURE.md` |
| API reference | `docs/API.md` |
| User guide | `docs/USAGE.md` |
| Product overview | Root `README.md`, `backend/docs/product/website.md` |

| Service | Use |
|---------|-----|
| Google Gemini (AI Studio) | LLM coaching, intent, embeddings |
| Tavily | Web search |
| YouTube Data API | Video recommendations |
| Gmail SMTP (App Password) | Reports + calendar `.ics` invites |
| Google Calendar API | Optional create-on-Accept |
| LiveKit | Optional study-call room tokens |

---

## Implementation checklist

| Requirement | Evidence |
|-------------|---------|
| Automate role tasks | Multi-agent study call |
| Multiple free-tier APIs | Gemini + Tavily + YouTube + SMTP |
| Meaningful actions | Schedule suggestions; Accept → real email; reports |
| Full-stack UI + backend | React / TanStack + FastAPI |
| Proactive actions | Planner suggestions + wrap-up; report trigger |

Weekly/monthly auto-reports can be added via an external scheduler calling `POST /students/me/report`. The default path uses explicit user actions for reliability.

---

## Links

| Item | URL |
|------|-----|
| Walkthrough video | [Tele-Exit demo](https://drive.google.com/file/d/1DPe5VJwmOw3D7YBCDjs0hBf8bFsUuxpI/view?usp=sharing) |
| Live app | https://tele-exit.vercel.app/ |
| API docs | https://heavenonearth7-tele-exit-backend.hf.space/docs |
| Source | This repository |

---

## Design quality bar

| Criterion | Approach |
|-----------|----------|
| Value | Personalized exit-exam coaching; field-specific banks |
| Automation | One call: tutor + research + video + memory + schedule |
| Technical | Hexagonal backend, typed API client, role-based auth, real SMTP |
| Domain fit | Education / tutoring (not recruiter templates) |

## Pitfalls avoided

| Pitfall | Tele-Exit |
|---------|-----------|
| Generic FAQ chatbot | Agents act on exam bank, calendar, email |
| Frontend-only polish | Domain agents, ingestion, outbox, JWT auth |
| Paid-only APIs | Free-tier Gemini + SMTP App Password + search/video keys |
| Silent fake side effects | Accept fails if invite cannot be delivered |
