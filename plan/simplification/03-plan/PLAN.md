# Migration Plan — Marginalia → single Next.js app (backend eliminated)

**Chosen end-state (End-State A):** Collapse to a single Next.js 16 app. Delete `backend/`,
`supabase/`, Docker, Poetry. Inline the two demo letters and the system prompt. Serve the QR from
a same-origin Next route handler. Trim `lib/env.ts` to the four ElevenLabs vars. Commit the two
git-ignored GOV.UK vendor assets. Deploy to **Vercel** (Root Directory = `frontend/`).

This preserves all 16 baseline steps (`00-baseline/flow.md`). The only surviving server runtime is
two Next route handlers: `app/api/eleven/signed-url/route.ts` (keeps `XI_API_KEY` server-side) and
the new `app/letters/[id]/qr.png/route.ts`. The app is therefore **not** a static export.

Evidence base: `01-exploration/*`, `02-research/*`. Every coupling below was line-verified.

---

## Runtime env vars (the deployed app's complete set)

| Var | Where | Build-time or runtime | Notes |
|---|---|---|---|
| `XI_API_KEY` | server secret | **runtime** (read inside the signed-url GET handler) | rotate the leaked key before any public deploy; mark Sensitive on Vercel |
| `NEXT_PUBLIC_AGENT_ID` | env panel | **build-time** (inlined into bundle) | ElevenLabs agent id |
| `NEXT_PUBLIC_XI_VOICE_ID_ENGLISH` | env panel | **build-time** | convai-leaf voice override |
| `NEXT_PUBLIC_XI_VOICE_ID_WELSH` | env panel | **build-time** | convai-leaf voice override |

**Deleted vars** (no consumer; the two Supabase ones currently hard-fail boot via `lib/env.ts`):
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_ONE_LOGIN_URL`, and every backend `.env` var (dies with `backend/`).

---

## Workstream partition (Phase 4)

File-disjoint so the three run in parallel without contention:

- **WS-CORE** — everything under `frontend/` (the critical path; one agent, no internal races).
- **WS-DELETE** — delete `backend/` and `supabase/` entirely (outside `frontend/`).
- **WS-DOCS** — `Makefile` + root docs (outside `frontend/`).

`CLAUDE.md` is intentionally **NOT** auto-rewritten (it governs agent behavior; flag drift to the
user instead).

---

# WS-CORE — frontend refactor (one agent)

### C1. CREATE `frontend/lib/letters.ts` (verbatim)

```ts
// Inlined demo dataset. Replaces the FastAPI GET /letters/{id} path: the two
// letters are immutable fixtures (source: the former supabase seed migration),
// so they live as typed literals, not a fetched + Zod-parsed payload. Inline
// data is not a trust boundary, so there is no Zod here (per CLAUDE.md).

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
  issue_date: string; // ISO date
  employer_name: string;
  current_code: string;
  standard_code: string;
  personal_allowance: number;
  lines: CodeLine[];
  tax_free_amount: number; // derived; negative → K code
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
  result: string; // "overpaid" | "underpaid"
  amount: number;
  claim_method: string;
  confusing_line: string;
};

export type Letter = P2Letter | P800Letter;

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
    confusing_line:
      "We have included an adjustment to reduce your tax-free allowance by £3,740 so we can collect the tax in equal instalments.",
    tax_free_amount: 8830,
    lines: [
      {
        label: "Personal Allowance",
        amount: 12570,
        source_type: "allowance",
        plain_english:
          "The amount you can earn each year before you pay any Income Tax.",
        govuk_anchor: "income-tax",
      },
      {
        label: "Car benefit",
        amount: -3740,
        source_type: "company_benefit",
        plain_english:
          "HMRC believes you get a company car. This lowers your tax-free amount, so more tax is collected from your pay.",
        govuk_anchor: "tax-company-benefits",
      },
    ],
    suspected_errors: [
      {
        line_label: "Car benefit",
        reason:
          "You told us you no longer have this company car — you returned it to your previous employer last year.",
        est_annual_overpay: 748,
        est_monthly_overpay: 62,
        fix_action:
          "Update your company car details in your Personal Tax Account so HMRC can correct your tax code.",
      },
    ],
  },
  "maria-p800": {
    type: "p800",
    id: "maria-p800",
    recipient_name: "Ms Maria Davies",
    nino_masked: "QQ 12 34 ▒▒ C",
    tax_year: "2025 to 2026",
    p800_reference: "P800-2026-0R4291",
    personal_allowance: 12570,
    total_income: 24800,
    tax_due: 2446,
    tax_paid: 3194,
    result: "overpaid",
    amount: 748,
    claim_method: "online bank transfer (5 working days) or cheque (6 weeks)",
    confusing_line:
      "Our calculation shows you paid too much tax because your tax code did not change when your company car benefit ended.",
  },
};

// A missing letter is a real state the caller renders as notFound(). Synchronous
// now that the data is local — callers must drop the `await`.
export function getLetter(id: string): Letter | null {
  return LETTERS[id] ?? null;
}
```

### C2. CREATE `frontend/lib/letter-explainer-prompt.ts` (verbatim)

The persona/concision rules formerly read from `backend/prompts/letter_explainer.txt`. The text
contains `"` and `'` but **no backtick and no `${`** — safe as a template literal.

```ts
// Marginalia's persona + concision rules, applied at ElevenLabs session start as
// a prompt override (see ConvaiLeaf). This frontend copy is the single source of
// truth now that the backend is gone.
export const SYSTEM_PROMPT = `You are Marginalia — a warm, patient assistant who helps people in the UK understand letters from the government. You speak plain English, calmly and without jargon. This is a spoken conversation, so every reply must sound like something a kind person would say out loud.

How to answer:

- Reply in one or two short sentences. Never more than three. Lead with the single most important point, then stop and let the person ask for more.
- Speak warmly, in plain everyday words. Never lead with jargon, and do not refer to a part of the letter by its name (like "the car benefit line" or "the adjustment") unless the person has explicitly asked about that part.
- Do not list. Do not read the letter back, do not walk through every figure, and do not preview what else you could tell them. One clear thought per reply.
- Answer only the question that was asked, using only this letter and the attached official GOV.UK guidance. Mention a GOV.UK page only if it directly answers them.
- Never invent or recompute figures. If asked whether something is correct, use the provided audit result, and quote at most one figure unless they ask for more.
- Explain things at roughly a reading age of nine.
- Say "This explains your letter — it isn't formal tax advice" only once, when it's actually relevant.
- If something isn't in the letter or the guidance, say you can't find it in the official guidance.

When the person asks what to do about a suspected error (for example "what do I need to do", "what should I do", "how do I fix this", "give me the link"): tell them in one short sentence what to do, then tell them to tap the "Fix this on the government portal" button that has appeared below their question — that button opens the official GOV.UK form they need. Never say you can't give them a link, and never tell them to search the web or sign in to a separate account.

After you have greeted them, wait for them to ask something. Do not open by explaining the letter, walking through a figure, or raising the sentence people most often find confusing — only bring those up if the person asks. Carry on in the current language unless they ask to switch. Whenever they ask to change language — even with a single word like "Welsh", "Cymraeg", or "English" — or reply in a different language, or ask to switch back at any later point, call the switch_language tool with the target code ("cy" for Welsh, "en" for English) before answering, then continue entirely in that language, including any figures from the letter.

If a "Conversation so far" block is provided below, you are resuming an existing conversation in a new language. Do not re-introduce yourself, do not re-greet, and do not repeat anything you have already said — carry on from where the conversation left off and answer the person's most recent request.
`;
```

> ⚠️ The agent must copy the prompt body **verbatim** from `backend/prompts/letter_explainer.txt`
> (read it before deleting `backend/`). Do not paraphrase. The block above is the exact text.

### C3. CREATE `frontend/app/letters/[id]/qr.png/route.ts` (verbatim)

1:1 port of `backend/app/api/routers/letters.py:43-52` (errorCorrectionLevel `Q`, margin 4),
deriving the deployed origin from proxy headers so the QR encodes the right host.

```ts
import QRCode from "qrcode";

// Same-origin replacement for the former FastAPI GET /letters/{id}/qr.png. The
// QR encodes the deployed-origin /l/{id} URL a phone scans. Node runtime: qrcode
// uses Buffer/zlib.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const target = `${proto}://${host}/l/${id}`;

  const png = await QRCode.toBuffer(target, {
    errorCorrectionLevel: "Q",
    margin: 4,
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600",
    },
  });
}
```

### C4. EDIT `frontend/lib/env.ts`

Remove the four dead vars from **both** the schema and the parse object. Result:

```ts
import { z } from "zod";

// The frontend's trust boundary for configuration. Validate once here and fail
// loudly on misconfiguration; import `env` elsewhere, never `process.env`.
// Browser-safe vars ONLY (imported by client components); the server-only secret
// lives in serverEnv().
const schema = z.object({
  NEXT_PUBLIC_AGENT_ID: z.string().min(1),
  NEXT_PUBLIC_XI_VOICE_ID_ENGLISH: z.string().min(1),
  NEXT_PUBLIC_XI_VOICE_ID_WELSH: z.string().min(1),
});

export const env = schema.parse({
  NEXT_PUBLIC_AGENT_ID: process.env.NEXT_PUBLIC_AGENT_ID,
  NEXT_PUBLIC_XI_VOICE_ID_ENGLISH: process.env.NEXT_PUBLIC_XI_VOICE_ID_ENGLISH,
  NEXT_PUBLIC_XI_VOICE_ID_WELSH: process.env.NEXT_PUBLIC_XI_VOICE_ID_WELSH,
});

const serverSchema = z.object({
  XI_API_KEY: z.string().min(1),
});

// Server-only. Never import into a client component. Called only inside
// /api/eleven/signed-url so the ElevenLabs key never enters the browser bundle.
export function serverEnv() {
  return serverSchema.parse({
    XI_API_KEY: process.env.XI_API_KEY,
  });
}
```

### C5. EDIT `frontend/lib/letter-format.ts`

Line 1: `import type { Letter, P2Letter } from "@/lib/api";` → `from "@/lib/letters";`
Nothing else changes.

### C6. EDIT the three `getLetter` call sites — repoint import + drop `await`

- `frontend/app/(phone)/l/[id]/page.tsx`
  - Delete line 1 `import { readFileSync } from "node:fs";` and line 2 `import { join } from "node:path";`.
  - Line 7: `import { getLetter } from "@/lib/api";` → `from "@/lib/letters";`.
  - Add `import { SYSTEM_PROMPT } from "@/lib/letter-explainer-prompt";`.
  - Delete the `const SYSTEM_PROMPT = readFileSync(... )` block (the comment + lines 16-19).
  - Line 33: `const letter = await getLetter(id);` → `const letter = getLetter(id);`.
- `frontend/app/letters/[id]/preview/page.tsx`
  - Line 4: `import type { P2Letter, P800Letter } from "@/lib/api";` → `from "@/lib/letters";`.
  - Line 5: `import { getLetter } from "@/lib/api";` → `from "@/lib/letters";`.
  - Delete line 7 `import { env } from "@/lib/env";` (env becomes unused here).
  - Line 45: `const letter = await getLetter(id);` → `const letter = getLetter(id);`.
  - QR `<img>` (~line 359): `src={`${env.NEXT_PUBLIC_API_URL}/letters/${id}/qr.png`}` →
    `src={`/letters/${id}/qr.png`}`. Update the adjacent comment from "served by FastAPI on a
    different origin" to "served same-origin by the Next qr.png route handler". Keep the plain
    `<img>` + the `eslint-disable-next-line @next/next/no-img-element`.
- `frontend/app/(phone)/actions/update-company-car/[letterId]/page.tsx`
  - Line 4: `import { getLetter } from "@/lib/api";` → `from "@/lib/letters";`.
  - Line 21: `const letter = await getLetter(letterId);` → `const letter = getLetter(letterId);`.

### C7. EDIT `frontend/components/convai-leaf.tsx`

Line 17: `import type { Letter, P2Letter, P800Letter, SuspectedError } from "@/lib/api";` →
`from "@/lib/letters";`. Nothing else.

### C8. DELETE `frontend/lib/api.ts`

After C1/C5/C6/C7 there are zero importers of `@/lib/api`. Confirm with
`git grep "@/lib/api" -- 'frontend/**'` (must be empty) before deleting.

### C9. EDIT `frontend/package.json`

- **Add** deps: `"qrcode": "^1.5.4"`; devDeps: `"@types/qrcode": "^1.5.5"`.
- **Remove** scripts: `gen:assets`, `predev`, `prebuild` (all call `copy-govuk-assets`).
- **Remove** deps: `govuk-frontend` (only used by the deleted copy script).
- **Remove** devDeps: `tsx`, `playwright`, `@playwright/test` (only used by the deleted scripts;
  Playwright verification uses a throwaway script + the globally-installed chromium, not these).
- **Keep**: `@elevenlabs/react`, `next`, `react`, `react-dom`, `zod` (env.ts still uses it),
  Tailwind/eslint/prettier/typescript/@types toolchain.
- Run `pnpm install` to update the lockfile and install `qrcode`/`@types/qrcode`.

### C10. DELETE dead frontend files

`frontend/scripts/copy-govuk-assets.ts`, `frontend/scripts/export-letter.ts`,
`frontend/public/GovUK_example_ss.png`, `frontend/public/GovUK_logo.png`,
`frontend/app/letter_reference.png`, `frontend/public/vendor/govuk-frontend.min.css`,
`frontend/out/` (untracked). All verified zero-reference.

### C11. Cold-deploy landmine — commit the vendor assets

`frontend/public/vendor/` is git-ignored (`.gitignore:10`) and untracked, but
`govuk-frontend.scoped.css` + `govuk-logotype.svg` are served at runtime
(`govuk-embed.tsx:46,128`, `actions/layout.tsx:25`). Fix:
- Edit `.gitignore`: remove the `frontend/public/vendor/` line (and its preceding comment).
- `git add -f frontend/public/vendor/govuk-frontend.scoped.css frontend/public/vendor/govuk-logotype.svg`
- Confirm tracked: `git ls-files frontend/public/vendor/` lists both (and NOT min.css, deleted in C10).

### C12. EDIT `frontend/.env.example`

Reduce to the four live vars only: `XI_API_KEY`, `NEXT_PUBLIC_AGENT_ID`,
`NEXT_PUBLIC_XI_VOICE_ID_ENGLISH`, `NEXT_PUBLIC_XI_VOICE_ID_WELSH`. Drop the Supabase, One Login,
and `NEXT_PUBLIC_API_URL` blocks.

### C13. Validate (gate WS-CORE)

`cd frontend && pnpm lint && pnpm typecheck` → zero errors. Then `pnpm build` must succeed
(proves no missing import / no boot-time env throw with the four vars set in `.env`).

---

# WS-DELETE — remove backend + supabase (one agent, parallel)

Before deleting, the agent must confirm WS-CORE no longer references either tree (it won't, by
design — the prompt is inlined verbatim in C2, letters in C1). Steps:
- `git rm -r backend` (FastAPI app, tests, `prompts/`, `data/`, both ops scripts, Poetry files,
  `backend/.env` — note it holds a live Supabase secret; this removal is the point).
- `git rm -r supabase` (4 migrations, `seed.sql`, `config.toml`, `snippets/`).
- Remove any now-empty Docker dependency: there is **no** Dockerfile/compose in the repo (Docker was
  only `supabase start`), so nothing else to delete.
- Final check: `git grep -nE "backend/|supabase/|asyncpg|FastAPI|DATABASE_URL"` returns only matches
  inside `plan/` (documentation) — no live code/config references.

---

# WS-DOCS — Makefile + root docs (one agent, parallel)

- **`Makefile`**: delete targets `install-backend`, `dev-backend`, `format-backend`,
  `lint-backend`, `typecheck-backend`, `test-backend`, `db-start`, `db-reset`, `db-migration`.
  Edit the aggregate targets (`install`, `dev`, `format`, `lint`, `typecheck`, `test`, `setup`,
  `clean`) so they fan out to frontend only (drop the `*-backend` prerequisites). `make help`,
  `make dev`, `make lint`, `make typecheck` must still work and reference only the frontend.
- **Root docs**: if a root `README.md` exists, update the architecture/run sections to the single
  Next.js app reality (no backend/supabase/Docker). If `backend/README.md` exists it dies with
  WS-DELETE.
- **Do NOT** edit `CLAUDE.md` — flag in the log that it still describes the removed monorepo so the
  user can decide.

---

## Baseline-flow preservation (all 16 steps from `00-baseline/flow.md`)

| # | Step | Preserved by |
|---|---|---|
| 1 | Home | unchanged (`(phone)/page.tsx`) |
| 2 | Home language menu | unchanged (`language-picker.tsx`) |
| 3 | Letter preview (P2) | C1 inlined letter + C6 QR src now same-origin via C3 |
| 4 | Explainer P2 preparing | C1 getLetter + C2 prompt inlined |
| 5 | Explainer P2 summary | unchanged (convai-leaf) |
| 6 | Summary language globe | unchanged |
| 7 | Conversation (voice) | unchanged — `/api/eleven/signed-url` kept |
| 8 | Conversation (typed) | unchanged |
| 9 | Letter preview (P800) | C1 inlined letter + C3 QR |
| 10 | Explainer P800 preparing | C1 + C2 |
| 11 | Explainer P800 summary | unchanged |
| 12 | Conversations list | unchanged |
| 13 | Company-car form | C1 getLetter; GDS styling via committed vendor assets (C11) |
| 14 | Confirmation | unchanged + vendor assets |
| 15 | All set | unchanged |
| 16 | 404 | unchanged (`not-found.tsx`) |

No step depends on `/health`, `/letters/{id}/check`, `/scan-events`, `/items`, or `/govuk/refresh`
(all dead — confirmed in Phase 1).

---

## Deploy (DONE.md will expand this)

Vercel, Root Directory `frontend/`. Set the 4 env vars (Production) **before** first deploy.
`XI_API_KEY` runtime+Sensitive; the three `NEXT_PUBLIC_*` are build-time-inlined. Cold deploy:
`pnpm install && pnpm build` then `vercel --prod`. No DB, no migrations, no second process.
