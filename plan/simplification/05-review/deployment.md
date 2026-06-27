# Phase-5 Adversarial Review — LENS 5: DEPLOYMENT VALIDATOR

**Scope:** Static verification that a cold deploy to Vercel (Root Directory = `frontend/`)
would succeed. Did NOT run `pnpm build` (Phase 8 validates the build).

**Verdict: PASS** — zero cold-deploy blockers found.

---

## (1) Env-var schema is the complete, minimal set — PASS

`frontend/lib/env.ts` now requires exactly:

- Build-time (browser, inlined): `NEXT_PUBLIC_AGENT_ID`, `NEXT_PUBLIC_XI_VOICE_ID_ENGLISH`,
  `NEXT_PUBLIC_XI_VOICE_ID_WELSH` (the `env` object — throws at build if any is missing).
- Runtime (server secret): `XI_API_KEY` (via `serverEnv()`, read inside the signed-url GET handler).

Every consumer maps to exactly these — no orphan and no missing var:
- `app/api/eleven/signed-url/route.ts` → `env.NEXT_PUBLIC_AGENT_ID`, `serverEnv().XI_API_KEY`
- `components/convai-leaf.tsx:347,389,390` → `env.NEXT_PUBLIC_XI_VOICE_ID_ENGLISH/WELSH`

`frontend/.env.example` documents exactly those four and nothing else. The four removed vars
(`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_ONE_LOGIN_URL`) are absent from BOTH the schema and the parse object — so no removed
`NEXT_PUBLIC_*` is still required (which would otherwise hard-fail the build). Full-repo grep for
those four names across `frontend/**.{ts,tsx,json,example}` (excluding lockfile) → zero matches.

## (2) No hardcoded localhost / 127.0.0.1 / :8000 / NEXT_PUBLIC_API_URL in shipped code — PASS

`grep -rniE "localhost|127.0.0.1|:8000|NEXT_PUBLIC_API_URL|SUPABASE|ONE_LOGIN" frontend/{app,components,lib}`
returns only two hits, both **code comments** describing the former architecture:
- `lib/letters.ts:2` ("former supabase seed migration")
- (no runtime references)

The preview-page QR image is now same-origin: `app/letters/[id]/preview/page.tsx:354`
`src={`/letters/${id}/qr.png`}` (no `env.NEXT_PUBLIC_API_URL` prefix; the `@/lib/env` import was
dropped from this file). The QR route handler derives the origin from `x-forwarded-host`/`host`
proxy headers — correct for Vercel.

## (3) Cold-deploy vendor-asset landmine is fixed — PASS

- `git ls-files frontend/public/vendor/` lists **both** `govuk-frontend.scoped.css` and
  `govuk-logotype.svg` (staged `A`), and does NOT list the deleted `govuk-frontend.min.css`.
  A fresh clone therefore has the two assets served at runtime
  (`actions/layout.tsx:25`, `update-company-car/[letterId]/page.tsx:90`,
  `confirmation/page.tsx:75`, `govuk-embed.tsx:46,128`).
- `.gitignore` no longer contains a `frontend/public/vendor/` line (`git check-ignore` confirms
  none of the vendor files are ignored). The previously-ignored landmine is gone.

## (4) No build-time dependency on a deleted script / dep — PASS

`frontend/package.json`:
- Scripts: no `predev`, `prebuild`, or `gen:assets`; no reference to `copy-govuk-assets`.
- `govuk-frontend`, `playwright`, `@playwright/test`, `tsx` removed from declared deps/devDeps.
- `qrcode ^1.5.4` (dep) + `@types/qrcode ^1.5.5` (devDep) present — the QR route's import resolves.
- `frontend/scripts/` directory deleted (both `copy-govuk-assets.ts` and `export-letter.ts` gone).

**Lockfile sync (frozen-lockfile gate):** Vercel runs `pnpm install --frozen-lockfile`, which fails
if the lockfile `importers` block disagrees with `package.json`. The importers block matches exactly
(`qrcode`/`@types/qrcode` added; `govuk-frontend`/`playwright`/`tsx` absent from importers). The 13
`@playwright/test` strings remaining in `pnpm-lock.yaml` are `next@16.2.9`'s **optional peer
dependency** resolution artifact (peer-context hash in the `next` version string + a `packages:`
entry), not a stale importer declaration — they do not break `--frozen-lockfile`. `govuk-frontend`
is fully absent from the lockfile. `next.config.ts` does NOT set `output: 'export'`, so the two
route handlers (`/api/eleven/signed-url`, `/letters/[id]/qr.png`) deploy as serverless functions.

## (5) No backend reference that runs at build or runtime — PASS

`grep -rniE "@/lib/api|backend/|FastAPI|asyncpg|DATABASE_URL|readFileSync|node:fs|node:path"
frontend/{app,components,lib}` returns only two **comments** (`lib/letters.ts:1`,
`qr.png/route.ts:3`). `git grep "@/lib/api"` → zero importers; `lib/api.ts` deleted from disk.
The signed-url route (baseline flow steps 7 & 8) is still present at
`frontend/app/api/eleven/signed-url/route.ts`. Makefile/README backend references are irrelevant to
the Vercel cold deploy (build runs only `pnpm install && pnpm build` inside `frontend/`).

## XI_API_KEY rotation — confirmed as a documented deploy note

PLAN.md (env table + WS-DELETE) flags rotating the leaked `XI_API_KEY` before any public deploy and
marking it Sensitive on Vercel. This is a deploy-ops note (the secret lives in git history via the
already-triaged `backend/.env` deletion), not a code blocker. Confirmed, not re-reported.

---

## Non-blocking notes

1. **Three new source files are untracked (`??`), not yet committed:**
   `frontend/lib/letters.ts`, `frontend/lib/letter-explainer-prompt.ts`,
   `frontend/app/letters/[id]/qr.png/route.ts`. They are NOT gitignored
   (`git check-ignore` clean), so a standard `git add -A` (the normal way to stage a multi-file
   refactor) includes them, and the working tree Phase 8 builds against already has them. **Footgun:**
   a `git commit -am` would NOT pick up untracked new files — it would ship a commit where the
   deletion of `lib/api.ts` lands but `@/lib/letters` (imported by four files) is missing, breaking
   the build. Stage with `git add -A`, not `git commit -am`, before pushing to Vercel. Classified
   non-blocking because the files are authored, present, and un-ignored; the engineered landmine
   (gitignored vendor assets that survive `git add .`) is the one that was fixed.

2. CLAUDE.md still describes the removed backend/supabase monorepo — intentionally not rewritten
   (already triaged). Irrelevant to deploy.
