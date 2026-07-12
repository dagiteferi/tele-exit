# Tele-Exit API — Hugging Face Space (Docker)
FROM python:3.12-slim

WORKDIR /app

# System deps for common Python wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY db ./db
COPY docs ./docs

# Persist SQLite across restarts when a volume is mounted at /data
ENV DB_PATH=/data/tele_exit.db
ENV PYTHONUNBUFFERED=1
ENV USE_FAKES=false

RUN mkdir -p /data

EXPOSE 7860

# Hugging Face Spaces expects the app on port 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
