# LENS 4 — Type & Lint Checker

Reviewed change: Marginalia simplification (backend + supabase eliminated; single Next.js app).
Repo: `/Users/haidertoha/Code/i.ai_hackathon` · branch `main`.
Checks run against `frontend/` (the only surviving app). `pnpm build` deliberately NOT run (dev
server live on :3000; Phase 8 gate owns the build).

## Verdict: PASS

`pnpm lint` exit 0 AND `pnpm typecheck` exit 0. Zero blockers.

---

## 1. `pnpm lint`  →  EXIT 0  (clean)

```
$ eslint .
LINT_EXIT=0
```

No eslint errors or warnings. (`package.json` "lint" = `eslint .` — flat config, whole frontend.)
This covers every refactor-touched and newly-created file:
`lib/letters.ts`, `lib/letter-explainer-prompt.ts`, `app/letters/[id]/qr.png/route.ts`,
`lib/env.ts`, `lib/letter-format.ts`, `app/letters/[id]/preview/page.tsx`,
`app/(phone)/l/[id]/page.tsx`, `app/(phone)/actions/update-company-car/[letterId]/page.tsx`,
`components/convai-leaf.tsx`. The preview page's `no-img-element` eslint-disable was preserved by
the refactor, so the same-origin `<img src="/letters/{id}/qr.png">` does not trip eslint.

## 2. `pnpm typecheck`  →  EXIT 0  (clean)

```
$ tsc --noEmit
TYPECHECK_EXIT=0
```

No TS errors. The new synchronous `getLetter(id): Letter | null` and the dropped `await` at the
three call sites typecheck. `import QRCode from "qrcode"` in the new route resolves (`qrcode` +
`@types/qrcode` are in `package.json` and installed). `@/lib/letters` and
`@/lib/letter-explainer-prompt` resolve at every repointed import. The convai-leaf pre-existing
ts(6385) deprecation HINTS for `source`/`FormEvent` are not type errors and do not affect exit 0
(triaged non-blocker, present at HEAD).

## 3. `pnpm prettier --check .`  →  EXIT 1  (only pre-existing/triaged files)

```
[warn] app/(phone)/layout.tsx
[warn] pnpm-workspace.yaml
[warn] public/vendor/govuk-frontend.scoped.css
[warn] Code style issues found in 3 files.
PRETTIER_EXIT=1
```

All 3 are the pre-triaged non-blockers:
- `app/(phone)/layout.tsx` — pre-existing nonconformance at HEAD (NOT introduced here).
- `pnpm-workspace.yaml` — pre-existing nonconformance at HEAD.
- `public/vendor/govuk-frontend.scoped.css` — vendored third-party asset (committed in C11); not
  authored here.

Prettier is **not** part of `make lint`/`make typecheck`, so its exit 1 does not gate this lens.

### Refactor-TOUCHED files are prettier-clean (proof)

Ran prettier `--check` explicitly on every file the refactor created or edited:

```
$ prettier --check lib/letters.ts lib/letter-explainer-prompt.ts lib/env.ts \
  lib/letter-format.ts app/letters/[id]/qr.png/route.ts \
  app/letters/[id]/preview/page.tsx app/(phone)/l/[id]/page.tsx \
  app/(phone)/actions/update-company-car/[letterId]/page.tsx \
  components/convai-leaf.tsx package.json
All matched files use Prettier code style!
PRETTIER_TOUCHED_EXIT=0
```

`.env.example` (also edited) is intentionally excluded: prettier has no parser for it
(`No parser could be inferred`) and the full directory `--check` skips it — it is not and cannot be a
prettier failure.

---

## Cross-checks supporting "no dead/broken references"

- `git grep -n "@/lib/api" -- 'frontend/**'` → no matches (rc=1). The deleted `lib/api.ts` has zero
  importers; `lib/api.ts` is gone from disk. No broken module resolution.
- Vendor assets are git-tracked (cold-deploy safe): `git ls-files frontend/public/vendor/` lists
  `govuk-frontend.scoped.css` and `govuk-logotype.svg` (both staged `A`); `govuk-frontend.min.css`
  is gone.
- New route present on disk: `app/letters/[id]/qr.png/route.ts`.

## Non-blocking notes
- Prettier exit 1 from the 3 pre-existing/vendored files. Optional: `pnpm format` would also rewrite
  `layout.tsx` and `pnpm-workspace.yaml`; leave the vendored CSS as-is or add a `.prettierignore`
  entry. Not required for this change.
