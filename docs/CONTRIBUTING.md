# Contributing

Thanks for contributing to Tele-Exit. This guide covers local setup, conventions, and how to open a pull request.

## Development setup

1. Fork and clone the repo.
2. Follow [Getting started](../README.md#getting-started) for backend + frontend.
3. Copy env templates:
   - `backend/.env.example` → `backend/.env`
   - `frontend/.env.example` → `frontend/.env`
4. Never commit secrets (`.env`, credentials, API keys).

### Useful commands

```bash
# Backend
cd backend
source ../.venv/bin/activate
uvicorn app.main:app --reload --port 8000
pytest -q

# Frontend
cd frontend
npm run dev
npm run lint
npm run build
```

## Project conventions

- **Backend:** hexagonal layout — put business logic in `domain/`, interfaces in `ports/`, vendors in `adapters/`.
- **Auth:** authorize from JWT claims; do not trust client-supplied user IDs.
- **Field isolation:** exam listing and attempts must respect `field_of_study`.
- **Side effects:** calendar Accept should fail honestly if invite delivery is impossible (no fake success IDs).
- **Tests:** prefer domain/unit tests under `backend/tests/`; use `USE_FAKES=true` where appropriate.

## Pull requests

1. Create a branch: `git checkout -b feature/short-description`
2. Keep commits focused; write clear messages.
3. Open a PR against `main` with:
   - what changed and why
   - how you tested it
   - screenshots / API examples when UI or contracts change

## Docs

| Doc | When to update |
|-----|----------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | New agents, ports, or data flows |
| [API.md](API.md) | New or changed endpoints |
| [USAGE.md](USAGE.md) | User-facing flows |
| Package READMEs | Setup / env changes |

## Code of conduct

Be respectful in issues and PRs. Assume good intent; keep discussion technical and constructive.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](../LICENSE).
