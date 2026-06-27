# 02 — Research: Backend Elimination vs Hosting

**Question:** Can the FastAPI backend be eliminated entirely?
**Answer: YES — decisively. Eliminate it.** There is no demo behaviour that requires a separate Python service, a database, or any runtime mutation. Three concrete couplings stand between the current code and a backend-less deploy; all three have clean, low-risk frontend replacements specified below.

Repo root: `/Users/haidertoha/Code/i.ai_hackathon`. All paths absolute.

---

## 0. Why elimination is viable (the evidence in one place)

The demo's entire backend contact surface is **two read-only endpoints over two immutable rows**, plus **one runtime file read** of a static prompt:

| Coupling | Current implementation | Evidence | Runtime nature |
|---|---|---|---|
| Fetch a letter | `getLetter()` → `GET {NEXT_PUBLIC_API_URL}/letters/{id}` | `frontend/lib/api.ts:91-98`; backend `backend/app/api/routers/letters.py:14-19` → `select * from letters where id=$1` (`backend/app/repositories/letters.py:13-24`) | Read-only, 2 fixed slugs |
| Scannable QR PNG | `<img src={NEXT_PUBLIC_API_URL}/letters/{id}/qr.png>` | `frontend/app/letters/[id]/preview/page.tsx:359`; backend `backend/app/api/routers/letters.py:43-52` | Pure compute, **no DB** — encodes `https://{host}/l/{id}` from the slug only |
| Agent system prompt | `readFileSync(join(cwd,"..","backend","prompts","letter_explainer.txt"))` | `frontend/app/(phone)/l/[id]/page.tsx:16-19` | Static 19-line text file, read once per process |

Decisive facts (carried from Phase 1, re-verified against source):

- **Zero runtime mutations.** The only writer in the whole backend is `log_scan_event` (`backend/app/repositories/letters.py:27-39`) behind `POST /scan-events`; no frontend code ever calls it. The `letters` table is SELECT-only. So **no database is needed at runtime** — the data can be a TS literal.
- **Only two rows are ever requested:** `maria-p2`, `maria-p800` (`frontend/app/(phone)/page.tsx:14`, `frontend/app/(phone)/conversations/page.tsx:9-12`). Their exact contents are in `supabase/migrations/20260625090200_seed_demo_letters.sql:14-66` and reproduced verbatim in §1.1.
- **The TS shape already exists** as the Zod discriminated union in `frontend/lib/api.ts:31-85` — the inline target is a solved problem.
- **The QR endpoint touches no DB** — it reads only `request.url.netloc` and the path slug (`backend/app/api/routers/letters.py:45`). It is trivially same-origin-replaceable.
- **The app is already not a static export** (`frontend/next.config.ts` sets only `reactStrictMode`/`devIndicators`; the keep-alive server route `frontend/app/api/eleven/signed-url/route.ts` needs `XI_API_KEY`). So adding one same-origin route handler for the QR introduces **no new architectural constraint** — there is already a Node/SSR host.
- **The FastAPI app never uses ElevenLabs.** `settings.xi_api_key` is referenced only at its declaration (`backend/app/config.py:17`); the signed-URL minting is wholly inside the Next route. Removing FastAPI does not touch the voice path.

Everything else in `backend/` (`/health`, `/items`, `/letters/{id}/check`, `/scan-events`, `/govuk/refresh`, the asyncpg pool, the `letters`/`scan_events`/`organizations` tables, both ops scripts) is provably off the demo path (Phase 1 reports 02/03/04). Nothing is lost by deleting it.

---

## 1. EXACTLY what must change in the frontend

### 1.1 Inline the two letters as typed static data

Create `frontend/lib/letters.ts` holding the data + the lookup, and **drop Zod for this data**. Per CLAUDE.md, "Zod lives only at trust boundaries." An inline TS literal we author is not a boundary — it is typed by the compiler. So the `letterSchema.parse(...)`, the `z.coerce.number()` `money` helper (`frontend/lib/api.ts:29`), `getHealth`/`Health`, and the `env`/`fetch` machinery all disappear. Keep only the *types* (convert the `z.infer` aliases to plain types, or re-derive them).

Type shape to preserve (identical fields to `frontend/lib/api.ts:31-85`, money as plain `number`, `issue_date` as an ISO string literal):

```ts
export type CodeLine = {
  label: string;
  amount: number; // signed: additions +, deductions −
  source_type: string;
  plain_english: string;
  govuk_anchor: string;
};
export type SuspectedError = {
  line_label: string;
  reason: string;
  est_annual_overpay: number;
  est_monthly_overpay: number;
  fix_action: string;
};
export type P2Letter = {
  type: "p2";
  id: string;
  recipient_name: string;
  nino_masked: string;
  tax_year: string;
  issue_date: string;
  employer_name: string;
  current_code: string;
  standard_code: string;
  personal_allowance: number;
  lines: CodeLine[];
  tax_free_amount: number;
  confusing_line: string;
  suspected_errors: SuspectedError[];
};
export type P800Letter = {
  type: "p800";
  id: string;
  recipient_name: string;
  nino_masked: string;
  p800_reference: string;
  tax_year: string;
  total_income: number;
  personal_allowance: number;
  tax_due: number;
  tax_paid: number;
  result: string;
  amount: number;
  claim_method: string;
  confusing_line: string;
};
export type Letter = P2Letter | P800Letter;
```

The data map (verbatim from `supabase/migrations/20260625090200_seed_demo_letters.sql:14-66`; keep the `▒▒` block glyphs exactly — that is what currently renders, see Phase 1 03-data item 2):

```ts
const LETTERS: Record<string, Letter> = {
  "maria-p2": {
    type: "p2",
    id: "maria-p2",
    recipient_name: "Ms Maria Davies",
    nino_masked: "QQ 12 34 ▒▒ C",
    tax_year: "2026 to 2027",
    issue_date: "2026-04-06",
    employer_name: "Bridgwater & Co Ltd",
    current_code: "883L",
    standard_code: "1257L",
    personal_allowance: 12570,
    lines: [
      { label: "Personal Allowance", amount: 12570, source_type: "allowance", plain_english: "The amount you can earn each year before you pay any Income Tax.", govuk_anchor: "income-tax" },
      { label: "Car benefit", amount: -3740, source_type: "company_benefit", plain_english: "HMRC believes you get a company car. This lowers your tax-free amount, so more tax is collected from your pay.", govuk_anchor: "tax-company-benefits" },
    ],
    tax_free_amount: 8830,
    confusing_line: "We have included an adjustment to reduce your tax-free allowance by £3,740 so we can collect the tax in equal instalments.",
    suspected_errors: [
      { line_label: "Car benefit", reason: "You told us you no longer have this company car — you returned it to your previous employer last year.", est_annual_overpay: 748, est_monthly_overpay: 62, fix_action: "Update your company car details in your Personal Tax Account so HMRC can correct your tax code." },
    ],
  },
  "maria-p800": {
    type: "p800",
    id: "maria-p800",
    recipient_name: "Ms Maria Davies",
    nino_masked: "QQ 12 34 ▒▒ C",
    p800_reference: "P800-2026-0R4291",
    tax_year: "2025 to 2026",
    total_income: 24800,
    personal_allowance: 12570,
    tax_due: 2446,
    tax_paid: 3194,
    result: "overpaid",
    amount: 748,
    claim_method: "online bank transfer (5 working days) or cheque (6 weeks)",
    confusing_line: "Our calculation shows you paid too much tax because your tax code did not change when your company car benefit ended.",
  },
};

// A missing letter is still a real state callers render with notFound().
export function getLetter(id: string): Letter | null {
  return LETTERS[id] ?? null;
}
```

`getLetter` becomes **synchronous**. The three call sites currently `await` it; `await` on a non-promise is a no-op, so they can stay verbatim, but the clean edit is to drop the `await`. The `notFound()` null-handling at every call site is preserved unchanged.

**Call-site edits (3 + the format helper + the leaf import):**
1. `frontend/app/(phone)/l/[id]/page.tsx:33` — `getLetter(id)` (lib import path changes; see below).
2. `frontend/app/letters/[id]/preview/page.tsx:45` — same; **also remove `import { env }`** (line 7), now unused once the QR src is same-origin (§1.2).
3. `frontend/app/(phone)/actions/update-company-car/[letterId]/page.tsx:21` — same.
4. `frontend/lib/letter-format.ts:1` — `import type { Letter, P2Letter }` now from `@/lib/letters`. This file is pure (no backend), so it needs no other change — inlining just feeds it a literal `Letter`.
5. `frontend/components/convai-leaf.tsx:17` — imports `SuspectedError` (and `Letter`) types; repoint to `@/lib/letters`.

Then **delete `frontend/lib/api.ts`** (it was Zod schemas + `getHealth` (dead, `frontend/lib/api.ts:13-24`, zero callers) + the two fetchers — all removed).

### 1.2 Replace the QR PNG with a same-origin Next route handler — RECOMMENDED

Create `frontend/app/letters/[id]/qr.png/route.ts` (a folder literally named `qr.png`, sibling of the existing `[id]/preview/` segment — Next allows a dotted literal segment, yielding `/letters/{id}/qr.png`). It is a 1:1 port of `backend/app/api/routers/letters.py:43-52` using a Node QR lib:

```ts
import QRCode from "qrcode";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // The phone scans the deployed HTTPS host. Behind a proxy (Vercel/Render/Fly)
  // the public host is in x-forwarded-host; fall back to host for local dev.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${host}/l/${id}`;
  const png = await QRCode.toBuffer(url, { errorCorrectionLevel: "Q", margin: 4 });
  return new Response(png, { headers: { "content-type": "image/png" } });
}
```

(Reading request headers forces dynamic rendering, which is exactly what we want — the encoded origin must reflect the real host, just as the FastAPI version used `request.url.netloc`. `errorCorrectionLevel: "Q"` + `margin: 4` match `ERROR_CORRECT_Q` + `border=4` in the backend.) Keep the runtime as the default Node runtime (Buffer is unavailable on edge).

Then change the consumer at `frontend/app/letters/[id]/preview/page.tsx:359` to a **relative same-origin** src and update the stale comment (`page.tsx:355-357` says "served by FastAPI on a different origin"):

```tsx
<img src={`/letters/${id}/qr.png`} alt="QR code — scan with your phone or click to open" width={140} height={140} />
```

Add dependencies: `qrcode` + `@types/qrcode` (dev).

**Why a route handler, not the alternatives:**
- **vs pre-baked static PNG** — rejected. The QR must encode the *deployed origin*, which isn't known at PNG-generation time. Baking in a fixed URL breaks local dev (a localhost preview would point a phone at prod) and rebreaks on any URL change. It also reintroduces committed binaries + a generation step. The route handler derives the host per request for free — the property the FastAPI version had.
- **vs client-side encode** — workable (a `"use client"` leaf using `window.location.origin`), but it converts part of an otherwise-server page to client, ships a QR lib into the client bundle, and renders the QR only post-hydration (a visible pop-in, and the Playwright PDF export at `frontend/scripts/export-letter.ts` would depend on JS having run). A QR dependency is needed either way; the route handler keeps it server-side, out of the client bundle, and keeps the `<img>`-of-a-real-PNG behaviour the export comment relies on.
- The route handler is the **most faithful port** (same logic, same output, same `<img>` consumer, same per-request host), and folds the QR into the single Next deployable — collapsing the cross-origin coupling the comment at `page.tsx:355` was written around.

The non-scannable click path already survives without any backend (`<a href="/l/{id}">` at `page.tsx:350-351`); only the scannable image needed replacing, and now it is same-origin.

### 1.3 Inline the agent system prompt

Move the 19 lines of `backend/prompts/letter_explainer.txt` into a frontend TS module, e.g. `frontend/lib/letter-explainer-prompt.ts`:

```ts
export const SYSTEM_PROMPT = `You are Marginalia — a warm, patient assistant ...
... call the switch_language tool with the target code ("cy" for Welsh, ...)...`;
```

A template literal is safe — the prompt contains `"` and `'` but no backtick. Then in `frontend/app/(phone)/l/[id]/page.tsx`: delete the `node:fs`/`node:path` imports and the `readFileSync` block (lines 1-2, 16-19) and `import { SYSTEM_PROMPT } from "@/lib/letter-explainer-prompt"`. The prop handoff to `ConvaiLeaf` (`page.tsx:44`) is unchanged. This removes the last out-of-bundle filesystem dependency and the `../backend` path that elimination would otherwise break.

Note: the file was the shared source of truth with `backend/scripts/setup_eleven_agent.py:30`. That script is manual, run-once ops; the agent (`NEXT_PUBLIC_AGENT_ID=agent_0701...`) already exists, and the prompt is applied at runtime via the session override (the `systemPrompt` prop → ConvaiLeaf), so the inlined frontend copy *is* the runtime source of truth. The script goes with `backend/` (§2). If re-bootstrapping the agent later matters, point a kept copy of that script at the new frontend path — but that is outside elimination.

### 1.4 Prune `frontend/lib/env.ts`

`schema.parse` runs at module load and is imported by client + server, so a missing **required** var hard-fails boot (Phase 1 04 item 1). Remove the dead vars:
- Delete `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`env.ts:13-14,23-25`) — required, no default, no consumer, no `@supabase/*` dependency installed. **These currently force every deploy to supply Supabase values for an auth flow that does not exist.**
- Delete `NEXT_PUBLIC_API_URL` (`env.ts:12,22`) — dead once §1.1/§1.2 land.
- Delete `NEXT_PUBLIC_ONE_LOGIN_URL` (`env.ts:18,29`) — no consumer (has a default, so harmless, but it is dead).
- **Keep:** `NEXT_PUBLIC_AGENT_ID`, `NEXT_PUBLIC_XI_VOICE_ID_ENGLISH`, `NEXT_PUBLIC_XI_VOICE_ID_WELSH`, and `serverEnv().XI_API_KEY` — the only runtime config that remains.

### 1.5 Fix the cold-deploy landmine (do this in the same change)

`frontend/public/vendor/` is git-ignored (`.gitignore:10`) and `git ls-files` returns nothing, yet two files are `<link>`/`<img>`-ed at runtime: `govuk-frontend.scoped.css` (`actions/layout.tsx:25`, `govuk-embed.tsx:46`) and `govuk-logotype.svg` (`actions/.../page.tsx:90`, confirmation page, `govuk-embed.tsx:130`). `frontend/scripts/copy-govuk-assets.ts` regenerates **only** `govuk-frontend.min.css`, which nothing serves. A fresh clone + build ships **without** the scoped GDS CSS and the crown SVG → broken `/actions/*` and in-chat GOV.UK overlay. **Un-ignore and commit `govuk-frontend.scoped.css` + `govuk-logotype.svg`.** Once committed, `copy-govuk-assets.ts`, the `predev`/`prebuild`/`gen:assets` scripts (`package.json:6-7,9`) and the `govuk-frontend` dependency (`package.json:21`, whose only output `min.css` is unused) become deletable. (This is not strictly part of backend elimination, but it must be fixed for the same cold deploy, and it lets the build drop a dependency.)

---

## 2. What elimination lets us DELETE

**Whole trees**
- `backend/` — entire FastAPI app, repos, services, models, tests, prompts, `data/govuk/*`, `data/letter-samples/*`, both ops scripts (`scripts/pull_govuk.py`, `scripts/setup_eleven_agent.py`), `pyproject.toml`, `poetry.lock`, `backend/.env`, `backend/.env.example`.
- `supabase/` — all four migrations, `config.toml` (ports 54321-54329), `seed.sql`. (Keep `20260625090200_seed_demo_letters.sql` only as the provenance reference for the inlined values during the inlining phase; it ships nowhere.)

**Infra / Docker**
- No `Dockerfile`/`docker-compose` exists (Phase 1 04 item 8). Docker was needed **only** by `supabase start` — gone. No container runtime remains.

**Makefile targets** (`Makefile`) coupled to the removed services:
- `install-backend`, `dev-backend`, `db-start`, `db-reset`, `db-migration`, `format-backend`, `lint-backend`, `typecheck-backend`, `test-backend`, and the aggregate `format`/`lint`/`typecheck`/`test`/`install` targets' backend fan-out. What survives is the frontend-only path (`pnpm install` / `pnpm dev` / `pnpm build`); the Makefile can be slimmed to those or dropped.

**Frontend code/deps**
- `frontend/lib/api.ts` (replaced by `lib/letters.ts`); `getHealth`/`Health` (dead) go with it.
- `frontend/scripts/copy-govuk-assets.ts` + `predev`/`prebuild`/`gen:assets` scripts + the `govuk-frontend` dependency (after §1.5 commits the scoped assets).
- **Add:** `qrcode` + `@types/qrcode` (the one new dep, for §1.2).
- Optional dead assets (no references; Phase 1): `frontend/public/GovUK_example_ss.png`, `frontend/public/GovUK_logo.png`, `frontend/app/letter_reference.png`.

**Environment variables** that become dead:
- Frontend: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_ONE_LOGIN_URL`.
- Backend (whole set): `DATABASE_URL`, `CORS_ORIGINS`, `DEBUG`, `ENVIRONMENT`, `LOG_LEVEL`, backend `XI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `XI_VOICE_ID_ENGLISH/WELSH`. (Secret hygiene: `backend/.env` holds a live Supabase **secret** key and `frontend/.env` a live `XI_API_KEY` — delete the backend secret, and rotate `XI_API_KEY` before any public deploy regardless.)

**Surviving runtime surface after elimination** (the entire deployable):
- `frontend/` Next 16 app, `next build` → `next start` (Node host, not static export).
- Server routes: `app/api/eleven/signed-url/route.ts` (needs `XI_API_KEY` + `NEXT_PUBLIC_AGENT_ID`) and the new `app/letters/[id]/qr.png/route.ts`.
- Runtime env: `XI_API_KEY` (secret), `NEXT_PUBLIC_AGENT_ID`, `NEXT_PUBLIC_XI_VOICE_ID_ENGLISH`, `NEXT_PUBLIC_XI_VOICE_ID_WELSH`.
- Build needs network to Google Fonts (`next/font/google`, `app/layout.tsx`).

All 16 baseline flow steps (`plan/simplification/00-baseline/flow.md`) are preserved: the two letters still resolve end-to-end (now from the literal map), the QR still renders a scannable PNG (now same-origin, still 200), the signed-URL call still fires, the GOV.UK action path is untouched.

---

## 3. FALLBACK ONLY — hosting FastAPI if elimination is rejected

Elimination is the recommendation; this is contingency. If the backend is kept, it needs a Python host **and** a Postgres (the asyncpg pool, `backend/app/main.py:33-36`), plus CORS configured for the cross-origin frontend (`backend/app/main.py:46`) and a public URL for both `getLetter` and the QR `<img>`. Ranked for this app:

1. **Render** — managed web service builds the Poetry app directly (no Dockerfile), point `DATABASE_URL` at the **already-provisioned hosted Supabase Postgres** (`oxsxmfdtnmthdksbchhy.supabase.co`) via the session pooler (5432; or transaction pooler 6543 with `statement_cache_size=0` per CLAUDE.md). Frontend on Vercel. Simplest keep-the-backend path; reuses existing Supabase.
2. **Railway** — equivalent ergonomics (Nixpacks builds the Poetry app), can also point at hosted Supabase or its own managed Postgres. Marginally faster to wire than Render; fewer guardrails.
3. **Fly.io** — most control (global, persistent), but requires authoring a Dockerfile and managing `fly postgres` — more setup than the demo justifies.

Every option reintroduces a second deployable, cross-origin CORS, a public backend URL, and a database to keep alive — all of which §1 deletes. **Recommendation stands: eliminate the backend.**
