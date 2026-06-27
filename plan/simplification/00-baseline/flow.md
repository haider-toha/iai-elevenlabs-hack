# Marginalia — Baseline Flow Capture

**Captured:** 2026-06-26 · **Tooling:** Playwright + headless Chromium (phone viewport 430×932, `deviceScaleFactor: 2`, microphone permission granted with fake media device so the voice start-chain reaches `/api/eleven/signed-url`).
**App under test:** `http://localhost:3000` (Next.js 16 App Router, Turbopack dev) · backend `http://localhost:8000` (FastAPI "Marginalia").
**Screens:** `plan/simplification/00-baseline/screens/NN-<name>.png`

---

## Environment health (pre-walk)

- `GET http://localhost:8000/health` → `{"status":"ok","service":"Marginalia"}`
- `GET http://localhost:3000/` → `200`
- `GET http://localhost:8000/letters/maria-p2` → `200` (P2 JSON)
- `GET http://localhost:8000/letters/maria-p800` → `200` (P800 JSON)
- `GET http://localhost:8000/letters/maria-p2/qr.png` → `200 image/png`
- `GET http://localhost:8000/letters/maria-p800/qr.png` → `200 image/png`
- `GET http://localhost:8000/letters/nope` → `404` (clean not-found)
- `GET http://localhost:3000/api/eleven/signed-url` → `200` (ElevenLabs key is valid; the route proxies a signed URL)
- Supabase Postgres `127.0.0.1:54322` is a DB port (not HTTP); it is exercised indirectly — every page renders real seeded letter data.

---

## Routes discovered (full set)

Read from `frontend/app`. The `(phone)` route group does not affect URLs; it only applies the iPhone-frame shell (frame chrome is `lg:`-only, so at a phone width the app is full-bleed).

| Route | Source file | Notes |
|---|---|---|
| `/` | `app/(phone)/page.tsx` | Phone home. Scan / Continue / Language. |
| `/conversations` | `app/(phone)/conversations/page.tsx` | "Your letters" list. |
| `/l/[id]` | `app/(phone)/l/[id]/page.tsx` | Explainer; one route, three internal phases (preparing → summary → conversation). QR cold-open target. |
| `/all-set` | `app/(phone)/all-set/page.tsx` | Editorial success screen. |
| `/actions/update-company-car/[letterId]` | `app/(phone)/actions/update-company-car/[letterId]/page.tsx` | GOV.UK GDS company-car form (auto-fills). |
| `/actions/update-company-car/[letterId]/confirmation` | `.../confirmation/page.tsx` | GDS green confirmation panel. |
| `/letters/[id]/preview` | `app/letters/[id]/preview/page.tsx` | HMRC scan facsimile (outside `(phone)`; neutral-grey document surface). Holds the QR. |
| `/api/eleven/signed-url` | `app/api/eleven/signed-url/route.ts` | GET; server-only ElevenLabs signed-url proxy. |
| (any unknown URL) | `app/not-found.tsx` | Global editorial 404. |

**Demo letter ids (slugs):** `maria-p2` (P2 PAYE Coding Notice, tax year 2026 to 2027, code 883L) and `maria-p800` (P800 Tax Calculation, tax year 2025 to 2026, overpaid, refund £748). Source: `supabase/migrations/20260625090200_seed_demo_letters.sql`. Both recipient = "Ms Maria Davies".

**Important — server-side data path:** `getLetter()` (`GET :8000/letters/{id}`) runs inside async Server Components, so it executes on the Next server and is **not** visible in the browser network trace. It is nonetheless proven on every preview/summary/action screen, which all render real seeded values (names, tax codes, £ amounts). The only browser-visible backend call is the QR image (`/letters/{id}/qr.png`); the only browser-visible same-origin API call is `/api/eleven/signed-url`. No `/scan-events` call exists in the frontend (that table is backend seed data only).

---

## Ordered flow

### 1 — Home · `/` · direct (entry point)
Visible: "Good afternoon.", "How can I help today?", "Scan a letter — I'll explain it simply.", "Continue a previous letter — Open a recent conversation.", "Language … English", privacy footer "Your data stays private. We don't share your letters or conversations with anyone." Marginalia "M" monogram logo.
API: none. Screenshot: `screens/01-home.png` — **PASS**

### 2 — Home, language menu open · `/` · click the "Language" row
Visible: dropdown with search box "Search languages" and flag rows — English (Default), Cymraeg, Polski, Română, Türkçe, Português, Español, then "See more languages".
API: none. Screenshot: `screens/02-home-language-menu.png` — **PASS**

### 3 — Letter preview (P2) · `/letters/maria-p2/preview` · click "Scan a letter" on home
Visible: HMRC scan facsimile — crown logo, "HM Revenue & Customs", "PAYE Coding Notice / Tax code for the year 2026-27", recipient "Ms Maria Davies / 47 Stryd Fawr / Caerdydd / CF10 1AX", "Please keep all your Coding Notices…", return address "BX9 1AS", Phone 0300 200 3300, NINO "QQ 12 34 ▒▒ C", "Dear Ms Maria Davies,", "Your tax code … is 883L". Scannable QR + "Scan with your phone to interact with this letter."
API: `GET http://localhost:8000/letters/maria-p2/qr.png 200`. Screenshot: `screens/03-preview-p2.png` — **PASS**

### 4 — Explainer (P2), preparing phase · `/l/maria-p2` · click the QR anchor on the preview
Visible: blue morphing orb, "Reading your letter…", checklist cascade ("Extracting key details" …), "Your data is private / We don't share your letter or conversations" card. Auto-advances ~3s (no redirect, same route).
API: none in browser (`getLetter` is server-side). Screenshot: `screens/04-explainer-p2-preparing.png` — **PASS**

### 5 — Explainer (P2), summary phase · `/l/maria-p2` · auto-advance (same route)
Visible: doc card "PAYE Coding Notice / 2026 to 2027", "Here's what we found.", "This sets the tax code your employer will use for the 2026 to 2027 tax year.", findings: "Your tax-free amount this year is £8830, which sets your tax code to 883L." and "HMRC believes you have a company car, which lowers that amount by £3740." CTAs: "Chat about this letter" + "Type instead".
API: none. Screenshot: `screens/05-explainer-p2-summary.png` — **PASS**

### 6 — Explainer (P2) summary, language globe · `/l/maria-p2` · click the globe in the top bar
Visible: same language dropdown surfaced over the findings summary.
API: none. Screenshot: `screens/06-explainer-p2-summary-language.png` — **PASS**

### 7 — Explainer (P2), conversation (voice entry) · `/l/maria-p2` · click "Chat about this letter"
Visible: chat header (menu + "English ▾"), agent bubble "Hi, I'm Marginalia. What would you like to know about your letter?", "Suggested questions" (What does my tax code mean? / Why did it change? / Is this correct? / What do I need to do?), the blue voice orb with "Marginalia is speaking", "Ask anything" composer with mic + close (X). The live ElevenLabs WebSocket cannot complete headless — this is expected and not a failure; the screen and its start-chain are what we verify.
API: `GET /api/eleven/signed-url 200`. Screenshot: `screens/07-explainer-p2-conversation-voice.png` — **PASS**

### 8 — Explainer (P2), typed-chat entry · `/l/maria-p2` · End conversation → summary → "Type instead"
Visible: same greeting + suggested questions, but the prominent orb dock is replaced by a slim "Marginalia is speaking" status line and a pill "Ask anything" composer (typed mode).
API: `GET /api/eleven/signed-url 200` (a fresh session starts). Screenshot: `screens/08-explainer-p2-conversation-typed.png` — **PASS**

### 9 — Letter preview (P800) · `/letters/maria-p800/preview` · direct (home only links to the P2 letter)
Visible: HMRC facsimile — "Tax Calculation / Tax year 2025-26", recipient block, Phone 0300 200 3300, NINO "QQ 12 34 ▒▒ C", Reference "P800-2026-0R4291", "We have checked the Income Tax you paid in the tax year 2025 to 2026.", "Income you received £24800", "Personal Allowance £12570" (and below: refund), + QR.
API: `GET http://localhost:8000/letters/maria-p800/qr.png 200`. Screenshot: `screens/09-preview-p800.png` — **PASS**

### 10 — Explainer (P800), preparing phase · `/l/maria-p800` · click the QR anchor on the P800 preview
Visible: "Reading your letter…" orb + checklist + privacy card (same theatre as the P2).
API: none in browser. Screenshot: `screens/10-explainer-p800-preparing.png` — **PASS**

### 11 — Explainer (P800), summary phase · `/l/maria-p800` · auto-advance (same route)
Visible: doc card "Tax Calculation / 2025 to 2026", "Here's what we found.", "This shows how much tax you paid in the 2025 to 2026 tax year.", findings: "You paid more tax than you needed to in 2025 to 2026.", "That's why you're owed a refund of £748.", "This usually happens when too much tax was taken from your pay." CTAs present.
API: none. Screenshot: `screens/11-explainer-p800-summary.png` — **PASS**

### 12 — Conversations list · `/conversations` · click "Continue a previous letter" on home
Visible: "Your letters / Your recent conversations.", rows: "Tax Calculation — 28 Apr 2024" (→ `/l/maria-p800`), "PAYE Coding Notice — 12 Jan 2025" (→ `/l/maria-p2`), "Self Assessment Confirmation — 28 Dec 2024" (demo-only row, href `#`), "View all conversations".
API: none. Screenshot: `screens/12-conversations.png` — **PASS**

### 13 — Company-car action form · `/actions/update-company-car/maria-p2` · direct
(In the running demo this is reached in-session: the chat ActionCard "Fix this on the government portal" → GOV.UK overlay → "Continue on GOV.UK". The overlay needs a live agent reply to surface, which can't happen headless, so we capture the same standalone form directly.)
Visible: GOV.UK GDS masthead + "HMRC — Personal Tax Account" service bar, "Company car and fuel", "Tell us your company car has been returned", "We'll use these details to update Ms Maria Davies's tax code…". Auto-typed fields: Vehicle registration "AB12 CDE", Date returned "14 March 2026", P11D value "£18,700". Green "Confirm and send" button (enables after the fill animation).
API: none in browser (`getLetter` server-side). Screenshot: `screens/13-company-car-form.png` — **PASS**

### 14 — Confirmation · `/actions/update-company-car/maria-p2/confirmation` · click "Confirm and send"
Visible: GDS green panel "Details received / Your company car update has been submitted", body "Your details have been received. In production this would update your tax code with HMRC. No real change has been made.", "What happens next … replacing code 883L with 1257L and stopping the overpayment.", "Continue" link, footer prototype/OGL licence notice.
API: none. Screenshot: `screens/14-confirmation.png` — **PASS**

### 15 — All set · `/all-set` · click "Continue" on the confirmation
Visible: tick mark, "You're all set.", "You can come back anytime if you have more questions.", "Save this chat" stub + primary "Finish" (→ home).
API: none. Screenshot: `screens/15-all-set.png` — **PASS**

### 16 — Not found · `/this-route-does-not-exist` · direct (unknown route)
Visible: "Marginalia" wordmark, "404", "Nothing filed here.", "The page you asked for doesn't exist. Back to home." Editorial style, outside the phone frame.
API: none. Screenshot: `screens/16-not-found.png` — **PASS**

---

## What "working" means for this demo (for the later verification agent)

Compare apples to apples on these, not on the voice actually speaking:

1. **Two seeded letters resolve end-to-end.** `maria-p2` (P2, code 883L, tax-free £8830, company-car deduction £3740) and `maria-p800` (P800, overpaid, refund £748) each render real data on their preview, the `/l/[id]` summary findings, and (for P2) the action form. If summaries show placeholder/empty figures, the backend letter path is broken.
2. **The cold-open chain renders.** `/letters/[id]/preview` shows the HMRC facsimile and loads `GET :8000/letters/{id}/qr.png 200`; the QR anchor opens `/l/{id}`, which runs preparing (~3s) → summary automatically (same route, no sub-routes, no `?step=`).
3. **The explainer start-chain fires.** Tapping "Chat about this letter" (or "Type instead") issues `GET /api/eleven/signed-url` (record the actual status — here `200`; an upstream `502` is acceptable and still counts as the call firing). Voice/listening orb, the four suggested questions, and the composer must render. A non-connecting WebSocket headless is **not** a failure.
4. **The GOV.UK action path completes.** Company-car form auto-fills (AB12 CDE / 14 March 2026 / £18,700) → "Confirm and send" → GDS "Details received" confirmation (honesty line "No real change has been made." is mandatory and verbatim) → "Continue" → `/all-set` → "Finish" → home.
5. **Supporting screens render:** home (Scan/Continue/Language), the language dropdown (English default + Cymraeg + 6 more), `/conversations` (Tax Calculation / PAYE Coding Notice / Self Assessment Confirmation), and the global 404.
6. **Brand boundary holds (do not "fix" these):** the `/letters/[id]/preview` is a deliberate white/black/Arial HMRC scan look-alike; the `/actions/*` screens are deliberate GOV.UK GDS facsimiles (crown logo, blue bar, green buttons). HMRC letter content stays in-fiction. These are intentional and must survive simplification.

**Browser-visible API surface (the meaningful, non-asset calls):**
- `GET http://localhost:8000/letters/maria-p2/qr.png` → 200
- `GET http://localhost:8000/letters/maria-p800/qr.png` → 200
- `GET http://localhost:3000/api/eleven/signed-url` → 200 (fires on each conversation start)
- (server-side, not in browser trace) `GET :8000/letters/{id}` for every preview/explainer/action render.

---

## VERDICT: PASS

All 16 screens rendered their expected content; the two seeded letters resolve end-to-end; every expected backend/same-origin API call fired with a healthy status (qr.png 200 ×2, signed-url 200 ×2). No screen errored, 404'd unexpectedly, or showed missing core content. The voice WebSocket not connecting under headless is expected and excluded from the gate per the capture brief.
