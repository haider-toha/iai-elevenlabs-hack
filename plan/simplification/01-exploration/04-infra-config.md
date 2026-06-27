# 04 — Infrastructure & Config (exploration)

Domain: **Infrastructure, environment variables, Docker, Makefile, build pipeline, cold-deploy footprint.**

Repo root: `/Users/haidertoha/Code/i.ai_hackathon`. This is a Next.js (`frontend/`) +
FastAPI (`backend/`) + local Supabase (`supabase/`) monorepo. The simplification goal
is an easy cold deploy that **eliminates the backend by inlining the static demo
letters**, leaving a Next.js app with one server route for ElevenLabs.

This report classifies every config/infra surface into three buckets and cites exact
file + line evidence for each claim — especially every "unused" claim.

---

## TL;DR — what a true cold start of just-the-demo requires

A from-scratch deploy of the demo **with the backend removed** needs only:

1. `pnpm install` in `frontend/` (the only pnpm package; backend is Poetry, separate).
2. `next build` → `next start` (Next 16). No `output: export` is set
   (`frontend/next.config.ts` has only `reactStrictMode` + `devIndicators: false`),
   so this is a **standard Node server build, not a static export**.
3. Exactly **one real secret at runtime**: `XI_API_KEY` (read server-side in
   `frontend/app/api/eleven/signed-url/route.ts:13`).
4. Three build-time-inlined `NEXT_PUBLIC_*` values: `NEXT_PUBLIC_AGENT_ID`,
   `NEXT_PUBLIC_XI_VOICE_ID_ENGLISH`, `NEXT_PUBLIC_XI_VOICE_ID_WELSH`.
5. Build-time network access to Google Fonts (`next/font/google` in
   `frontend/app/layout.tsx:3` self-hosts Hanken Grotesk + Newsreader at build).

**No Docker, no Supabase, no Postgres, no Poetry/Python** are needed once the
backend is inlined. But four things currently block that and are flagged below as
*needs-decision*: (a) `lib/api.ts` `getLetter` over `NEXT_PUBLIC_API_URL`,
(b) the QR PNG served by the backend, (c) the system prompt read at runtime from
`../backend/prompts/`, and (d) the **git-ignored `public/vendor/` GOV.UK assets**
that no script regenerates.

---

## BUCKET 1 — ACTIVELY USED AT RUNTIME (in the demo flow)

### Frontend env vars (validated in `frontend/lib/env.ts`)

| Var | Kind | Default? | Where consumed at runtime |
|---|---|---|---|
| `XI_API_KEY` | **server-only secret** (`serverEnv()`, `lib/env.ts:32-43`) | required, `z.string().min(1)` | `app/api/eleven/signed-url/route.ts:13` — sent as `xi-api-key` header to ElevenLabs `get-signed-url`. The single essential secret. |
| `NEXT_PUBLIC_AGENT_ID` | NEXT_PUBLIC, build-time inlined | required, `min(1)` (`lib/env.ts:15`) | `app/api/eleven/signed-url/route.ts:15` — `agent_id` query param. |
| `NEXT_PUBLIC_XI_VOICE_ID_ENGLISH` | NEXT_PUBLIC | required, `min(1)` (`lib/env.ts:16`) | `components/convai-leaf.tsx:342` (English session) and `:387` (switch-back). |
| `NEXT_PUBLIC_XI_VOICE_ID_WELSH` | NEXT_PUBLIC | required, `min(1)` (`lib/env.ts:17`) | `components/convai-leaf.tsx:386` (Welsh restart). |
| `NEXT_PUBLIC_API_URL` | NEXT_PUBLIC | **has default** `http://localhost:8000` (`lib/env.ts:12`) | `lib/api.ts:92` (`getLetter`) and `app/letters/[id]/preview/page.tsx:359` (`qr.png` `<img>`). **This is the live coupling to the backend** that the simplification must remove. |

Real current values (`frontend/.env`) — redacted; see local `.env` for live values:
- `NEXT_PUBLIC_AGENT_ID=<redacted>`
- `NEXT_PUBLIC_XI_VOICE_ID_ENGLISH=<redacted>`
- `NEXT_PUBLIC_XI_VOICE_ID_WELSH=<redacted>`
- `XI_API_KEY=<redacted>`

### The single frontend server route (the keep)

`frontend/app/api/eleven/signed-url/route.ts` — `GET` fetches a signed WebSocket URL
from `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url`. This is the
**only** server endpoint the demo cannot lose. It needs `XI_API_KEY` +
`NEXT_PUBLIC_AGENT_ID`.

### Runtime file dependency OUTSIDE the bundle (needs-decision)

`frontend/app/(phone)/l/[id]/page.tsx:16-19` does
`readFileSync(join(process.cwd(), "..", "backend", "prompts", "letter_explainer.txt"))`
**at server runtime**. So the agent system prompt currently lives in
`backend/prompts/letter_explainer.txt` and is read relative to the frontend cwd. If
`backend/` is deleted for the cold deploy, **this path breaks** — the prompt must be
moved into `frontend/` or inlined. (Full prompt text is in that file, 19 lines;
captured for the inlining phase.)

### Backend env vars / Settings (only if the backend is kept)

`backend/app/config.py` `Settings` + `backend/.env`. Fields actually consumed:

| Var | Settings field | Consumed at |
|---|---|---|
| `DATABASE_URL` | `database_url` (`config.py:14`) | `app/main.py:34` — `asyncpg.create_pool`. Backend's core dependency. |
| `CORS_ORIGINS` | `cors_origins` (`config.py:13`) | `app/main.py:46` — `CORSMiddleware allow_origins`. |
| `DEBUG` | `debug` (`config.py:12`) | `app/main.py:43` — `FastAPI(debug=...)`. |
| (none) | `app_name` default `"Marginalia"` (`config.py:11`) | `app/main.py:43` (title) and `app/api/routers/health.py:16` (service name). |

### Backend endpoints hit by the demo at runtime

Only **two** of the five mounted routers serve the live demo:
- `GET /letters/{id}` — `app/api/routers/letters.py:14-19`, via `lib/api.ts:92`
  (`getLetter`), used by `l/[id]`, `letters/[id]/preview`, and
  `actions/update-company-car/[letterId]`.
- `GET /letters/{id}/qr.png` — `app/api/routers/letters.py:43-52` (uses `qrcode`),
  rendered as `<img>` in `letters/[id]/preview/page.tsx:359`. Note the preview's QR
  is also a plain `<a href="/l/{id}">` (line 350), so the *click* path survives
  without the backend; only the scannable PNG breaks.

### The data to inline (the whole point of the simplification)

`supabase/migrations/20260625090200_seed_demo_letters.sql` — two letter rows, the
single source of demo data. Schema in
`supabase/migrations/20260625090000_create_letters.sql` (one table, both types,
discriminated by `type`; text-slug PK like `maria-p2`). Pydantic shapes in
`backend/app/models/letters.py`; the matching Zod shapes the frontend already parses
are in `frontend/lib/api.ts:31-98` (`P2Letter` / `P800Letter` discriminated union).
Key values to carry verbatim:
- `maria-p2`: P2, `Ms Maria Davies`, NI `QQ 12 34 ▒▒ C`, tax year `2026 to 2027`,
  PA `12570`, code `883L` (standard `1257L`), employer `Bridgwater & Co Ltd`,
  issue `2026-04-06`, tax-free `8830`; lines = Personal Allowance `+12570`,
  Car benefit `-3740`; one suspected error (Car benefit, est `748`/yr, `62`/mo).
- `maria-p800`: P800, same person, tax year `2025 to 2026`, ref `P800-2026-0R4291`,
  total income `24800`, tax due `2446`, tax paid `3194`, result `overpaid`,
  amount `748`, claim method `online bank transfer (5 working days) or cheque (6 weeks)`.
- `confusing_line` strings are stored per letter (verbatim HMRC phrasing; provenance
  in `backend/data/letter-samples/p2-verbatim-strings.md`).

The frontend already turns this into the agent prompt via
`frontend/lib/letter-format.ts` (`buildLetterBlock` / `buildLetterBlockWelsh`) — that
file is pure and needs no backend, so inlining just means feeding it a literal
`Letter` object instead of `getLetter()`.

### Runtime-served static GOV.UK assets (used, but git-ignored — see Bucket 3)

- `public/vendor/govuk-frontend.scoped.css` — `<link>`ed at runtime by
  `components/govuk-embed.tsx:46` and `app/(phone)/actions/layout.tsx:25`.
- `public/vendor/govuk-logotype.svg` — `<img>` in `components/govuk-embed.tsx:126`,
  `actions/update-company-car/[letterId]/page.tsx:88`, and the confirmation page.

### Build pipeline pieces that are load-bearing

- `frontend/postcss.config.mjs` — `@tailwindcss/postcss` (Tailwind v4 CSS-first; no
  `tailwind.config.js`; tokens live in `frontend/app/globals.css` `@theme`).
- `frontend/app/layout.tsx:3-21` — `next/font/google` (Hanken Grotesk + Newsreader);
  fetched at build, needs network during `next build`.
- `frontend/tsconfig.json:29-33` — `@/*` path alias → `./*`.
- App-dir icon conventions used by the framework automatically: `app/icon.svg`,
  `app/apple-icon.png` (Next file-based metadata; no explicit import needed).

---

## BUCKET 2 — PRESENT BUT UNUSED AT RUNTIME

### Frontend env vars never read by any consumer

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — referenced
  **only** inside `frontend/lib/env.ts` (`:13-14`, `:23-25`). There is no
  `@supabase/supabase-js` dependency in `frontend/package.json` (deps are
  `@elevenlabs/react`, `govuk-frontend`, `next`, `react`, `react-dom`, `zod` only),
  and `grep` finds **zero** Supabase imports across `app/ components/ lib/`. The
  "Supabase Auth browser flow" in CLAUDE.md is **never wired up**. ⚠️ Caveat
  (Bucket 3): both use `z.url()` / `min(1)` with **no default**, so they are still
  *mandatory for the app to boot* even though unused.
- `NEXT_PUBLIC_ONE_LOGIN_URL` — referenced only in `frontend/lib/env.ts` (`:18`,
  `:29`). No consumer anywhere. Has a default (`http://localhost:3001`), so it does
  not block boot. The "GOV.UK One Login simulator on :3001" exists **only in the
  planning docs** (`plan/01-the-final-idea.md:60`,
  `plan/02-technical-build-plan.md:63/678/719-723/766/776`); it was never built into
  code, and there is **no docker-compose** to run it.

### Frontend dead code

- `getHealth()` in `frontend/lib/api.ts:13-24` — defined but has **no call sites**
  (`grep getHealth` across `app/ components/` returns nothing). The `/health`
  endpoint it targets is therefore not exercised by the demo.

### Backend env vars / Settings fields never consumed

- `ENVIRONMENT` → `Settings.environment` (`config.py:18`) and `LOG_LEVEL` →
  `Settings.log_level` (`config.py:19`): parsed but **never read** anywhere in
  `backend/app` (`grep settings.environment / settings.log_level` → nothing). Dead
  config.
- `XI_API_KEY` (backend) → `Settings.xi_api_key` default `""` (`config.py:17`):
  **not consumed by any runtime route.** `grep settings.xi_api_key` → nothing. The
  `.env.example:14` comment claims `POST /govuk/refresh` uses it, but
  `app/api/routers/govuk.py:57-79` calls the public GOV.UK Content API with **no
  key**. The only real reader of the key is the setup script (Bucket 3).
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `XI_VOICE_ID_ENGLISH`, `XI_VOICE_ID_WELSH`
  in `backend/.env`: **not even Settings fields** (`config.py` defines none of them),
  and `SettingsConfigDict(extra="ignore")` (`config.py:7-9`) silently drops them.
  `grep -i supabase|jwt|jwks backend/app` → nothing. The `.env.example:10-11` claim
  of a "JWT-verification dep (via JWKS)" describes a dependency that **does not
  exist** in `backend/app/api/deps.py` (only `SettingsDep` + `get_db`).

Real backend values present (`backend/.env`, for reference / to delete):
`SUPABASE_URL=<redacted>`,
`SUPABASE_SECRET_KEY=<redacted>`,
`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

### Backend endpoints never hit by the demo

- `GET /health` — `routers/health.py` (frontend `getHealth` is dead).
- `POST /letters/{id}/check` — `routers/letters.py:22-31` + `services/letter_check.py`
  (the formula audit). `grep "/check"` in `frontend/` → nothing. The audit result is
  pre-baked into the seed `suspected_errors` and surfaced via `letter-format.ts`, so
  this route is never called live.
- `POST /scan-events` — `routers/scan_events.py`. `grep scan-events` in `frontend/` →
  nothing. The ~50 seeded events in the seed migration feed an analytics heatmap that
  the demo never renders.
- `POST /items` + `GET /items/{id}` — `routers/items.py` (explicitly labelled
  `SCAFFOLD`, in-memory dict). No frontend usage.

### Backend code that exists only for setup/build, not the live path

- `backend/scripts/setup_eleven_agent.py` — reads `os.environ["XI_API_KEY"]`,
  `XI_VOICE_ID_ENGLISH/WELSH`; uploads the GOV.UK KB, creates/updates the
  "Letter Explainer" agent (`llm: claude-sonnet-4-5`, tts
  `eleven_v3_conversational`), and **writes `NEXT_PUBLIC_AGENT_ID` into
  `frontend/.env`** (`:254-261`). Run manually, once.
- `backend/scripts/pull_govuk.py` and `POST /govuk/refresh`
  (`routers/govuk.py`) — fetch GOV.UK content into `backend/data/govuk/*.md` for the
  KB. Setup-time only.
- `backend/data/` (govuk markdown corpus + `letter-samples/`) — feeds the KB/agent
  bootstrap and documents verbatim strings; not served at runtime.
- `frontend/scripts/export-letter.ts` — Playwright; screenshots the preview into
  `frontend/out/maria-p2.{pdf,png}`. Setup/demo-asset generation only.

### Unused static assets (no references)

- `frontend/public/GovUK_example_ss.png`, `frontend/public/GovUK_logo.png`,
  `frontend/app/letter_reference.png` — `grep` finds no references in `app/` or
  `components/`. (`HMRC_logo.png` and `logo.png` *are* used: preview masthead, home,
  wordmark.)

### `frontend/out/` is NOT a Next static export

`out/` contains only `maria-p2.pdf` + `maria-p2.png` (the Playwright export outputs).
There is no `output: "export"` in `next.config.ts` and no other files in `out/`. It is
git-ignored (`/.gitignore` `frontend/out/`). Do **not** mistake it for a deployable
static bundle.

### Makefile targets and the cold deploy

`Makefile` targets and their relevance to a backend-less cold deploy:

| Target | Lines | Cold-deploy relevance |
|---|---|---|
| `setup` | 24-26 | Dev convenience (`cp .env.example .env`). Not for deploy. |
| `install` / `install-frontend` / `install-backend` | 28-34 | Only `install-frontend` (`pnpm install`) needed; `install-backend` (poetry) droppable. |
| `dev` / `dev-backend` / `dev-frontend` | 38-48 | `dev-frontend` (`pnpm dev`) is the demo dev path; the other two assume the backend. |
| `format*` / `lint*` / `typecheck*` / `test*` | 50-80 | Dev-only. `test-frontend` is a stub (`echo "no frontend tests yet"`, `package.json:17`). |
| `db-start` / `db-reset` / `db-migration` | 82-94 | **Supabase + Docker only.** Eliminated once data is inlined. |
| `clean` | 96-99 | Housekeeping. |

---

## BUCKET 3 — AMBIGUOUS / NEEDS-DECISION

1. **Supabase env vars are unused but *mandatory to boot*.** `NEXT_PUBLIC_SUPABASE_URL`
   and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` have no consumer, but `lib/env.ts:13-14`
   validates them with `z.url()` / `min(1)` and **no default**. `schema.parse(...)`
   runs at module load, and `env.ts` is imported by both client and server files, so a
   **missing Supabase var crashes the whole app on import.** Decision: to drop them you
   must also delete them from the `schema` object — you cannot merely stop setting them.
   Same applies if you keep `NEXT_PUBLIC_ONE_LOGIN_URL` (though its default shields it).

2. **`NEXT_PUBLIC_API_URL` + `getLetter` must be replaced, not just unset.** It defaults
   to `http://localhost:8000`, so leaving it unset doesn't error — it just makes every
   `getLetter`/qr fetch hit a dead localhost backend. The inlining phase must replace
   `lib/api.ts:getLetter` with a literal lookup (the 4 call sites: `l/[id]`,
   `letters/[id]/preview`, `actions/update-company-car/[letterId]`) and decide the QR
   story (see #3).

3. **The QR PNG (`GET /letters/{id}/qr.png`) is the only backend-served binary in the
   live flow.** `letters/[id]/preview/page.tsx:359` renders it from
   `NEXT_PUBLIC_API_URL`. Options: pre-generate a static PNG into `public/`, generate at
   build, encode the QR client-side, or rely on the existing `<a href="/l/{id}">` and
   drop the scannable image. Needs a decision before backend removal.

4. **`public/vendor/` is GIT-IGNORED and the runtime files are not regenerated by any
   script — this is the biggest cold-deploy landmine.** Root `/.gitignore` ignores
   `frontend/public/vendor/` entirely (`git check-ignore` confirms
   `govuk-frontend.scoped.css`, `.min.css`, and `govuk-logotype.svg` are all ignored,
   and `git ls-files frontend/public/vendor/` returns nothing). The `predev`/`prebuild`
   hook `frontend/scripts/copy-govuk-assets.ts` regenerates only
   `govuk-frontend.min.css` — which is **not referenced anywhere at runtime** (runtime
   uses `govuk-frontend.scoped.css`). Neither `govuk-frontend.scoped.css` nor
   `govuk-logotype.svg` is produced by any script or committed. A fresh `git clone` +
   build therefore ships **without** the scoped GDS CSS and the GOV.UK crown logo → the
   in-chat GOV.UK overlay (`govuk-embed.tsx`) and the `/actions/*` pages render unstyled
   and the logo 404s. Decision: un-ignore + commit `scoped.css` + `logotype.svg` (and
   either fix `copy-govuk-assets.ts` to emit the scoped file or drop the script +
   the now-unused `govuk-frontend` dependency), or otherwise guarantee these assets at
   deploy time.

5. **`predev`/`prebuild` coupling to the `govuk-frontend` npm package.**
   `package.json:7,9` run `copy-govuk-assets.ts` before every dev/build; it
   `require.resolve("govuk-frontend/dist/...")`, so the `govuk-frontend` dependency must
   be installed for any build to succeed — even though its output (`min.css`) is unused.
   If #4 is resolved by committing `scoped.css`, both the script and the dependency
   become deletable.

6. **The system prompt lives in `backend/prompts/` but is read by the frontend at
   runtime.** See Bucket 1 — `l/[id]/page.tsx:16` `readFileSync(../backend/prompts/...)`.
   Deleting `backend/` without relocating this file breaks the conversation page.

7. **Secret hygiene.** `frontend/.env` and `backend/.env` (git-ignored) contain a live
   `XI_API_KEY`, a Supabase publishable key, and a Supabase **secret** key. Whichever
   host runs the one ElevenLabs route needs `XI_API_KEY` as a real platform secret;
   rotate it before any public deploy. The Supabase secret can be deleted with the
   backend.

8. **Docker footprint is Supabase-only.** No `docker-compose`/`Dockerfile` exists
   anywhere (`find` confirms). Docker is invoked solely by `supabase start`
   (`Makefile:82`, `README.md:15/38`). Removing the DB removes the only Docker need.
   The `supabase/` directory (migrations, `config.toml` ports 54321-54329, `seed.sql`)
   becomes dead once data is inlined — though the seed migration remains the **source of
   truth for the values to inline**, so keep it for reference during that phase.
