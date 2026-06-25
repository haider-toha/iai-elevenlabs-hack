# Marginalia UI Rehaul — Implementation Plan

Synthesised from 5 research docs (`research/01..05`) and 5 adversarial validations
(`validation/01..05`), bound by `CLAUDE.md`. This is the single source of truth for the
implementer. All paths are absolute-from-repo-root `/Users/haidertoha/Code/i.ai_hackathon`.

The target is a **mobile-first citizen journey, demoed on a Mac in a phone-frame** (§3.5) and
working full-bleed on a real phone, rebuilt from a 12-screen mockup (`plan/ui_rehaul/reference/`).
The mockup is **layout/IA reference only** — every structure is re-skinned in the fixed editorial
token system, and its placeholder copy/figures are **discarded** in favour of real `maria-p2` data
(§1.8). Where research and validation conflicted, the validators' rulings win.

This revision folds in the product owner's settled decisions **D1–D9** (recorded in
`research/decisions-research.md`, grounded in `research/decisions-a/b/c-*.md`). Those decisions
**close most prior open questions** (now stated as facts in §1/§2) and **overturn two earlier
invariants** — the heatmap dashboard and the investor pitch are **deleted** (§5.9), not preserved.
The few genuinely-open decisions live in §6.

---

## 1. Overview & guiding constraints

These invariants govern every screen below. They are not re-litigated in the per-screen
sections — they are assumed.

1. **QR entry is an invariant (BLOCKER if broken).** The QR is generated server-side with a
   hardcoded path: `backend/app/api/routers/letters.py:45` →
   `url = f"https://{request.url.netloc}/l/{letter_id}"`, and the preview page links the same
   (`frontend/app/letters/[id]/preview/page.tsx:324`). `/l/[id]` **must stay the canonical,
   self-sufficient cold-open destination and render the summary state directly**. It must
   NEVER become a redirect to a home/scan screen, never assume prior step-state (`?step=`),
   and the path `/l/[id]` must not be renamed (any pre-printed/screenshotted QR encodes it
   permanently). (V1 R2.)

2. **One route, view-state — do NOT split the live session across sub-routes.** The
   `ConversationProvider` + all SDK callbacks + transcript are one client subtree mounted once
   (`frontend/components/convai-leaf.tsx:61-67`, state at `:76-86`, callbacks at `:91-141`).
   Model mockup screens **3–9** as **internal view-states of the single `/l/[id]` route**, not
   navigable sub-routes. This is the only option where a step transition *cannot* unmount the
   session. (V1 R1, V5 D1.) If sub-routes are ever chosen, the *entire* `ConvaiSession`
   stateful shell — not just the provider — must be lifted into a `/l/[id]/layout.tsx` that
   renders it above `{children}`; sub-pages become thin views reading shared context. Prefer
   view-state and avoid the refactor.
   **Screens 10/11/12 are the exception — standalone static routes, NOT view-states (D1).** The
   finish flow leaves `/l/[id]` via the GOV.UK action (same-window), which unmounts the provider
   and ends the session; by Screen 10 there is no live session to host a view-state, and the
   content is hard-coded show-only anyway. They live at `/all-set` (10), `/` (11), `/conversations`
   (12). (Decisions-B §3.)

3. **Dismiss must be a session-ending action (research correction).** ElevenLabs
   `@elevenlabs/react@1.8.0` **does** end the session on `ConversationProvider` unmount
   (verified at `react/dist/lib.iife.js:942-948`) — the research's "leaks on unmount, relies
   on GC" was WRONG. The real risk is the inverse: an X/dismiss that **hides** the voice UI
   without unmounting the provider leaves mic/WebSocket/wake-lock live. Therefore: if the
   provider is hoisted into a persistent shell, the X/dismiss control **must call
   `endSession()` explicitly**; if the provider stays a per-`/l/[id]` leaf, navigation
   teardown is already handled — do **not** add redundant unmount `endSession()` (dead code).
   (V2 C6.)

4. **Secure context (HTTPS) is a day-of BLOCKER.** `getUserMedia` + `AudioContext` are
   secure-context-gated. A phone on `http://<LAN-IP>:3000` has **no microphone** — the voice
   demo (the whole product) is dead on stage. The demo MUST be served over HTTPS (TLS tunnel /
   deployed host / `next dev --experimental-https` with a phone-trusted cert), never a raw IP.
   This is a hosting/run-book mandate, not a code change. (V2 C3, V4 #1.)

5. **The session start chain is sacred.** Tap → `getUserMedia({audio:true})` → `fetchSignedUrl()`
   → `startSession()` must stay inside a **direct user gesture** (`convai-leaf.tsx:160-180`,
   tap at `:213-216`). Never start from a `useEffect`, router transition, `setTimeout`, or
   on-mount hook. iOS audio unlock relies on the SDK's **capture-phase** document listeners +
   a **30s** AudioContext-stash TTL (`audioUnlock.js`): keep tap→`startSession` well under 30s,
   and never `stopPropagation` document-level pointer events in any new shell/modal. (V2 C1/C2,
   V5 D3.)

6. **Screens 1–9 need ZERO backend change; screens 10/11/12 are hard-coded show-only (D1,
   settled).** Screens 1–9 run on the existing `GET /letters/{id}` payload + the existing
   client-side ElevenLabs path. Screens 10/11/12 are **static, hard-coded content that must look
   legitimate but persist nothing** — no users, no conversations table, no auth, no backend
   change (`grep` for auth in `backend/app` returns nothing, and we are not adding it). The
   earlier "fake vs build-real persistence" fork is **closed**: it's faked, deliberately. (D1;
   V3 Risk 1/2, R5 §7.)

7. **The HMRC confusion-heatmap dashboard is DELETED entirely (D4).** `/dashboard`
   (`app/dashboard/page.tsx`), its `GET /scan-events/aggregates` endpoint, the
   `ScanEventAggregate`/`LanguageCount`/`ScanEventDashboard` models, and the
   `getScanEventDashboard` API call are all removed (full surface in §5.9). This **overturns the
   prior "must stay untouched" BLOCKER.** `POST /scan-events`, the `scan_events` table + seed,
   and the router mount in `main.py` **stay** (the POST shares the router; migrations are
   append-only). Removing the frontend page is **not** sufficient — the aggregate GET + its 3
   models + the repo fn must be excised at source, but the router/mount is NOT removed.
   Consequently, the citizen "Your letters" list (Screen 12) is free to take any path; it lives
   at `/conversations` (D5). (Decisions-A §3/§4.)

8. **Run the demo on `maria-p2` with its REAL data (D2, settled).** The mockup's "P800 / £426.78
   / Pay the amount owed / 5 May 2024" placeholders are **discarded**; every number, label, date,
   and action binds to the seeded P2 letter: **PAYE Coding Notice**, tax year **2026 to 2027**,
   Ms Maria Davies / Bridgwater & Co Ltd, code **883L → 1257L**, Personal Allowance **£12,570**,
   Car benefit **−£3,740**, tax-free **£8,830**; one `suspected_error` (Car benefit returned to a
   previous employer) overpaying **£748/yr (£62/mo)**, fix → `/actions/update-company-car`. The
   seeded P800 (`maria-p800`) is an *overpaid £748 refund*, tax year 2025 to 2026, with **no
   `lines` / no `suspected_errors`** — it appears only as the second hard-coded item in Screen 12.
   This is "bind to existing data", **zero backend / no re-seed**. (D2; Decisions-C §1.)

9. **Design conformance: mockup = layout/IA only; skin in the fixed tokens.** Translate every
   structure into the editorial token system in `frontend/app/globals.css @theme`:
   blue → oxblood `bg-accent`/`text-accent`; `rounded-xl` → `rounded-tactile` (3px); shadows/
   glassmorphism → hairline `border-rule` + `bg-surface-raised`/`-sunken` layering; system-sans
   → Familjen Grotesk (headings) / Newsreader (body serif); white/black → bone `#f1f0ea`/ink
   `#1c1b18`. **No new tokens.** **Ruling (V5 C6): user chat bubbles must NOT be solid
   `bg-accent`** — that turns the proof-mark oxblood into a banned "filled primary everywhere"
   tell. User turns get restrained treatment (surface-sunken/raised + hairline rule, or an
   oxblood edge rule); reserve solid `bg-accent` for the **single primary CTA per screen**. Do
   NOT restyle the two sanctioned exceptions: the GDS `/actions/*` clone and the HMRC
   `/letters/[id]/preview` facsimile stay deliberately non-editorial. (R4 §7, V5 §3/D7.)

---

## 2. Screen-by-screen plan (all 12 screens)

Format per screen: **(a)** route/component mapping · **(b)** build/change/leave · **(c)**
ambiguities + reconciliation (recommendation + tradeoff, never a silent default) · **(d)**
backend impact (required vs assumed).

### Screen 1 — Scan letter — **BINNED**
The entry point is either clicking the QR link (desktop/print) or scanning the QR with the
phone's native camera app. Both land directly at `/l/[id]`. No in-app scan screen is needed or
wanted — it would be theatre with no real path behind it. `/l/[id]` (Screen 3, the letter
summary) is the canonical cold-open destination.

### Screen 2 — Reading letter (analysis checklist + "Your data is private")
- **(a) Mapping.** No equivalent; `/l/[id]` server-fetches the whole letter instantly
  (`l/[id]/page.tsx`), no interstitial, no `loading.tsx` anywhere. (R3 §5, R4 table.)
- **(b) Build.** A **scripted/timed animation with hard-coded items + hard-coded timing (D8)** —
  the five checklist items map to no real processing (the letter is already structured in
  Postgres); this is a **demo artefact, polished but not real**. "Your data is private" is static
  copy. Implement as an internal "preparing" view-state of `/l/[id]` — **not** a route the QR
  passes through first (§1.1).
- **(c) Decision (settled — D8).** Staged theatre, not a real `loading.tsx`/`<Suspense>` boundary
  (the server read is effectively instant). Keep it short and make it look polished. *No open
  fork.*
- **(d) Backend.** None (PF). **Critical timing constraint (§1.5 / Decisions-C §4):** the
  animation must **complete BEFORE** the user's start gesture — the voice session starts on a
  **fresh, separate tap** on the voice screen, never auto-advanced off the animation via
  `setTimeout`/`useEffect`/router transition. Keep tap→`startSession` well under the 30s
  `STASH_TTL_MS` (`@elevenlabs/client/dist/platform/web/audioUnlock.js:2`), and never
  `stopPropagation` document-level pointer events (capture-phase unlock listeners at `:46-59`),
  or iOS audio dies silently. (V2 C2, V5 D3.)

### Screen 3 — Letter summary ("Here's what we found" + Recognised chip + dual CTA)
- **(a) Mapping.** Closest is `CompactLetter` (`l/[id]/page.tsx:72-125`) — a styled letter
  summary, not a findings card. This is the **cold-QR landing state** of `/l/[id]` (§1.1).
- **(b) Build/reshape.** Reshape into a single-column findings card + bottom-docked CTA. Bind
  every value to **real P2 data** (§1.8 / Decisions-C §1): the **"Recognised: …" chip** displays
  the known `letter.type` label **"PAYE Coding Notice"** + tax year **"2026 to 2027"** (it is
  presentational — the type is known because the slug is known; there is no image classifier).
  Bullet findings derive from `lines[].plain_english` (Personal Allowance / Car benefit glosses)
  + the single `suspected_errors[]` entry (Car benefit returned to a previous employer, est
  **£748/yr · £62/mo**, fix action), all in `GET /letters/{id}`. Dual CTA: "Chat about this
  letter" (start voice — the session start gesture, §1.5) + "Type instead" (same voice session
  driven by text — see Screen 7). (R3 §5, V3 Risk 1.)
- **(c) Decision (settled — D2).** Runs on `maria-p2`; bullets are real data, not authored copy.
  The mockup's "P800 Tax Calculation / £426.78" labels are discarded (£426.78 is in no row).
  *No open fork.*
- **(d) Backend.** None (binds to the existing `GET /letters/{id}` payload).

### Screen 4 — Voice chat, listening (centered mic + chips + "Ask anything" bar)
- **(a) Mapping.** `ConvaiLeaf` start button (`convai-leaf.tsx:233-244`) + static `PROMPT_CHIPS`
  (`:33-38`, rendered `:272-284`). RESHAPE.
- **(b) Build/reshape.** Text pill → centered circular mic (≥44px) + bottom-docked input bar.
  Greeting today is the agent's `firstMessage`. Chips already exist (static, four canned).
- **(c) Ambiguity — pre-session tappable chips (V2 C7 / V5 D5).** Today chips are
  `disabled={!live}` (`:278`) and `askChip` early-returns if `!live` (`:219`). To make a chip a
  *conversation starter* before connecting, tapping it must **start the session inside that
  same tap** (chip tap → `startInEnglish()` → then deliver the text once `connected`), NOT
  relax the gate and call `sendUserMessage` with no session (which throws — connection is
  async). Correct shape: "start then send" — pass the chip text as the opening turn (agent
  `firstMessage` or an initial message fired on `status === "connected"`). *Recommendation:*
  wire start-on-tap for pre-session chips. **Tradeoff:** small interaction change; must
  preserve the optimistic-push contract (`:220-225`). A pre-session chip is a start-session
  affordance bound by §1.5 (direct tap, <30s, no document `stopPropagation`).
- **(d) Backend.** None (EE — Next signed-url route + existing leaf).

### Screen 5 — Voice chat, speaking (animated orb)
- **(a) Mapping.** Not built — only a `size-2` status dot today (`convai-leaf.tsx:247-258`). NEW.
- **(b) Build.** The listening↔speaking distinction is a **separate SDK axis** the leaf
  currently ignores: `useConversation` returns `mode: "speaking"|"listening"`, `isSpeaking`,
  `isListening`, and frequency getters (`getOutputByteFrequencyData()`/`getInputByteFrequencyData()`),
  but the leaf only destructures `{ status, startSession, endSession, sendUserMessage }`
  (`:91`). Destructure `mode`/`isSpeaking`/`isListening` (+ frequency getters for amplitude) —
  **additive, no integration change**. (R2 §4/§10, V5 D2.)
- **(c) Ambiguity.** None material. **Guard (V5 D2):** animate the orb off the SDK `mode` axis,
  NOT off `status` alone (`status` is `connected` for both listening and speaking — animating
  off it is wrong), and do NOT invent an `isSpeaking` from transcript deltas (desyncs audio).
- **(d) Backend.** None (EE — all client-side).

### Screen 6 — Voice chat, in progress (transcript visible)
- **(a) Mapping.** `TranscriptPanel` (`convai-leaf.tsx:309-361`) already renders committed
  turns + the audio-paced live tail. RESHAPE (restyle to bubbles + add scroll region).
- **(b) Leave the data model intact; reshape presentation.** Preserve verbatim the
  audio-paced reveal contract: committed turns from `onMessage` (`:91-100`), live agent text
  from `onAgentChatResponsePart` (`:101-117`), audio alignment from `onAudioAlignment`
  (`:118-129`, a **ref** mutated per chunk), the 30ms reveal interval with `REVEAL_LEAD_MS=120`
  (`:148-158`), and the `disconnected` reset (`:134-140`). Restyle L/R editorial text into
  chat bubbles **in surface tokens** (user = restrained, NOT solid `bg-accent` — §1.9). (R2 §7,
  V5 R7–R11.)
- **(c) Ambiguity.** Does the per-character live-reveal cursor survive inside an auto-scrolling
  bubble? *Recommendation:* keep it (signature interaction); the live tail is just
  `live.slice(0, min(revealedCount, live.length))` with a caret — auto-scroll the region to
  bottom on new delta. **Tradeoff:** auto-scroll + live caret need care so the region doesn't
  fight the user scrolling up. (R4 §8 q6.)
- **(d) Backend.** None (PF — transcript is React state, nothing persisted).

### Screen 7 — Chat thread (full bubble thread + "Ask anything" input)
- **(a) Mapping.** Same `TranscriptPanel`; **there is NO free-text input box today** — text
  entry is only the canned chips; `sendUserMessage` exists in the SDK but no UI calls it for
  typed input. RESHAPE + small addition.
- **(b) Build.** Add an "Ask anything" `<input>` whose submit calls `sendUserMessage` — the same
  method `askChip` already uses (`convai-leaf.tsx:225`, the **only** call site today; no free-text
  input exists). Mirror the optimistic-push contract (`:218-226`): push the user turn to
  `transcript` locally, then `sendUserMessage(text)` — the server does NOT echo injected text, so
  the optimistic push is required. Input must be **≥16px font** (iOS zoom-on-focus) and ≥44px tall.
  (D7; Decisions-C §3; R2 §10, R4 §5.)
- **(c) Decision (settled — D7).** Typed text feeds the **existing voice session** via
  `sendUserMessage` — **purely additive**, no new `startSession` config, no `textOnly` override,
  no second session. "Type instead" (Screen 3) is the same voice session driven by text, not a
  separate text-only mode. *No open fork.*
- **(d) Backend.** None (PF — nothing persisted).

### Screen 8 — Response options (full-width action rows w/ chevrons)
- **(a) Mapping.** `PROMPT_CHIPS` wrap-pills (`convai-leaf.tsx:272-284`). RESHAPE to ≥44px
  full-width list rows. (R3 §5, R4 table.)
- **(b) Build.** Today's four chips are generic *question* chips; the mockup shows *action*
  options (Pay / Ask for more time / Disagree / …), which are payment-journey prompts for a "you
  owe" letter — **incoherent against P2** (a coding notice, nothing to pay) per §1.8. Render the
  options as **prompts that feed the voice agent** (via `sendUserMessage`) and/or link to the two
  real GOV.UK anchors (`/income-tax`, `/tax-company-benefits`), reconciled to P2 reality. The one
  real *action* (the company-car fix) belongs on Screen 9.
- **(c) Decision (settled — D2).** Bind to P2: agent-seeding prompts + the two real GOV.UK links;
  do NOT invent payment routes/amounts or the mockup's "Pay the amount owed". *No open fork.*
- **(d) Backend.** None (PF/EE). A real "Pay" payment flow = new route, out of scope.

### Screen 9 — Action items ("What you need to do" cards + "See all options")
- **(a) Mapping.** One real action: the company-car CTA in the leaf
  (`convai-leaf.tsx:228,296-304`), gated `suspectedErrors.length > 0 && agentHasReplied`,
  P2-only, → `/actions/update-company-car/[letterId]`. RESHAPE/NEW (a summary card list distinct
  from the GDS form).
- **(b) Build.** Derive cards from **existing real P2 data only**: **one card** from the single
  `suspected_errors` entry — the company-car correction, reason "You told us you no longer have
  this company car…", est **£748 a year (about £62 a month)**, primary action **"Fix this on the
  government portal"** → `<Link href="/actions/update-company-car/${letterId}">` (same-window;
  this **is** the finish-flow entry, §Screen-10). The mockup's "£426.78" is **in no row** — the
  only P2 figure is £748/yr. Anything beyond the one real card is authored copy linking to the two
  real GOV.UK anchors, or is cut. (D2; R3 §5, V3 Risk 4, V5 D9.)
- **(c) Decision (settled — D2/D1).** Ship the one real P2 card + optional authored GOV.UK links;
  no invented destinations/amounts/deadlines (letters carry no "respond by" date or "amount owed"
  line). The action button opens the existing GOV.UK form **same-window** — which unmounts the
  voice session (correct; the user is done talking). *No open fork.*
- **(d) Backend.** None — EE for the existing action. Keep the company-car CTA's inbound link live
  so `/actions/*` is not orphaned (V1 R6).

### Screen 10 — Resolve & finish ("You're all set" / Save chat / Finish) — **STATIC `/all-set` (D1)**
- **(a) Mapping.** A **NEW standalone static editorial route `/all-set`** (under the phone group,
  §3.5). NOT a view-state of `/l/[id]` — by this point the action nav has unmounted the voice
  session (§1.2). It is reached from the **GDS confirmation page's new X/close control**
  (`<Link href="/all-set" aria-label="Close">×</Link>`, a Server-Component link, zero client JS;
  leaving `/actions/*` auto-drops the GDS stylesheet). The GDS confirmation itself stays untouched
  with its verbatim "No real change has been made." line (§5.5). (D1; Decisions-B §3.)
- **(b) Build.** Hard-coded show-only: "You're all set" + a **Finish** CTA → `/` (Screen 11). If a
  "Save this chat" button is shown, it is a **deliberately-labelled stub** that persists nothing
  (mirrors the GOV.UK action's existing honesty). No transcript is saved (it's `useState` only and
  already gone). (R3 §5, R5 §7, V5 D11.)
- **(c) Decision (settled — D1).** Hard-coded, persists nothing, no auth, no backend. The
  real-vs-fake fork is closed. *No open fork.*
- **(d) Backend.** None. (The unused `POST /scan-events` is NOT wired — its only reader, the
  heatmap, is deleted in D4.)

### Screen 11 — Return to home ("Good morning" + Scan/Continue) — **STATIC `/` (D3)**
- **(a) Mapping.** **`/` is the citizen home (D3).** The investor pitch (`app/page.tsx`) is
  **deleted** and `/` is rebuilt as this static home (under the phone group, §3.5). (Decisions-A §5.)
- **(b) Build.** Hard-coded show-only: "Good morning" greeting (static or time-based), "Scan a
  letter" (→ the QR/letter-preview path; there is no in-app scanner — Screen 1 is binned),
  "Continue a previous letter" (→ re-open `/l/{slug}` fresh; sessions are ephemeral, nothing to
  resume), and a privacy note. No language toggle (D6 — language is voice-driven, §5.3). Persists
  nothing. (R5 §7.)
- **(c) Decision (settled — D3).** Home is `/`; pitch deleted. Inbound `/` links (`Wordmark`
  `wordmark.tsx:13`, 404 `not-found.tsx:20`, GDS header service-name links) now land on the
  citizen home — acceptable; reword the 404 label and the stale `wordmark.tsx:6-8` comment
  (Decisions-A §2). *No open fork.*
- **(d) Backend.** None (hard-coded static).

### Screen 12 — "Your letters" — **STATIC `/conversations` (D5)**
- **(a) Mapping.** **NEW standalone static route `/conversations`** (verified collision-free —
  `grep` for `conversations` across `app/ components/ lib/` returns nothing; does not shadow
  `/letters/[id]/preview`). NOT `/dashboard` (deleted in D4). Under the phone group (§3.5). (D5;
  Decisions-B §0/§4.)
- **(b) Build.** A **hard-coded two-item list** of the known fixtures, each with its own real
  data: **PAYE Coding Notice** (`maria-p2`, 2026 to 2027) and **Tax Calculation** (`maria-p800`,
  2025 to 2026 — note the different year). Each row links to its `/l/{slug}`. Persists nothing,
  no auth, no list endpoint, no per-user model. (Decisions-C §1.)
- **(c) Decision (settled — D5/D1).** Hard-coded list at `/conversations`; the real-vs-build-auth
  fork is closed (hard-coded). *No open fork.*
- **(d) Backend.** None (hard-coded static).

---

## 3. Mobile layout strategy

The primary target is a live phone. Today **every page uses one desktop-first editorial
container** (`mx-auto max-w-5xl px-6 py-16 …`); there is **no app shell, no sticky/fixed
element, no scroll container, no `viewport` export, no `env(safe-area-inset-*)`, no touch
feedback** anywhere (all confirmed by grep — V4 verification log). The mobile work is largely
net-new structure, not restyling.

### 3.1 Per-screen classification (NEW / RESHAPE / VIEWPORT-FIX)
(R4 §4; NEW = no equivalent, RESHAPE = component exists but needs structural change,
VIEWPORT-FIX = close, needs sizing/safe-area.)

| # | Screen | Class | Note |
|---|--------|-------|------|
| 1 | Scan (camera) | **BINNED** | Entry is OS camera → QR → `/l/[id]`. No in-app screen. |
| 2 | Reading | **NEW** | No loading/progress screen exists. Scripted animation. |
| 3 | Summary | **RESHAPE** | `CompactLetter` → single-column findings card + docked CTA. |
| 4 | Listening | **RESHAPE** | Text pill → centered circular mic + docked input bar. |
| 5 | Speaking (orb) | **NEW** | No orb; wire SDK `mode`/frequency. |
| 6 | In-progress (bubbles) | **RESHAPE** | L/R editorial text → bubbles + scroll region + docked bar. |
| 7 | Chat thread | **RESHAPE** | Same `TranscriptPanel`; bubbles + scroll + new "Ask anything" input. |
| 8 | Response options | **RESHAPE** | Wrap-pills → ≥44px full-width list rows w/ chevrons. |
| 9 | Action items | **RESHAPE/NEW** | Editorial card list distinct from the GDS form. |
| 10 | Resolve/finish | **NEW** | Standalone static `/all-set` (NOT a `/l/[id]` view-state, NOT the GDS confirmation). |
| 11 | Home | **NEW** | Static `/` (pitch deleted, D3). No personal home existed. |
| 12 | Your letters | **NEW** | Static `/conversations` (hard-coded 2 letters; `/dashboard` is deleted, D4). |

### 3.2 The app-shell approach (solve safe-area once, not per screen)
- **Add a root `viewport` export** in `app/layout.tsx` (none exists today) with
  `viewportFit: "cover"`. Without `viewport-fit=cover`, `env(safe-area-inset-*)` resolves to
  `0` — both are required *together*. (R4 §2, V4 #2.)
- **Build one shared mobile shell** in a **route-group `layout.tsx`** wrapping the citizen flow
  (`app/(phone)/…` — route groups do NOT change URLs, so `/l/[id]`, `/`, `/all-set`,
  `/conversations` are unaffected and the QR invariant §1.1 holds): **fixed top status/nav bar**
  padded with `env(safe-area-inset-top)`, a **scrollable content region**, and a **bottom-docked
  input/CTA** padded with `env(safe-area-inset-bottom)`. This same layout also hosts the Mac
  phone-frame (§3.5) as its outer chrome — one structure, not two. Net-new chrome — the mockup's
  core mobile structure. (R4 §2/§6, V4 #2, Decisions-B §5.)
- **Use `dvh`, never `vh`.** Every full-height shell uses `100dvh`/`min-h-dvh` (and `svh` for
  the always-collapsed case). Fix the one existing bug: `app/not-found.tsx:7` `min-h-screen` →
  `min-h-dvh`. `app/letters/[id]/preview/page.tsx:40` already models the correct pattern. (V4 #3.)
- **Dedicated transcript scroll region.** Inside a flex-column shell:
  `flex-1 min-h-0 overflow-y-auto` for the transcript, with the input bar as a **sibling**
  (not inside the scroller). Add **auto-scroll-to-bottom** on new turn / live delta, and
  `overscroll-behavior: contain` to stop rubber-band bleed. None exists today
  (`convai-leaf.tsx:324` is `min-h-40`, no scroll container). (R4 §2/§6, V4 #6.)
- **Touch feedback + tap highlight.** Add `active:`/`focus-visible:` states to every
  interactive control (all are `hover:`-only today — dead on touch); set
  `-webkit-tap-highlight-color: transparent` globally in `globals.css` base and supply
  intentional press states. The mic button especially needs a visible `:active`. (R4 §3, V4 #7.)
- **Whether the exception routes opt into `viewportFit:"cover"` (§6 Q):** a root export
  applies it to the editorial app, the HMRC facsimile, AND the GDS clone. Likely fine globally
  (GDS is responsive), but confirm GDS doesn't fight it; do NOT let the cover/safe-area work
  accidentally restyle the two exceptions (V5 C7/D7).

### 3.3 Touch targets (≥44×44px) — current sizes
The future "Ask anything" input must be **≥16px font** (iOS zoom-on-focus) and ≥44px tall.
Re-spec the following (R4 §5, V4 #4/#5):

| Element | File:line | Current | Action |
|---|---|---|---|
| Voice/mic primary button | `convai-leaf.tsx:233-244` | `py-3` ≈48px tall | OK height, **wrong shape** → circular mic |
| End/X (docked) | — | does not exist | **NEW** ≥44px circular; X = session-ending (§1.3) |
| Prompt / response-option chips | `convai-leaf.tsx:272-284` | `py-1.5` ≈32px | **TOO SMALL** → ≥44px full-width rows |
| Citation chips | `convai-leaf.tsx:381-388` | `py-1` ≈28px | **TOO SMALL** → ≥44px |
| Action card / "Fix this…" link | `convai-leaf.tsx:296-304` | `py-2.5` ≈44px | Borderline OK |
| Language toggle (globe) | — | does not exist | **NEW** ≥44px in notch-safe header |
| Transcript scroll region | `convai-leaf.tsx:324` | `min-h-40`, no scroller | `flex-1 min-h-0 overflow-y-auto` |
| "Ask anything" input | — | does not exist | **NEW** ≥44px, font ≥16px |
| One Login button | `l/[id]/page.tsx:143` | `py-1.5` ≈32px | **TOO SMALL** → `py-3`+ |
| Wordmark home link | `wordmark.tsx:12` | ≈24–32px | small, low priority |

### 3.4 `/l/[id]` desktop-side-by-side → single-column rearchitecture
Today `l/[id]/page.tsx:45-58` is a desktop `lg:grid-cols-12` with the letter in
`lg:col-span-5` and `ConvaiLeaf` in `lg:col-span-7`; below `lg` it stacks the **full letter
facsimile above the chat** — the "shrunk desktop" failure the demo must avoid (V4 #8). The
rehaul gives phones a **dedicated single-column flow** (summary → voice → thread) as
**internal view-states of the one `/l/[id]` route** (§1.2), NOT the reflowed two-pane grid.
The desktop side-by-side may be retained for wide viewports, but the phone path is the
view-state flow. The provider/session is mounted once across all these states (§1.2/§5 D1).

### 3.5 Phone-frame for the Mac demo (D9)
The demo is driven on a **Mac**, but must look/feel like a phone. **Approach: a route-group layout
(server-only) + a media-query bezel** — host the frame in the **same `app/(phone)/layout.tsx`** that
already owns the mobile app-shell (§3.2); no new structure. (Decisions-B §5.)
- **Frame:** a `max-w-[390px] mx-auto` column (auto full-bleed on a real phone) + a **`lg:`-gated
  bezel/device chrome** — visible only on the wide Mac viewport, hidden on a real phone.
- **The frame owns the height (the key trap):** `min-h-dvh lg:h-[852px]`; the inner app-shell uses
  `h-full min-h-0`, **not** its own `dvh`. `dvh` resolves to the *visual viewport*, so a child
  `min-h-dvh` inside the Mac frame would stretch to the whole browser window and overflow the fake
  bezel. Owning height at the frame preserves the §3.2 address-bar-jump fix on a real phone AND
  constrains the Mac frame. (Decisions-B §6 NEW #1 — the single most likely phone-frame bug.)
- **In the group (framed):** `/l/[id]`, `/all-set`, `/conversations`, `/` (home), `/actions/*`
  (GDS is responsive, composes fine in 390px and nests under the frame). **Outside (unframed):**
  `/letters/[id]/preview` (the HMRC paper-letter facsimile — reads as a full HMRC page, already
  `min-h-dvh`). `/dashboard` and the pitch no longer exist (D3/D4).
- **Safe-area on a Mac:** `env(safe-area-inset-*)` resolves to `0` on desktop (correct — no notch);
  add a small `lg:` min-padding only if a fake home-indicator pill is drawn in the bezel. No
  conflict with `viewportFit:"cover"` (a no-op on desktop). (Decisions-B §6 NEW #2.)
- **Why not** a root-layout CSS wrapper: the root is a Server Component and can't exclude routes
  without client pathname logic — it would frame the HMRC/letter surfaces too.

---

## 4. Demo integrity (physical-phone failure modes + day-of gate)

The demo is shown LIVE on a physical phone. Each failure mode below is a thing a judge would
SEE; each has a mandated fix. Ordered by likelihood-of-sinking-the-demo. (V2 kill-list, V4
failure table.) Severity: **P0** = demo dead · **P1** = visibly broken · **P2** = unpolished.

1. **[P0] Secure-context-for-mic — FIRST, above everything.** `getUserMedia` + `AudioContext`
   need HTTPS/localhost. A phone on `http://<LAN-IP>:3000` gets **no mic** → tapping the mic
   throws/never connects → the voice product is dead. **Fix (hosting, not code):** serve over
   HTTPS — TLS tunnel (`ngrok`/`cloudflared`), deployed HTTPS host, or
   `next dev --experimental-https` with a phone-trusted cert. Never a raw IP. The screen-1
   camera viewfinder is also `getUserMedia`-gated. (V2 C3, V4 #1.)
2. **[P0] Safe-area / viewport.** No `viewport` export, no `viewportFit:"cover"`, no `env()`
   today → the docked "Ask anything" bar sits UNDER the home indicator and the sticky header
   UNDER the notch. **Fix:** root `viewport` export `viewportFit:"cover"` + pad docked chrome
   with `env(safe-area-inset-bottom/top)` (both required together). (§3.2, V4 #2.)
3. **[P1] `100vh` jump.** `min-h-screen` breathes ~60–100px as Safari's address bar shows/hides.
   **Fix:** `100dvh`/`min-h-dvh` (+`svh`) everywhere; fix `not-found.tsx:7`. (V4 #3.)
4. **[P1] iOS zoom-on-focus.** Tapping an input with font <16px auto-zooms the page. **Fix:** the
   "Ask anything" input MUST be ≥16px (don't set `text-sm`/`text-xs`). GDS inputs already ≥16px.
   (V4 #4.)
5. **[P1] Sub-44px touch targets.** Prompt chips ≈32px, citation chips ≈28px, One Login ≈32px.
   **Fix:** every tappable target ≥44×44px (§3.3). (V4 #5.)
6. **[P1] Transcript scroll region.** No scroll container today; a long conversation pushes the
   docked input off-screen and new turns land below the fold. **Fix:** `flex-1 min-h-0
   overflow-y-auto` transcript with the input bar as a sibling, auto-scroll-to-bottom,
   `overscroll-behavior: contain`. (§3.2, V4 #6.)
7. **[P1] iOS audio-unlock budget (silent muteness).** TTS plays no sound if >30s elapses
   between the unlocking tap and `startSession`, or if any new global handler
   `stopPropagation`s capture-phase document pointer events. **Fix:** keep `startSession` on a
   *fresh* direct tap; no >30s pre-session animation between tap and start; never
   `stopPropagation` document-level pointer events in the new shell/modal. The screen-2 reading
   animation must complete **before** the start gesture, not between gesture and start. (§1.5,
   V2 C2, V4 #9, V5 D3.)
8. **[P2] No press feedback.** All interactions `hover:`-only; default grey iOS tap-highlight
   box flashes. **Fix:** `active:`/`focus-visible:` states + `-webkit-tap-highlight-color:
   transparent` (§3.2). (V4 #7.)
9. **[NEEDS-MITIGATION] Language-switch reconnect (voice-driven — D6).** There is **NO UI language
   toggle.** The session always starts in English; the agent's **opening message asks which
   language to continue in**, and on "Welsh" the existing `switch_language` client tool fires →
   `restartInWelsh` (`convai-leaf.tsx:184-204,209-211`). The switch is **not seamless**:
   `endSession` → fresh signed URL → `startSession` + lost agent context, and it is **one-way**
   (no `restartInEnglish` — CY→EN doesn't exist, and D6 doesn't need it). **Fix:** show the
   reconnect beat ("switching to Welsh…") with an explicit transcript boundary; it happens once,
   early. **Agent config is in-repo and reproducible (corrected — NOT a dashboard dependency):**
   the `switch_language` tool *definition*, the system prompt that decides to ask/honour the
   question, and the baseline `first_message` are all defined in
   `backend/scripts/setup_eleven_agent.py` (tool `:70-92`, prompt from
   `backend/prompts/letter_explainer.txt`, `first_message` `:198`) and applied to the live agent
   by re-running that idempotent create-or-update script
   (`poetry run python backend/scripts/setup_eleven_agent.py`). The user-heard greeting is the
   client override `ENGLISH_FIRST_MESSAGE` (`convai-leaf.tsx:42`). **Status: implemented** — the
   greeting asks the language question, the prompt handles a one-word "Welsh", and the change is
   pushed. (D6; Decisions-C §2; V2 C5, V5 D4.)
10. **[NEEDS-MITIGATION] Dismiss-ends-session.** Under a hoisted-shared-provider shell, an
    X/dismiss that only HIDES the voice view leaves mic/WS/wake-lock live (orange mic dot
    persists, can wedge the next session — singleton). **Fix:** the X/dismiss is a
    session-ending action — call `endSession()` explicitly. If the provider stays a per-`/l/[id]`
    leaf, navigation teardown is already handled — don't add redundant unmount code. (§1.3, V2
    C6, V4 #10.)

**Exempt — do NOT "fix" or restyle:** the HMRC facsimile `/letters/[id]/preview` (white/black/
Arial, already `min-h-dvh`) and the GDS `/actions/*` clone (already responsive, ≥16px/≥40px).

### Day-of go/no-go checklist (on the ACTUAL phone + venue network)
Gate 1–2 are blocking; if either is red, **STOP and fix hosting before touching UI.** (V4 §run-book.)
1. **[P0] HTTPS.** URL bar shows `https://` (not `http://`+IP). Tap mic → OS mic-permission
   prompt appears. No prompt / instant error = insecure context = no demo.
2. **[P0] Full mic round-trip.** Tap → grant mic → **hear the agent's first message aloud**
   (tests iOS audio-unlock too). On venue Wi-Fi, not just home.
3. Safe-area clean on a notched device (docked bar above home indicator; header clears notch).
4. No zoom-on-focus on the text input (proves ≥16px).
5. No `100vh` jump when the address bar hides/reveals (proves `dvh`).
6. Long-conversation scroll: transcript scrolls in its region, input stays docked, new turns
   auto-scroll into view, no rubber-band blank.
7. Every control thumb-tappable one-handed (proves ≥44px).
8. Visible `:active` press feedback; no stray grey highlight box.
9. Wake-lock holds (call survives ~30s of silence without the screen dimming).
10. Dismiss cleans up (navigate away from a live call and back — mic indicator off, fresh
    session starts clean).
11. Wi-Fi-drop fallback rehearsed (error surfaces inline via `onError`, `convai-leaf.tsx:133`).
12. **[D6] Language switch fires.** The agent's opening message ASKS which language; say "Welsh"
    and confirm `restartInWelsh` fires and the voice switches. The agent config (tool + prompt +
    greeting) is in-repo; if it asks but doesn't switch, re-run
    `poetry run python backend/scripts/setup_eleven_agent.py` to re-apply the prompt/tool (§4.9).

---

## 5. Regression surface — what stays completely untouched

Each item works today and must still work after the rehaul. Loss of any = blocker. (V5 §1,
V1 R6.) The implementer should treat this as the pre-merge checklist.

### 5.1 Voice session lifecycle & SDK contract
- **Gesture→start chain.** Tap → `getUserMedia({audio:true})` → `fetchSignedUrl()` →
  `startSession()` stays inside a direct tap. `convai-leaf.tsx:160-180`, tap `:213-216`. (§1.5.)
- **Provider/session singleton.** One `ConversationProvider`, one session, never two
  concurrent `startSession`s / two providers. `convai-leaf.tsx:61-67`. (V2 C4.)
- **`live` gate.** `live = status === "connected" || "connecting"` drives button label, chip
  enablement, reveal interval. `convai-leaf.tsx:142`.
- **Signed-URL proxy.** Keeps `XI_API_KEY` server-only, returns `{signedUrl}`, single-use/
  time-limited, re-minted on every (re)start. `app/api/eleven/signed-url/route.ts:12-22`,
  client `convai-leaf.tsx:396-410`.
- **`@elevenlabs/client` is client-only** (touches `document`/`AudioContext` at import). Leaf
  is `"use client"` `convai-leaf.tsx:1`. Never import into a Server Component or a shared
  non-`"use client"` shell module. (V2 C2.)
- **Audio-paced transcript machine — preserve verbatim:** committed turns `onMessage`
  (`:91-100`), live text `onAgentChatResponsePart` start/delta/stop (`:101-117`), audio
  alignment `onAudioAlignment` into the `timeline` ref (`:118-129`), 30ms reveal interval w/
  `REVEAL_LEAD_MS=120` (`:148-158`), `disconnected` reset (`:134-140`), chip optimistic-push +
  `sendUserMessage` (`:218-226`, SDK does NOT echo injected text), error surfacing w/
  `NotAllowedError` mapping (`:133,263-270,427-433`). (V5 R7–R13.) Reshaping presentation is
  fine; changing the data contract is a regression.
- **`mode`/`isSpeaking`/`isListening` for orb (Screen 5):** wire the SDK axis, do not fake from
  `status` or transcript deltas. (V5 D2.)

### 5.2 QR → slug intake (BLOCKER — §1.1)
- QR encodes `https://{host}/l/{id}` server-side (`backend/app/api/routers/letters.py:38-52`),
  rendered in `QrBlock` (`preview/page.tsx:317-344`). `/l/[id]` stays the canonical,
  self-sufficient cold-open target; never a redirect; path never renamed. There is no in-app
  scan screen — Screen 1 is binned; entry is OS camera → QR → `/l/[id]` directly. (V1 R2.)

### 5.3 Language switch semantics (EN→CY, voice-driven — D6)
- Welsh reached only via the agent-invoked `switch_language` client tool → `restartInWelsh`:
  full teardown (`endSession` → new signed URL → `startSession` w/ Welsh block/voice/
  `language:"cy"`). ElevenLabs cannot hot-swap. **One-way: no `restartInEnglish`, no UI toggle**
  — and D6 deliberately keeps it this way. The handler is in-repo (`convai-leaf.tsx:209-211` →
  `:184-204`); Welsh voice via `NEXT_PUBLIC_XI_VOICE_ID_WELSH` (`env.ts:17`).
- **The agent config is reproducible from the repo (corrected).** The `switch_language` tool
  *definition*, the system prompt, and the baseline `first_message` are all defined in
  `backend/scripts/setup_eleven_agent.py` (tool config `:70-92`, `reconcile_client_tool` `:161-174`;
  prompt loaded from `backend/prompts/letter_explainer.txt` `:30,183`; `first_message` `:198`) and
  applied to the live "Letter Explainer" agent by re-running that idempotent create-or-update
  script — NOT hand-edited in the ElevenLabs dashboard. (Earlier docs wrongly called this
  out-of-repo; they missed the script.)
- **The D6 changes are implemented and pushed:** (1) the client greeting `ENGLISH_FIRST_MESSAGE`
  (`convai-leaf.tsx:42`) and the baseline `first_message` (`setup_eleven_agent.py:198`) now ask
  *which language* to continue in (session starts in English); (2) `letter_explainer.txt` handles
  a one-word "Welsh"/"Cymraeg" reply as a switch **and** enforces concise, voice-length answers;
  (3) re-ran `setup_eleven_agent.py` to apply. The `switch_language`→`restartInWelsh` path is
  otherwise unchanged. Keep it working. (D6; Decisions-C §2; V5 R14–R17, §4.9.)

### 5.4 Citation chips (letter-derived, NOT live attribution)
- Built from `sources` prop (`CodeLine.govuk_anchor`), deduped, linked to
  `https://www.gov.uk/${anchor}`, shown only after `agentHasReplied && sources.length > 0`.
  `convai-leaf.tsx:363-393`, `:292-294`; sources built `l/[id]/page.tsx:31-34`. The SDK has
  **no `source_attribution`** — citations CANNOT track the spoken sentence. Restyle freely;
  changing the source is a regression (and impossible). (V5 R18–R20/D6.)

### 5.5 GOV.UK company-car action + confirmation (sanctioned GDS exception — DO NOT restyle)
- Action CTA appears only when `suspectedErrors.length > 0 && agentHasReplied`, P2-only, →
  `/actions/update-company-car/[letterId]` (`convai-leaf.tsx:228,296-304`). Keep this inbound
  link live or the route is orphaned (V1 R6).
- `/actions/*` is GDS-styled via scoped `vendor/govuk-frontend.min.css` + `govuk-template__body`
  (`app/actions/layout.tsx:16-23`). Form self-fills char-by-char, `readOnly`, submit disabled
  until filled, `noValidate`, hardcoded demo values, submit = client nav only / nothing
  persisted (`auto-fill-form.tsx:34-62`, `update-company-car/[letterId]/page.tsx:28-32`).
  Confirmation = GDS green panel with **verbatim "No real change has been made"** + 883L→1257L
  copy (`confirmation/page.tsx:43-53`). The editorial Screen-10 (`/all-set`) must NOT replace or
  restyle this GDS confirmation. (V5 R21–R26, D7.)
- **Two minimal additions to the confirmation page (D1/D3), nothing else):**
  (1) a **new X/close control** `<Link href="/all-set" aria-label="Close">×</Link>` — the
  citizen finish path (Screen 10); style it as an unobtrusive GDS-ish top-right link, do NOT
  inject editorial chrome. (2) the existing **"Return to the dashboard" link
  (`confirmation/page.tsx:56`) MUST be repointed `/dashboard` → `/`** and relabelled — `/dashboard`
  is deleted (D4/§5.9), so leaving it would 404 the "done" screen. Leaving `/actions/*` (via either
  control) auto-unmounts the GDS stylesheet. Do not touch the verbatim honesty line or panel copy.
  (D1/D3; Decisions-B §3, Decisions-A §1.)

### 5.6 HMRC letter preview facsimile (sanctioned exception — DO NOT restyle)
- `/letters/[id]/preview` is a deliberate white-paper/black-ink/**Arial** scan look-alike
  (MEMORY-pinned), verbatim in-fiction HMRC content, already `min-h-dvh`. `preview/page.tsx:9-15`.
  Keep reachable (it is the demo's scannable physical letter, upstream of Screen 1). (V5 R29/R30.)

### 5.7 Confusion-heatmap dashboard — **DELETED (D4), see §5.9**
- The prior "`/dashboard` must stay untouched (BLOCKER)" ruling is **overturned**. The heatmap is
  removed entirely; deletion surface is in §5.9. It is no longer part of the regression surface.

### 5.8 Backend/data contract (zero-regression on the wire)
- `GET /letters/{id}` Pydantic↔Zod mirror (P2/P800 discriminated by `type`, money via
  `z.coerce.number()`) — `backend/app/models/letters.py` ↔ `frontend/lib/api.ts:31-98`.
  `letter_id` is a **text slug** printed in QR+URL. Two seeded letters + ~50 seeded scan-event
  rows are the only persisted state; nothing a session does is written today. Do NOT "wire up"
  `POST /letters/{id}/check` (a deliberate unused integrity guard, not a gap). (V3 Risk 1, V5
  R33–R35.)
- **`POST /scan-events` + the `scan_events` table/seed STAY** even though D4 removes the aggregate
  `GET` that read them: the POST shares the router (mounted `main.py:14,55`) and migrations are
  append-only. Do NOT remove the router/mount. The POST is **not** wired to anything (its only
  reader, the heatmap, is deleted) — leave it dormant. (D4; Decisions-A §3/§4.)

### 5.9 Intentional deletions (NOT regressions — do these on purpose)
These removals are **deliberate** (D3/D4). An implementer must recognise them as intended, not
accidental breakage. Order: remove callers in the same change as exports to avoid a broken build.
(Full evidence: Decisions-A §3/§4/§5.)

**Heatmap dashboard (D4):**
| Action | Path |
|---|---|
| DELETE FILE | `frontend/app/dashboard/page.tsx` (+ the now-empty `app/dashboard/` dir) |
| EDIT (remove slice) | `frontend/lib/api.ts:100-129` — `scanEventAggregateSchema`, `languageCountSchema`, `scanEventDashboardSchema`, the 3 exported types, `getScanEventDashboard()` |
| EDIT (remove route + 2 imports) | `backend/app/api/routers/scan_events.py` — `GET /aggregates` (`:21-23`) + `ScanEventDashboard`/`get_scan_event_dashboard` imports |
| EDIT (remove fn + trim imports) | `backend/app/repositories/letters.py` — `get_scan_event_dashboard()` (`:47-71`); KEEP `ScanEventCreate`/`log_scan_event` |
| EDIT (remove 3 models) | `backend/app/models/scan_events.py` — `ScanEventAggregate`/`LanguageCount`/`ScanEventDashboard`; KEEP `ScanEventCreate` |
| **KEEP / DO NOT TOUCH** | `backend/app/main.py` (router import `:14` + mount `:55`), `POST /scan-events`, the `scan_events` table + both seed migrations |

**Investor pitch page (D3):**
| Action | Path |
|---|---|
| DELETE FILE | `frontend/app/page.tsx` (the file-local `DemoLink` component dies with it — no external importer) |
| REBUILD | `/` becomes the static citizen home (Screen 11, §2) |
| KEEP | `frontend/components/wordmark.tsx` + `app/logo.png` (still used by `not-found.tsx`, `l/[id]/page.tsx`) |

**Link fixups required by the deletions** (a missed one = broken demo):
- `confirmation/page.tsx:56` "Return to the dashboard" → repoint `/dashboard`→`/`, relabel (D3) — **the one 404 risk**.
- `not-found.tsx:20` "Back to the index" → reword to "Back to home"; `wordmark.tsx:6-8` stale comment.
- After deleting `app/dashboard/`, restart the dev server so `.next/` route types regenerate.

---

## 6. Open questions the implementer must confirm before coding

The product owner's decisions (D1–D9, see `research/decisions-research.md`) closed most of the
earlier open questions. **Closed and now settled facts** (do NOT re-litigate): real-vs-fake for
10/11/12 → **hard-coded** (D1, §1.6); P800-vs-P2 copy → **real P2 data** (D2, §1.8); home identity
→ **`/` is the citizen home, pitch deleted** (D3, §5.9); Screen-12 route → **`/conversations`**
(D5); language toggle → **none; voice-driven EN→CY** (D6, §5.3); typed-text → **existing session
via `sendUserMessage`** (D7, §Screen-7); reading interstitial → **staged theatre** (D8, §Screen-2);
the heatmap-dashboard `POST`-wiring question is **moot** (D4 deleted its only reader). What remains
genuinely open:

1. **Pre-session tappable chips.** With the new flow the voice session starts from Screen 3's "Chat
   about this letter" CTA (so the greeting/language question is heard), meaning Screen-4 suggestion
   chips usually appear when the session is already live. *Open:* if any chip can be tapped before a
   session exists, it must **start the session on that tap** ("start then send", §Screen-4) — never
   relax `disabled={!live}` (`convai-leaf.tsx:278`) without wiring start-on-tap, which yields a dead
   chip. Confirm whether pre-session chips are reachable at all in the final flow. (V2 C7, V5 D5.)

2. **GDS header service-name links → `/` (brand jump).** Inside the GOV.UK facsimile, the "HMRC —
   Personal Tax Account" service-name links (`actions/.../page.tsx:79`, `confirmation/page.tsx:24`)
   now resolve to the Marginalia citizen home. No 404, but a visual jump out of the GDS clone.
   *Open:* leave as-is, or neutralise the link. Low stakes. (Decisions-A §2.)

3. **User-bubble styling — honour the ruling.** §1.9 rules user bubbles must NOT be solid
   `bg-accent` (restrained surface-token treatment; solid oxblood reserved for the one primary CTA
   per screen). Not open, but flagged so the implementer consciously honours it. (V5 C6.)

---

## 7. Sequencing

Anchor early work on **foundational, low-regression** items (deletions, shell, phone-frame);
keep the **session-coupled** work (the `/l/[id]` reshape, the `firstMessage` reword) in one phase.
Screens 10/11/12 are now **cheap hard-coded static** work (D1) — no persistence track to gate on.

### Phase 0 — Demo-infra gate (do FIRST, blocking, no code)
- Stand up **HTTPS** for the phone (tunnel/deployed/`--experimental-https`). Nothing voice-
  related can be tested without it (§4.1). This gates the whole demo, not just a phase.

### Phase 1 — Foundational shell + phone-frame + deletions (safe, low-regression, unblocks everything)
Ship independently; touches no session logic:
- **Deletions (D3/D4, §5.9):** delete the pitch `app/page.tsx` and the heatmap (`app/dashboard/page.tsx`
  + the `lib/api.ts` slice + the 3 backend files), KEEP the `scan_events` POST/table/router-mount;
  repoint `confirmation/page.tsx:56` `/dashboard`→`/` (the one 404 risk) and reword the 404/comment.
  Pure subtractive; do them first so the route map is clean. Restart the dev server after.
- Root `viewport` export `viewportFit:"cover"`; `env(safe-area-inset-*)` padding; `dvh`
  everywhere (fix `not-found.tsx:7`); `-webkit-tap-highlight-color` + `active:`/`focus-visible:`
  base states (§3.2). Pure additive; must not restyle the two exceptions (§5.5/§5.6).
- The shared mobile **app shell + Mac phone-frame** in one `app/(phone)/layout.tsx` (fixed top bar
  + scroll body + docked input/CTA + transcript scroll region; the frame owns the height,
  `min-h-dvh lg:h-[852px]`) (§3.2/§3.5). Verify the route-group move keeps `/l/[id]`'s URL (§1.1).
- ≥44px touch-target re-spec for existing controls (§3.3).

### Phase 2 — `/l/[id]` single-column reshape (the core, still low session-risk)
- Rearchitect `/l/[id]` from the two-pane desktop grid into single-column **view-states**
  (summary → voice → thread), provider mounted once, no sub-routes (§1.2/§3.4). This is the
  spine; screens 3–9 hang off it (10/11/12 are separate static routes — Phase 3).
- Restyle `TranscriptPanel` into bubbles in surface tokens (user NOT solid oxblood), preserving
  the audio-paced reveal contract (§5.1). Screens 3, 6, 7.
- Wire the SDK `mode` axis for the speaking orb (Screen 5) — additive (§5.1/D2).
- Reshape chips into ≥44px rows + add the "Ask anything" input calling `sendUserMessage` (D7,
  additive — Screens 4, 7, 8).
- **DONE (D6):** the greeting (`convai-leaf.tsx:42` + `setup_eleven_agent.py:198`) asks which
  language; the system prompt (`backend/prompts/letter_explainer.txt`) handles a one-word "Welsh"
  and now enforces concise voice-length answers; pushed via
  `poetry run python backend/scripts/setup_eleven_agent.py`. The `switch_language`→`restartInWelsh`
  path is unchanged. Agent config is fully in-repo via that script — re-run it after any prompt/
  tool/greeting edit (§5.3). Verify day-of (§4 #12).

These are **coupled to each other** (same route/component) but **decoupled from** the
finish/home/letters screens — ship Phase 1 then Phase 2 as the demo's backbone.

### Phase 3 — Surrounding screens (independent, content-driven, all hard-coded)
- Screen 2 reading theatre (hard-coded, timing-constrained §4.7); Screen 3 findings card from real
  P2 data; Screen 9 single real P2 action card (£748, no invented amounts/routes).
- **Screens 10/11/12 — quick hard-coded static work (D1):** `/all-set` (editorial success),
  `/` (citizen home), `/conversations` (two-item list). Add the confirmation-page X/close
  `<Link href="/all-set">` (§5.5). No persistence, no auth, no backend — these are now cheap and
  decoupled, NOT a gated "build-real" track. Each ships independently of the voice internals.

### Phase 4 — Interaction polish (small, after the backbone)
- **Pre-session start-on-tap chips** (§6 Q1): only if reachable pre-session; an interaction-model
  change on the start chain — validate the 30s/gesture constraints (§4.7).
- **dismiss-ends-session** teardown (§1.3): only add explicit `endSession()` IF the provider is
  hoisted into a shared shell; with the per-`/l/[id]` leaf + same-window finish nav, unmount
  already tears down (no code needed).

**Independent-shippable:** Phase 1 (deletions + shell + phone-frame), Phase 3 (all surrounding
screens incl. the hard-coded 10/11/12), the P2 data binding. **Coupled (one route/session):**
Phase 2 internals + the `firstMessage` reword + pre-session chips. **No separate persistence
track** — 10/11/12 are hard-coded (D1).
