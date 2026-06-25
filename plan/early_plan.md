# The Talking Letter — Technical Build Doc

*A government letter you can scan to make it read, explain, and answer questions about itself — in plain English, any language, grounded in GOV.UK. Inspired by the self-reading letters in Harry Potter; it's 2026, so we just build it.*

Working names: **Plain Letter**, **Speak Easy**, **The Talking Envelope**, **Decoder**.

---

## 0. The one-paragraph thesis

People don't call HMRC because they're stupid — they call because the letter is unreadable. The letter is the bug; the call is the crash report. HMRC's *own* user research proves it: on the P800 tax-calculation letter, specific sections ("hotspots") were found difficult to understand by up to ~26% of people, and ~17% said they would call HMRC purely because they couldn't understand a section. So instead of building yet another call-handling bot (the queue), we kill the confusion at its source (the letter). And the scan data hands government a ranked "fix these letters" list — the purest *efficient-government* deliverable.

---

## 1. Questions we must answer (and the answers)

### Q1. Which letters do we target first? Which are easiest / highest impact?

Target HMRC PAYE letters first. They're high-volume, formulaic, scary, and the math is deterministic (so we can sanity-check, not just paraphrase). Priority order:

| Letter | What it is | Volume | Why it's a good first target |
|---|---|---|---|
| **P2 — Coding Notice** | Explains how your tax code was calculated | HMRC issues ~20M PAYE codes/year | **Best starting point.** Fully deterministic formula → we can *verify* it, not just read it. Errors are common and cost real money. |
| **P800 — Tax Calculation** | End-of-year reconciliation: under/overpaid | ~3.5M overpayment P800s in a recent year | HMRC has already published which sections confuse people (free heatmap seed). Triggers refund-claim action. |
| **PA302 — Simple Assessment** | A tax bill for people not in Self Assessment | Common for pensioners | Hard payment deadline (31 Jan) → deadline-reminder value. |
| **SA250 / "Welcome to Self Assessment"**, **SA316** (notice to file), **SA300/SA302** | Self Assessment prompts & calculations | Millions of SA taxpayers | Deadlines + jargon (UTR, payments on account). |

Avoid for v1: compliance-check / enquiry letters (SA315/SA316 determinations, investigations) — high stakes, legal nuance, wrong answer = harm. Explicitly out of scope; hand those to a human.

**Why P2 is the demo hero:** the tax-code formula is public and simple:
```
Net allowance = Personal Allowance (£12,570 for 2025/26)
              + additions (e.g. Marriage Allowance received)
              − deductions (company car BIK, medical insurance BIK,
                            prior-year underpayment "coded out", etc.)
Tax code   = floor(Net allowance ÷ 10) + suffix letter
             (K prefix instead of suffix if Net allowance is negative)
```
So `1257L` ⇒ £12,570 allowance. If someone's P2 shows `1100L` but they have no deductions, we can say with confidence: *"that looks too low — you may be overpaying."* That's the moment that lands: the letter doesn't just read itself, it **catches its own error.**

### Q2. How does scanning a QR code map to "this specific letter"?

A QR code just encodes a URL. The intelligence is what's behind the URL.

- **Production model:** when HMRC generates a letter, it embeds a QR encoding `https://app.example/l/{letterId}` where `letterId` resolves to that letter's *structured data* (letter type, tax year, the person's tax code, the figures, the deadline). The agent then explains *this* letter, from data we already hold — which keeps hallucination low because most of the answer is retrieval of known fields, not generation.
- **Two flavours:**
  - *Static QR* → fixed URL, content looked up server-side by ID. Simplest; what you want.
  - *Dynamic QR* → the URL is a redirector you control, so you can change the destination later, expire links, and log scans without reprinting. Slightly more infra; nice-to-have.
- **Auth/PII reality:** a real letter contains personal tax data, so production needs the citizen to authenticate (GOV.UK One Login) before the agent reveals figures. The QR opens the page; One Login gates the sensitive content. **For the hackathon, skip real auth** — hard-code 2–3 demo letters behind demo IDs.

### Q3. How do we generate the QR codes?

Trivially, with a library — no external service needed.

- **Libraries:** `qrcode` (Python) or `qrcode` / `qr-code-styling` (JS). Generate a PNG/SVG from the URL string in one call.
- **Print-quality settings that matter** (so it scans off paper):
  - **Error-correction level Q or H** (~25–30% recovery) — survives a folded/coffee-stained letter. (Levels are L/M/Q/H.)
  - **Quiet zone** ≥ 4 modules of white border.
  - Minimum physical size ≈ 2×2 cm at typical print DPI; keep good contrast (dark on light).
  - Keep the URL short (use a redirector/short ID) → lower QR density → easier scan.
- **No app needed:** modern iOS/Android cameras scan QR natively and open the URL in the browser. That's why the front end is a **web page with an embedded voice widget**, not an app to install — critical for reach (elderly, low-tech users).

### Q4. How do we keep answers accurate and grounded (not hallucinated)? *(the question a judge WILL ask)*

Three layers:

1. **The letter is the primary source.** Most questions ("what does *this* say / what do I owe / by when") are answered from the letter's structured fields we already hold. Low generation, low risk.

2. **GOV.UK as the grounding corpus** for the "what does this mean / what do I do" questions. GOV.UK exposes **public, no-auth APIs**:
   - **Content API** — `https://www.gov.uk/api/content/{path}` returns the exact published page content as structured JSON (e.g. `…/api/content/tax-codes`). No key, HTTPS, ~10 req/sec limit. This is the clean way to pull official guidance text instead of scraping.
   - **Search API** — `https://www.gov.uk/api/search.json?q=tax+code&fields=title,description,link` to find the right pages, with `filter_organisations=hm-revenue-customs` to scope to HMRC. Returns up to 1,000 results.
   - We pull the relevant HMRC pages (tax codes, P800, Simple Assessment, Time to Pay), store them as the agent's **knowledge base**, and ground every answer with citations back to the source GOV.UK page.

3. **This is the government's own accepted pattern.** GOV.UK Chat (live since May 2026, built on Claude) already gives "conversational answers grounded in official government information with direct links back to source guidance." We're applying the *same* grounding approach — just triggered by the letter, delivered as voice, in any language. Framing it this way largely defuses the "is it safe?" objection.

**Scope guardrail:** resolvable/factual → agent answers; complex/high-stakes/contested → clean handoff with the letter context attached, never a guess. Use the platform's content guardrails + the `hallucination_kb` eval metric (below) to enforce it.

### Q5. Which ElevenLabs APIs do we use, and for what *specifically*?

This is the part that makes it an audio-stack project, not a TTS demo. Mapping capability → job (all current as of 2026):

- **ElevenAgents (Conversational AI)** — the spine. The letter is an *agent* you interrogate ("what if I can't pay by then?"), not a recording. Build via the visual workflow builder or API; embed on web with the **`@elevenlabs/convai-widget-embed`** drop-in widget. **Bring-your-own-LLM** supported (GPT/Claude/Gemini) — run it on **Claude** to mirror GOV.UK Chat.
- **Knowledge Base + RAG** — toggle **Use RAG** in agent settings; for a small GOV.UK slice you can even **direct-inject** (a few pages ≈ a few-thousand tokens is faster than RAG; RAG adds ~250ms and is for big corpora). Non-enterprise KB limit ~20MB / 300k chars — plenty. There's a built-in **`search_documentation`** system tool and **multi-source RAG** config.
- **`source_attribution`** (config boolean) + **`used_static_kb_document_*`** metadata — makes the agent **report which GOV.UK sources it used** → on-screen citations. This is your accuracy proof on stage.
- **`hallucination_kb` eval metric** — measures whether the agent stuck to the knowledge base. Cite this when asked "how do you know it's not making things up?"
- **TTS v3 (audio tags, 70+ languages)** — read the letter in a **calm, reassuring tone** (direct delivery so a scary "you owe us" letter isn't read like a threat). Tone control is a real feature.
- **Pronunciation Dictionaries** (phoneme rules: `string_to_replace`/`phoneme`/`alphabet`) — force correct pronunciation of `PAYE`, `UTR`, `P800`, `1257L`, reference numbers. The difference between a toy and something credible.
- **Scribe v2 Realtime (STT)** — the citizen *speaks* their question in their own language; ~150ms latency, 90+ languages. Use **`keyterms`** to bias recognition toward tax jargon and **`noVerbatim`** to strip filler/disfluency. Pair with the agent's turn-taking model (handles pauses/interruptions) — vital for elderly/distressed users.
- **Language-detection system tool** — auto-detects the user's language and switches. Plus **mid-conversation voice switching** → offer **familiar accents** (Glaswegian, British-Asian, etc.), not just languages. People trust and parse a voice that sounds like their community — call this out as a deliberate design choice.
- **Voice Isolator (audio isolation)** — clean the incoming audio (bad line, kitchen radio) so Scribe actually understands them.
- **Dubbing v2** (optional, for outbound explainer videos) — as of May 2026 it **carries the original speaker's emotion across every language**; one "what a P800 means" video → every community language with consistent tone.
- **AI Speech Classifier** (the trust twist) — anyone can verify audio was generated by ElevenLabs. Given rampant fake-HMRC scams, an *official* talking letter that's **verifiable** turns a deepfake risk into a trust feature.
- **Tools (webhook / client / system / MCP)** — let the agent take real action mid-call: flag the suspect tax code, trigger the refund-claim flow, set a deadline reminder. `pre_tool_speech` lets it say "let me check that…" before a slow call.
- **Privacy/sovereignty** — **`conversation_history_redaction`** strips names/emails/PII from stored transcripts/audio; **EU data residency** + **zero-retention** modes. This is your answer for "you're handling people's tax data" and ticks the *Sovereign* theme.

### Q6. What's the data exhaust / moat?

Every scan is a signal: *which letter, which paragraph people ask about, in which language, where it dead-ends.* The platform gives you the raw material — conversation analytics, **conversation transcript text-search & semantic-search endpoints**, and a `GET /v1/convai/users` list. Aggregate into a **"confusion heatmap"**: a ranked list of which letters (and which *lines*) generate the most "help me" scans.

The product isn't just the talking letter — it's the **feedback loop that tells government which letters to rewrite.** "Fix these 3 letters → delete this much demand permanently." No call-handling team will have this, and it's the deliverable i.AI actually funds. (Bonus: HMRC's published P800 hotspot research pre-seeds it with real data.)

### Q7. Where's the wow, beyond "a chatbot that talks"?

Two beats:
1. **Self-catching error:** the letter reads itself, then says *"…but that tax code looks too low for your situation — want me to query it?"* Paper that audits itself.
2. **The heatmap reveal:** zoom out from one letter to *"here are the 3 letters confusing the whole country, ranked — rewrite these."* That's the efficiency punchline.

---

## 2. Architecture

```
[Paper letter w/ QR]
      │  scan (native phone camera)
      ▼
[Web page] ──(embed)──► [ElevenAgents widget]
      │                        │
      │  letterId              ├─ Scribe v2 Realtime (STT, keyterms, noVerbatim)
      ▼                        ├─ LLM (Claude) + Knowledge Base/RAG
[Letter service] ◄────────────┤      └─ source_attribution → citations
  - structured fields         ├─ TTS v3 (calm tone, accent/lang, pronunciation dict)
  - tax-code sanity check ─────┤─ Tools (webhook/MCP): flag code, claim refund, set reminder
      │                        └─ Voice Isolator on inbound audio
      ▼
[GOV.UK grounding]            [Analytics/transcripts] ──► [Confusion Heatmap dashboard]
  - Content API /api/content/{path}
  - Search API /api/search.json (filter_organisations=hm-revenue-customs)
```

**Suggested stack:** Next.js/React front end + ElevenLabs convai widget · ElevenLabs Agents (LLM = Claude) · Scribe v2 Realtime · TTS v3 + pronunciation dictionary · a tiny "letter service" (the structured demo letters + the PAYE sanity-check math) · a script that pulls ~6–10 HMRC GOV.UK pages via the Content/Search API into the agent's knowledge base · a simple dashboard for the heatmap. (Add Twilio only if you also want a phone-in path; for scan-and-talk, in-browser is cleaner.)

SDKs available: JavaScript/TypeScript, Python, Swift, React, React Native. Docs are LLM-friendly — append `/llms.txt` or `.md` to any ElevenLabs docs URL.

---

## 3. The 2-day build plan (real vs mocked)

**Build for real (this is where credibility lives):**
- The conversational **letter-agent**: Scribe Realtime (voice in) + Claude + KB-grounded answers + TTS v3 (voice out), embedded on a web page.
- **GOV.UK grounding**: pull ~6–10 real HMRC pages (tax codes, P800, Simple Assessment, Time to Pay, claim-a-refund) via Content/Search API → agent knowledge base → answers cite the source page.
- **P2 tax-code sanity check** — genuinely real (the formula above). This powers the self-catching-error moment.
- **Multi-language + 2–3 accents**, with a **pronunciation dictionary** for PAYE/UTR/P800/codes.
- **Confusion-heatmap dashboard** — seed with your demo scans + a little synthetic volume + HMRC's published hotspot data.

**Mock / stub (don't sink time here):**
- **QR → letter lookup**: hard-code 2–3 real letter types behind demo IDs (use real anonymised letter layouts).
- **Auth (One Login)**: skip; assume the demo user is verified.
- **Action backends** (query-code / claim-refund): stub with a convincing confirmation ("I've flagged this with HMRC — you'll get a reference by email").
- **Letter *generation*** side (gov prints the QR in production): just show a pre-made letter with a QR.

---

## 4. Demo script (~3 min; every beat is a different "oh")

1. Hold up a real, baffling **P2 / P800** letter. *(relatable groan)*
2. **Scan the QR** with a normal phone. The page opens; the letter **speaks**, calm and plain: *"This says your tax code is changing to 1100L in April. For your situation that looks too low — you'd overpay. Want me to query it?"* *(talking-paper "oh")*
3. **Switch language live** — same letter, now Urdu, in a familiar accent. *(inclusion "oh")*
4. **Speak a question back** — "what if I can't pay by the deadline?" — it answers, grounded, **with a GOV.UK citation on screen**, and offers to set up Time to Pay + a reminder. *(it-actually-helps "oh")*
5. Zoom to the **dashboard**: *"Across 1,000 letters, here are the 3 that confuse people most, ranked by scan-for-help rate — rewrite these and demand drops X%."* *(efficient-government "oh" — the one judges fund)*

**One-liner:** *"Every team here is answering the call. We made the letter explain itself — in any language, grounded in GOV.UK — and we tell government which letters to bin."*

---

## 5. Risks & how to pre-empt them on stage

- **"How do you stop it lying about taxes?"** → Letter fields are primary source; "what it means" is RAG-grounded on GOV.UK with citations (`source_attribution`); `hallucination_kb` metric enforces it; out-of-scope/high-stakes → human handoff. Same pattern GOV.UK Chat already ships.
- **"It's handling personal tax data."** → One Login gate in production; `conversation_history_redaction`, EU data residency, zero-retention. (Sovereign theme box ticked.)
- **Scary-letter tone** → show the deliberately calm delivery; mention you can detect distress and shorten/soften responses.
- **Scams** (fake-HMRC is rampant, 200k+ reports/year) → the **AI Speech Classifier** watermark lets a citizen verify the official assistant; a talking official letter can't be cleanly spoofed.
- **Accessibility/reach** → no app to install (native camera + web), voice-first for low-literacy, languages + familiar accents for non-native speakers — i.e., it reaches the exact population the phone-line/app can't.

---

## 6. Optional extensions (only if you have spare hours)

- **Deadline guardian** — agent offers to set a reminder/callback before the letter's deadline → kills the downstream *enforcement* cost, not just the confusion call.
- **"Explain like I'm worried"** — detect distress in the voice, switch to shorter/calmer responses (TTS v3 emotional control + agent tone).
- **Carer mode** — let an authorised family member scan and hear it on the person's behalf (the under-served "acting for someone else" population).

---

## 7. Key facts / sources to keep in your back pocket

- HMRC P800 user research found specific letter sections confuse up to ~26% of people; ~17% would call purely due to not understanding a section. (HMRC/Crown Copyright research.)
- HMRC issues ~20M PAYE codes/year; ~3.5M overpayment P800s in a recent year.
- Tax-code formula is public and deterministic (P2 breakdown) → enables real sanity-checking.
- GOV.UK Content API (`/api/content/{path}`) and Search API (`/api/search.json`) are public, no-auth, JSON.
- GOV.UK Chat (live May 2026, Claude-based) already grounds answers in official guidance with source links — the precedent that de-risks our approach.
- ElevenLabs primitives used: Agents + RAG/KB, `source_attribution`, `hallucination_kb`, TTS v3, Pronunciation Dictionaries, Scribe v2 Realtime (`keyterms`/`noVerbatim`), language-detection tool, Voice Isolator, Dubbing v2, AI Speech Classifier, tools (webhook/MCP), `conversation_history_redaction` + EU residency/zero-retention.