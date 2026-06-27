# Backend Exploration — Simplification Phase 01

Scope: full map of `backend/` (FastAPI) for the Marginalia demo, cross-checked
against the Next.js frontend to prove what is actually called at runtime. Goal
of the wider effort: simplify toward a cold deploy by (likely) eliminating the
FastAPI backend and inlining the static demo letters, leaving the Next.js app
with one server route for ElevenLabs.

Repo root: `/Users/haidertoha/Code/i.ai_hackathon`

---

## 0. App wiring (read first)

- `backend/app/main.py` — thin app factory. Lifespan opens one `asyncpg` pool
  (`main.py:33-36`) and registers a `jsonb` codec (`main.py:18-25`); mounts five
  routers in `create_app()` (`main.py:51-55`): `health`, `items`, `letters`,
  `govuk`, `scan_events`. CORS allows `cors_origins` (default
  `http://localhost:3000`).
- `backend/app/config.py` — `Settings(BaseSettings)`. Fields: `app_name`
  (`"Marginalia"`), `debug`, `cors_origins`, `database_url` (default local
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres`), `xi_api_key`
  (default `""`), `environment`, `log_level`.
- `backend/app/api/deps.py` — `SettingsDep` and `get_db`/`DbConn` (acquires a
  connection from `app.state.pool`, `deps.py:26-32`). These are the only two
  injectable deps.

The only shared runtime resource is the Postgres pool. Every DB-touching route
goes through `DbConn`.

---

## Runtime call map (frontend → backend), evidence-based

All frontend HTTP calls to the backend go through `frontend/lib/api.ts`, which
is the single client. Source-only grep (excluding `.next/` build output) shows
exactly three functions and their call sites:

| Backend endpoint | Frontend code path | Called at runtime? |
|---|---|---|
| `GET /letters/{id}` | `getLetter()` `frontend/lib/api.ts:91-97` → called in 3 pages | YES |
| `GET /letters/{id}/qr.png` | `<img src>` `frontend/app/letters/[id]/preview/page.tsx:359` | YES |
| `GET /health` | `getHealth()` `frontend/lib/api.ts:13-25` | NO — **zero callers** |
| `POST /letters/{id}/check` | none | NO |
| `POST /scan-events` | none | NO |
| `POST /items`, `GET /items/{id}` | none | NO |
| `POST /govuk/refresh` | none | NO (ops/build-time) |

`getLetter` call sites (proof it is live):
- `frontend/app/(phone)/l/[id]/page.tsx:33` — the QR cold-open page (the core
  demo: fetches the letter, renders `ConvaiLeaf`).
- `frontend/app/(phone)/actions/update-company-car/[letterId]/page.tsx:21` — the
  "fix it" action screen.
- `frontend/app/letters/[id]/preview/page.tsx:45` — the printed-letter facsimile.

> **Note on `/health`:** the task brief assumed the frontend calls `/health`.
> It does **not**. `getHealth()` is defined in `frontend/lib/api.ts:13` but a
> source grep for `getHealth` returns only that definition — no caller anywhere
> in `app/`, `components/`, or `lib/`. `/health` is exercised only by
> `backend/tests/test_health.py`. Treat `/health` as **not used by the demo**.

---

## 1. ACTIVELY USED AT RUNTIME (in the demo flow)

### 1.1 `GET /letters/{letter_id}` → `read_letter`
- File: `backend/app/api/routers/letters.py:14-19`.
- Touches: **DB table `public.letters`** (read-only) via
  `get_letter()` in `backend/app/repositories/letters.py:13-24`
  (`select * from letters where id = $1`).
- External APIs: none.
- Response model: `P2Letter | P800Letter`
  (`backend/app/models/letters.py:35-70`). The discriminator is the `type`
  column; `jsonb` `lines`/`suspected_errors` arrive as Python lists via the
  pool codec.
- Frontend: validated by the Zod discriminated union in
  `frontend/lib/api.ts:64` and consumed by all three pages above. **This is the
  one endpoint the demo cannot lose.**
- Only two rows ever requested: `maria-p2` and `maria-p800` (the only seeded
  letters; ids referenced at `frontend/app/(phone)/conversations/page.tsx:9-10`,
  `frontend/app/(phone)/page.tsx:14`).

### 1.2 `GET /letters/{letter_id}/qr.png` → `letter_qr`
- File: `backend/app/api/routers/letters.py:38-52`.
- Touches: **no DB, no external API.** Pure in-process QR render with `qrcode`
  (`letters.py:46-52`). Encodes `https://{request.url.netloc}/l/{letter_id}`
  (`letters.py:45`).
- Frontend: rendered as an `<img>` on the printed-letter facsimile at
  `frontend/app/letters/[id]/preview/page.tsx:359`
  (`src={`${env.NEXT_PUBLIC_API_URL}/letters/${id}/qr.png`}`).
- For a backend-less deploy this is the only other runtime dependency — trivially
  replaceable by a Next route or a build-time/static PNG, since it touches
  nothing but the request host.

> **No data mutation occurs in the demo runtime path.** The two live endpoints
> are both reads/pure-compute. The `letters` table is read-only; nothing the
> demo calls writes to the DB.

---

## 2. PRESENT BUT UNUSED at runtime

Each item below is proven unused by: (a) no frontend source reference, and
(b) where relevant, where its only callers live.

### 2.1 `POST /letters/{letter_id}/check` → `check_letter`
- File: `backend/app/api/routers/letters.py:22-31`; logic in
  `backend/app/services/letter_check.py:25-39`.
- Would touch DB table `letters` (re-read) and run the deterministic P2 audit.
- **Unused:** no frontend reference to `/check` or `checkLetter` exists
  (grep across `*.ts`/`*.tsx` returns only the `SuspectedError` *type* import in
  `frontend/components/convai-leaf.tsx:17` and `lib/api.ts:39`). The frontend
  already receives `suspected_errors` **embedded in the `GET /letters` response**
  (`frontend/lib/api.ts:61`, used at `lib/letter-format.ts:48-49,92-93` and
  `components/convai-leaf.tsx:181-182`). The separate POST audit endpoint is
  never invoked.
- Note: `check_p2_letter()` (`letter_check.py`) is still a useful *reference*
  for how the seeded `suspected_errors` / `tax_free_amount` were derived
  (lines sum → £8,830 → code `883L`), but the route is dead at runtime.

### 2.2 `POST /scan-events` → `create_scan_event`
- File: `backend/app/api/routers/scan_events.py:15-18`; writes via
  `log_scan_event()` `backend/app/repositories/letters.py:27-39`
  (`insert into scan_events ...`).
- Touches: **DB table `public.scan_events` (the only WRITE path in the whole
  backend).**
- **Unused:** no frontend reference to `/scan-events`, `scanEvent`,
  `scan-event`, or `logScan` (grep returns nothing in source). This is the only
  runtime mutation endpoint and it is never called — confirming the demo
  performs **zero DB writes**.
- The `scan_events` table is pre-populated with ~50 synthetic rows by the seed
  migration (`supabase/migrations/20260625090200_seed_demo_letters.sql:71-123`),
  so any "heatmap" is static seed data, not live logging.

### 2.3 `GET /health` → `health`
- File: `backend/app/api/routers/health.py:14-16`.
- Touches: nothing (returns `{status, service}` from Settings).
- **Unused by the demo:** `getHealth()` has no caller (see note in section 0).
  Only `backend/tests/test_health.py` hits it.

### 2.4 `govuk.py` `POST /govuk/refresh` — see section 3 (ops/build-time).

### 2.5 Backend `Settings.xi_api_key`
- File: `backend/app/config.py:17`. The comment (`config.py:15-16`) claims
  "only POST /govuk/refresh needs it" — **this is inaccurate.** Grep proves
  `xi_api_key` is referenced **only** at its declaration; `refresh_govuk`
  (`govuk.py:57-79`) calls the public GOV.UK Content API with no key. The
  ElevenLabs key is consumed by the *frontend* server route
  (`frontend/app/api/eleven/signed-url/route.ts` via `serverEnv().XI_API_KEY`)
  and by the ops script (`scripts/setup_eleven_agent.py:111`, reading
  `os.environ` directly). **The FastAPI app never uses ElevenLabs.**

### 2.6 DB table `public.organizations`
- Created by `supabase/migrations/20260624101500_create_organizations.sql`,
  seeded by `supabase/seed.sql`. **No backend code references it**
  (grep `organization` over `backend/app` returns nothing). It is the reference
  migration pattern only.

---

## 3. SCAFFOLD / SETUP-OR-ADMIN ONLY

### 3.1 `items` router — SCAFFOLD (proven)
- File: `backend/app/api/routers/items.py`. `POST /items` (`items.py:23-27`),
  `GET /items/{item_id}` (`items.py:30-35`).
- Proof it is scaffold: the file self-documents it — `items.py:18-19`:
  *"SCAFFOLD: in-memory stand-in for a repository."* Storage is a module-level
  `dict` (`_items` `items.py:20`); **touches no DB, no external API.**
- No frontend reference (grep for `/items` returns nothing in source). Exercised
  only by `backend/tests/test_items.py`. **Delete-on-sight for simplification.**

### 3.2 `govuk` router — build-time KB sync (ops only)
- File: `backend/app/api/routers/govuk.py`. `POST /govuk/refresh`
  (`govuk.py:57-79`).
- Touches: **External API** — `https://www.gov.uk/api/content/{path}`
  (`govuk.py:64`) for six fixed slugs (`govuk.py:14-21`). Writes Markdown to
  `backend/data/govuk/*.md` (`govuk.py:72-74`). **No DB.**
- Not on any live demo path; it (re)builds the grounding corpus that the
  ElevenLabs agent uploads. Functionally duplicated by the standalone script
  `backend/scripts/pull_govuk.py` (same six slugs, same output dir). The
  six output files already exist on disk (`backend/data/govuk/*.md`), so a
  cold deploy needs neither.

### 3.3 Standalone scripts (never imported by the app)
- `backend/scripts/pull_govuk.py` — seeds `data/govuk/*.md` from the GOV.UK
  Content API. Ops-only; self-contained (does not import the app).
- `backend/scripts/setup_eleven_agent.py` — idempotent ElevenLabs bootstrap:
  uploads KB docs, creates/updates the "Letter Explainer" agent, creates the
  `switch_language` client tool, and rewrites `NEXT_PUBLIC_AGENT_ID` into
  `frontend/.env`. Uses `XI_API_KEY` / `XI_VOICE_ID_*` from `backend/.env`.
  Run manually; **not part of any request path.**

---

## 4. AMBIGUOUS / needs-decision

1. **QR generation (`GET /letters/{id}/qr.png`).** Actively used at runtime
   (section 1.2) but trivial — depends only on the request host. Decision: move
   to a Next route handler, generate the PNG at build time, or hardcode a static
   image. Cannot simply be dropped without changing
   `frontend/app/letters/[id]/preview/page.tsx:359`.

2. **Runtime file dependency on `backend/prompts/letter_explainer.txt`.** Not an
   HTTP call, but the frontend server component reads it from disk at runtime:
   `frontend/app/(phone)/l/[id]/page.tsx:16-19`
   (`readFileSync(join(process.cwd(), "..", "backend", "prompts",
   "letter_explainer.txt"))`). Eliminating `backend/` breaks this path. Decision:
   move/inline `letter_explainer.txt` into the frontend (it is also consumed by
   `scripts/setup_eleven_agent.py:30`, so keep one source of truth).

3. **`letter_check.py` derivation logic.** The route is dead (2.1), but the
   formula it encodes (lines sum → tax-free amount → suffix code) is the
   provenance of the seeded numbers. Decision: drop the route; keep the file's
   math only as documentation if the inlined letters need re-derivation. No
   runtime need.

4. **`scan_events` table + seed rows.** No runtime reader and no runtime writer
   in the codebase. If any future "heatmap" screen is intended it would need a
   reader; today it is inert. Decision: safe to drop with the backend.

---

## 5. Data to inline (captured for a later phase)

Eliminating the backend means `GET /letters/{id}` must be replaced by static
data for the only two ids the demo uses. Verbatim from
`supabase/migrations/20260625090200_seed_demo_letters.sql`:

### `maria-p2` (P2 / PAYE Coding Notice — the error-catch fixture)
- `recipient_name`: `Ms Maria Davies`
- `nino_masked`: `QQ 12 34 ▒▒ C`
- `tax_year`: `2026 to 2027`
- `personal_allowance`: `12570`
- `issue_date`: `2026-04-06`
- `employer_name`: `Bridgwater & Co Ltd`
- `current_code`: `883L`, `standard_code`: `1257L`
- `tax_free_amount`: `8830`
- `confusing_line`: `We have included an adjustment to reduce your tax-free
  allowance by £3,740 so we can collect the tax in equal instalments.`
- `lines` (jsonb):
  - `{ label: "Personal Allowance", amount: 12570, source_type: "allowance",
    plain_english: "The amount you can earn each year before you pay any Income
    Tax.", govuk_anchor: "income-tax" }`
  - `{ label: "Car benefit", amount: -3740, source_type: "company_benefit",
    plain_english: "HMRC believes you get a company car. This lowers your
    tax-free amount, so more tax is collected from your pay.", govuk_anchor:
    "tax-company-benefits" }`
- `suspected_errors` (jsonb):
  - `{ line_label: "Car benefit", reason: "You told us you no longer have this
    company car — you returned it to your previous employer last year.",
    est_annual_overpay: 748, est_monthly_overpay: 62, fix_action: "Update your
    company car details in your Personal Tax Account so HMRC can correct your
    tax code." }`

### `maria-p800` (P800 / Tax Calculation — the refund fixture)
- `recipient_name`: `Ms Maria Davies`
- `nino_masked`: `QQ 12 34 ▒▒ C`
- `tax_year`: `2025 to 2026`
- `personal_allowance`: `12570`
- `p800_reference`: `P800-2026-0R4291`
- `total_income`: `24800`, `tax_due`: `2446`, `tax_paid`: `3194`
- `result`: `overpaid`, `amount`: `748`
- `claim_method`: `online bank transfer (5 working days) or cheque (6 weeks)`
- `confusing_line`: `Our calculation shows you paid too much tax because your tax
  code did not change when your company car benefit ended.`

The frontend Zod shape these must satisfy is `letterSchema` in
`frontend/lib/api.ts:64` (money fields coerced to numbers; `type` is the
discriminant). The six GOV.UK grounding docs live at
`backend/data/govuk/*.md` (also needed by the ElevenLabs agent, not the live
page render).

---

## 6. Summary for simplification

To delete the FastAPI backend with no demo regression, the only runtime
substitutions required are:
1. **`GET /letters/{id}`** → inline the two letters above (section 5) into the
   frontend (a typed module behind `getLetter`).
2. **`GET /letters/{id}/qr.png`** → a Next route / static PNG (section 4.1).
3. **`backend/prompts/letter_explainer.txt`** → move into the frontend
   (section 4.2).

Everything else in `backend/` (`/health`, `/items`, `/letters/{id}/check`,
`/scan-events`, `/govuk/refresh`, the `asyncpg` pool, the `letters`/
`scan_events`/`organizations` tables, both ops scripts) is **not on the demo
runtime path** and can be removed. The ElevenLabs signed-URL flow is already a
Next.js route (`frontend/app/api/eleven/signed-url/route.ts`), independent of
FastAPI.
