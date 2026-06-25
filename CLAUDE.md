# Project Rules

Next.js + FastAPI + PostgreSQL (Supabase) monorepo. Read this before writing code.

```
frontend/   Next.js App Router · React · TypeScript · Tailwind v4 — pnpm
backend/    FastAPI · Pydantic v2 — Poetry
supabase/   PostgreSQL schema & SQL migrations — Supabase CLI
```

Pinned toolchain: Node 26, pnpm 11, Python 3.14, Poetry 2.4, Supabase CLI 2.

---

## General Principles

- **Explore before acting.** Resolve unknowns by reading the code, not guessing. Follow the patterns already here instead of inventing new ones.
- **Every line justifies itself.** No dead code, no backwards-compat shims, no config flags or props added "just in case". Delete rather than keep.
- **No defensive programming.** Trust validated upstreams and fail loudly at the source. Don't paper over uncertainty downstream with guards and fallbacks. (This is about *redundant* checks on already-proven data — not about handling genuinely uncertain inputs like a network call or a cache miss, which you must model.)
- **Obvious over clever.** If a line needs a comment to explain *what* it does, rewrite the line. Comments explain *why*, never *what*.
- **Rule of three.** Don't extract a helper or abstraction until the third real use. Inline duplication beats the wrong abstraction. Equally: don't leave a one-call-site "util" — inline it.
- **Database safety is paramount.** Mutations go through migrations; preview destructive SQL with `SELECT` first.

---

## Data Access & Auth

**FastAPI is the only data path for application logic.** The browser calls the backend over `NEXT_PUBLIC_API_URL`; the backend owns all DB access through its `asyncpg` pool and authorizes every request itself. It connects as a privileged role, so **RLS does not protect the FastAPI path** — never lean on RLS for backend queries; check resource ownership in the route/service.

**Supabase is used only for Auth.** The `NEXT_PUBLIC_SUPABASE_*` keys exist so the browser can run the Supabase Auth flow (login/signup) with `@supabase/supabase-js`. Send the resulting JWT to FastAPI as a `Bearer` token; the backend verifies it and derives the user. **Do not read or write application tables directly from the browser** with the Supabase client — that path is ungoverned here. (If you ever do, that table MUST ship RLS + a policy in the same migration.)

---

## Frontend

**Server vs client components.** Server Components are the default. Add `"use client"` only for `useState`/`useReducer`, event handlers, effects, or browser APIs — and push it to the **leaf**, never a page or layout (everything a client file imports joins the client bundle). When server data must live inside an interactive shell, pass the server component in as `children`/props rather than converting the shell's whole subtree to client. Context providers are client components wrapping `{children}` deep in the tree — never `<html>`.

**Types.** `any` is banned (lint errors on it). For genuinely-unknown input use `unknown` and narrow. Use `satisfies` for config-shaped literals, not `as` — reserve `as` for assertions you can prove the compiler can't. Model variants as discriminated unions (`{ status: "ok"; data } | { status: "error"; error }`), so illegal states are unrepresentable and `switch` is exhaustive — this *removes* the need for defensive `if (data && !error)` checks. Don't annotate what's inferred; annotate at boundaries.

**Zod lives only at trust boundaries** — incoming request bodies, route handlers, `searchParams`, external API responses, env parsing. Internal function-to-function calls are already typed by TS; validating them is slop. Env is validated once in `lib/env.ts` (import `env`, never `process.env`); API responses in `lib/api.ts`.

**Data fetching.** Fetch in async Server Components; parallelize independent reads with `Promise.all` (sequential awaits that don't depend on each other are a waterfall bug). Stream slow reads with `<Suspense>`. No `useEffect` data fetching — that's a server job. Reach for SWR/TanStack Query only for genuinely client-driven async state.

**State.** Default to none: derive from server data + URL `searchParams`. Local UI state → `useState` in a leaf. Cross-tree → Context. A store (Zustand/Jotai) only after Context demonstrably hurts — never preemptively. No Redux.

**Conventions.** Route files use Next's reserved names (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`). Component files `kebab-case.tsx` exporting a `PascalCase` component, one per file. Hooks `use-*.ts`. No barrel `index.ts` re-export files (they hurt tree-shaking and create cycles) — import from the real path.

**Avoid:** `"use client"` at the top of a page/layout; `as` to silence type errors; `useEffect` fetching; barrel files; premature abstraction.

---

## Backend

**Structure.** `app/main.py` (thin: app, lifespan, middleware, router mounting) → `app/api/routers/*` → `app/services/*` → `app/repositories/*`. Layering is the *ceiling*, not a mandate: **do not create a service that only forwards to a repo, or a repo that only wraps one query** — for a one-line read, put it in the route. No `manager`/`helper`/`util` grab-bags.

**Dependency injection.** Always `Annotated[T, Depends(...)]`, never a bare `= Depends()` default. Define reusable deps as type aliases in `app/api/deps.py`. Inject the `Settings` object; never read `os.environ` outside `config.py`.

**Pydantic discipline.** A Pydantic model for everything crossing a boundary — request, response, config, domain. **No bare `dict` or `Any` across a boundary.** Set `response_model=` on every route. v2 idioms only: `model_config = ConfigDict(...)`, `@field_validator`, `model_validate`, `model_dump`. Never v1 (`class Config`, `.dict()`, `@validator`).

**Validate once — for structure.** Pydantic validates shape at the edge; trust that shape downstream and don't re-validate it. This does **not** cover authorization, resource ownership, or business invariants — re-check those at the point of use. "Validated body" never means "authorized action".

**No swallowing errors.** No `try/except` that logs-and-continues or returns `None` to hide a failure. Convert *expected* domain errors to an explicit `HTTPException`; let everything else raise and 500 loudly. Don't add `if x is None` guards on values Pydantic has already proven non-optional — but *do* handle `None` from lookups, `Optional` fields, and business logic. That's correctness, not defensiveness.

**Lifespan & async.** Startup/shutdown via the `@asynccontextmanager` `lifespan` (not the deprecated `@app.on_event`): open shared resources before `yield`, store on `app.state`, close after. Handlers touching I/O are `async def`. **Never call blocking I/O inside `async def`** — use a sync `def` handler (FastAPI threadpools it) or `anyio.to_thread.run_sync`. A blocking call in an async handler stalls the whole event loop; it's the most common real bug.

**Config** via one `Settings(BaseSettings)` reading `.env`, exposed through an `@lru_cache`'d `get_settings()`. Secrets in `.env` (gitignored); commit `.env.example`.

---

## Database & Migrations

**Schema conventions.** `uuid` primary keys defaulting to `gen_random_uuid()` for user-linked tables (consistent with Supabase `auth.uid()`, safe to expose, non-enumerable); `bigint generated always as identity` only for internal high-volume tables. Always `created_at`/`updated_at timestamptz` (never naive `timestamp`), kept honest by a `set_updated_at()` trigger. `snake_case`, plural table names. Hard-delete by default; add a nullable `deleted_at` only where recoverability is actually needed (and then every query and policy must filter it).

**RLS.** Enable Row Level Security on every `public` table holding user data **and ship at least one policy in the same migration** — `enable row level security` alone is deny-all and silently returns zero rows. Scope policies `to authenticated` and key them on `(select auth.uid()) = user_id`. Note: a backend connecting as the table owner or service role **bypasses RLS** — so RLS guards the PostgREST/JS-client path, not your FastAPI path; do your own authz there.

**Migration discipline:**
- **Append-only. Never edit an applied migration** — write a new one. One logical change per file.
- **Forward-only. No down-migrations** — we roll forward with a new migration. (So: snapshot the DB before anything destructive; there is no undo button.)
- **Wrap each migration in `begin; … commit;`** — *except* statements that forbid it: `CREATE INDEX CONCURRENTLY` and `ALTER TYPE … ADD VALUE`. Those run outside a transaction block, alone in their own migration.
- **`IF NOT EXISTS` for extensions and re-runnable policies; not for `CREATE TABLE`/`ADD COLUMN`** — there it silently hides schema drift instead of failing on a real conflict.
- **Additive, not destructive, in one step (expand/contract).** To rename: add the new column, backfill, dual-write, switch reads, then drop the old one in a *later* migration. Never drop a column in the same deploy that stops using it. Add a `NOT NULL` constraint as `NOT VALID` then `VALIDATE CONSTRAINT` separately to avoid a full-table lock.
- **Naming:** `supabase migration new <verb_led_snake_case>` → `YYYYMMDDHHMMSS_create_widgets.sql`.

See `supabase/migrations/20260624101500_create_organizations.sql` for the reference pattern.

**Python ↔ DB.** An `asyncpg` pool created in the FastAPI `lifespan`, shared via `app.state`. `DATABASE_URL` is the single source of truth — local is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. If you connect through Supabase's **transaction pooler (port 6543)**, pass `statement_cache_size=0` (it doesn't support prepared statements); the session pooler (5432) and direct connection are fine as-is.

---

## UI & Design

The look is **editorial press**: warm bone paper, soft-black ink, one oxblood accent used like a proof mark. It must never read as AI-generated.

**Fonts** (both via `next/font/google`, self-hosted, zero layout shift — see `app/layout.tsx`): **Familjen Grotesk** for display/headings (a Swedish grotesque with real ink traps), **Newsreader** for body/long-form (an editorial reading serif). **No monospaced font anywhere in the UI** — code blocks are the only exception. Tabular figures come from `.tnum` (`font-feature-settings: "tnum"`), not a mono face.

**Colour is semantic tokens, never raw hex in components.** Defined once in `app/globals.css` `@theme`; reference as Tailwind utilities (`bg-surface`, `text-ink-muted`, `border-rule`, `text-accent`). Warm bone surfaces, soft-black ink, a single oxblood accent (`--color-accent`), earthy olive/ochre for status. No pure `#000`/`#fff`.

**Shape & structure.** Sharp corners by default; the only radius is `rounded-tactile` (3px) for buttons/tags. Structure comes from 1px hairline `rule` borders and the occasional heavy rule — **not drop shadows**. Generous whitespace, asymmetric multi-column layout, body measure ≤ 66ch. Motion is restrained: 120–200ms ease-out, opacity and small translate only.

**Banned (these are the AI tells):** Inter / Geist / Roboto / Open Sans — *and* the second-gen tells Satoshi / General Sans / Clash Display / Bricolage Grotesque / Fraunces; any monospace in the UI; purple/indigo/blue "primary" buttons; gradients; `rounded-xl` everything; glassmorphism / `backdrop-blur`; drop-shadow soup; centered single-column hero; three-feature-cards-with-icons grids; Heroicons; emoji bullets; terracotta/beige template palettes.

---

## Tooling

`make help` lists every target. The essentials:

```bash
make install     # pnpm + poetry deps
make dev         # frontend :3000 + backend :8000 (or dev-frontend / dev-backend)
make format      # ruff format + prettier
make lint        # ruff + eslint
make typecheck   # mypy --strict + tsc --noEmit
make test        # pytest
make db-start    # local Supabase (needs Docker)
make db-migration name=add_widgets_table
make db-reset    # replay migrations + seed
```

- **Backend:** `ruff` is both linter and formatter (no Black). `mypy` runs in `strict` mode — code must be fully typed. Config lives in `backend/pyproject.toml`.
- **Frontend:** flat ESLint config (`eslint.config.mjs`) with `eslint-config-next` + Prettier interop; `next lint` no longer exists in Next 16, so lint runs the ESLint CLI directly. `tsc --noEmit` for types.
- **Tailwind v4 is CSS-first**: there is **no `tailwind.config.js`**. Tokens live in the `@theme` block of `app/globals.css`; content is auto-detected; the PostCSS plugin is `@tailwindcss/postcss`.
- Don't loosen a check to make it pass. Fix the code, or change the rule deliberately with a reason.
