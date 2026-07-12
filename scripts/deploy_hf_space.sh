#!/usr/bin/env bash
# Push backend-only code to Hugging Face Space.
# Free tier: Gradio SDK + ZeroGPU (Docker/cpu-basic needs HF PRO).
# Usage: ./scripts/deploy_hf_space.sh
# Requires: HF_TOKEN env or ~/.cache/huggingface/token
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
SPACE_ID="${HF_SPACE_ID:-Heavenonearth7/tele-exit-backend}"
WORKDIR="${TMPDIR:-/tmp}/tele-exit-hf-space"

if [[ -z "${HF_TOKEN:-}" ]]; then
  if [[ -f "$HOME/.cache/huggingface/token" ]]; then
    HF_TOKEN="$(cat "$HOME/.cache/huggingface/token")"
  else
    echo "Set HF_TOKEN or run: huggingface-cli login"
    exit 1
  fi
fi

echo "→ Cloning space $SPACE_ID ..."
rm -rf "$WORKDIR"
HF_USER="${HF_USERNAME:-Heavenonearth7}"
git clone "https://${HF_USER}:${HF_TOKEN}@huggingface.co/spaces/${SPACE_ID}" "$WORKDIR"

echo "→ Syncing backend (no .env) ..."
cd "$WORKDIR"
find . -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +

cp "$BACKEND/Dockerfile" .
cp "$BACKEND/.dockerignore" .
cp "$BACKEND/requirements.txt" .
cp "$BACKEND/HF_SPACE_README.md" ./README.md
# Gradio Space entry (serves FastAPI via demo.launch → uvicorn)
cp "$BACKEND/app_hf.py" ./app.py
rsync -a --exclude='__pycache__' --exclude='*.pyc' --exclude='.pytest_cache' \
  "$BACKEND/app/" ./app/
rsync -a "$BACKEND/db/" ./db/
rsync -a --exclude='__pycache__' "$BACKEND/docs/" ./docs/

rm -f .env .env.local .env.production
rm -rf credentials

git add -A
if git diff --cached --quiet; then
  echo "No changes to push."
  exit 0
fi

git -c user.email="deploy@tele-exit.local" -c user.name="Tele-Exit Deploy" \
  commit -m "Deploy Tele-Exit FastAPI backend (Gradio Space shell)"

echo "→ Pushing to Hugging Face ..."
git push origin HEAD:main 2>/dev/null || git push origin HEAD:master

echo "✓ Done. Open: https://huggingface.co/spaces/${SPACE_ID}"
echo "  Set Secrets in Space Settings (JWT_SECRET, GEMINI_API_KEY, SMTP_*, CORS_ORIGINS, …)"
