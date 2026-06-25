# Marginalia

**The voice in the margin of your government letter.** Marginalia turns the QR
code already printed on a government letter into a thirty-second conversation
that explains it — in any language — and catches the mistake.

Next.js + FastAPI + PostgreSQL (Supabase) monorepo.

```
frontend/   Next.js App Router, React, TypeScript, Tailwind v4 — pnpm
backend/    FastAPI, Pydantic v2 — Poetry
supabase/   PostgreSQL schema & SQL migrations — Supabase CLI
```

Requires Node 26, pnpm 11, Python 3.14, Poetry 2, Supabase CLI 2, and Docker (for the database).

## Setup

```bash
git init && git add -A && git commit -m "Scaffold"   # not a git repo yet
make setup        # install deps + create .env / .env.local from examples
```

Then put real values in `backend/.env` and `frontend/.env.local` (never commit them).

## Run

```bash
make dev            # frontend :3000 + backend :8000 (Ctrl-C stops both)
# or, in two terminals:
make dev-backend
make dev-frontend
```

- Frontend: http://localhost:3000
- Backend health: http://localhost:8000/health · API docs: http://localhost:8000/docs

## Database (needs Docker)

```bash
make db-start                              # boot local Supabase
make db-migration name=add_widgets_table   # new migration file
make db-reset                              # replay migrations + seed
```

## Checks

```bash
make format      # ruff format + prettier
make lint        # ruff + eslint
make typecheck   # mypy + tsc
make test        # pytest
```

Read `CLAUDE.md` before writing code — it's the project constitution.
