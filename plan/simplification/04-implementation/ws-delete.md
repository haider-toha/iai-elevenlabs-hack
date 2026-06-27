# WS-DELETE — remove backend/ and supabase/

Workstream: delete the FastAPI `backend/` and Supabase `supabase/` trees entirely.
Spec: `plan/simplification/03-plan/PLAN.md` ("WS-DELETE", lines 359-369).

## Pre-flight state
- `backend/` tracked files: 37; `supabase/` tracked files: 7.
- `git status --short backend supabase` clean (no uncommitted edits in either tree).
- Ignored/untracked under backend: `.DS_Store`, `.env` (live Supabase secret — removal is the point),
  `.mypy_cache/`, `.pytest_cache/`, `.ruff_cache/`, `app/.DS_Store`, `__pycache__/` (several), `data/.DS_Store`.
- Ignored/untracked under supabase: `.branches/`, `.temp/`.
- Verbatim prompt + letters already carried in PLAN.md C1/C2 (inlined by WS-CORE in parallel), so no
  data needs preserving here.

## Actions
1. `git rm -r backend` — 37 tracked files staged for deletion (FastAPI app, tests, `prompts/`,
   `data/`, `scripts/`, `poetry.lock`, `pyproject.toml`, `README.md`, `.env.example`). Then
   `rm -rf backend` to clear leftover ignored files (`.env` holding the live Supabase secret,
   `.DS_Store`, `.mypy_cache/`, `.pytest_cache/`, `.ruff_cache/`, every `__pycache__/`). Directory
   fully gone (`ls backend` → No such file or directory).
2. `git rm -r supabase` — 7 tracked files staged (4 migrations, `seed.sql`, `config.toml`,
   `.gitignore`). Then `rm -rf supabase` to clear untracked `.branches/` + `.temp/`. Directory
   fully gone.
   - Note: `supabase/snippets/` was empty (no tracked files); removed with the tree.
3. No Dockerfile / compose existed in the repo, so nothing else to delete (Docker was only
   `supabase start`).

## Verification
- `git ls-files backend` → 0; `git ls-files supabase` → 0 (nothing tracked remains).
- `git status --short` → 37 `D backend/...` + 7 `D supabase/...` staged deletions.
- Task grep `git grep -nE "asyncpg|DATABASE_URL|from app\.|fastapi|supabase/migrations" -- ':!plan/'`
  → matches **only `CLAUDE.md`** (documentation/governance). No live code/config references to either
  deleted tree. PLAN.md line 39 explicitly says CLAUDE.md is NOT auto-rewritten — flagged below.
- Broader `git grep -nE "backend/|supabase/|asyncpg|FastAPI|DATABASE_URL"` non-plan matches are all
  owned by **other** workstreams (correctly not touched):
  - `frontend/.env.example`, `frontend/app/(phone)/l/[id]/page.tsx`,
    `frontend/app/letters/[id]/preview/page.tsx`, `frontend/lib/api.ts` → WS-CORE (C6/C8/C12).
  - `README.md` → WS-DOCS.
  - `.gitignore:15,26,27` (`backend/.venv/`, `supabase/.branches/`, `supabase/.temp/`) → stale ignore
    entries; `.gitignore` is edited by WS-CORE (C11), so left untouched to avoid contention. See flag.
  - `CLAUDE.md` → governance doc, not rewritten by design.

## Flags for the user
- `CLAUDE.md` still describes the removed FastAPI/Supabase monorepo (lines 3, 7-8, 28, 30, 64, 74,
  84, 86, 120). Intentionally not edited (PLAN.md line 39). User should decide whether to update it.
- `.gitignore` retains now-dead entries `backend/.venv/`, `supabase/.branches/`, `supabase/.temp/`.
  Harmless, but stale. `.gitignore` is in WS-CORE's scope (C11), so not touched here.
- `backend/.env` (live Supabase secret) was untracked and is now removed from disk, but it remains in
  git history. Rotate the leaked key before any public deploy (PLAN.md runtime-env table).

## Status: DONE — both trees deleted and staged; no live references remain.
