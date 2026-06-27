# Phase-5 Adversarial Review — LENS 3: RULES ENFORCER

**Scope:** Verify every CHANGED/created file conforms to `CLAUDE.md`. Report only real
violations in changed code.

**Verdict: PASS** — zero blockers.

`pnpm typecheck` → exit 0. `pnpm lint` → exit 0. (Run from `frontend/`.)

---

## Files reviewed (changed + created)

Created: `frontend/lib/letters.ts`, `frontend/lib/letter-explainer-prompt.ts`,
`frontend/app/letters/[id]/qr.png/route.ts`, `frontend/public/vendor/govuk-frontend.scoped.css`,
`frontend/public/vendor/govuk-logotype.svg`.

Edited: `frontend/lib/env.ts`, `frontend/lib/letter-format.ts`,
`frontend/components/convai-leaf.tsx`, `frontend/app/(phone)/l/[id]/page.tsx`,
`frontend/app/letters/[id]/preview/page.tsx`,
`frontend/app/(phone)/actions/update-company-car/[letterId]/page.tsx`,
`frontend/package.json`, `frontend/.env.example`, `.gitignore`.

---

## Rule-by-rule findings

### Zod only at trust boundaries — PASS
- `lib/letters.ts` is plain TypeScript types + a literal `Record<string, Letter>`. Correct: the
  inlined demo dataset is a compile-time fixture, not a fetched payload, so it is **not** a trust
  boundary and (rightly) carries no Zod. The header comment states exactly this.
- `lib/env.ts` keeps Zod where it belongs (env parse — a real boundary): `env` validates the three
  browser-safe `NEXT_PUBLIC_*` vars at module load; `serverEnv()` validates `XI_API_KEY` server-side
  only. No Zod was added to any internal function-to-function call.

### Discriminated union modelling intact — PASS
- `Letter = P2Letter | P800Letter` with a literal `type: "p2"` / `type: "p800"` discriminant. All
  consumers (`letter-format.ts`, `convai-leaf.tsx`, the three pages) narrow on `letter.type`, so the
  union is exhaustively switchable and the `if (!letter) notFound()` checks model a genuine missing
  state (not defensive padding).

### No `any` — PASS
- Grep for `: any` / `<any>` / `as any` across the created files: none. Typecheck (`tsc --noEmit`)
  is clean, confirming nothing is silently widened.

### No defensive / dead code — PASS
- No dead data: every inlined field (`result`, `claim_method`, `tax_due`, `tax_paid`,
  `total_income`, `standard_code`, `p800_reference`, `nino_masked`, `suspected_errors`, …) is read
  by a consumer. Verified by field-usage grep.
- `getLetter` returns `Letter | null`; callers branch to `notFound()`. That is correctness (a real
  lookup miss), not a redundant guard — consistent with CLAUDE.md.
- The QR route's `x-forwarded-host ?? host ?? new URL(...).host` and `x-forwarded-proto ?? "https"`
  fallbacks handle genuinely-uncertain proxy headers (absent in local dev), which CLAUDE.md
  explicitly permits ("not about handling genuinely uncertain inputs"). Not defensive slop.
- `@/lib/api` fully removed; `git grep "@/lib/api"` over `frontend/**` is empty — no dangling
  imports. No references remain to the deleted env vars (`NEXT_PUBLIC_API_URL`, `SUPABASE`,
  `ONE_LOGIN`).

### QR route — sensible single-file route, no needless layering — PASS
- `app/letters/[id]/qr.png/route.ts` is one `GET` handler that does its work inline (no
  service/repo split for a one-line image render — correct per the "layering is a ceiling" rule).
  `async`, awaits `params`, returns a `Response` with the PNG bytes. 1:1 port of the deleted FastAPI
  handler (errorCorrectionLevel `Q`, margin 4). Default Next.js route runtime is Node, which
  satisfies qrcode's Buffer/zlib dependency.

### env.ts validates only at the boundary — PASS (see Zod section).

### kebab-case filenames + one component per file — PASS
- New lib files are lowercase/kebab (`letters.ts`, `letter-explainer-prompt.ts`); the route uses the
  reserved `route.ts` under a valid `qr.png/` segment. No barrel `index.ts` introduced. The created
  files export types/consts/a route handler, not multiple components — the one-component-per-file
  rule is not implicated.

### Comments explain *why*, not *what* — PASS
- `letters.ts`, `letter-explainer-prompt.ts`, `qr.png/route.ts`, and the `env.ts` edits all carry
  rationale comments (why no Zod, why this is the single source of truth, why Node runtime, why
  browser-safe-only). The edit to the preview page correctly updated the stale "served by FastAPI on
  a different origin" comment to "served same-origin by the Next qr.png route handler".

### No banned UI patterns / brand boundary respected — PASS
- No new fonts, gradients, blue primary buttons, glassmorphism, or icon-card grids introduced in
  editorial code. The committed `public/vendor/*` GOV.UK assets and the HMRC-facsimile preview page
  are the deliberate, documented brand-boundary exceptions (per project memory) — not violations.
- All seven `/vendor/govuk-*` runtime references resolve to the two now-tracked files
  (`govuk-frontend.scoped.css`, `govuk-logotype.svg`); the deleted `min.css` is referenced nowhere.
  `.gitignore` correctly drops the `frontend/public/vendor/` ignore so the assets ship on a cold
  deploy.

### Editorial-codebase fit — PASS
- The new code reads like its neighbours: same import-grouping order, same `notFound()` pattern, same
  comment voice. The verbatim system prompt matches the deleted `backend/prompts/letter_explainer.txt`
  byte-for-byte (diffed against `git show HEAD:...`), and the prompt body contains no backtick or
  `${`, so the template literal is safe.

---

## Non-blocking observations

1. `P800Letter.result: string` (and `CodeLine.source_type: string`) could be tightened to a literal
   union (`"overpaid" | "underpaid"`) for "illegal states unrepresentable". This is faithfully
   ported from the original backend `result: str` — not introduced here — and the top-level
   discriminated union (`type`) already satisfies the hard rule. Minor modelling nit only.
2. The QR route relies on the implicit Next.js Node runtime for qrcode's `Buffer`/`zlib`. Correct
   today; an explicit `export const runtime = "nodejs"` would make the Node dependency
   self-documenting. Optional.
3. `serverEnv()` re-parses `process.env` on every call rather than memoising. Pre-existing pattern,
   unchanged here; negligible cost on the single signed-url route.

## Confirmed (already-triaged) non-blockers
- `CLAUDE.md` still describes the removed backend/supabase monorepo — intentionally not rewritten
  (flagged for the user); out of scope for changed-code review.
- `convai-leaf.tsx` TS 6385 deprecation *hints* (`source`, `FormEvent`) pre-exist at HEAD; the
  change here is only the `@/lib/api` → `@/lib/letters` import repoint plus prettier reflow.
- Pre-existing prettier nonconformance in `(phone)/layout.tsx` and `pnpm-workspace.yaml` predates
  this change.
- `backend/.env` (live secret) removed from disk but present in git history → rotate-before-deploy
  is a deploy note, not a code blocker.
