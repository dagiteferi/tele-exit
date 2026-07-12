---
title: Tele-Exit Backend
emoji: 🎓
colorFrom: indigo
colorTo: blue
sdk: gradio
sdk_version: "5.29.0"
app_file: app.py
pinned: false
license: mit
short_description: FastAPI backend for the Tele-Exit AI exit-exam study coach
suggested_hardware: zero-a10g
tags:
  - fastapi
  - education
  - api
  - gradio
---

# Tele-Exit Backend

Production-style **FastAPI** API for Tele-Exit — an AI exit-exam study coach.

> **Hosting note.** Hugging Face free tier no longer runs Docker / `cpu-basic` Spaces without [PRO](https://huggingface.co/pro). This Space uses the **Gradio SDK (5.x) + ZeroGPU** shell (with a tiny `@spaces.GPU` warmup) so the API can stay free, while still serving FastAPI on port 7860.

## Live surface

| Path | Purpose |
|------|---------|
| `/health` | Liveness check |
| `/docs` | Interactive OpenAPI |
| `/redoc` | API reference |

## What it provides

- Student auth (JWT) and admin bootstrap  
- Field-filtered exit exams and practice attempts  
- Multi-agent study-call coaching (memory, planner, search, curriculum)  
- Calendar suggestions with SMTP `.ics` delivery  
- Product support chatbot over ingested docs  

## Configuration (Space Secrets)

Set secrets under **Settings → Variables and secrets**. Do **not** commit a `.env`.

**Required for a real demo**

| Secret | Notes |
|--------|--------|
| `JWT_SECRET` | Strong random string |
| `USE_FAKES` | `false` |
| `GEMINI_API_KEY` | LLM / embeddings |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Calendar invite email |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | First admin |
| `CORS_ORIGINS` | Comma-separated frontend origins |
| `FRONTEND_URL` | Frontend base URL (password-reset links) |

**Optional**

| Secret | Notes |
|--------|--------|
| `TAVILY_API_KEY` | Web search for curriculum |
| `YOUTUBE_API_KEY` | Video suggestions |
| `DB_PATH` | SQLite path (default `./tele_exit.db`) |

## Hardware

Keep **ZeroGPU** selected (free with Gradio). Do **not** switch this Space to Docker unless you have Hugging Face PRO — Docker requires `cpu-basic` (or paid GPU), and ZeroGPU is Gradio-only.

## Upgrade path (optional)

With [Hugging Face PRO](https://huggingface.co/pro), recreate the Space as `sdk: docker` using the included `Dockerfile` (uvicorn on port `7860`) for a cleaner FastAPI-only deploy.
