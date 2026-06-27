# Marginalia — Phase 8 Playwright Verification (Simplified Build)

**Verified:** 2026-06-26 · **Tooling:** Playwright 1.61.1 + headless Chromium (phone viewport 430×932, `deviceScaleFactor: 2`, microphone granted with fake media device so the voice start-chain reaches `/api/eleven/signed-url`).
**App under test:** `http://localhost:3000` served by a PRODUCTION build (`next start`, not dev). `GET /` → `200`.
**No backend:** there is **no** FastAPI on `:8000` and **no** Supabase. The app is self-contained — letters are inlined (`lib/letters`) and the QR is served same-origin by the Next route handler `app/letters/[id]/qr.png/route.ts`.
**Method:** the exact 16-step baseline sequence was walked, preferring real clicks (matching how the baseline reached each step) and falling back to direct URL only where the baseline did. Per page: `networkidle` settle, `page.on('requestfinished')` capture (method/url/status), one screenshot per step.
**Screens:** `plan/simplification/08-verification/screens/NN-<name>.png`
**Baseline compared against:** `plan/simplification/00-baseline/flow.md` + `00-baseline/screens/`.

---

## The intended improvement (treated as PASS, not regression)

Where the **baseline** recorded `GET http://localhost:8000/letters/{id}/qr.png` (cross-origin, FastAPI), the **simplified** app fires `GET http://localhost:3000/letters/{id}/qr.png` (same-origin, Next route handler) `200 image/png`. This origin change is the whole point of the refactor and is scored as PASS. The only other browser-visible API call, `GET /api/eleven/signed-url`, was already same-origin and remains so.

The live ElevenLabs WebSocket cannot complete under headless Chromium. Per the capture brief this is **expected and excluded from the gate** — what is verified is that the conversation screen renders (header, suggested questions, orb / status line, composer) and that its start-chain fires `/api/eleven/signed-url`.

---

## Per-step results

| # | Screen | URL | Reached by | Key content vs baseline | API calls observed (origin) | Screenshot | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Home | `/` | direct | M monogram, "Good afternoon.", "How can I help today?", Scan a letter / Continue a previous letter / Language → English, privacy footer — all present | none (page load only, same-origin) | `screens/01-home.png` | **PASS** |
| 2 | Home language menu | `/` | click "Language" row | Dropdown: Search languages + English (Default), Cymraeg, Polski, Română, Türkçe, Português, Español, "See more languages" | none | `screens/02-home-language-menu.png` | **PASS** |
| 3 | Letter preview P2 | `/letters/maria-p2/preview` | click "Scan a letter" | HMRC facsimile: crown, "HM Revenue & Customs", "PAYE Coding Notice / Tax code for the year 2026-27", Ms Maria Davies / 47 Stryd Fawr / Caerdydd / CF10 1AX, keep-notices note, BX9 1AS, Phone 0300 200 3300, NINO QQ 12 34 ▒▒ C, "Dear Ms Maria Davies,", code **883L** | `GET /letters/maria-p2/qr.png` **200** (same-origin :3000) | `screens/03-preview-p2.png` | **PASS** |
| 4 | Explainer P2 preparing | `/l/maria-p2` | click QR anchor | Blue morphing orb, "Reading your letter…", checklist cascade, "Your data is private / We don't share your letter or conversations" card | none in browser (letter is inlined; no server fetch leaks) | `screens/04-explainer-p2-preparing.png` | **PASS** |
| 5 | Explainer P2 summary | `/l/maria-p2` | auto-advance (~3s) | Doc card "PAYE Coding Notice / 2026 to 2027", "Here's what we found.", "This sets the tax code your employer will use for the 2026 to 2027 tax year.", tax-free **£8830 → 883L**, company car lowers by **£3740**; CTAs Chat / Type instead | none | `screens/05-explainer-p2-summary.png` | **PASS** |
| 6 | Summary language globe | `/l/maria-p2` | click language globe | Same language dropdown surfaced over the findings summary | none | `screens/06-explainer-p2-summary-language.png` | **PASS** |
| 7 | Conversation (voice) | `/l/maria-p2` | click "Chat about this letter" | Header (menu + English ▾), 4 Suggested questions, blue voice orb + "Marginalia is speaking", "Ask anything" composer with mic + close. Greeting shows "Marginalia is getting ready…" (live WS does not deliver the agent's first message headless — expected) | `GET /api/eleven/signed-url` **200** (same-origin :3000) | `screens/07-explainer-p2-conversation-voice.png` | **PASS** |
| 8 | Conversation (typed) | `/l/maria-p2` | End conversation → summary → "Type instead" | Same greeting state + 4 suggested questions, but slim "Marginalia is speaking" status line (no prominent orb) above the pill composer — typed mode matches baseline | `GET /api/eleven/signed-url` **200** (same-origin :3000) — fresh session | `screens/08-explainer-p2-conversation-typed.png` | **PASS** |
| 9 | Letter preview P800 | `/letters/maria-p800/preview` | direct | HMRC facsimile: "Tax Calculation / Tax year 2025-26", recipient block, Phone 0300 200 3300, NINO QQ 12 34 ▒▒ C, Reference **P800-2026-0R4291**, "We have checked the Income Tax you paid in the tax year 2025 to 2026", Income **£24800**, Personal Allowance **£12570** | `GET /letters/maria-p800/qr.png` **200** (same-origin :3000) | `screens/09-preview-p800.png` | **PASS** |
| 10 | Explainer P800 preparing | `/l/maria-p800` | click QR anchor | "Reading your letter…" orb + checklist + privacy card (same theatre as P2) | none in browser | `screens/10-explainer-p800-preparing.png` | **PASS** |
| 11 | Explainer P800 summary | `/l/maria-p800` | auto-advance | Doc card "Tax Calculation / 2025 to 2026", "Here's what we found.", "This shows how much tax you paid in the 2025 to 2026 tax year.", "You paid more tax than you needed to in 2025 to 2026.", refund of **£748**, "This usually happens when too much tax was taken from your pay." | none | `screens/11-explainer-p800-summary.png` | **PASS** |
| 12 | Conversations list | `/conversations` | click "Continue a previous letter" | "Your letters / Your recent conversations.", Tax Calculation — 28 Apr 2024 (→ /l/maria-p800), PAYE Coding Notice — 12 Jan 2025 (→ /l/maria-p2), Self Assessment Confirmation — 28 Dec 2024, View all conversations | none (RSC prefetches same-origin; aborted prefetches are normal Next Link behaviour) | `screens/12-conversations.png` | **PASS** |
| 13 | Company-car form | `/actions/update-company-car/maria-p2` | direct | **GDS-styled**: GOV.UK crown masthead + "HMRC — Personal Tax Account" bar, GDS Transport type, "Company car and fuel", "Tell us your company car has been returned", auto-filled Vehicle reg **AB12 CDE** / Date **14 March 2026** / P11D **£18,700**, green "Confirm and send" (enabled after fill) | none in browser (letter inlined) | `screens/13-company-car-form.png` | **PASS** |
| 14 | Confirmation | `.../confirmation` | click "Confirm and send" | **GDS-styled** green panel "Details received / Your company car update has been submitted", "No real change has been made." (verbatim), "What happens next … replacing code **883L** with **1257L** and stopping the overpayment.", "Continue" link, OGL footer | none | `screens/14-confirmation.png` | **PASS** |
| 15 | All set | `/all-set` | click "Continue" | Tick mark, "You're all set.", "You can come back anytime if you have more questions.", Save this chat stub + primary "Finish" | none | `screens/15-all-set.png` | **PASS** |
| 16 | Not found | `/this-route-does-not-exist` | direct | Editorial 404: Marginalia wordmark, "404", "Nothing filed here.", "The page you asked for doesn't exist. Back to home." (outside phone frame). HTTP status **404** | document `404` (same-origin) | `screens/16-not-found.png` | **PASS** |

---

## Browser-visible API surface (the meaningful, non-asset calls)

All same-origin on `http://localhost:3000`:

- `GET /letters/maria-p2/qr.png` → **200** (step 3) — same-origin, replaces the baseline's `:8000` call.
- `GET /letters/maria-p800/qr.png` → **200** (step 9) — same-origin, replaces the baseline's `:8000` call.
- `GET /api/eleven/signed-url` → **200** (step 7) — same-origin.
- `GET /api/eleven/signed-url` → **200** (step 8, fresh session) — same-origin.

`_rsc` / `?_rsc=` entries in the trace are Next.js RSC route prefetches; they are same-origin and either `200` or `net::ERR_ABORTED` (a cancelled prefetch — normal `<Link>` behaviour, not a failure). All `_next/static` asset noise was filtered out.

---

## Backend-elimination check

**Zero calls to `:8000` or any backend were observed across all 16 steps.** The instrumented walk explicitly scanned every captured request for `:8000` / `localhost:8000`; the resulting list was empty. The QR is now served same-origin by the Next route handler, and `getLetter()` reads inlined data with no network hop. The FastAPI/Supabase elimination is complete.

---

## VERDICT: PASS

All 16 steps render the same content as the baseline. The two letters resolve end-to-end (P2: code 883L, tax-free £8830, company-car -£3740; P800: overpaid 2025 to 2026, refund £748). The QR is served same-origin `200 image/png` on both previews (the intended improvement over the baseline's `:8000`), and the conversation start-chain fires `/api/eleven/signed-url` `200` same-origin on both entry modes. The GOV.UK action path completes with full GDS styling and the verbatim "No real change has been made." honesty line. The editorial 404 returns HTTP 404. The voice WebSocket not connecting headless is expected and excluded from the gate. **No backend (`:8000`) calls occurred.**
