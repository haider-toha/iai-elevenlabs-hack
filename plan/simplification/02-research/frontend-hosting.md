# Frontend Hosting (2026) — decision for the simplified Marginalia app

Research date: 2026-06-26. Scope: where to host the post-refactor Marginalia frontend —
a Next.js **16.2.9** App Router app (React 19.2.7, Turbopack) whose only server runtime is
two Node route handlers. Builds on Phase 1 (`01-exploration/*`, `00-baseline/flow.md`). Facts
from Phase 1 are treated as ground truth and not re-derived here.

---

## TL;DR — recommendation

**Deploy to Vercel.** It is the only first-party Next.js host, runs Next 16 App Router route
handlers with zero config, and uses one Environment Variables panel for both build-time and
runtime values — which is exactly what this app needs (3 build-time `NEXT_PUBLIC_*` + 1 runtime
secret). For a phone-framed hackathon demo with one external dependency (ElevenLabs), nothing
else clears the bar of "git push and it works" as cleanly.

Ranked:

1. **Vercel** — first-party, zero-config, single env panel. *Pick this.*
2. **Netlify** — zero-config Next 16 via its maintained OpenNext adapter; effectively a tie on
   effort, second only because it is not the framework's own author.
3. **Cloudflare Workers (`@opennextjs/cloudflare`)** — works, but you hand-write `wrangler.jsonc`
   + `open-next.config.ts` and the build-time/runtime env split becomes a real footgun. Only
   worth it if Cloudflare is already the org standard.
4. **Render / self-host Node (Docker `output: "standalone"`)** — most control, most ops. Over-kill
   for a demo; choose only if a non-serverless long-lived Node host is a hard requirement.

---

## What this app actually requires of a host (the constraints that decide it)

From Phase 1, the simplified app is **not** a static export and **not** a backend monorepo. After
the refactor it is a single Next.js app with:

- **Two Node route handlers** that must run server-side:
  - `app/api/eleven/signed-url/route.ts` — the surviving ElevenLabs signed-URL minter
    (`route.ts:13` reads `XI_API_KEY` via `serverEnv()`; `02-backend`/`05-external` §1.1). This
    alone rules out `output: "export"`.
  - the **new QR route handler** that replaces the deleted FastAPI `GET /letters/{id}/qr.png`
    (Phase 1 decision 4.4 / 3.3). It encodes the deployed origin + `/l/{id}`, so it too must be a
    server handler, not a static asset.
- **Build-time network access to Google Fonts.** `app/layout.tsx:3` uses `next/font/google`
  (Hanken Grotesk + Newsreader); these are fetched and self-hosted at `next build`
  (`04-infra-config` Bucket 1, `05-external` §1.3). Any CI/build step must have outbound network.
- **Static assets served from `public/`** — including the two GOV.UK files
  (`public/vendor/govuk-frontend.scoped.css`, `govuk-logotype.svg`) that are **git-ignored and
  not regenerated** (the cold-deploy landmine, Phase 1 §3/4). *This bites on every host equally* —
  fix it before deploying anywhere (commit the two files). Hosting choice does not save you here.
- **One real secret at runtime:** `XI_API_KEY`. Everything else the agent needs is a
  build-inlined `NEXT_PUBLIC_*` value.

Net: the app needs an **SSR/serverless Node host**, build-time network, and a place to put 3
build vars + 1 runtime secret. It does **not** need a database, Docker, Python, edge KV, or
background jobs.

---

## The env-var rule that dominates the whole decision (read this first)

This is the single most important hosting fact for Marginalia, and it is **the same on every
platform** because it is a property of Next.js, not the host:

> **`NEXT_PUBLIC_*` variables are inlined into the JS bundle at `next build`. They must be present
> at *build time*. After the build they are frozen — changing them later has no effect without a
> rebuild.** Server-only variables (no prefix) are read from `process.env` at *runtime* and can
> change per-deploy without a rebuild.
> ([Next.js env docs](https://nextjs.org/docs/pages/guides/environment-variables),
> [Vercel env guide](https://env.dev/guides/vercel-env-variables))

Marginalia makes this stricter than usual because of **`frontend/lib/env.ts`**: it calls
`schema.parse({...})` **at module load**, referencing each `process.env.NEXT_PUBLIC_*` literally
(`env.ts:21-30`). That module is imported by both client and server code. Consequences:

- If any **required** `NEXT_PUBLIC_*` var is missing **at build time**, the build *throws* — it
  does not silently ship `undefined`. (This is also why the dead Supabase vars currently hard-fail
  boot — Phase 1 §3.1; delete them from the schema as part of the refactor.)
- After the refactor the schema should contain exactly the three live `NEXT_PUBLIC_*` vars
  (drop `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_ONE_LOGIN_URL`).
- `XI_API_KEY` is read by `serverEnv()` **only inside the GET handler** (`env.ts:39-43`,
  `route.ts:13`). Route handlers do not execute at build, so `XI_API_KEY` is **not required at
  build** — it is a pure **runtime** secret. (Setting it at build too is harmless.)

### Where each of the 4 needed vars goes

| Var | Kind | Needed at | Why |
|---|---|---|---|
| `NEXT_PUBLIC_AGENT_ID` | public, inlined | **build** | `route.ts:15` URL + inlined into bundle |
| `NEXT_PUBLIC_XI_VOICE_ID_ENGLISH` | public, inlined | **build** | `convai-leaf.tsx:342,387` |
| `NEXT_PUBLIC_XI_VOICE_ID_WELSH` | public, inlined | **build** | `convai-leaf.tsx:386` |
| `XI_API_KEY` | server secret | **runtime** | `serverEnv()` in the signed-url handler; never inlined |

On hosts with a **single env config shared by build and runtime** (Vercel, Netlify, Render), the
practical answer is: **set all four in the one panel** and they cover both phases. The build/runtime
distinction only becomes operationally visible on **Cloudflare**, where the build runs in CI/locally
(needs the three `NEXT_PUBLIC_*` in that env) and runtime secrets are injected separately into the
Worker (see below).

---

## Turbopack / Next 16 notes for *this* app

Next 16 makes **Turbopack the default for both `next dev` and `next build`**, and a custom
**webpack config now fails the build** to prevent silent misconfig
([Next 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16),
[Turbopack migration](https://ishu.dev/post/turbopack-nextjs-16-migration-guide-2026-04-27)).
For Marginalia this is a **non-issue and actually a positive**:

- `next.config.ts` has only `reactStrictMode` + `devIndicators` — **no webpack config, no Babel,
  no SVGR, no Module Federation** (the things that break under Turbopack). So the default
  Turbopack build "just works"; no `--webpack` escape hatch needed.
- Turbopack is **stricter about `NEXT_PUBLIC_` static references** — but `env.ts` already accesses
  them as literal `process.env.NEXT_PUBLIC_X` (not dynamic), which is exactly the form Turbopack
  inlines. No change required.
- The stable **Build Adapters API landed in Next 16.2**, which is what let Netlify, Cloudflare/
  OpenNext, Amplify, etc. all gain first-class Next 16 support during Q1 2026
  ([OpenNext Cloudflare](https://opennext.js.org/cloudflare),
  [makerkit hosting roundup](https://makerkit.dev/blog/tutorials/best-hosting-nextjs)). So every
  option below genuinely supports Next 16 — the differentiator is effort and the env model.

---

## Option-by-option

### 1. Vercel — recommended

- **Route handlers out of the box?** Yes — first-party. SSR pages and route handlers
  automatically become isolated serverless functions; no adapter, no config
  ([Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)).
- **Env model:** one **Project → Settings → Environment Variables** panel, scoped to
  Production / Preview / Development. Values are present for **both build and runtime**, so all four
  vars go in the same place. Note Vercel's own caveat: a var added *after* a deployment is
  `undefined` until you redeploy
  ([Vercel KB](https://vercel.com/kb/guide/how-to-add-vercel-environment-variables)). Set vars
  *before* the first build.
- **Gotchas for this app:** essentially none. Build has network (fonts fetch fine). Mark
  `XI_API_KEY` as a Sensitive var — but remember "Sensitive" does **not** stop a `NEXT_PUBLIC_`
  var reaching the browser; that's what the missing prefix already guarantees here
  ([Vercel sensitive env](https://vercel.com/docs/environment-variables/sensitive-environment-variables)).
- **Why #1:** least surface area, framework author's own platform, exact match for a 4-var,
  2-handler demo.

#### Exact deploy steps (Vercel)

1. **Finish the refactor prerequisites first** (these are host-independent, but block any deploy):
   commit `public/vendor/govuk-frontend.scoped.css` + `govuk-logotype.svg` (un-ignore them);
   inline the two letters + the system prompt; replace `getLetter`/QR with the inlined data +
   new QR route handler; delete the dead `NEXT_PUBLIC_API_URL` / Supabase / One Login vars from
   `lib/env.ts`. (Phase 1 decisions 1–6.)
2. `gh repo` / push the repo to GitHub (or run `vercel` CLI from `frontend/`).
3. In Vercel, **New Project → import the repo → set Root Directory to `frontend/`** (the Next app
   is not at repo root). Framework preset auto-detects Next.js; build command `next build`, output
   handled automatically. Package manager: pnpm (lockfile detected).
4. **Add Environment Variables (all four, Production scope) before deploying:**
   - `NEXT_PUBLIC_AGENT_ID` → `agent_…` (build)
   - `NEXT_PUBLIC_XI_VOICE_ID_ENGLISH` → `YCMgeo2Dvws6xwm7kQNN` (build)
   - `NEXT_PUBLIC_XI_VOICE_ID_WELSH` → `73fZMjboCm1aBVyxTbBp` (build)
   - `XI_API_KEY` → the secret, **mark Sensitive** (runtime) — **rotate the leaked key first**
     (Phase 1 §3.7).
5. **Deploy.** Verify the gate from `00-baseline/flow.md`: home renders, both letters resolve,
   `/letters/{id}/preview` shows the QR (now from the new same-origin handler), and
   `GET /api/eleven/signed-url` returns 200.

### 2. Netlify — strong alternative

- **Route handlers out of the box?** Yes. Netlify ships and **auto-updates** a maintained OpenNext
  adapter supporting every Next version from 13.5+, "Next.js 16 … ready … with zero configuration,"
  including Turbopack and the new caching APIs
  ([Next.js on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/),
  [Netlify changelog](https://www.netlify.com/changelog/tag/next-js/)). App Router server
  components, streaming, and route handlers are supported; handlers run as Netlify Functions.
- **Env model:** one **Site configuration → Environment variables** panel, available at build and
  runtime — same single-panel ergonomics as Vercel. Put all four there; the three `NEXT_PUBLIC_*`
  are consumed at build, `XI_API_KEY` at runtime.
- **Gotchas:** there are scattered "Next 16 build fails on Netlify" forum reports from the early
  16.x window
  ([forum thread](https://answers.netlify.com/t/next-js-16-project-build-fails-on-netlify/157791));
  the documented fix path is to be on the latest adapter (it auto-updates unless you opted out).
  Set **Base directory = `frontend`**. Otherwise indistinguishable from Vercel in effort.

### 3. Cloudflare Workers via `@opennextjs/cloudflare` — works, more moving parts

- **Route handlers out of the box?** Yes, but via an adapter you wire yourself. The adapter
  supports App Router route handlers, SSR, SSG, and dynamic routes, running on the **Node.js
  runtime** of Workers (not the limited edge runtime) — which is what our handlers need
  ([OpenNext Cloudflare](https://opennext.js.org/cloudflare)). All Next 16 minors are supported
  (Next 14 support drops Q1 2026).
- **Required config (hand-written):** `wrangler.jsonc` with `"main": ".open-next/worker.js"`,
  an `assets` binding to `.open-next/assets`, **`compatibility_flags: ["nodejs_compat",
  "global_fetch_strictly_public"]`**, and a compatibility date ≥ 2024-09-23; plus
  `open-next.config.ts`; plus build/preview/deploy scripts; deploy with `npm run deploy`
  ([get-started](https://opennext.js.org/cloudflare/get-started)).
- **Env model — this is where the build/runtime split gets real:**
  - The **build runs in CI/locally** (`opennextjs-cloudflare build` runs `next build`), so the
    three `NEXT_PUBLIC_*` must be in **that build environment** to be inlined. A Worker secret set
    in the Cloudflare dashboard is **not** visible to the build and will *not* fix a missing
    `NEXT_PUBLIC_*` — this is the classic OpenNext footgun for this exact pattern.
  - `XI_API_KEY` is a **runtime secret**, injected as a Worker secret (`wrangler secret put
    XI_API_KEY` or the dashboard; `.dev.vars` locally). OpenNext maps Cloudflare bindings into
    `process.env`, so `serverEnv()`'s `process.env.XI_API_KEY` resolves at request time.
- **Verdict:** technically fine, but you maintain two env surfaces and two config files for a demo
  that Vercel/Netlify deploy with none. Choose only if Cloudflare is mandated.

### 4. Render / self-host Node — most control, most ops

- **Render (managed):** a standard **Web Service** — build `pnpm install && pnpm build`, start
  `pnpm start` (`next start`), one env-vars panel shared by build + runtime, zero-downtime deploys,
  Next 16 supported
  ([Render Next.js guide](https://render.com/docs/deploy-nextjs-app),
  [SSR article](https://render.com/articles/how-to-deploy-next-js-applications-with-ssr-and-api-routes)).
  Route handlers run because it's a real long-lived Node server. Set Root Directory to `frontend`.
  Reasonable, just more than a demo needs.
- **Raw self-host (Docker):** add `output: "standalone"` to `next.config.ts`; Next traces only the
  imported `node_modules` into `.next/standalone` and you run `node server.js` in a slim multi-stage
  image
  ([self-hosting](https://nextjs.org/docs/app/guides/self-hosting),
  [standalone output](https://nextjs.org/docs/pages/api-reference/config/next-config-js/output)).
  Now you own TLS, the host, scaling, and **the build env** — `NEXT_PUBLIC_*` must be passed as
  build args/`ENV` *before* `next build` in the Dockerfile, while `XI_API_KEY` is injected at
  `docker run`/orchestrator runtime. This correctly models the build/runtime split but is the most
  work; justified only if a serverless platform is off the table.

---

## Bottom line

The app is a tiny SSR Next 16 surface (2 route handlers, 4 env vars, 1 external service, no DB).
Every option listed runs it, so optimise for the lowest-effort correct deploy: **Vercel**, with the
three `NEXT_PUBLIC_*` voice/agent vars and the runtime `XI_API_KEY` secret all entered in the one
Environment Variables panel **before the first build**, root directory `frontend`. Before deploying
anywhere, fix the host-independent blocker — commit the two git-ignored `public/vendor/` GOV.UK
assets — or the GOV.UK overlay and `/actions/*` pages render unstyled on a cold clone.

## Sources

- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Next.js Environment Variables (build vs runtime inlining)](https://nextjs.org/docs/pages/guides/environment-variables)
- [Vercel env variables guide (env.dev)](https://env.dev/guides/vercel-env-variables)
- [Vercel: add environment variables (redeploy caveat)](https://vercel.com/kb/guide/how-to-add-vercel-environment-variables)
- [Vercel sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
- [Next.js on Netlify (overview)](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Netlify Next.js changelog](https://www.netlify.com/changelog/tag/next-js/)
- [Netlify forum: Next 16 build fails](https://answers.netlify.com/t/next-js-16-project-build-fails-on-netlify/157791)
- [OpenNext Cloudflare](https://opennext.js.org/cloudflare) · [get-started](https://opennext.js.org/cloudflare/get-started)
- [Render: deploy Next.js](https://render.com/docs/deploy-nextjs-app) · [SSR + API routes](https://render.com/articles/how-to-deploy-next-js-applications-with-ssr-and-api-routes)
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting) · [output: standalone](https://nextjs.org/docs/pages/api-reference/config/next-config-js/output)
- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) · [Turbopack default migration](https://ishu.dev/post/turbopack-nextjs-16-migration-guide-2026-04-27) · [best Next.js hosting 2026](https://makerkit.dev/blog/tutorials/best-hosting-nextjs)
