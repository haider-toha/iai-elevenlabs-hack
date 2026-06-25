# Document 2 — The Technical Build Plan

*Production-ready plan for the HMRC P2/P800 voice explainer. Every stack choice is grounded in the capability research; exact API fields, paths and limits are verified.*

---

## Architecture overview

```
   Paper P2 letter
   ┌───────────────┐
   │  ▓▓▒░ QR ░▒▓▓  │  https://demo.host/l/AB12   (≤30-char URL, level-Q QR)
   └──────┬────────┘
          │ phone camera scan (iOS Camera / Android Chrome)
          ▼
   ┌────────────────────────────────────────────┐        ┌───────────────────────────┐
   │  NEXT.JS (App Router, HTTPS)               │        │  ELEVENLABS CONV-AI AGENT │
   │  /l/[letterId]/page.tsx  (Server Component)│        │  Scribe STT               │
   │   • fetch letter + grounding from FastAPI  │        │   →  Claude Sonnet 4.5     │
   │   • render the letter, highlight the line  │  voice │   →  TTS (warm UK voice)   │
   │  <ConvaiLeaf/>  ("use client" leaf)  ◄─────┼────────┤  KB: GOV.UK guidance (RAG)│
   │   • <elevenlabs-convai> widget             │ ws/443 │  source_attribution: on   │
   │   • override-prompt = injected letter      │        │  per-session: letter text │
   │   • override-language = user language      │        │   injected via override   │
   └──────┬─────────────────────────────────────┘        └───────────────────────────┘
          │ NEXT_PUBLIC_API_URL  (Bearer JWT)                         ▲
          ▼                                                           │ KB sync (build-time)
   ┌────────────────────────────────────────────┐                    │
   │  FASTAPI  (the only data path)             │                    │
   │   GET  /letters/{id}        → letter + grounding snippets        │
   │   POST /letters/{id}/check  → deterministic formula audit ───────┘
   │   POST /scan-events         → heatmap logging
   │   POST /govuk/refresh       → pull + clean GOV.UK, push to KB
   └──────┬───────────────────────────┬─────────┘
          │ asyncpg pool (lifespan)   │ httpx
          ▼                           ▼
   ┌────────────────┐        ┌──────────────────────────┐
   │ PostgreSQL     │        │ GOV.UK Content API       │
   │ (Supabase)     │        │ /api/content/{path}      │
   │ letters,       │        │ no key · ≤10 req/s · OGL │
   │ scan_events    │        └──────────────────────────┘
   └────────────────┘
```

**One-paragraph explanation.** A citizen scans the QR already printed on their letter and lands on a Next.js page. The page's Server Component asks FastAPI (the only data path, per repo rules) for that letter's structured content plus the relevant official-guidance snippets; a single `"use client"` leaf mounts the ElevenLabs convai widget and injects *this letter* into the agent's system prompt at session start, with the user's language. Voice round-trips go **browser ↔ ElevenLabs directly** (lowest latency, no audio through our backend). The agent reasons with **Claude Sonnet 4.5** over a **knowledge base of GOV.UK guidance** (pre-loaded, RAG, with citations on). When the user asks "is this right?", the page calls FastAPI's deterministic formula audit — the **error-catch is computed in code, never hallucinated**. Every scan and question is logged (no PII) to build a confusion heatmap that tells government which sentences to rewrite.

---

## Stack decisions

| Layer | Choice | One-line justification |
|---|---|---|
| **Frontend** | **Next.js App Router** (existing scaffold) | Server Components fetch the letter + grounding with zero client JS; a single client leaf carries the voice widget — exactly the repo's "push `use client` to the leaf" rule. |
| **ElevenLabs path** | **Conversational AI Agent** (not the direct STT→LLM→TTS pipeline) | The Agent gives turn-taking, barge-in, native language detection and a drop-in mobile widget for free; hand-rolling the real-time loop would consume both build days. (Direct API only wins if exact citation control is the core wow — it isn't here.) |
| **LLM** | **Claude Sonnet 4.5, selected natively** in the agent's `llm` field | Best plain-English reasoning; selectable inside ElevenLabs on their billing — **no custom-LLM proxy, no separate Anthropic key** (the BYO-key path is OpenAI-compatible only). |
| **Grounding** | **Two layers**: (1) GOV.UK guidance as the agent **knowledge base (RAG + `source_attribution`)**; (2) the specific letter **injected per-session** into the system prompt | The corpus is stable and shared → KB. The letter is unique per scan and short → prompt injection (no per-letter KB upload/indexing delay). |
| **GOV.UK pull** | **Content API** `https://www.gov.uk/api/content/{path}` (no key, ≤10 req/s) | Verified live; full page body in `details.parts[].body`; **OGL v3.0** lets us use it as a grounding corpus with one attribution line. |
| **Auth** | **Mocked** — official **GOV.UK One Login Docker simulator** (`ghcr.io/govuk-one-login/simulator:latest`) behind a Design-System button | Real One Login needs a `.gov.uk` email + ~5-day onboarding; the simulator runs real OIDC locally with no credentials, so the demo *is* the real protocol. |
| **QR** | **Python `qrcode`**, error level **Q**, `border=4`, URL **< 30 chars** | Q = 25% damage recovery (folds/smudges) without over-densifying; short URL keeps the code coarse and reliably scannable at arm's length. |
| **Voice UX safety** | `conversation_history_redaction` on; "this is not formal tax advice" in the system prompt; error-catch computed in code | Letters contain names/NI numbers; redaction + a hard "only from the letter and official guidance" instruction + a deterministic audit keep it grounded and defensible. |

---

## Letter service — the structured data model

Two demo letters: a **P2 coding notice** (primary, the error-catch) and a **P800 tax calculation** (secondary, the refund). Pydantic v2 models (repo rule: a model for everything crossing a boundary; `response_model=` on every route).

```python
# app/models/letters.py
from pydantic import BaseModel, ConfigDict
from enum import StrEnum
from datetime import date
from decimal import Decimal

class LetterType(StrEnum):
    P2 = "p2"
    P800 = "p800"

class CodeLine(BaseModel):           # one row of the "how we worked out your tax-free amount" table
    label: str                       # e.g. "Car benefit", "Personal Allowance", "Untaxed interest"
    amount: Decimal                  # signed: additions +, deductions −
    source_type: str                 # "allowance" | "company_benefit" | "underpayment" | "state_pension" | "interest"
    plain_english: str               # pre-written gloss the agent can lean on
    govuk_anchor: str                # slug of the GOV.UK page that explains this line

class SuspectedError(BaseModel):     # the "we caught it" payload — computed, never guessed
    line_label: str
    reason: str                      # "You told us you no longer have this company car"
    est_annual_overpay: Decimal
    est_monthly_overpay: Decimal
    fix_action: str                  # "Update company benefits in your Personal Tax Account"

class P2Letter(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    type: LetterType = LetterType.P2
    recipient_name: str
    nino_masked: str                 # "QQ 12 34 ▒▒ C" — stored masked
    tax_year: str                    # "2026 to 2027"
    issue_date: date
    employer_name: str
    current_code: str                # "883L"
    standard_code: str               # "1257L"  (what it would be with no deductions)
    personal_allowance: Decimal      # 12570
    lines: list[CodeLine]            # PA + additions − deductions
    tax_free_amount: Decimal         # derived; can be negative → K code
    confusing_line: str              # the verbatim hard sentence, for the page highlight
    suspected_errors: list[SuspectedError]

class P800Letter(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    type: LetterType = LetterType.P800
    recipient_name: str
    nino_masked: str
    p800_reference: str
    tax_year: str
    total_income: Decimal
    personal_allowance: Decimal
    tax_due: Decimal
    tax_paid: Decimal
    result: str                      # "overpaid" | "underpaid"
    amount: Decimal
    claim_method: str                # "online bank transfer (5 working days) or cheque (6 weeks)"
    confusing_line: str
```

**How each field maps to the agent's context.** FastAPI serialises the letter into a compact plain-text block that is injected into the system prompt via `overrides.agent.prompt.prompt` at session start. It contains: the recipient's situation, every `CodeLine` with its `plain_english` gloss, the derived `tax_free_amount`/code, and — crucially — the `suspected_errors` so that when the user asks "is this right?", the agent surfaces the pre-computed pound figure rather than improvising one. The `govuk_anchor` on each line tells the agent which KB document to cite.

**Demo seed — Maria's P2 (the error-catch):**

| Line | Amount | Note |
|---|---|---|
| Personal Allowance | +£12,570 | standard |
| Car benefit | −£3,740 | **stale — car returned last year** |
| **Tax-free amount** | **£8,830 → code `883L`** | should be `1257L` |
| **Suspected error** | **£748/yr ≈ £62/mo overpaid** | (£3,740 × 20%) |

The verbatim *confusing line* on the page (real HMRC wording): *"We have included an adjustment to reduce your tax-free allowance by £3,740 so we can collect the tax in equal instalments."*

---

## GOV.UK grounding — exact pages, exact calls, into the KB

**Pages to pull** (all verified live, `document_type: guide` → body in `details.parts[].body`, HTML):

| Topic | Content API call |
|---|---|
| Tax codes (suffixes, K codes, what the number means) | `GET https://www.gov.uk/api/content/tax-codes` |
| Tax over/underpayments (P800, refunds, owing tax) | `GET https://www.gov.uk/api/content/tax-overpayments-and-underpayments` |
| Simple Assessment (pay-by-deadline variant) | `GET https://www.gov.uk/api/content/simple-assessment` |
| Pay a tax bill / Time to Pay | `GET https://www.gov.uk/api/content/pay-self-assessment-tax-bill` |
| Income Tax & Personal Allowance | `GET https://www.gov.uk/api/content/income-tax` |
| *(company-car benefit — verify slug before relying)* | `GET https://www.gov.uk/api/content/tax-company-benefits` |

**Exact pull + clean (FastAPI, `httpx`, run at build time — never during the live demo):**

```python
async def pull_govuk(path: str) -> tuple[str, str]:
    async with httpx.AsyncClient() as c:
        r = await c.get(f"https://www.gov.uk/api/content/{path}")   # no key, no headers
        r.raise_for_status()
        doc = r.json()
    title = doc["title"]
    parts = doc["details"].get("parts")                  # guide → list of {title, slug, body}
    html = "\n\n".join(p["body"] for p in parts) if parts else doc["details"]["body"]
    text = strip_html(html)                              # to plain text for the KB
    return title, text                                   # respect ≤10 req/s across the batch
```

**Into the KB.** Each cleaned page is written as a titled `.md` and uploaded to the agent's ElevenLabs knowledge base (dashboard upload is fine for a hackathon; the KB API works too). We are far under the **20 MB / 300k-char** non-enterprise cap, but enable **RAG** anyway so retrieval stays tight, and turn on **`source_attribution`** so each answer reports `used_static_kb_document_ids` for the on-screen citation. **Licence:** show *"Contains public sector information licensed under the Open Government Licence v3.0."* in the footer; do not reproduce GOV.UK/Crown logos.

---

## Agent configuration (exact settings)

- **LLM:** `claude-sonnet-4-5` (native selection in the agent's `llm` field).
- **Knowledge base:** the GOV.UK docs above; **RAG enabled**; **`source_attribution: true`** (on `ConversationConfig`).
- **Base system prompt** (set once on the agent): persona + rules —
  - *Explain UK government letters in plain English at roughly a reading age of 9.*
  - *Answer only from the letter provided and the attached official GOV.UK guidance. Name the GOV.UK page you used.*
  - *Never invent or recompute figures — if asked whether something is correct, use the provided audit result.*
  - *Always say, when relevant, "This explains your letter — it isn't formal tax advice."*
  - *If something isn't in the letter or the guidance, say you can't find it in the official guidance.*
- **Per-session overrides** (set on the widget from server data):
  - `override-prompt` = base prompt **+ the injected letter block** (incl. `suspected_errors`).
  - `override-language` = the user's language (or rely on Conversational AI 2.0 auto-detection).
  - `override-first-message` = a warm, letter-specific greeting ("I can see you've got a tax code notice from HMRC — what would you like to know?").
  - ⚠️ **Enable System prompt, First message, and Language overrides in the agent's Security tab** — they are **off by default and silently ignored otherwise.**
- **Privacy:** `conversation_history_redaction` on (redacts names, NI numbers from stored transcripts).
- **STT keyterms** (Scribe bias list, ≤50 terms): `HMRC, PAYE, tax code, coding notice, Personal Allowance, company car benefit, P2, P800, National Insurance, tax-free amount, Simple Assessment, K code, tax year`.
- **Pronunciation dictionary** (so the voice doesn't spell jargon badly): `PAYE → "pay as you earn"`, `HMRC → "H-M-R-C"`, `P800 → "P eight hundred"`, `883L → "eight eight three, L"`, `1257L → "one two five seven, L"`.
- **Voice:** a warm, natural UK voice (not the default robotic preset); Flash/Turbo TTS for low latency.
- **Language detection:** native (Conversational AI 2.0) — confirm the languages you'll demo (e.g. English + Polish + Urdu) behave on a real device.

---

## Web page — what the QR scan lands on

`/l/[letterId]/page.tsx` (Server Component) + `convai-leaf.tsx` (`"use client"`):

- **Server fetch:** letter + grounding snippets from `GET /letters/{id}` via FastAPI (parallelised with `Promise.all` where independent — no waterfalls).
- **Letter render:** a faithful visual of the P2 at the top, with the **confusing line highlighted in the oxblood accent**, so the judge sees exactly what the citizen can't parse.
- **One big tap target — "Ask about this letter"** — mounts `<elevenlabs-convai>` (load the `@elevenlabs/convai-widget-embed` script via `next/script strategy="lazyOnload"`); mic starts on the tap (iOS requires a user gesture + HTTPS).
- **Pre-populated prompt suggestions** (tap-to-ask chips): *"What does my tax code mean?" · "Why did it change?" · "Is this correct?" · "What do I need to do?"*
- **Citation display:** as the agent answers, render GOV.UK source chips from `source_attribution` (`used_static_kb_document_ids` → the page title + a link to the live gov.uk page).
- **Language selector** (or trust auto-detect) and the **One Login** button (mocked) for the "personalised actions" beat.
- **Styling:** editorial-press per `CLAUDE.md` — bone paper, soft-black ink, one oxblood accent, Familjen Grotesk + Newsreader, hairline rules, no AI-tell fonts/gradients/shadows. OGL attribution in the footer.

---

## Confusion heatmap

**Log per scan/question** (`POST /scan-events`, **no PII**): `letter_type`, `letter_section` (classify the question → which "hotspot": tax-code / adjustments / what-to-do / etc.), `language`, `resolved` (answered vs escalated to "call HMRC"), `session_seconds`, `timestamp`.

**Aggregate:** count questions per `letter_section` to reveal which parts of the letter generate the most confusion (HMRC's own research already predicts the **"adjustments" line** will dominate — the dashboard *proves* it from live usage).

**Dashboard shows:** a heatmap overlaid on the letter image (question density per section, hottest = oxblood), language distribution, a **"questions answered without a phone call"** counter (the failure-demand-deleted metric), and the top confusing phrases. This is the feedback-to-government story: *the product doesn't just help citizens, it tells HMRC which sentences to rewrite* — tying straight to the Behavioural Insights Team evidence that rewording a letter measurably changes behaviour.

---

## 2-day build sequence (demo-critical path done by end of Day 1)

**Day 1 — get the full QR → voice → grounded answer loop working end-to-end.**
- **AM**
  - Create the ElevenLabs agent: select **Claude Sonnet 4.5**, paste the base system prompt, **enable the three overrides in the Security tab**, pick the voice.
  - Pull `tax-codes` + `tax-overpayments-and-underpayments` from the Content API, clean, upload to the KB, enable **RAG + `source_attribution`**.
  - Define the `P2Letter` model + seed **Maria's letter** (the car-benefit error) in FastAPI + Postgres migration.
- **PM**
  - Build `/l/[letterId]/page.tsx`: server-fetch the letter, render it, mount the convai leaf with `override-prompt` (letter block) + `override-language`.
  - Generate the **level-Q QR** (Python `qrcode`) pointing at the deployed HTTPS URL; print one P2 to paper.
  - Deploy to an HTTPS host. **✅ Milestone: scan the printed letter on a real iPhone, tap, ask "what does this mean?", hear a grounded answer.** The demo now exists.

**Day 2 — make it land and harden.**
- **AM**
  - `POST /letters/{id}/check`: compute the formula, flag the stale deduction + monthly overpay; inject into the prompt so *"is this right?"* fires the error-catch.
  - Add the **P800** letter + a **second language**; add the **citation chips** on the page.
  - Editorial styling pass.
- **PM**
  - **Confusion heatmap** dashboard (log + aggregate + letter overlay), seeded with ~50 synthetic events.
  - **One Login** mocked button (Docker simulator or styled stub).
  - Pitch polish: the **MoU slide**, the **NAO numbers**, the **DWP 66% "this scales" closer**; pronunciation dictionary; rehearse on the demo phone; **record a backup video.**

---

## What to mock and how (exact stubs)

- **Auth (One Login):** run `docker run --rm -d -p 3000:3000 ghcr.io/govuk-one-login/simulator:latest` and point an OIDC client at it for a *real* `/authorize → /token → /userinfo` round-trip returning `{name, DOB, address}`. Cheaper fallback: a GOV.UK-Design-System **"Sign in with GOV.UK One Login"** button → a canned callback. **Never display an NI number as coming from One Login** (it never returns one).
- **Action backends:** the "update my tax code" / "claim my refund" buttons route to a GOV.UK-styled **"Start now"** screen → a stub confirmation ("In production this updates your record via your Personal Tax Account"). No write to HMRC.
- **Letter generation:** a small Jinja/React template renders a realistic P2/P800 from the data model (authentic headings and wording, fabricated figures/names) to HTML→PNG, with the QR composited in the corner; print one for the live scan.
- **Heatmap data:** seed `scan_events` with ~50 synthetic rows (weighted so "adjustments" is hottest) so the dashboard looks alive before the live demo adds to it.

---

## Top 5 risks

| # | Risk | Mitigation | Verdict |
|---|---|---|---|
| 1 | **Mobile Safari mic / widget flakiness** (mic permission, autoplay, custom-element load) | Serve HTTPS; mic on user tap; test on the *actual* demo iPhone on Day 1; pre-warm a session before going on stage; **record a backup video**; text-chat fallback. | **Kill-the-demo → mitigate hard** |
| 2 | **Latency on venue Wi-Fi** (~0.7–1.6 s first audio, worse on bad networks — it's distance-dominated) | Set the agent region near the venue; keep answers short; bring a **mobile hotspot**; pre-warm. | Graceful-degrade |
| 3 | **Hallucination / wrong tax explanation** (credibility killer + judge red flag) | `source_attribution` on; "only from the letter + KB, name the source, never invent figures" in the prompt; **the error-catch is computed in code, not by the model**; rehearse the exact demo questions. | **Kill-the-credibility → mitigate hard** |
| 4 | **Free-tier limits** (2 concurrent conversations, ~15 min agent time/month) | One demo phone; don't let the audience hammer it live; have a paid key or recorded backup ready; keep sessions short. | Graceful-degrade |
| 5 | **GOV.UK content gap or API hiccup** | KB is **pre-fetched and cached** (no live Content API call during the demo); respect ≤10 req/s at build time; if a question falls outside the KB the agent says "I can't find that in the official guidance" rather than guessing. | Graceful-degrade |

---

### Accuracy notes for the deck (stay bulletproof)
- The verified NHS letter-rewording RCT figure is **29.3% → 33.5% (+4.2pp)** (Northamptonshire NHS Health Check trial) — use this pair, not the 34.2%→39.7% in the original brief.
- Cite the DWP overturn rate as **"~66% of PIP appeals overturned at a tribunal hearing"** (share of appeals *heard*) — not "of all decisions" — or a sharp reviewer will (fairly) flag the denominator.
- ElevenLabs custom-LLM BYO-key is **OpenAI-compatible only** — that's why we use Claude *natively*, not via a proxy.
