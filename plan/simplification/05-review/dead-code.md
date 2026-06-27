# Phase-5 Adversarial Review — LENS 2: DEAD CODE AUDITOR

**Scope:** orphaned imports, dangling references, leftover scaffold, and orphaned config in the
CHANGED/remaining frontend after the backend/supabase elimination.
**Verdict: PASS (zero blockers).**

All work performed against the working tree (`git diff HEAD` + untracked new files), since the
prompt frames the change as the working-tree state.

---

## Targeted reference sweep (all required checks — all clean)

`git grep` over `frontend/**`:

| Check | Result |
|---|---|
| `@/lib/api` importers | **0** (file staged for deletion; no remaining consumers) |
| `NEXT_PUBLIC_API_URL` | 0 |
| `NEXT_PUBLIC_SUPABASE_*` | 0 |
| `NEXT_PUBLIC_ONE_LOGIN_URL` | 0 |
| `getHealth` | 0 |
| `readFileSync` | 0 |
| `node:fs` / `node:path` | 0 (both removed from `(phone)/l/[id]/page.tsx`) |
| `../backend` | 0 |
| `copy-govuk-assets` / `export-letter` | 0 (deleted scripts, no refs) |
| deleted PNGs (`GovUK_example_ss`, `GovUK_logo`, `letter_reference`) | 0 |

The single live coupling that survives — the vendor assets — resolves correctly:
`/vendor/govuk-frontend.scoped.css` and `/vendor/govuk-logotype.svg` are referenced by
`actions/layout.tsx`, `govuk-embed.tsx`, and both company-car pages, and **both files are staged**
(`A`) after C11. `git ls-files frontend/public/vendor/` would list exactly those two (min.css gone).

---

## package.json + lockfile (orphaned config)

`package.json` is fully cleaned per C9:
- Scripts removed: `gen:assets`, `predev`, `prebuild` (all called the deleted `copy-govuk-assets`).
- Deps removed: `govuk-frontend`. DevDeps removed: `tsx`, `playwright`, `@playwright/test`.
- Added: `qrcode ^1.5.4` (dep), `@types/qrcode ^1.5.5` (devDep).
- No surviving script points at a deleted file.

`pnpm-lock.yaml` is **in sync**: `pnpm install --frozen-lockfile` → exit 0 ("Already up to date").
This is the exact gate Vercel runs on cold deploy, so it passes.
- Residual `playwright@1.61.1` / `playwright-core@1.61.1` and `@playwright/test@1.61.1` entries
  persist only as `next@16.2.9`'s **optional peer dependency** resolution, not as direct importers
  (the `importers.` block correctly lists only the live deps). Not an orphan — frozen install
  validates it.

---

## New files — no unused imports, all exports consumed

- `lib/letters.ts` — exports `CodeLine`, `SuspectedError`, `P2Letter`, `P800Letter`, `Letter`,
  `getLetter`; every one is consumed externally or internally. `getLetter` is now **synchronous**
  and all three call sites dropped `await` (`l/[id]`, `preview`, `update-company-car`).
- `lib/letter-explainer-prompt.ts` — single `SYSTEM_PROMPT` export, consumed by `l/[id]/page.tsx`.
- `app/letters/[id]/qr.png/route.ts` — only imports `QRCode` (used). Compiles as a dynamic route
  (`ƒ /letters/[id]/qr.png` in the build output).

Edited call sites verified: `letter-format.ts` and `convai-leaf.tsx` repoint to `@/lib/letters`;
`preview/page.tsx` dropped the now-unused `env` import and the QR `<img src>` is now same-origin
`/letters/${id}/qr.png`.

## Build gates (working tree)

- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0 (ESLint catches unused imports; none)
- `pnpm build` → success; route map shows all 12 routes including the new qr.png handler; no
  missing-import or boot-time env throw.

---

## Non-blocking observations

1. **New deliverable files are untracked while their replacement is staged for deletion.**
   `lib/api.ts` shows `D ` (staged deletion) but `lib/letters.ts`,
   `lib/letter-explainer-prompt.ts`, and `app/letters/[id]/qr.png/route.ts` are `??` (untracked).
   The working tree is complete and builds, so this is not a code defect — but it IS a
   commit-completeness footgun: a partial commit (e.g. `git commit -am`, which does not add
   untracked files) would ship the `lib/api.ts` deletion without its replacement and fail a cold
   deploy. **Action before commit:** `git add` the three new paths (the vendor assets were already
   `git add -f`'d, so the staging is just incomplete, not wrong).

2. **Orphan `.gitignore` entries pointing at deleted trees.** `backend/.venv/` (line 13),
   `supabase/.branches/` (line 24), `supabase/.temp/` (line 25) now ignore non-existent paths.
   Harmless (ignoring a missing path is a no-op) — cosmetic cleanup only. The refactor correctly
   removed the `frontend/public/vendor/` ignore line (C11).

3. **Newly-committed `public/vendor/govuk-frontend.scoped.css` fails `prettier --check`.** Prettier
   is **not** a lint/build/deploy gate here (no `.github/workflows`, `make lint` = ruff+eslint,
   Vercel runs `next build`), and the file is a minified third-party vendor asset that should not be
   reformatted. Optional cleanup: add it to a `.prettierignore`. (The other two prettier warnings —
   `(phone)/layout.tsx`, `pnpm-workspace.yaml` — are the pre-existing, already-triaged baseline.)

4. **Stale comment mentions of the deleted `govuk-frontend.min.css`.** `actions/layout.tsx:12`
   (a prose comment) and a `sourceMappingURL=govuk-frontend.min.css.map` trailer inside the vendored
   scoped.css. Neither is a runtime load; the actual min.css was deleted in C10. Cosmetic.

5. **CLAUDE.md still describes the removed backend/supabase monorepo.** Already triaged (intentional
   per plan — flagged to the user, not auto-rewritten). Confirmed, not re-reported.
