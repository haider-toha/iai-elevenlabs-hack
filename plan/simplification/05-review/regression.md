# Phase-5 Adversarial Review — LENS 1: REGRESSION HUNTER

**Scope:** Verify the backend-elimination / single-Next.js-app simplification preserves all 16
baseline flow steps (`00-baseline/flow.md`) through the *changed* code.
**Verdict: PASS — zero blockers.**

Gates run from `frontend/`:
- `pnpm typecheck` → clean (`tsc --noEmit`, no output).
- `pnpm lint` → clean (`eslint .`, no output).
- `pnpm build` → **succeeds** (Next 16.2.9 / Turbopack). Route table registers all surviving
  routes including the two server runtimes: `ƒ /api/eleven/signed-url` and `ƒ /letters/[id]/qr.png`.
- Runtime sanity: `qrcode.toBuffer(...,{errorCorrectionLevel:"Q",margin:4})` returns a valid PNG
  (magic `89 50 4E 47`, 1677 bytes). `qrcode` + `@types/qrcode` present in `node_modules` and
  lockfile.

---

## (a) Inlined letter data vs. former seed — field-by-field

Compared `frontend/lib/letters.ts` against `HEAD:supabase/migrations/20260625090200_seed_demo_letters.sql`.
**Every field matches exactly**, including the NINO mask glyph `▒▒` (U+2592) and the `£3,740`
in the confusing line.

`maria-p2`: type, recipient_name (`Ms Maria Davies`), nino_masked (`QQ 12 34 ▒▒ C`), tax_year
(`2026 to 2027`), personal_allowance (12570), confusing_line, issue_date (`2026-04-06`),
employer_name (`Bridgwater & Co Ltd`), current_code (`883L`), standard_code (`1257L`),
tax_free_amount (8830); lines[] = Personal Allowance +12570 (income-tax) and Car benefit −3740
(tax-company-benefits) with identical plain_english; suspected_errors[] = Car benefit,
est_annual_overpay 748, est_monthly_overpay 62, identical reason + fix_action. ✓

`maria-p800`: type, recipient_name, nino_masked, tax_year (`2025 to 2026`), personal_allowance
(12570), confusing_line, p800_reference (`P800-2026-0R4291`), total_income (24800), tax_due
(2446), tax_paid (3194), result (`overpaid`), amount (748), claim_method
(`online bank transfer (5 working days) or cheque (6 weeks)`). ✓

The ~50 `scan_events` rows in the seed are intentionally dropped — no frontend consumer exists
(confirmed: `scan-events` is backend-only seed data; flow.md §41 states the same).

`SYSTEM_PROMPT` in `frontend/lib/letter-explainer-prompt.ts` is **byte-for-byte identical** to
`HEAD:backend/prompts/letter_explainer.txt` (Python exact-equality check passed, including the
trailing newline). No `${` / backtick collisions in the template literal.

## (b) QR `<img>` + new route handler

- `preview/page.tsx` QrBlock (`<img src={`/letters/${id}/qr.png`}>`) now points same-origin;
  comment updated to "served same-origin by the Next qr.png route handler"; plain `<img>` +
  `eslint-disable-next-line @next/next/no-img-element` retained.
- `frontend/app/letters/[id]/qr.png/route.ts` is a 1:1 port: derives origin from
  `x-forwarded-host` → `host` → `URL(request.url).host`, proto from `x-forwarded-proto` (default
  `https`), encodes `{proto}://{host}/l/{id}`, `errorCorrectionLevel:"Q"`, `margin:4`, returns
  `image/png`. Default Node.js runtime (no `runtime="edge"`), so `Buffer`/`zlib` used by `qrcode`
  are available — correct for Vercel. Build registers it as `ƒ /letters/[id]/qr.png`.

## (c) `/l/[id]` prompt blocks

`l/[id]/page.tsx`: `readFileSync`/`node:fs`/`node:path` imports removed (repo-wide grep: none
remain); imports `SYSTEM_PROMPT` from `@/lib/letter-explainer-prompt` and `getLetter` from
`@/lib/letters`; `getLetter(id)` is synchronous (no `await`); builds English + Welsh blocks via
`buildLetterBlock`/`buildLetterBlockWelsh` and passes them + `systemPrompt` to `ConvaiLeaf`.

## (d) GOV.UK vendor assets

`.gitignore` no longer ignores `frontend/public/vendor/`. `git ls-files public/vendor/` lists
`govuk-frontend.scoped.css` and `govuk-logotype.svg` (both tracked, `A` in status). All four
consumers reference them by `/vendor/...` path: `actions/layout.tsx:25`, `govuk-embed.tsx:46,128`,
`update-company-car/[letterId]/page.tsx:90`, `.../confirmation/page.tsx:75`. Deleted
`govuk-frontend.min.css` is not referenced (the two grep hits for that name are a *prose comment*
and a CSS `sourceMappingURL` — both benign).

## (e) `/api/eleven/signed-url`

Untouched (`git status` / `git diff` empty for the file). `convai-leaf.tsx:1227` still calls it
same-origin. `env.ts` retains `serverEnv()`/`XI_API_KEY` for it; `pnpm build` validated env parse
with the four vars from `.env`.

---

## 16-step trace (all preserved)

| # | Step | Status | Note |
|---|---|---|---|
| 1 | Home `/` | PASS | `(phone)/page.tsx` unchanged |
| 2 | Home language menu | PASS | `language-picker.tsx` unchanged |
| 3 | Preview P2 | PASS | inlined maria-p2 (exact) + same-origin QR via new route; `/HMRC_logo.png` present in `public/` |
| 4 | Explainer P2 preparing | PASS | sync `getLetter` + inlined `SYSTEM_PROMPT` |
| 5 | Explainer P2 summary | PASS | `convai-leaf` import-only change |
| 6 | Summary language globe | PASS | unchanged |
| 7 | Conversation (voice) | PASS | `/api/eleven/signed-url` untouched |
| 8 | Conversation (typed) | PASS | same |
| 9 | Preview P800 | PASS | inlined maria-p800 (exact) + same-origin QR |
| 10 | Explainer P800 preparing | PASS | sync `getLetter` + prompt |
| 11 | Explainer P800 summary | PASS | renders from letter |
| 12 | Conversations list | PASS | unchanged |
| 13 | Company-car form | PASS | sync `getLetter`; GDS via tracked vendor assets |
| 14 | Confirmation | PASS | unchanged; logotype tracked |
| 15 | All set | PASS | unchanged |
| 16 | 404 | PASS | `not-found.tsx` unchanged |

No surviving reference to backend/supabase coupling in app code: repo-wide grep for
`asyncpg|FastAPI|DATABASE_URL` returns nothing outside `plan/` and `CLAUDE.md`; no
`localhost:8000`, `SUPABASE`, `ONE_LOGIN`, `NEXT_PUBLIC_API_URL`, or `@/lib/api` references remain.

---

## Non-blocking observations

1. `CLAUDE.md` still describes the removed backend/supabase monorepo. (Known/triaged —
   intentionally not auto-rewritten; flagged to the user.)
2. `public/vendor/govuk-frontend.scoped.css` ends with `/*# sourceMappingURL=govuk-frontend.min.css.map */`
   but no `.map` is committed. Harmless: browsers fetch source maps only with devtools open and a
   miss is silent. Not a runtime/build concern.
3. `backend/.env` (live secret) removed from disk but remains in git history — rotate
   `XI_API_KEY` before any public deploy. (Known deploy note, not a code blocker.)
4. Pre-existing prettier nonconformance in `(phone)/layout.tsx` and `pnpm-workspace.yaml`, and the
   `ts(6385)` deprecation hints in `convai-leaf.tsx` — all present at HEAD, not introduced here,
   and not lint/type errors (gates pass clean).
