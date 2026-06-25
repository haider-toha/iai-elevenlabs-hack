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
   │   • fetch letter + grounding from FastAPI  │        │   →  Claude Sonnet 4.5    │
   │   • render the letter, highlight the line  │        │   →  TTS (warm UK voice)  │
   │  <ConvaiLeaf/>  ("use client" leaf)        │  voice │  KB: GOV.UK guidance (RAG)│
   │   • @elevenlabs/react useConversation()    │◄───────┤  source_attribution: on   │
   │   • startSession({signedUrl, overrides})   │ ws/443 │  per-session: letter text │
   │   • onMessage / onAudioAlignment → live    │        │   injected via override   │
   │     captions + word-level highlighting     │        │                           │
   └──────┬───────────────┬─────────────────────┘        └─────────────▲─────────────┘
          │               │ /api/eleven/signed-url                     │
          │               └──── (Next route handler, server-only)──────┘
          │                     fetches signed URL with XI_API_KEY,
          │                     never exposes the key to the browser
          │ NEXT_PUBLIC_API_URL  (Bearer JWT)                          │ KB sync (build-time)
          ▼                                                            │
   ┌────────────────────────────────────────────┐                     │
   │  FASTAPI  (the only data path)             │                     │
   │   GET  /letters/{id}        → letter + grounding snippets         │
   │   POST /letters/{id}/check  → deterministic formula audit ────────┘
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

**One-paragraph explanation.** A citizen scans the QR already printed on their letter and lands on a Next.js page. The page's Server Component asks FastAPI (the only data path, per repo rules) for that letter's structured content plus the relevant official-guidance snippets; a single `"use client"` leaf calls the **`@elevenlabs/react`** SDK's `useConversation` hook to start a voice session, injecting *this letter* into the agent's system prompt at session start. Authentication uses a **signed URL** generated server-side by a Next route handler (`/api/eleven/signed-url`) that holds the `XI_API_KEY` — the key never reaches the browser. Voice round-trips go **browser ↔ ElevenLabs directly** over WebSocket (lowest latency, no audio through our backend); the SDK exposes `onMessage` and `onAudioAlignment` callbacks so we render **live captions and word-level highlighting** as the agent speaks. The agent reasons with **Claude Sonnet 4.5** over a **knowledge base of GOV.UK guidance** (pre-loaded, RAG, with citations on). When the user asks "is this right?", the page calls FastAPI's deterministic formula audit — the **error-catch is computed in code, never hallucinated**. Every scan and question is logged (no PII) to build a confusion heatmap that tells government which sentences to rewrite.

---

## Stack decisions

| Layer | Choice | One-line justification |
|---|---|---|
| **Frontend** | **Next.js App Router** (existing scaffold) | Server Components fetch the letter + grounding with zero client JS; a single client leaf carries the voice widget — exactly the repo's "push `use client` to the leaf" rule. |
| **ElevenLabs path** | **Conversational AI Agent** + **`@elevenlabs/react` SDK** (`useConversation` hook), authenticated via server-issued signed URL | The Agent gives turn-taking, barge-in, native language detection and Claude/KB/citations for free; the React SDK exposes the WebSocket events directly (`onMessage`, `onAgentChatResponsePart`, `onAudioAlignment`), letting us render **live captions and word-level highlighting** — the demo's real-time feel. The drop-in widget is the easier path but hides those events; the SDK is ~30 lines extra and unlocks the visible wow. |
| **LLM** | **Claude Sonnet 4.5, selected natively** in the agent's `llm` field | Best plain-English reasoning; selectable inside ElevenLabs on their billing — **no custom-LLM proxy, no separate Anthropic key** (the BYO-key path is OpenAI-compatible only). |
| **Grounding** | **Two layers**: (1) GOV.UK guidance as the agent **knowledge base (RAG + `source_attribution`)**; (2) the specific letter **injected per-session** into the system prompt | The corpus is stable and shared → KB. The letter is unique per scan and short → prompt injection (no per-letter KB upload/indexing delay). |
| **GOV.UK pull** | **Content API** `https://www.gov.uk/api/content/{path}` (no key, ≤10 req/s) | Verified live; full page body in `details.parts[].body`; **OGL v3.0** lets us use it as a grounding corpus with one attribution line. |
| **Auth** | **Mocked** — official **GOV.UK One Login Docker simulator** (`ghcr.io/govuk-one-login/simulator:latest`) behind a Design-System button | Real One Login needs a `.gov.uk` email + ~5-day onboarding; the simulator runs real OIDC locally with no credentials, so the demo *is* the real protocol. |
| **QR** | **Python `qrcode`**, error level **Q**, `border=4`, URL **< 30 chars** | Q = 25% damage recovery (folds/smudges) without over-densifying; short URL keeps the code coarse and reliably scannable at arm's length. |
| **Voice UX safety** | `conversation_history_redaction` on; "this is not formal tax advice" in the system prompt; error-catch computed in code | Letters contain names/NI numbers; redaction + a hard "only from the letter and official guidance" instruction + a deterministic audit keep it grounded and defensible. |

---

## ElevenLabs setup — end-to-end, in order

Do these in sequence; nothing later in the doc works until each step here is green.

### 1. Account, billing, API key

1. Create an account at [elevenlabs.io](https://elevenlabs.io). Free tier is fine to start (caveats below).
2. Go to **Settings → API Keys → Create API Key**. Name it `i-ai-hackathon-server`. Scope: leave default (full convai access). **Copy and store immediately — it is shown once.**
3. (Optional) Create a second key scoped read-only for any monitoring/scripting.
4. **Free tier limits to know:** 2 concurrent conversations, ~15 min agent time/month. For the demo this is enough; if you do dry-runs all day you will burn it. If you can, put a $5 starter credit on the workspace before the demo day.

### 2. Knowledge Base — upload the GOV.UK pages

1. Run the FastAPI script `POST /govuk/refresh` (defined in this plan's GOV.UK section) once locally — it pulls the ~6 pages, strips HTML, and writes one `.md` per page into `backend/data/govuk/`.
2. In the ElevenLabs dashboard: **Conversational AI → Knowledge Base → Add documents → Upload** each `.md` file. Set the document name to the GOV.UK page title (e.g. `GOV.UK — Tax codes`); this is what `source_attribution` will return as the citation label.
3. Wait for indexing to finish (a few seconds per doc). You'll see a **"Ready"** badge.

### 3. Create the agent

1. **Conversational AI → Agents → Create new agent**, name it `Letter Explainer`.
2. **LLM:** select **Claude Sonnet 4.5** (`claude-sonnet-4-5`) from the model dropdown. This is billed by ElevenLabs — no separate Anthropic key needed.
3. **First message:** *"Hi, I can see you've got a tax code notice from HMRC. What would you like to know?"* (this is the default; per-session overrides will replace it.)
4. **System prompt:** paste the persona + rules from the *Agent configuration* section below. Add the sentence *"If the user asks for or speaks in another language, switch to that language for the rest of the conversation, including any references to figures from the letter."*
5. **Voice:** pick a warm UK voice (e.g. *Charlotte*, *Alice*) — **avoid the default robotic preset**. Set TTS model to **Flash v2** for low latency.
6. **Knowledge Base:** attach all the uploaded GOV.UK docs. **Enable RAG.** Enable **`source_attribution`**.
7. **Pronunciation dictionary:** create one and attach it (entries listed in the Agent configuration section).
8. **STT keyterms:** paste the bias list (Agent configuration section).
9. **Privacy:** turn on `conversation_history_redaction`.

### 4. ⚠️ Security tab — enable the overrides (this is the #1 footgun)

In the agent's **Security** tab, enable:

- ✅ **System prompt override** (`overrides.agent.prompt.prompt`)
- ✅ **First message override** (`overrides.agent.first_message`)
- ✅ **Language override** (`overrides.agent.language`)
- ✅ **Voice ID override** (`overrides.tts.voice_id`) — required for the Welsh voice swap

**Until you tick these, your code's per-session overrides are silently ignored.** The agent will keep using the static base prompt and you'll spend an hour debugging why your letter isn't being injected. Tick them now.

### 5. Authentication — also Security tab

- Set **Auth mode** to **Require authentication** (the agent will only accept connections via signed URL, not a raw `agent_id`).
- This is what protects you from someone sniffing the `agent_id` out of your client bundle and burning your free-tier minutes.
- The plan's `/api/eleven/signed-url` route handler is the server-side issuer — see below.

### 6. Copy two IDs into your environment

From the agent's settings page:

- **Agent ID** (e.g. `agent_7101k5zvyjhmfg983brhmhkd98n6`) → goes into `NEXT_PUBLIC_AGENT_ID`. This *can* be public (the signed-URL flow makes it useless on its own).
- Your **API key** from step 1 → goes into `XI_API_KEY` (server-only, **never** prefix `NEXT_PUBLIC_`).

### 7. Wire the Next.js side (signed URL route + React SDK)

```bash
pnpm add @elevenlabs/react
```

`frontend/app/api/eleven/signed-url/route.ts` (server-only — the API key never leaves the server):

```ts
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET() {
  const r = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${env.NEXT_PUBLIC_AGENT_ID}`,
    { headers: { "xi-api-key": env.XI_API_KEY }, cache: "no-store" }
  );
  if (!r.ok) return NextResponse.json({ error: "signed_url_failed" }, { status: 502 });
  const { signed_url } = await r.json();
  return NextResponse.json({ signedUrl: signed_url });
}
```

Signed URLs **expire after 15 minutes** but a session that has already started keeps running. Fetch a fresh one each time the user taps "Ask about this letter".

`frontend/components/convai-leaf.tsx` (the only `"use client"` file in the route):

```tsx
"use client";
import { useConversation } from "@elevenlabs/react";
import { useState } from "react";
import type { LetterContext } from "@/lib/letter-context";

export function ConvaiLeaf({ letterBlock }: { letterBlock: string }) {
  const [transcript, setTranscript] = useState<{ role: "user" | "agent"; text: string }[]>([]);
  const [agentLive, setAgentLive] = useState("");

  const conv = useConversation({
    onMessage: (m) => {
      if (m.source === "user") setTranscript((t) => [...t, { role: "user", text: m.message }]);
      if (m.source === "ai") setTranscript((t) => [...t, { role: "agent", text: m.message }]);
    },
    onAgentChatResponsePart: ({ type, text }) => {
      if (type === "start") setAgentLive("");
      if (type === "delta") setAgentLive((s) => s + text);
      if (type === "stop") setAgentLive("");
    },
    onAudioAlignment: (a) => { /* word-level timing for karaoke highlight */ },
    onError: (e) => console.error("convai error", e),
  });

  async function start() {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const { signedUrl } = await fetch("/api/eleven/signed-url").then((r) => r.json());
    await conv.startSession({
      signedUrl,
      overrides: {
        agent: {
          prompt: { prompt: letterBlock },
          language: "en",
          firstMessage:
            "Hi, I can see you've got a tax code notice from HMRC. What would you like to know?",
        },
      },
    });
  }

  return (
    <section>
      <button onClick={conv.status === "connected" ? () => conv.endSession() : start}>
        {conv.status === "connected" ? "End" : "Ask about this letter"}
      </button>
      <Transcript items={transcript} live={agentLive} />
    </section>
  );
}
```

Three things this gives you for free that the embedded widget doesn't:

- **Live captions** as the agent speaks (`onAgentChatResponsePart` deltas + `agentLive` state).
- **Word-level highlighting** (`onAudioAlignment` returns `{ chars, charStartTimesMs, charDurationsMs }` — render each word and toggle a class as audio plays).
- **Full control of the UI** — no widget chrome to fight against; the demo can be as editorial as `CLAUDE.md` demands.

### 8. Bootstrap script — let Claude do steps 2–5 for you

Everything in steps 2–5 (KB upload, agent creation, RAG enable, overrides, auth) is API-settable. You only need to do step 1 (create the API key) by hand — the rest can be a single idempotent script. Recommended location: `backend/scripts/setup_eleven_agent.py`.

```python
# backend/scripts/setup_eleven_agent.py
# Fully idempotent: safe to re-run any number of times. Reconciles the live
# ElevenLabs workspace with this script's intent — uploads/updates KB docs,
# creates-or-updates the agent, writes NEXT_PUBLIC_AGENT_ID to frontend/.env.local.
import hashlib
import os
from pathlib import Path
from elevenlabs import ElevenLabs

AGENT_NAME = "Letter Explainer"
GOVUK_DIR = Path("backend/data/govuk")
SYSTEM_PROMPT = Path("backend/prompts/letter_explainer.txt").read_text()
ENV_PATH = Path("frontend/.env.local")

client = ElevenLabs(api_key=os.environ["XI_API_KEY"])


def reconcile_kb_doc(md: Path) -> dict:
    """Upload md if missing, re-upload if content changed, otherwise reuse."""
    name = md.stem.replace("-", " ").title()
    content_hash = hashlib.sha256(md.read_bytes()).hexdigest()[:8]
    versioned_name = f"{name} [{content_hash}]"

    existing = client.conversational_ai.knowledge_base.list(search=name).documents
    for d in existing:
        if d.name == versioned_name:
            return {"type": "file", "name": d.name, "id": d.id}
        # Stale version with same base name — delete it before re-uploading.
        if d.name.startswith(f"{name} ["):
            client.conversational_ai.knowledge_base.documents.delete(documentation_id=d.id)

    with md.open("rb") as f:
        doc = client.conversational_ai.knowledge_base.documents.create_from_file(
            file=f, name=versioned_name,
        )
    client.conversational_ai.knowledge_base.document.compute_rag_index(
        documentation_id=doc.id, model="e5_mistral_7b_instruct",
    )
    return {"type": "file", "name": doc.name, "id": doc.id}


def desired_config(kb_docs: list[dict]) -> tuple[dict, dict]:
    conversation_config = {
        "agent": {
            "prompt": {
                "prompt": SYSTEM_PROMPT,
                "llm": "claude-sonnet-4-5",
                "knowledge_base": kb_docs,
                "rag": {"enabled": True, "embedding_model": "e5_mistral_7b_instruct"},
            },
            "first_message": "Hi, I can see you've got a tax code notice from HMRC. What would you like to know?",
            "language": "en",
        },
        "tts": {"voice_id": os.environ["XI_VOICE_ID_ENGLISH"], "model_id": "eleven_flash_v2_5"},
        "asr": {"keywords": [
            "HMRC", "PAYE", "tax code", "coding notice", "Personal Allowance",
            "company car benefit", "P2", "P800", "tax-free amount", "K code",
        ]},
    }
    platform_settings = {
        "overrides": {
            "conversation_config_override": {
                "agent": {"prompt": {"prompt": True}, "first_message": True, "language": True},
                "tts": {"voice_id": True},
            },
        },
        "auth": {"enable_auth": True},
        "privacy": {"conversation_history_redaction": True},
    }
    return conversation_config, platform_settings


def find_agent_id(name: str) -> str | None:
    page = client.conversational_ai.agents.list(search=name)
    for a in page.agents:
        if a.name == name:
            return a.agent_id
    return None


def write_env(agent_id: str) -> None:
    lines = [l for l in ENV_PATH.read_text().splitlines() if not l.startswith("NEXT_PUBLIC_AGENT_ID=")]
    lines.append(f"NEXT_PUBLIC_AGENT_ID={agent_id}")
    ENV_PATH.write_text("\n".join(lines) + "\n")


def main() -> None:
    kb_docs = [reconcile_kb_doc(md) for md in sorted(GOVUK_DIR.glob("*.md"))]
    conversation_config, platform_settings = desired_config(kb_docs)

    agent_id = find_agent_id(AGENT_NAME)
    if agent_id:
        client.conversational_ai.agents.update(
            agent_id=agent_id,
            name=AGENT_NAME,
            conversation_config=conversation_config,
            platform_settings=platform_settings,
        )
        print(f"Agent updated: {agent_id}")
    else:
        agent = client.conversational_ai.agents.create(
            name=AGENT_NAME,
            conversation_config=conversation_config,
            platform_settings=platform_settings,
        )
        agent_id = agent.agent_id
        print(f"Agent created: {agent_id}")

    write_env(agent_id)


if __name__ == "__main__":
    main()
```

What "idempotent" buys you:

- **No duplicate agents.** Re-running the script finds the existing `Letter Explainer` and updates it in place. The `agent_id` (and the signed URLs your users hold) stay valid.
- **No duplicate KB docs.** Each doc is named with its content hash (`Tax Codes [a1b2c3d4]`); if the file content hasn't changed, the live document is reused. If it has, the stale version is deleted and a fresh one uploaded + re-indexed.
- **Config drift is auto-corrected.** Toggling something in the dashboard by mistake (or someone else changing it) is overwritten the next time the script runs — the script is the source of truth.
- **`NEXT_PUBLIC_AGENT_ID`** is rewritten on every run, so even if `.env.local` is out of date, one `make setup-agent` brings it back in line.

Run with `poetry run python backend/scripts/setup_eleven_agent.py`. First run creates everything; subsequent runs reconcile.

### 9. Test the full chain before you go further

```bash
curl -H "xi-api-key: $XI_API_KEY" \
  "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=$NEXT_PUBLIC_AGENT_ID"
```

You should get back `{ "signed_url": "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=...&signature=..." }`. If you don't, fix it now — every other piece depends on this returning a URL.

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

## The mock letter — where it comes from and how to demo it

The letter is **seeded data** — a row in local Postgres written by a SQL migration. Maria's P2 (the car-benefit error) is the primary fixture; the P800 is added on Day 2. There's no PDF parsing, no OCR, no upload flow — for the hackathon, the data model *is* the letter.

**The wording is researched, not invented.** Every heading, every standard sentence, every footer line in the rendered letter must come from a real HMRC P2 or P800 — the demo's credibility depends on a tax-literate judge looking at our letter and recognising it as the real thing. Only the *personalised* fields (name, NI number, employer, exact deduction amount) are fabricated. **Do this research step before writing the seed migration**, not after — because the data model needs to mirror the real letter's structure.

### 0. Research the real letter wording (do this first)

Goal: produce `backend/data/letter-samples/p2-verbatim-strings.md`, a file containing every authentic phrase the rendered letter will use, each with a citation to where it came from. Treat it as a small editorial exercise.

**Sources to use, in priority order:**

1. **GOV.UK published guidance pages** — `gov.uk/tax-codes/letters-about-your-tax-code` and `gov.uk/tax-overpayments-and-underpayments` describe what each letter contains and quote sample phrasing. Authoritative, OGL-licensed, safe to reuse verbatim.
2. **HMRC's accessible-format letter library** (`gov.uk/government/publications/...`) — HMRC publishes large-print and Welsh versions of standard letters; these are gold because they're *exactly* the issued wording transcribed into accessible text. Search `site:gov.uk P2 "tax code notice"` and `site:gov.uk P800 "tax calculation"`.
3. **Real letters posted on r/UKPersonalFinance and MoneySavingExpert forums.** People photograph their letters when asking for help. These are the **actual confusing letters in the wild**, including the *actual sentences citizens find confusing* — invaluable for picking the verbatim *confusing line* for the page highlight. (Scrub all PII before storing screenshots locally.)
4. **HMRC Annual Reports** and **Behavioural Insights Team papers** that include letter-wording case studies (the kind of "before / after" screenshots that show official letter samples).
5. **The Plain Numbers Approach pilots** with HMRC — published case studies that include both original and rewritten letter copy.
6. **Internal HMRC style guides** if any are published (`gov.uk/government/publications/...`) — they prescribe phrases like "We have included an adjustment to..." and the standard footer.

**What to extract, line-by-line:**

| Element | What to capture | Example (Maria's P2) |
|---|---|---|
| Letterhead | The exact masthead block: "HM Revenue & Customs", "PAYE Coding Notice", reference numbers | `HM Revenue & Customs / PAYE Coding Notice / Tax year 6 April 2026 to 5 April 2027` |
| Salutation pattern | The exact form of address | `Dear Ms Davies,` |
| Opening paragraph | The standard sentence that introduces a coding notice | `This notice tells you about the tax code we will use to work out the Income Tax taken from your pay or pension.` |
| The table heading | Verbatim wording of the "how we worked out" header | `How we worked out your tax-free amount` |
| Per-row line labels | Authentic labels: "Personal Allowance", "Car benefit", "Untaxed interest" — *not* invented synonyms | |
| **The confusing line** | The single hardest verbatim sentence — this is what the on-page oxblood highlight calls out | `We have included an adjustment to reduce your tax-free allowance by £3,740 so we can collect the tax in equal instalments.` |
| The "what to do if wrong" footer | The standard footer telling citizens how to correct the letter | `If you think your tax code is wrong, please contact us…` |
| Reference numbers / disclaimers | NI number formatting, "Keep this notice safe", the OGL/Crown copyright line | |

**What to fabricate (and only these):**

- Recipient name, address (London-area, plausible)
- NI number (use a clearly-fake test format like `QQ 12 34 56 C`; the GOV.UK convention `QQ123456C` is reserved for testing)
- Employer name (fictitious — `Bridgwater & Co Ltd`)
- The exact deduction amount (£3,740, chosen so 20% × £3,740 = £748/yr ≈ £62/mo lands cleanly in the demo narration)
- Letter ID and reference numbers

**Output of this step (commit to repo):**

```
backend/data/letter-samples/
├── SOURCES.md                # provenance + URLs for every phrase used
├── p2-verbatim-strings.md    # one phrase per line, with a [^source] footnote
├── p800-verbatim-strings.md  # same for the P800 (Day 2)
└── reference-screenshots/    # visual references (gitignored if PII; otherwise scrubbed)
```

`p2-verbatim-strings.md` then **drives the rendering template** — every literal string in `letters/[id]/preview/page.tsx` is imported from this file (or hard-coded but with a `// from: p2-verbatim-strings.md L42` comment). This makes the authenticity reviewable: a tax-literate judge can audit the letter against the source file and the cited URLs.

**Why this is non-negotiable for the demo:** the whole pitch is "the citizen got *this* letter and couldn't understand it". If the letter looks AI-generated, the entire premise collapses — judges see slop, not a real-world problem. Spend the 90 minutes on the research; it pays for itself the moment a judge nods at a phrase they recognise.

### 1. Seed the data

`supabase/migrations/<timestamp>_seed_demo_letters.sql` inserts one row per fixture letter, populating every field of the `P2Letter` model verbatim from the demo seed table earlier in this doc. `make db-reset` re-applies migrations + seeds, so the demo letter is recreated from scratch every time.

### 2. Render the letter as a Next.js page

`/letters/[id]/preview/page.tsx` (Server Component) is the **canonical rendered letter**. It:

- Fetches the row via `GET /letters/{id}` from FastAPI
- Renders a faithful HMRC P2 layout using the editorial-press tokens from `CLAUDE.md` (warm bone, soft-black ink, Newsreader serif body, hairline rules, the *confusing line* highlighted in oxblood)
- Composites a **server-generated QR image** in the bottom-right corner

The same template later exports to PDF and PNG; HTML stays the source of truth. Authentic HMRC headings + wording, fabricated names/figures (Maria Davies, fictitious NI number, demo employer).

### 3. The clickable-AND-scannable QR — one image, two entry points

The QR image is generated server-side by FastAPI (`GET /letters/{id}/qr.png`), encoding the URL `https://<demo-host>/l/{id}` (≤30 chars, error level Q, `border=4`). On the preview page, that image is wrapped in an `<a>`:

```tsx
// frontend/app/letters/[id]/preview/page.tsx (excerpt)
<a href={`/l/${letter.id}`} aria-label="Open this letter on a phone">
  <img
    src={`${env.NEXT_PUBLIC_API_URL}/letters/${letter.id}/qr.png`}
    alt="QR code — scan with your phone or click to open"
    width={180}
    height={180}
  />
</a>
```

Now the **same image** is both a real QR (camera apps see the URL) and a hyperlink (clicks/taps go to the same URL). Two entry points, one destination:

| How you trigger it | What happens | When you'd use this |
|---|---|---|
| **Click the QR** on `/letters/maria-p2/preview` | Same-origin navigation to `/l/maria-p2` | Local dev, laptop demos, screen-share, rehearsal |
| **Scan the QR** with a phone camera | Phone opens `https://demo.host/l/maria-p2` | The "I scanned the paper letter" beat on stage |

Both land on the existing `/l/[id]/page.tsx` and start the ElevenLabs conversation. There is no second code path; the live demo and the dev demo run through the same component.

### 4. Export to PDF/PNG when you want a printable

A small Playwright script screenshots the preview into a print-ready file. The QR stays a real scannable image in the PDF — it's the same `<img>`, just rasterised into a page.

```ts
// scripts/export-letter.ts (run with `pnpm tsx scripts/export-letter.ts maria-p2`)
import { chromium } from "playwright";

const id = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } }); // A4 @ 96dpi
await page.goto(`http://localhost:3000/letters/${id}/preview`);
await page.pdf({ path: `out/${id}.pdf`, format: "A4", printBackground: true });
await page.screenshot({ path: `out/${id}.png`, fullPage: true });
await browser.close();
```

`pnpm tsx scripts/export-letter.ts maria-p2` produces `out/maria-p2.pdf` and `out/maria-p2.png`. Print the PDF for the live scan; embed the PNG in the deck if you want a static visual.

### 5. The full demo flow, both modes

**Laptop demo (zero hardware):**

1. `make dev` — backend + frontend up
2. Open `http://localhost:3000/letters/maria-p2/preview`
3. Click the QR in the corner
4. Lands on `/l/maria-p2`, taps "Ask about this letter", talks to the agent

**Live stage demo:**

1. Beforehand: `pnpm tsx scripts/export-letter.ts maria-p2 && lpr out/maria-p2.pdf`
2. On stage: open the camera on the demo iPhone, scan the printed letter
3. Phone navigates to `https://demo.host/l/maria-p2`
4. Tap "Ask about this letter", talk to the agent

Same destination, same code, same conversation.

### 6. Why this design holds up

- **One source of truth** — the letter exists once, in Postgres. The HTML preview, the PDF, and the PNG are all derived. Update the row, regenerate the export.
- **Hackathon-friendly debug loop** — no need to print or scan during development. Click → conversation. The phone-and-paper version is something you only switch to when you're ready to rehearse.
- **No layout drift between dev and demo** — Playwright screenshots the *exact* component you've been iterating on. What you see in the browser is what prints.
- **The QR is honest** — it really is the URL it claims to be; the click handler isn't a JS short-circuit, it's a same-origin navigation that any phone scanner would also produce.

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
  - `override-language` = `en-GB` at session start; `cy` after the Welsh switch. **The page and agent open in English; the user switches by simply asking** ("Can you explain this in Welsh?" / *"Wnewch chi egluro hyn yn Gymraeg?"*). The agent calls a `switch_language` client tool, the page ends the current session and restarts it with the Welsh voice and the Welsh letter block. The switch is voice-driven (no on-page toggle) — that's the demo beat — but the implementation is a clean session-restart, not a mid-stream voice swap (which ElevenLabs doesn't support).
  - `override-voice-id` = `XI_VOICE_ID_ENGLISH` initially; `XI_VOICE_ID_WELSH` on the restarted Welsh session. Both voice IDs come from the env (`frontend/.env.local`).
  - `override-first-message` = a warm, letter-specific greeting ("I can see you've got a tax code notice from HMRC — what would you like to know?").
  - ⚠️ **Enable System prompt, First message, and Language overrides in the agent's Security tab** — they are **off by default and silently ignored otherwise.**
- **Privacy:** `conversation_history_redaction` on (redacts names, NI numbers from stored transcripts).
- **STT keyterms** (Scribe bias list, ≤50 terms): `HMRC, PAYE, tax code, coding notice, Personal Allowance, company car benefit, P2, P800, National Insurance, tax-free amount, Simple Assessment, K code, tax year`.
- **Pronunciation dictionary** (so the voice doesn't spell jargon badly): `PAYE → "pay as you earn"`, `HMRC → "H-M-R-C"`, `P800 → "P eight hundred"`, `883L → "eight eight three, L"`, `1257L → "one two five seven, L"`.
- **Voice:** a warm, natural UK voice (not the default robotic preset); Flash/Turbo TTS for low latency.
- **Languages to demo:** **English (`en-GB`) at start with `XI_VOICE_ID_ENGLISH`, Welsh (`cy`) on user request with `XI_VOICE_ID_WELSH`.** Voice is per-session in ElevenLabs, so the Welsh switch is implemented as a session-restart triggered by a `switch_language` client tool the agent calls when asked. This keeps the Welsh voice native (no English voice mispronouncing Welsh place-names). Both letter blocks (English + Welsh translation) are pre-built server-side and returned by `GET /letters/{id}`. Confirm both voices on the actual demo device — Welsh in particular needs a real-device check (TTS pronunciation of the Welsh forms of HMRC/PAYE in the pronunciation dictionary, plus Scribe's Welsh STT accuracy on the demo phrases).

---

## Web page — what the QR scan lands on

`/l/[letterId]/page.tsx` (Server Component) + `convai-leaf.tsx` (`"use client"`, React SDK):

- **Server fetch:** letter + grounding snippets from `GET /letters/{id}` via FastAPI (parallelised with `Promise.all` where independent — no waterfalls). The Server Component formats the letter into the plain-text `letterBlock` and passes it as a prop into `<ConvaiLeaf letterBlock={...} />`.
- **Letter render:** a faithful visual of the P2 at the top, with the **confusing line highlighted in the oxblood accent**, so the judge sees exactly what the citizen can't parse.
- **One big tap target — "Ask about this letter"** — calls `useConversation().startSession({ signedUrl, overrides })` (signed URL fetched from `/api/eleven/signed-url`, overrides include the letter block); mic permission requested on the tap (iOS requires a user gesture + HTTPS).
- **Live transcript panel** below the button:
  - **User turn:** rendered from `onMessage` events with `source: "user"` — appears as soon as Scribe finalises the utterance.
  - **Agent turn:** rendered from the `onAgentChatResponsePart` `delta` stream — text appears progressively as the agent speaks, ChatGPT-style.
  - **Word-level highlight:** `onAudioAlignment` returns character timings; we group into words and toggle a `.spoken` class as the audio cursor passes over each one. This is the visible "ElevenLabs is alive" beat.
- **Pre-populated prompt suggestions** (tap-to-ask chips that call `conv.sendUserMessage()` instead of going through the mic): *"What does my tax code mean?" · "Why did it change?" · "Is this correct?" · "What do I need to do?"*
- **Citation display:** as the agent answers, render GOV.UK source chips from `source_attribution` (`used_static_kb_document_ids` → the page title + a link to the live gov.uk page).
- **No language selector — the user switches by asking; the page restarts the session with the Welsh voice.** The page opens in English with `voiceId: XI_VOICE_ID_ENGLISH`. When the user says *"Can you explain this in Welsh?"* (or speaks Welsh directly), a client tool the agent calls (`switch_language(target: "cy")`) triggers the page to `endSession()` and `startSession()` again with `overrides.tts.voice_id = XI_VOICE_ID_WELSH`, `overrides.agent.language = "cy"`, and the **pre-translated Welsh letter block** in `overrides.agent.prompt.prompt`. The new session begins in the native Welsh voice from the first word — the English voice never attempts Welsh, so pronunciation stays clean. The **One Login** button (mocked) sits in the header for the "personalised actions" beat.
- **Action chips** appear below the agent's reply once the error-catch fires (see *Stub-action mock* below).
- **Styling:** editorial-press per `CLAUDE.md` — bone paper, soft-black ink, one oxblood accent, Familjen Grotesk + Newsreader, hairline rules, no AI-tell fonts/gradients/shadows. OGL attribution in the footer.

---

## Confusion heatmap

**Log per scan/question** (`POST /scan-events`, **no PII**): `letter_type`, `letter_section` (classify the question → which "hotspot": tax-code / adjustments / what-to-do / etc.), `language`, `resolved` (answered vs escalated to "call HMRC"), `session_seconds`, `timestamp`.

**Aggregate:** count questions per `letter_section` to reveal which parts of the letter generate the most confusion (HMRC's own research already predicts the **"adjustments" line** will dominate — the dashboard *proves* it from live usage).

**Dashboard shows:** a heatmap overlaid on the letter image (question density per section, hottest = oxblood), language distribution, a **"questions answered without a phone call"** counter (the failure-demand-deleted metric), and the top confusing phrases. This is the feedback-to-government story: *the product doesn't just help citizens, it tells HMRC which sentences to rewrite* — tying straight to the Behavioural Insights Team evidence that rewording a letter measurably changes behaviour.

---

## 2-day build sequence (demo-critical path done by end of Day 1)

**Day 1 — get the full QR → voice → grounded answer loop working end-to-end.**
- **AM (90 min before code)**
  - **Letter research**: produce `backend/data/letter-samples/p2-verbatim-strings.md` from real GOV.UK and forum sources (see *The mock letter — Step 0*). This pins down the exact wording the demo needs to look real.
- **AM (rest)**
  - Run the bootstrap script `setup_eleven_agent.py`: creates the ElevenLabs agent on Claude Sonnet 4.5, uploads + indexes the GOV.UK KB, enables all four overrides + auth, writes `NEXT_PUBLIC_AGENT_ID` back to `.env.local`.
  - Pull `tax-codes` + `tax-overpayments-and-underpayments` from the Content API into `backend/data/govuk/*.md`.
  - Define the `P2Letter` model + seed **Maria's letter** in FastAPI + Postgres migration, with every literal string traceable to `p2-verbatim-strings.md`.
- **PM**
  - Build `/letters/[id]/preview/page.tsx` (the rendered letter with the clickable QR) and `/l/[id]/page.tsx` (the conversation page using the React SDK).
  - Generate the **level-Q QR** (FastAPI `GET /letters/{id}/qr.png`); the same `<img>` is wrapped in an `<a>` so it's both clickable (laptop) and scannable (phone).
  - Run the Playwright export script to produce `out/maria-p2.pdf`; print one P2 to paper.
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
- **Stub-action mock — the auto-filled GOV.UK form:** when the agent finishes the error-catch, an **Action chip** ("Fix this in your tax account →") appears below its reply. Tapping it routes within our app to `/actions/update-company-car/[letterId]`, a Next.js page that is a **faithful clone of GOV.UK's "Update company car details" service** built with the **GOV.UK Design System** (`govuk-frontend` package — Crown black header, green "Start now" button, the exact heading hierarchy and `govuk-form-group` markup). It is *our* page, not a real GOV.UK page; the Crown logo is omitted (per OGL).
  - **Auto-fill behaviour:** the page is a single `"use client"` component with `useState` for each field. On mount, a `useEffect` reads the suspected-error payload from the URL (or fetches it from FastAPI) and **animates each field being typed in**, one character at a time, ~25 ms per character — registration plate, "date returned to employer", "P11D value", etc. This is the visible wow: the citizen watches the form fill itself. No real DOM-scraping or browser automation is needed because *we own the form* — it's our component, we just programmatically `setState` with a delay.
  - **Submit:** the green "Confirm and send" button routes to `/actions/update-company-car/[letterId]/confirmation`, a **GOV.UK Design System confirmation panel** with the green tick: *"Your details have been received. In production this would update your tax code with HMRC. No real change has been made."* — the honesty line stays so judges and any HMRC observer cannot misread the demo.
  - **Why this works for the demo:** it shows the end-to-end *citizen → agent → action → form filled → done* loop in 30 seconds without touching a real government system, and without flaky third-party browser automation. If you later want the **browser-agent flourish** (Playwright/Browserbase actually opening a real GOV.UK page in a side tab and visibly typing), that's a Day-2-PM stretch goal — write the stub form first; the real-page version is purely additive.
  - **Why this is *not* DOM-reading-and-filling on a real GOV.UK site:** the real Personal Tax Account requires a real HMRC Government Gateway login, sits behind multi-factor auth, and writes to a real taxpayer's record — none of which we have access to or should touch in a hackathon. The "auto-filled GOV.UK form" the audience sees is our page, styled identically using the official design system, with the honesty line.
- **Letter generation:** see *The mock letter* section above. A Next.js Server Component (`/letters/[id]/preview`) renders the seeded `P2Letter` row into a faithful HMRC layout with a server-generated QR composited in the corner. The QR is wrapped in an `<a href="/l/[id]">` so the same image is **both clickable** (laptop demos) **and scannable** (printed/phone demos). A Playwright script exports the same component to PDF/PNG when you need a printable.
- **Heatmap data:** seed `scan_events` with ~50 synthetic rows (weighted so "adjustments" is hottest) so the dashboard looks alive before the live demo adds to it.

---

## Environment variables — the complete `.env` for handoff

This is the **full inventory** of secrets and config the project needs. Two `.env` files: one in `frontend/`, one in `backend/`. Both are gitignored; commit `.env.example` versions only.

### `frontend/.env.local`

```bash
# --- ElevenLabs (Conversational AI) -----------------------------------------
# Server-only. Used by /api/eleven/signed-url to issue signed WebSocket URLs.
# NEVER prefix with NEXT_PUBLIC_ — that would ship the key to the browser.
XI_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Agent ID is safe to expose: a signed URL is required to actually connect.
# Written by backend/scripts/setup_eleven_agent.py on first run.
NEXT_PUBLIC_AGENT_ID=agent_xxxxxxxxxxxxxxxxxxxxxxxxxxx

# Two voices: native English for the default session, native Welsh for the
# session that's restarted when the user asks for Welsh. Pick voice IDs from
# the ElevenLabs voice library that natively support each language.
XI_VOICE_ID_ENGLISH=YCMgeo2Dvws6xwm7kQNN
XI_VOICE_ID_WELSH=73fZMjboCm1aBVyxTbBp

# --- FastAPI (the only data path) -------------------------------------------
# Where the browser calls our backend. Local: http://localhost:8000
NEXT_PUBLIC_API_URL=http://localhost:8000

# --- Supabase Auth (only used for One Login mock + future user accounts) ----
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5...

# --- One Login simulator (mocked auth) --------------------------------------
# Points at the local Docker container running ghcr.io/govuk-one-login/simulator
NEXT_PUBLIC_ONE_LOGIN_URL=http://localhost:3001
ONE_LOGIN_CLIENT_ID=demo-client
ONE_LOGIN_CLIENT_SECRET=demo-secret
```

### `backend/.env`

```bash
# --- Database (Supabase / local Postgres) -----------------------------------
# Local: postgresql://postgres:postgres@127.0.0.1:54322/postgres
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# --- Supabase (auth verification only — backend reads JWT, never a table) ---
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# --- ElevenLabs (only needed for backend KB sync, not for conversations) ----
# Used by POST /govuk/refresh to programmatically upload .md files to the KB.
# Optional: dashboard upload works fine for the hackathon.
XI_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# --- App config -------------------------------------------------------------
ENVIRONMENT=development
LOG_LEVEL=info
```

### What we explicitly do *not* need

- **No Anthropic API key.** Claude Sonnet 4.5 is selected natively in the ElevenLabs agent and billed by ElevenLabs.
- **No GOV.UK API key.** The Content API is unauthenticated (≤10 req/s rate limit; we batch at build time).
- **No HMRC credentials.** The action mock is our own GOV.UK-styled form; no real HMRC integration.
- **No separate STT or TTS keys.** Scribe (STT) and the TTS voice are inside the ElevenLabs agent, covered by the same `XI_API_KEY`.

### Where each key gets used (one-line audit)

| Key | Used by | Surface |
|---|---|---|
| `XI_API_KEY` (frontend) | `/api/eleven/signed-url` route handler | Server-only; issues signed WebSocket URLs to the React SDK. |
| `XI_API_KEY` (backend) | `POST /govuk/refresh` (KB upload script) | Build-time only; never hit during the live demo. |
| `NEXT_PUBLIC_AGENT_ID` | `convai-leaf.tsx` | Passed to the signed-URL endpoint; safe to ship to browser. |
| `XI_VOICE_ID_ENGLISH` | `setup_eleven_agent.py` (agent default voice) + `convai-leaf.tsx` (initial session override) | Voice for the English session. |
| `XI_VOICE_ID_WELSH` | `convai-leaf.tsx` (Welsh session restart) | Voice for the Welsh session, applied via `overrides.tts.voice_id` after the language switch. Needs `voice_id` override enabled in agent Security. |
| `NEXT_PUBLIC_API_URL` | All Server-Component fetches | The only frontend → backend boundary. |
| `DATABASE_URL` | `asyncpg` pool in FastAPI lifespan | Letters, scan_events tables. |
| `SUPABASE_JWT_SECRET` | FastAPI auth dependency | Verifies the JWT from the One Login flow / future logged-in users. |
| `ONE_LOGIN_CLIENT_*` | `/api/auth/one-login/callback` | OIDC handshake against the local simulator. |

### Operational checklist before Day 1 starts

- [ ] ElevenLabs account + API key in `frontend/.env.local` as `XI_API_KEY`.
- [ ] `XI_VOICE_ID_ENGLISH` and `XI_VOICE_ID_WELSH` chosen from the voice library (native UK English + native Welsh) and in `frontend/.env.local`.
- [ ] Agent created with Claude Sonnet 4.5, KB attached, **all four overrides (`prompt`, `first_message`, `language`, `voice_id`) + auth enabled in Security tab**.
- [ ] `NEXT_PUBLIC_AGENT_ID` populated (auto-written by the bootstrap script).
- [ ] Signed-URL `curl` returns a `wss://...&signature=...` URL.
- [ ] Local Postgres up (`make db-start`); `DATABASE_URL` works.
- [ ] One Login Docker simulator running on `:3001`.
- [ ] HTTPS deployment target ready (Vercel preview + a tunnel for the FastAPI side, or one host that does both).
- [ ] Demo iPhone: Safari mic permission tested on the actual deployed URL.

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
