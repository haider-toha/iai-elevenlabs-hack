# WS-CORE — frontend refactor (progress log)

Spec: plan/simplification/03-plan/PLAN.md (steps C1–C13). Repo root: /Users/haidertoha/Code/i.ai_hackathon

## Pre-flight verification
- frontend dir surveyed; dead files confirmed present (GovUK_example_ss.png, GovUK_logo.png, app/letter_reference.png, public/vendor/govuk-frontend.min.css, out/).
- public/vendor/ holds: govuk-frontend.min.css (delete in C10), govuk-frontend.scoped.css (commit in C11), govuk-logotype.svg (commit in C11).
- `git grep "@/lib/api"` → 6 importers (letter-format, convai-leaf, 3 page call sites, + api.ts self). Matches C5/C6/C7 targets exactly.
- node v26.3.1, pnpm 11.9.0.

## Progress

- **C1** CREATE `frontend/lib/letters.ts` — verbatim from PLAN. ▒▒ NINO glyphs, − (U+2212), £ preserved. getLetter is synchronous `Letter | null`.
- **C2** CREATE `frontend/lib/letter-explainer-prompt.ts` — verbatim SYSTEM_PROMPT from PLAN block (did NOT read backend; PLAN is source of truth). Template literal, no backtick/`${` inside.
- **C3** CREATE `frontend/app/letters/[id]/qr.png/route.ts` — verbatim. Folder literally `qr.png`. errorCorrectionLevel "Q", margin 4, proxy-header origin.
- **C9 (first half)** EDIT `package.json` — added `qrcode ^1.5.4` + `@types/qrcode ^1.5.5`; removed scripts gen:assets/predev/prebuild, dep govuk-frontend, devDeps tsx/playwright/@playwright/test. `pnpm install` → qrcode 1.5.4, @types/qrcode 1.5.6 added; govuk-frontend/@playwright/test/playwright/tsx removed.
- **C4** EDIT `lib/env.ts` — trimmed to 3 NEXT_PUBLIC_ vars + serverEnv(XI_API_KEY). Dropped API_URL/SUPABASE×2/ONE_LOGIN.
- **C5** EDIT `lib/letter-format.ts` — type import repointed `@/lib/api` → `@/lib/letters`.
- **C6** EDIT 3 call sites:
  - `(phone)/l/[id]/page.tsx` — removed node:fs/node:path + readFileSync SYSTEM_PROMPT block; import SYSTEM_PROMPT from `@/lib/letter-explainer-prompt`; getLetter from `@/lib/letters`; dropped `await`.
  - `letters/[id]/preview/page.tsx` — type+value imports → `@/lib/letters`; removed unused `import { env }`; dropped `await`; QR `<img src` → `/letters/${id}/qr.png`; comment updated to "served same-origin by the Next qr.png route handler".
  - `(phone)/actions/update-company-car/[letterId]/page.tsx` — getLetter import → `@/lib/letters`; dropped `await`.
- **C7** EDIT `components/convai-leaf.tsx` — type import repointed → `@/lib/letters`.
- **C8** DELETE `lib/api.ts` — `git grep "@/lib/api"` confirmed empty first; `git rm`.
- **C10** DELETE dead files — `git rm` copy-govuk-assets.ts, export-letter.ts, GovUK_example_ss.png, GovUK_logo.png, app/letter_reference.png; removed public/vendor/govuk-frontend.min.css (was untracked) and out/ (untracked).
- **C11** Cold-deploy fix — removed `frontend/public/vendor/` line + comment from `.gitignore`; `git add -f` scoped.css + logotype.svg. `git ls-files frontend/public/vendor/` = exactly those two (no min.css).
- **C12** EDIT `.env.example` — reduced to XI_API_KEY + 3 NEXT_PUBLIC_ vars.
- **C13** VALIDATE — `pnpm lint` exit 0, `pnpm typecheck` exit 0 (zero errors). Did NOT run `pnpm build` (dev server live, per orchestrator). Ran prettier --write on the 2 files I edited (preview/page.tsx, convai-leaf.tsx) to keep them prettier-clean; both now pass `prettier --check`.

## Notes / flags
- Pre-existing prettier failures NOT introduced by me and left untouched (out of workstream): `app/(phone)/layout.tsx`, `pnpm-workspace.yaml` (both confirmed already failing at HEAD), and the vendored `public/vendor/govuk-frontend.scoped.css` (third-party asset — must not be reformatted).
- `frontend/scripts/` is now empty (both files deleted); empty dir is untracked by git, left in place.
- Did not touch `CLAUDE.md` (per PLAN it still describes the monorepo; flagged for user). Did not touch backend/, supabase/, Makefile, root README (other workstreams).
</content>
</invoke>
