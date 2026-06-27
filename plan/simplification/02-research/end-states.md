# 02 — Research: Simplification End-States

**Topic:** Concrete simplified end-states for Marginalia, ranked by **least ongoing complexity** and **easiest cold deploy**, every option preserving the 16-step baseline flow (`plan/simplification/00-baseline/flow.md`).

**Builds on (not re-derived):** the five Phase 1 exploration reports in `plan/simplification/01-exploration/`. Established facts treated as ground truth: only `GET /letters/{id}` and `GET /letters/{id}/qr.png` are live backend calls; zero runtime mutations; the one server runtime that must survive is `frontend/app/api/eleven/signed-url/route.ts` (mints an ElevenLabs signed WS URL with `XI_API_KEY`), so the app is **not** a pure static export; the dead env vars (`NEXT_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_ONE_LOGIN_URL`) currently **hard-fail boot** via `frontend/lib/env.ts:13-14,18`; and the git-ignored `public/vendor/govuk-frontend.scoped.css` + `govuk-logotype.svg` are the biggest cold-deploy landmine.

Verified live during this research:
- `frontend/next.config.ts` sets only `reactStrictMode` + `devIndicators` — **no `output: "export"`**, so today's build is a standard Node/SSR build (confirms a server host is required).
- `frontend/package.json` deps are `@elevenlabs/react`, `govuk-frontend`, `next`, `react`, `react-dom`, `zod`. `predev`/`prebuild` run `scripts/copy-govuk-assets.ts`, which emits **only** `govuk-frontend.min.css` (the unused one).
- `git ls-files frontend/public/vendor/` → **empty**; `git check-ignore` confirms `scoped.css` and `logotype.svg` are ignored yet present on disk (124k/144k/3.5k). They exist only on this machine.
- `frontend/lib/env.ts:13-14` requires the Supabase vars with **no default** → `schema.parse` throws on import if unset.

---

## The fixed substitution set (applies to every end-state)

Independent of which end-state we pick, these are the mechanical changes that sever the backend from the demo path. They are the "work" common to all three; the end-states differ only in *what hosts the result*.

1. **Inline the two letters.** Replace `getLetter()` (`frontend/lib/api.ts:91`) with a synchronous lookup over a typed `Record<"maria-p2" | "maria-p800", Letter>` (e.g. `frontend/lib/letters.ts`), populated verbatim from `supabase/migrations/20260625090200_seed_demo_letters.sql` (full values captured in the Phase 1 reports). Keep the existing Zod types as the literal's type; drop the `z.coerce` boundary. Callers already `await` and handle `null` via `notFound()` — harmless on a sync return.
2. **QR same-origin.** Replace the `<img src={NEXT_PUBLIC_API_URL/letters/{id}/qr.png}>` (`frontend/app/letters/[id]/preview/page.tsx:359`) with a same-origin source. Recommended: a Next route handler at `app/letters/[id]/qr.png/route.ts` that QR-encodes `https://{request host}/l/{id}` (mirrors the FastAPI behavior, which keyed off `request.url.netloc`) and returns `image/png`. Needs a JS QR lib (`qrcode`) added to `frontend/`. The preview's `<a href="/l/{id}">` already carries the click path, so this only restores the *scannable* image.
3. **Inline the prompt.** Replace the runtime `readFileSync(join(process.cwd(),"..","backend","prompts","letter_explainer.txt"))` (`frontend/app/(phone)/l/[id]/page.tsx:16-19`) with the 18-line system prompt as a TS constant (or a file under `frontend/`). This is what unblocks deleting `backend/`.
4. **Fix env schema.** Delete `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_ONE_LOGIN_URL` from the `schema` object in `frontend/lib/env.ts` (they have no consumer and the two Supabase ones hard-fail boot). Once letters are inlined, also drop `NEXT_PUBLIC_API_URL`.
5. **Un-ignore + commit the vendor assets** (`public/vendor/govuk-frontend.scoped.css`, `public/vendor/govuk-logotype.svg`). This is mandatory in **every** end-state — without it the `/actions/*` pages and the in-chat GOV.UK overlay render unstyled and the crown 404s on a fresh clone. With `scoped.css` committed, the `copy-govuk-assets.ts` script and the `govuk-frontend` dependency (which only produce the unused `min.css`) can both be deleted.

Everything below assumes this set is done. The end-states diverge on **deployment shape**, not on this work.

---

## End-State A (RECOMMENDED) — Single Next.js app on Vercel

The whole repo becomes one Next.js app. `backend/`, `supabase/`, Docker, Poetry, and the DB-oriented `Makefile` targets are **gone**.

### Resulting repo shape
```
/ (the Next.js app — collapse frontend/ to root)
  app/            (phone) routes, letters/[id]/preview, letters/[id]/qr.png/route.ts,
                  api/eleven/signed-url/route.ts, layout, not-found
  components/     convai-leaf, auto-fill-form, govuk-embed, language-picker, back-button
  lib/            env.ts (trimmed), letters.ts (inlined data + getLetter), letter-format.ts,
                  letter-explainer prompt constant
  public/         HMRC_logo.png, logo.png, assets/fonts/*, vendor/{scoped.css,logotype.svg}
  next.config.ts  package.json  tsconfig.json  postcss.config.mjs  globals.css
```
**Gone:** the entire `backend/` tree (FastAPI app, `asyncpg` pool, all five routers, both ops scripts, `data/`, `prompts/`), the entire `supabase/` tree (migrations, `seed.sql`, `config.toml`), the Supabase/Docker/Poetry toolchain, `scripts/copy-govuk-assets.ts`, the `govuk-frontend` dep, and the dead frontend bits (`getHealth`/`Health` in `lib/api.ts`, dead assets `GovUK_example_ss.png`/`GovUK_logo.png`/`letter_reference.png`).

> **Monorepo-dir note:** collapsing `frontend/` to the repo root is the cleanest single-app shape. The zero-file-move alternative is to keep `frontend/` and set Vercel's **Root Directory = `frontend`** — functionally identical deploy, less churn. Either is fine; collapsing wins marginally on "least ongoing complexity" because there is then exactly one `package.json` and no nesting.

### Deploy target
**Vercel.** It is the native first-party host for the Next.js App Router: the `/api/eleven/signed-url` and `/letters/[id]/qr.png` route handlers run as serverless functions automatically, `next/font/google` self-hosting works at build, and there is zero infra config. (Any Node host — Render/Fly/Railway/a container — also works since this is a plain `next build && next start`; Vercel is simply the lowest-friction.)

### Cold-deploy command sequence
Git-driven (recommended): connect the repo in the Vercel dashboard, set the 4 env vars, push. Or fully from the CLI:
```bash
# 0. one-time: rotate XI_API_KEY (the old one is committed in .env history)
pnpm install                 # single workspace; no Poetry, no Supabase, no Docker
pnpm build                   # local sanity check (standard Node build)
vercel link
vercel env add XI_API_KEY production                    # server secret
vercel env add NEXT_PUBLIC_AGENT_ID production
vercel env add NEXT_PUBLIC_XI_VOICE_ID_ENGLISH production
vercel env add NEXT_PUBLIC_XI_VOICE_ID_WELSH production
vercel --prod
```
That is the entire cold start: install → build → deploy. No services to provision, no migrations to replay, no second process.

### Exact runtime env vars
| Var | Kind | Used by |
|---|---|---|
| `XI_API_KEY` | server secret | `app/api/eleven/signed-url/route.ts:13` |
| `NEXT_PUBLIC_AGENT_ID` | public, build-inlined | `app/api/eleven/signed-url/route.ts:15` |
| `NEXT_PUBLIC_XI_VOICE_ID_ENGLISH` | public | `components/convai-leaf.tsx:342,387` |
| `NEXT_PUBLIC_XI_VOICE_ID_WELSH` | public | `components/convai-leaf.tsx:386` |

Four vars, one of them secret. Nothing else.

### Migration effort / risk
**Effort: moderate, fully mechanical.** The five substitution steps above plus deleting two top-level directories. No new behavior, no schema design. **Risk: low.** The only non-trivial new code is the QR route handler (a ~15-line handler around `qrcode`), and its output is visually verifiable against the baseline screenshots. The one true landmine — the un-tracked vendor assets — is closed by step 5 and is a prerequisite for *any* deploy. **Out-of-band prerequisite (not a deploy blocker, true in every option):** the ElevenLabs agent named by `NEXT_PUBLIC_AGENT_ID` must already exist with `conversation_config_override` + auth enabled (provisioned once via `setup_eleven_agent.py`); the demo overrides the prompt per-session, so it needs the agent to *exist in the right shape*, not the setup script at runtime.

---

## End-State B — Keep the monorepo, mock the data layer (two-process)

Keep both `frontend/` and a slimmed `backend/`, but cut the database: the FastAPI `letters` router serves the two letters from a static in-process Python module (and keeps its `qrcode` endpoint), so `supabase/`, Docker, Postgres, and the `asyncpg` pool/lifespan are deleted. The frontend keeps calling `NEXT_PUBLIC_API_URL`.

### Resulting repo shape
`supabase/`, the DB Makefile targets, `asyncpg`, and the unused routers (`items`, `scan_events`, `govuk`, `/check`, `/health`) are gone. What **stays** that End-State A deletes: the FastAPI app itself (now a thin static server), `backend/pyproject.toml` + Poetry, the `letters` + `qr.png` routes, CORS config, and the frontend's `NEXT_PUBLIC_API_URL` coupling (`lib/api.ts:92`).

### Deploy target
**Two runtimes, two deploys.** Next.js on Vercel (or any Node host) **plus** FastAPI on a Python host (Render/Fly/Railway or a container). They must be wired together: `NEXT_PUBLIC_API_URL` → the deployed FastAPI origin, and FastAPI `CORS_ORIGINS` → the deployed frontend origin.

### Cold-deploy command sequence
```bash
# Backend
poetry install
poetry run uvicorn app.main:app   # deploy to a Python host; note its public URL
# Frontend (separately)
pnpm install && pnpm build
# set NEXT_PUBLIC_API_URL=<backend url>, set backend CORS_ORIGINS=<frontend url>
# deploy frontend; re-deploy whenever either URL changes
```

### Exact runtime env vars
Frontend: the four from End-State A **plus** `NEXT_PUBLIC_API_URL`. Backend: `DATABASE_URL` is gone (data is static), but you still carry `CORS_ORIGINS` and the FastAPI process config. More vars, two `.env` surfaces.

### Migration effort / risk
**Effort: similar to A** (still must inline data — just into Python instead of TS — and still must fix env + vendor assets), but you do *not* get to delete the backend, so you keep maintaining it. **Risk: higher ongoing.** Two runtimes means two cold starts, a CORS handshake that breaks on any URL change, Poetry/Python in the deploy pipeline, and a chicken-and-egg env ordering (frontend build needs the backend URL). **This buys nothing the demo uses** — the backend would serve two immutable constants and a QR. It is strictly more operational surface than A for identical behavior. Kept here only as the "preserve the structure" option; it loses on both ranking axes.

---

## End-State C — Static export (`output: "export"`) + external signer

Force `next.config.ts` `output: "export"` to emit a pure static bundle deployable to any CDN/object store (S3, GitHub Pages, Cloudflare Pages static).

### Why pure static export is blocked
`output: "export"` **drops all server runtimes** — route handlers and server-only code are not emitted. That directly kills `app/api/eleven/signed-url/route.ts`, which is the one runtime that must survive: it exists precisely so `XI_API_KEY` is used **server-side only** and never reaches the browser (`route.ts:11-21`). Under static export there are only two ways to get a signed URL, both bad:
- **Inline `XI_API_KEY` into the client** (e.g. call ElevenLabs from the browser) — leaks the secret to every visitor. Non-starter.
- **Host the signing route elsewhere** — a standalone serverless function (Vercel/Cloudflare/Lambda). This *works*, but it reintroduces exactly one server runtime, on a *second* platform, with its own deploy, secret store, and CORS — i.e. you've recreated End-State A's single server function the hard way, split across two hosts.

The QR is independently solvable under static export (pre-bake two PNGs into `public/`, or encode client-side), so QR is **not** the blocker — the ElevenLabs secret is.

### Deploy target
Static CDN for the bundle **+** a separate function host for the signer. Two systems.

### Cold-deploy command sequence
```bash
pnpm install
pnpm build         # with output: "export" → emits out/
# upload out/ to the CDN
# separately: deploy the signing function, set XI_API_KEY on it, set CORS, wire the URL
```

### Exact runtime env vars
The three `NEXT_PUBLIC_*` voice/agent vars are build-inlined into the static bundle. `XI_API_KEY` lives only on the **external** signer function. The browser must also be told the signer's URL (another public var). More moving parts than A.

### Migration effort / risk
**Effort: highest.** On top of the common substitution set, you must split the signer into a separate deployable, wire CORS, pre-bake or client-encode the QR, and verify nothing else trips `output: "export"`'s constraints. **Risk: a real secret-exposure trap** (the tempting "just call ElevenLabs from the client" shortcut is a security hole) plus two systems to keep in sync. **No payoff** for this app: Vercel already serves the hybrid (static pages + the one function) for free in End-State A, so static export trades away the built-in server route for nothing. Ranked last.

---

## Ranking

| Rank | End-state | Ongoing complexity | Cold deploy | Runtimes |
|---|---|---|---|---|
| **1** | **A — single Next app on Vercel** | **Lowest** (one app, one host, 4 env vars) | **Easiest** (install → build → deploy) | 1 |
| 2 | B — monorepo, mocked data | Higher (2 processes, CORS, Poetry) | Two coupled deploys | 2 |
| 3 | C — static export + signer | Highest (split signer, secret trap) | Two systems, manual wiring | 2 |

## Final recommendation

**Adopt End-State A: collapse the repo to a single Next.js app, delete `backend/` + `supabase/` + Docker/Poetry, inline the two letters and the system prompt, serve the QR from a same-origin Next route handler, trim `lib/env.ts` to the four ElevenLabs vars, commit the two git-ignored GOV.UK vendor assets, and deploy to Vercel.** It is decisively the best on both axes the brief asks for: *easiest cold deploy* (a from-scratch start is just `pnpm install && pnpm build && vercel --prod` with four env vars — no DB to provision, no migrations to replay, no second process to wire) and *least ongoing complexity* (one codebase, one runtime, one host, one secret). Crucially it keeps the **only** runtime the app genuinely needs — the `/api/eleven/signed-url` server route that protects `XI_API_KEY` — running natively on the platform built for it, which is exactly what disqualifies the static-export variant (C) and makes the two-process variant (B) pure overhead. Every step is mechanical and verifiable against the captured baseline screenshots, so the 16-step flow is preserved with low risk; the single must-not-forget item — committing `public/vendor/govuk-frontend.scoped.css` and `govuk-logotype.svg` — is shared by all options and is the one thing that silently breaks a fresh clone.
