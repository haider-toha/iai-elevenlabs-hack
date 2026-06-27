# Marginalia

**The voice in the margin of your government letter.** Marginalia turns the QR
code already printed on a government letter into a thirty-second conversation
that explains it — in any language — and catches the mistake.

A single Next.js 16 app (App Router, React, TypeScript, Tailwind v4 — pnpm). The
two demo letters and the explainer system prompt are inlined; the only server
runtime is two Next route handlers — `/api/eleven/signed-url` (keeps the
ElevenLabs key server-side) and `/letters/[id]/qr.png` (same-origin QR).

Requires Node 26 and pnpm 11.

## Setup

```bash
make setup        # install deps + create frontend/.env from the example
```

Then put real values in `frontend/.env` (never commit it):

- `XI_API_KEY` — ElevenLabs API key (server-only secret)
- `NEXT_PUBLIC_AGENT_ID` — ElevenLabs agent id
- `NEXT_PUBLIC_XI_VOICE_ID_ENGLISH` — English voice override
- `NEXT_PUBLIC_XI_VOICE_ID_WELSH` — Welsh voice override

## Run

```bash
make dev            # frontend on :3000
```

- App: http://localhost:3000

## Checks

```bash
make format      # prettier
make lint        # eslint
make typecheck   # tsc
make test        # frontend tests
```

## Deploy

Deployed on Vercel with Root Directory set to `frontend/`. Set the four env vars
above in the Vercel project (Production) before the first deploy — `XI_API_KEY`
as a runtime Sensitive secret, the three `NEXT_PUBLIC_*` are inlined at build
time. No database, no migrations, no second process.

Read `CLAUDE.md` before writing code — it's the project constitution.
