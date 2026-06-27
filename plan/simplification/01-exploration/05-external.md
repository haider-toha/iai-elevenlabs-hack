# 05 — External Services (Exploration)

**Domain:** Every third-party / cross-process dependency, split into RUNTIME (hit
during the live demo flow) vs SETUP/BUILD-TIME (provisioning only) vs DEAD.
**Goal context:** the simplification target is a backend-less cold deploy — a
Next.js app with one server route for ElevenLabs. This report establishes exactly
which external dependencies survive that cut and which can be deleted.

Repo root: `/Users/haidertoha/Code/i.ai_hackathon` (frontend = `frontend/`,
backend = `backend/`, db = `supabase/`).

---

## Bucket 1 — ACTIVELY USED AT RUNTIME (in the demo flow)

### 1.1 ElevenLabs Conversational AI — the core, and the ONLY service that must survive

Two cooperating halves:

**(a) Server route — signed-URL minting (the one server route to keep).**
`frontend/app/api/eleven/signed-url/route.ts`
- `GET` handler reads the server-only secret `XI_API_KEY` via `serverEnv()`
  (`route.ts:13`; `serverEnv` defined in `frontend/lib/env.ts:32-43`).
- Calls `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${env.NEXT_PUBLIC_AGENT_ID}`
  with header `xi-api-key: XI_API_KEY` (`route.ts:14-17`).
- Returns only `{ signedUrl }` to the browser — the key never leaves the server
  (`route.ts:20-21`). This is the entire reason a server runtime is still needed.

**(b) Client — live WebSocket voice session.**
`frontend/components/convai-leaf.tsx`
- Imports `@elevenlabs/react` (`convai-leaf.tsx:3-7`; dep in `frontend/package.json:20`,
  `"@elevenlabs/react": "^1.8.0"`).
- `fetchSignedUrl()` calls the route above: `fetch("/api/eleven/signed-url")`
  (`convai-leaf.tsx:1224`).
- `startSession({ signedUrl, overrides: { agent: { prompt, language, firstMessage },
  tts: { voiceId } } })` (`convai-leaf.tsx:330-344` English; `389-402` Welsh restart).
- Voice IDs read from env: `env.NEXT_PUBLIC_XI_VOICE_ID_ENGLISH`
  (`convai-leaf.tsx:342, 387`) and `env.NEXT_PUBLIC_XI_VOICE_ID_WELSH`
  (`convai-leaf.tsx:386`).
- Agent is the one referenced by `NEXT_PUBLIC_AGENT_ID` (used only in the server
  route URL, `route.ts:15`).
- Also depends on the browser mic API `navigator.mediaDevices.getUserMedia`
  (`convai-leaf.tsx:327`) — a browser capability, not a third party.

**Important runtime nuance — the prompt is overridden client-side.** The agent's
*base* prompt/KB/RAG/LLM are configured at setup time (see 2.1), but every live
session REPLACES the prompt with `${systemPrompt}\n\n${letterBlock}`
(`convai-leaf.tsx:338, 396`) and overrides `language` + `tts.voiceId`. For these
overrides to be accepted, the agent must have been provisioned with
`conversation_config_override` enabled and `auth.enable_auth: true`
(`backend/scripts/setup_eleven_agent.py:224-235`). So the demo depends on the
agent *existing in the right shape*, not on re-running setup.

**No Anthropic dependency.** The agent's LLM is `claude-sonnet-4-5`
(`setup_eleven_agent.py:184`), but it is hosted and billed *by ElevenLabs* on the
agent config. There is no `ANTHROPIC_API_KEY`, no `@anthropic-ai/*` package, and
no direct Anthropic call anywhere in the repo (frontend or backend). Anthropic is
NOT an external service this app integrates with directly.

> **EXACT minimal runtime requirement (ElevenLabs):**
> 1 Next.js server route (`/api/eleven/signed-url`)
> + `XI_API_KEY` (server-only secret)
> + `NEXT_PUBLIC_AGENT_ID` (one pre-provisioned agent, overrides + auth enabled)
> + `NEXT_PUBLIC_XI_VOICE_ID_ENGLISH` + `NEXT_PUBLIC_XI_VOICE_ID_WELSH`
> + the `@elevenlabs/react` client package
> + browser mic permission.
> Current English/Welsh voice IDs in `.env.example`: `YCMgeo2Dvws6xwm7kQNN`
> (English), `73fZMjboCm1aBVyxTbBp` (Welsh).

### 1.2 FastAPI backend — currently runtime, but it is the thing to eliminate

The browser/server calls the backend over `NEXT_PUBLIC_API_URL`
(`frontend/lib/env.ts:12`, default `http://localhost:8000`). Only THREE backend
touch-points are actually exercised by the demo:

1. **`getLetter(id)` → `GET {API_URL}/letters/{id}`** (`frontend/lib/api.ts:91-98`).
   Called by three async Server Components:
   - `frontend/app/(phone)/l/[id]/page.tsx:33` (the QR/cold-open conversation page)
   - `frontend/app/letters/[id]/preview/page.tsx:45` (the HMRC facsimile)
   - `frontend/app/(phone)/actions/update-company-car/[letterId]/page.tsx:21`
   Backend handler: `backend/app/api/routers/letters.py:13-18`, data from Postgres
   `letters` table via `backend/app/repositories/letters.py:11-26`.

2. **QR PNG → `GET {API_URL}/letters/{id}/qr.png`** rendered as an `<img src>` in
   `frontend/app/letters/[id]/preview/page.tsx:359`. Backend handler
   `backend/app/api/routers/letters.py:38-56` uses the `qrcode` lib and encodes
   `https://{request.url.netloc}/l/{letter_id}` (so the encoded URL is the
   *deployed host* at request time — see ambiguity 3.4).

3. The backend itself depends on **Postgres** (local Supabase or hosted) via an
   `asyncpg` pool (`backend/app/main.py:31-37`, `DATABASE_URL` in
   `backend/app/config.py:14`). All letter content is **static demo data** — two
   rows, `maria-p2` and `maria-p800` — seeded in
   `supabase/migrations/20260625090200_seed_demo_letters.sql`. This is exactly the
   data to inline (quoted in §4).

> **EXACT minimal runtime requirement (backend, as-is):** `/letters/{id}` (JSON)
> + `/letters/{id}/qr.png` (PNG) + a Postgres DB holding 2 static rows. Everything
> the backend serves to the live demo is static — which is why the backend can be
> eliminated by inlining the two letters and replacing the QR (see §3.3-3.5).

### 1.3 Google Fonts — BUILD-TIME only (self-hosted), no runtime call

`frontend/app/layout.tsx:3` uses `next/font/google` → `Hanken_Grotesk` +
`Newsreader`. `next/font/google` downloads the font files at **build time** and
self-hosts them in the bundle; there is no request-time call to fonts.googleapis.com.
Listed here (not "dead") because it is a real build-time network dependency for a
cold deploy. (Aside: CLAUDE.md's design rules name "Familjen Grotesk" but the code
uses `Hanken_Grotesk` — not relevant to external-service mapping.)

### 1.4 GOV.UK Design System assets — RUNTIME, but served from `public/` (no service)

`frontend/components/govuk-embed.tsx:46` loads `/vendor/govuk-frontend.scoped.css`
and `/vendor/govuk-logotype.svg` (`govuk-embed.tsx:130`); the action pages reuse
the same logotype (`app/(phone)/actions/update-company-car/[letterId]/page.tsx:88`).
These are **static files already committed** under `frontend/public/vendor/`
(`govuk-frontend.min.css`, `govuk-frontend.scoped.css`, `govuk-logotype.svg`) and
`frontend/public/HMRC_logo.png` / `GovUK_logo.png`. At runtime this is plain static
asset serving — NOT an external service. The npm package + copy script that produce
them are build-time only (see 2.3).

---

## Bucket 2 — PRESENT AT SETUP / BUILD-TIME ONLY (never on the live path)

### 2.1 ElevenLabs agent provisioning — `backend/scripts/setup_eleven_agent.py`
Standalone ops CLI (`setup_eleven_agent.py:1-13`). Uses `XI_API_KEY`
(`setup_eleven_agent.py:111`, read from `backend/.env`) to: upload the GOV.UK KB
docs, create RAG indexes, create the `switch_language` client tool, and
create/update the "Letter Explainer" agent with `llm: claude-sonnet-4-5`, TTS model
`eleven_v3_conversational`, pronunciation dict, ASR keyterms, Welsh language preset,
and overrides+auth enabled (`setup_eleven_agent.py:177-243`). On success it writes
`NEXT_PUBLIC_AGENT_ID` back into `frontend/.env` (`setup_eleven_agent.py:254-261`).
→ Setup-time. Its *output* (the provisioned agent) is a runtime prerequisite, but
the script itself is never invoked by the demo. Uses `XI_VOICE_ID_ENGLISH` /
`XI_VOICE_ID_WELSH` from `backend/.env` (`setup_eleven_agent.py:202, 219`).

### 2.2 GOV.UK Content API — `https://www.gov.uk/api/content/...`
Hit only by:
- `backend/scripts/pull_govuk.py` (standalone seeding script; `GOVUK_API` at
  `pull_govuk.py:28`, paths at `pull_govuk.py:31-38`), and
- `POST /govuk/refresh` (`backend/app/api/routers/govuk.py:58-83`).
Both write plain-text markdown into `backend/data/govuk/*.md` (six files already
committed: `income-tax.md`, `tax-codes.md`, etc.). The frontend never calls
`/govuk/refresh`. → Build/setup-time corpus refresh only.

### 2.3 `govuk-frontend` npm package + copy script
`frontend/package.json:21` (`"govuk-frontend": "^6.3.0"`) +
`frontend/scripts/copy-govuk-assets.ts` (run via `predev`/`prebuild`,
`package.json:7,9`). The script copies `govuk-frontend.min.css` into
`public/vendor/` (`copy-govuk-assets.ts:12-16`). Note: the *scoped* stylesheet
`public/vendor/govuk-frontend.scoped.css` consumed at runtime (1.4) is a separately
committed/derived file — no script in the repo regenerates it (grep for "scoped"
finds only the runtime `<link>` reference). → Build-time.

### 2.4 Playwright letter export — `frontend/scripts/export-letter.ts`
Launches headless Chromium to screenshot `/letters/{id}/preview` into
`out/{id}.pdf` + `out/{id}.png` (`export-letter.ts`). The committed `frontend/out/`
holds `maria-p2.pdf` / `maria-p2.png`. `@playwright/test` + `playwright` are
devDependencies (`package.json:28,36`). → Dev tooling, never runtime.

---

## Bucket 3 — DEAD / UNUSED AT RUNTIME (proven by zero references)

### 3.1 Supabase (`@supabase/supabase-js`) — entirely unwired
- `@supabase/supabase-js` is **NOT a dependency**: 0 hits for `@supabase` in
  `frontend/pnpm-lock.yaml`; `frontend/node_modules/@supabase` does not exist;
  no `createClient` / `supabase-js` import anywhere in `app/`, `components/`,
  `lib/`, `scripts/` (grep returns NONE).
- The vars `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  appear **only** in `frontend/lib/env.ts:13-14, 23-25`. They are required by the
  zod schema (no `.default()`), so they must be *present* or the env parse throws —
  but no component ever reads them. No Supabase Auth flow (login/signup) exists.
- `.env.example:24-26` describes them as "Auth only", but that path was never built
  on the frontend.
→ **Verdict:** the two `NEXT_PUBLIC_SUPABASE_*` vars are dead; delete from
`env.ts` and `.env`. (The *backend's* Postgres happens to be Supabase-hosted-or-
local, but that's the DB layer, eliminated with the backend — not the JS Auth SDK.)

### 3.2 GOV.UK One Login simulator — dead var
`NEXT_PUBLIC_ONE_LOGIN_URL` appears **only** in `frontend/lib/env.ts:18, 29`
(has a default). Zero usages in any component/page (grep NONE). `.env.example:28-30`
references a `ghcr.io/govuk-one-login/simulator` Docker container that nothing in
the code touches. → Delete the var; no auth simulator is wired.

### 3.3 `getHealth()` — dead function
`frontend/lib/api.ts:13-24` defines `getHealth()` → `GET {API_URL}/health`, but it
has **zero callers** (grep `getHealth` across `app/components/lib` returns only the
definition). The backend `/health` route (`backend/app/api/routers/health.py`) is
never hit by the demo.

### 3.4 Backend routes the frontend never calls
- `POST /letters/{id}/check` — formula audit (`backend/app/api/routers/letters.py:21-31`).
  No frontend caller; `suspected_errors` ship pre-computed inside the letter payload
  (`lib/api.ts:39-45, 61`), consumed in `convai-leaf.tsx:181-182, 494`.
- `POST /scan-events` (`backend/app/api/routers/scan_events.py`) + the `scan_events`
  table — analytics; no frontend caller (grep `scan-events` in frontend = NONE).
- `/items` router (`backend/app/api/routers/items.py`) — explicit in-memory
  SCAFFOLD ("SCAFFOLD: in-memory stand-in", items.py).
→ All confirm the backend's live surface is just §1.2's two reads.

---

## Bucket 4 — AMBIGUOUS / NEEDS-DECISION (for the inlining phase)

### 4.1 Agent must be pre-provisioned (setup-time prerequisite)
The live demo needs an existing ElevenLabs agent with `conversation_config_override`
+ `auth` enabled. For a cold deploy you must run `setup_eleven_agent.py` ONCE
against the target workspace (which requires `backend/.env` with `XI_API_KEY` +
voice IDs and a working Poetry env), or point `NEXT_PUBLIC_AGENT_ID` at an
already-provisioned agent. **Decision:** keep the setup script reachable even if the
FastAPI server is deleted, or document a one-time manual provisioning step.

### 4.2 Agent LLM + voice model availability
The agent uses `claude-sonnet-4-5` (`setup_eleven_agent.py:184`) and TTS model
`eleven_v3_conversational` (`setup_eleven_agent.py:208`), the only ConvAI model that
supports Welsh (`cy`). **Decision:** confirm the deployer's ElevenLabs plan grants
both; otherwise Welsh-switch and/or the LLM choice silently differ. (No Anthropic
key involved — billed via ElevenLabs.)

### 4.3 System-prompt filesystem coupling (blocks backend deletion)
`frontend/app/(phone)/l/[id]/page.tsx:16-19` reads
`../backend/prompts/letter_explainer.txt` via `readFileSync(join(process.cwd(),
"..", "backend", "prompts", "letter_explainer.txt"))` at server-render time. This is
a hard cross-package FS dependency: if `backend/` is removed from the deploy, every
`/l/[id]` render throws. **Decision:** inline the 18-line prompt as a TS constant or
move the file into `frontend/`. (File confirmed present, 2.8 KB.)

### 4.4 QR PNG generation moves off the server
The preview page's `<img src={API_URL/letters/{id}/qr.png}>`
(`letters/[id]/preview/page.tsx:359`) is generated by FastAPI. Eliminating the
backend breaks it. The QR encodes `https://{request.url.netloc}/l/{id}` — the
*deployed* host. **Decision:** pre-generate a static QR baked with the final deploy
URL, generate client-side (e.g. a QR lib), or drop the image (the page is a
facsimile; the QR's `<a href>` already links to `/l/{id}`).

### 4.5 Letter data to inline
The two demo letters live in Postgres (seeded SQL). To go backend-less, inline them
as typed objects matching the `Letter` discriminated union in `frontend/lib/api.ts:47-85`.
Source of truth = `supabase/migrations/20260625090200_seed_demo_letters.sql`. Verbatim
values the inlining phase needs:

**`maria-p2` (P2 / PAYE Coding Notice):**
- `recipient_name`: `Ms Maria Davies`, `nino_masked`: `QQ 12 34 ▒▒ C`,
  `tax_year`: `2026 to 2027`, `personal_allowance`: `12570`,
  `issue_date`: `2026-04-06`, `employer_name`: `Bridgwater & Co Ltd`,
  `current_code`: `883L`, `standard_code`: `1257L`, `tax_free_amount`: `8830`.
- `confusing_line`: "We have included an adjustment to reduce your tax-free
  allowance by £3,740 so we can collect the tax in equal instalments."
- `lines`: [Personal Allowance +12570 (source `allowance`, anchor `income-tax`),
  Car benefit −3740 (source `company_benefit`, anchor `tax-company-benefits`)].
- `suspected_errors`: [{ line_label "Car benefit", reason "You told us you no longer
  have this company car — you returned it to your previous employer last year.",
  est_annual_overpay 748, est_monthly_overpay 62, fix_action "Update your company
  car details in your Personal Tax Account so HMRC can correct your tax code." }].

**`maria-p800` (P800 / Tax Calculation):**
- `recipient_name`: `Ms Maria Davies`, `nino_masked`: `QQ 12 34 ▒▒ C`,
  `tax_year`: `2025 to 2026`, `personal_allowance`: `12570`,
  `p800_reference`: `P800-2026-0R4291`, `total_income`: `24800`, `tax_due`: `2446`,
  `tax_paid`: `3194`, `result`: `overpaid`, `amount`: `748`,
  `claim_method`: "online bank transfer (5 working days) or cheque (6 weeks)".
- `confusing_line`: "Our calculation shows you paid too much tax because your tax
  code did not change when your company car benefit ended."

(The `scan_events` rows in the same migration are analytics for the unused
`/scan-events` path and do NOT need inlining.)

---

## Summary table

| Service / dependency | Bucket | Evidence |
|---|---|---|
| ElevenLabs ConvAI (signed-url + WS session) | RUNTIME (keep) | `route.ts`, `convai-leaf.tsx`, `env.ts` |
| FastAPI `/letters/{id}` (letter JSON) | RUNTIME (eliminate via inline) | `lib/api.ts:91`, `letters.py:13` |
| FastAPI `/letters/{id}/qr.png` | RUNTIME (eliminate, see 4.4) | `preview/page.tsx:359`, `letters.py:38` |
| Postgres (Supabase/local) — backend DB | RUNTIME of backend only | `main.py:31`, seed migration |
| Google Fonts (`next/font/google`) | BUILD-TIME (self-hosted) | `layout.tsx:3` |
| GOV.UK static assets in `public/vendor` | RUNTIME static (no service) | `govuk-embed.tsx:46,130` |
| `setup_eleven_agent.py` (agent provisioning) | SETUP-TIME prereq | `setup_eleven_agent.py` |
| GOV.UK Content API | SETUP/BUILD-TIME | `pull_govuk.py`, `govuk.py` |
| `govuk-frontend` pkg + copy script | BUILD-TIME | `copy-govuk-assets.ts` |
| Playwright export | DEV TOOLING | `export-letter.ts` |
| `@supabase/supabase-js` | DEAD (not even installed) | 0 in lockfile/node_modules |
| `NEXT_PUBLIC_SUPABASE_*` vars | DEAD | `env.ts:13-14` only |
| `NEXT_PUBLIC_ONE_LOGIN_URL` | DEAD | `env.ts:18` only |
| `getHealth()` / `/health` | DEAD | `lib/api.ts:13`, 0 callers |
| `/letters/{id}/check`, `/scan-events`, `/items` | DEAD (no FE caller) | routers; grep NONE in FE |

## Bottom line for the simplification goal
The backend can be eliminated. Its only live contributions are (a) two static
letters and (b) a server-rendered QR. Inline the letters (§4.5), resolve the QR
(§4.4) and the system-prompt FS read (§4.3), and the deployed demo reduces to a
Next.js app whose sole runtime external dependency is **ElevenLabs**, reached
through the single server route `/api/eleven/signed-url`. Supabase, One Login, and
the `getHealth`/`check`/`scan-events`/`items` surfaces are dead and can be deleted
outright.
