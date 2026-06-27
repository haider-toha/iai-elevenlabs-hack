# WS-DOCS — Makefile + root docs

Workstream: Makefile + root docs for the single-Next.js-app collapse (PLAN.md "WS-DOCS").
File-disjoint from WS-CORE (`frontend/`) and WS-DELETE (`backend/`, `supabase/`). Did not touch
those trees.

## Step 1 — Makefile

Rewrote `/Users/haidertoha/Code/i.ai_hackathon/Makefile` to a frontend-only task runner.

- Deleted targets: `install-backend`, `dev-backend`, `format-backend`, `lint-backend`,
  `typecheck-backend`, `test-backend`, `db-start`, `db-reset`, `db-migration`.
- Dropped the `BACKEND` and `SUPABASE` make variables (now unused).
- Aggregate targets now fan out to the frontend only:
  - `install` → `install-frontend`
  - `dev` → `dev-frontend` (the old `dev` ran both servers via a `trap ... ; wait` shell
    construct; now it just runs `pnpm dev` in `frontend/`)
  - `format` → `format-frontend`, `lint` → `lint-frontend`, `typecheck` → `typecheck-frontend`,
    `test` → `test-frontend`
  - `setup` → `install`, then `cp -n frontend/.env.example frontend/.env` only (dropped the
    backend `.env` copy)
  - `clean` → removes `frontend/.next` + `*.tsbuildinfo` only (dropped the backend
    `__pycache__`/`.mypy_cache`/`.ruff_cache`/`.pytest_cache` cleanup)
- Kept the `*-frontend` named targets as the fan-out destinations, per PLAN.md ("fan out to
  frontend only" / "drop the `*-backend` prerequisites" — only the backend + db targets are
  named for deletion).

Verification (non-destructive — did NOT run `make dev`/`make build`/`make clean` so the running
:3000 dev server and its `.next` are untouched):

- `make help` lists a coherent frontend-only set: help, setup, install(-frontend),
  dev(-frontend), format(-frontend), lint(-frontend), typecheck(-frontend), test(-frontend),
  clean. No backend/db targets remain.
- `make -n <target>` for every aggregate confirms each expands to a `cd frontend && pnpm ...`
  command (no backend/supabase paths).
- `grep -nEi 'backend|supabase|poetry|docker|mypy|pytest|uvicorn|db-' Makefile` → no matches.

## Step 2 — Root README.md

`/Users/haidertoha/Code/i.ai_hackathon/README.md` exists; rewrote architecture + how-to-run for a
single Next.js app.

- Removed the monorepo block (frontend/backend/supabase), the Python 3.14 / Poetry 2 /
  Supabase CLI 2 / Docker requirements, the `git init` scaffold line, the
  `make dev-backend`/`make dev-frontend` two-terminal instructions, the backend health/docs URLs,
  and the entire "Database (needs Docker)" section.
- Now documents: single Next.js 16 app; the two surviving server route handlers
  (`/api/eleven/signed-url`, `/letters/[id]/qr.png`); Node 26 + pnpm 11 only; the four live env
  vars in `frontend/.env` (`XI_API_KEY`, `NEXT_PUBLIC_AGENT_ID`,
  `NEXT_PUBLIC_XI_VOICE_ID_ENGLISH`, `NEXT_PUBLIC_XI_VOICE_ID_WELSH`); `make dev` → :3000;
  frontend-only checks; and a Vercel deploy section (Root Directory `frontend/`, set the 4 env
  vars before first deploy, `XI_API_KEY` runtime+Sensitive, no DB/migrations/second process).
- Kept the "Read `CLAUDE.md`" pointer (the file still exists).

## Step 3 — CLAUDE.md (NOT edited) — DRIFT FLAG

Per PLAN.md, `CLAUDE.md` was intentionally NOT auto-rewritten.

ACTION FOR USER: `/Users/haidertoha/Code/i.ai_hackathon/CLAUDE.md` still documents the
now-removed `backend/` (FastAPI/Pydantic/Poetry) + `supabase/` (PostgreSQL/migrations/RLS)
monorepo as if it were live — including the directory map, the pinned Python/Poetry/Supabase
toolchain, and the entire "Data Access & Auth", "Backend", and "Database & Migrations" sections.
After WS-DELETE removes those trees, that guidance is stale. Decide whether to revise CLAUDE.md
to a frontend-only constitution.

## Not touched

`frontend/`, `backend/`, `supabase/` — owned by other workstreams.
