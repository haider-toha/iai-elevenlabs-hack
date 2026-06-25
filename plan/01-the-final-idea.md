# Document 1 — The Final Idea

*One-page brief. Synthesised from 9 grounded research streams (ElevenLabs capabilities, GOV.UK APIs, confusion evidence, real letter content, integration path, One Login, QR, i.AI judging, domain ranking).*

---

## The chosen domain — HMRC P2 PAYE Coding Notice (with the P800 as the second letter)

**Why this, stress-tested against everything else.** It is the only candidate that wins on all four axes at once:

- **It has a deterministic, checkable formula.** A tax code is `Personal Allowance + additions − deductions`, last digit dropped. That means the app can do something no benefits or NHS letter allows: **read the formula back and catch a real error live on stage.** "HMRC thinks you still have a company car — your code is wrong and you're overpaying £62 a month" is concrete and verifiable. "It explained your benefits letter" is not.
- **The evidence is the government's own.** HMRC's own user research found **26%** couldn't understand the P800 "adjustments" section and **17%** would phone HMRC purely because they didn't understand a section; the P2 research found **42%** would call, **30%** of them if they suspected the code was wrong. The NAO found HMRC takes **38 million calls a year**, makes people wait **~23 minutes**, and that **72% of those calls are avoidable "failure demand"** (rising to 76% in 2024-25). The problem is quantified for us.
- **The integration is already real.** HMRC **already prints QR codes on ~36 letter types, including the P2**, pointing to GOV.UK guidance ([gov.uk verification page](https://www.gov.uk/guidance/check-if-a-qr-code-on-a-letter-youve-received-from-hmrc-is-genuine)). We are visibly *upgrading an existing government touchpoint*, not inventing a fictional one — a judge cannot object that it's implausible.
- **It carries the lowest political and liability risk.** Tax is universal and non-partisan. Explaining a coding formula is not regulated advice the way a benefits or immigration decision is. DWP/PIP has the single most powerful statistic in government (**66% of PIP appeals overturned at tribunal**) and the highest emotional charge — but explaining a benefits decision live at a *government* event is both a regulated-advice liability and a political landmine. **We keep DWP as the closing "this scales to the highest-stakes letters" slide, not the live demo.**

---

## The one-line pitch (say this before anything else)

> **"Forty million times a year, someone in Britain opens a government letter they can't understand — and picks up the phone. We turn the QR code already on that letter into a thirty-second conversation, in any language, that explains it — and catches the mistake."**

---

## The human story

**Maria is a care worker.** English is her second language. In March a brown envelope arrives: an HMRC PAYE Coding Notice. Her tax code has dropped from `1257L` to `883L`. The letter says this is because of an "adjustment" for a **company car benefit of £3,740** — a car she handed back to her old employer last year. She doesn't know what an "adjustment" is, can't tell the code is now wrong, and faces a choice: bin it (and quietly overpay tax every month for a year), or join a 23-minute phone queue she can't afford on a shift.

She scans the QR code in the corner of the letter. A page opens on her phone. She taps once and asks, **in her own language**, *"What does this mean?"* A calm voice answers in plain English: your tax code went down because HMRC believes you have a company car worth £3,740 a year, which adds about £62 a month in tax — **but if you gave that car back, this is wrong, and you're overpaying.** Here is the one thing to do, and here is the official GOV.UK page that says so.

She didn't read two pages of small print. She didn't call anyone. She understood her own letter in thirty seconds — and got £748 a year back.

---

## The three "oh" moments in the demo

1. **"Oh — it speaks her language."** The judge watches a question asked in Polish (or Urdu, or Romanian) get a fluent, natural spoken answer. This is the accessibility beat — and it lands directly on the **DSIT–ElevenLabs accessibility MoU signed 8 June 2026**, for exactly "people with low literacy or learning differences" and "linguistically diverse communities."
2. **"Oh — it caught the error."** The agent doesn't just summarise; it reads the deterministic formula and flags the stale company-car deduction with a pound figure: *"you're overpaying about £62 a month."* A machine catching a real mistake in a real government calculation. This is the beat people remember.
3. **"Oh — it's grounded, not guessing."** Every answer shows a GOV.UK source chip ("Source: GOV.UK — Tax codes: what your tax code means") via ElevenLabs' `source_attribution`, each linking to the live official page. The safety architecture — grounded, cited, "this is not formal tax advice" — is exactly what civil-service judges reward (it's what i.AI's own Caddy does, and what the consumer "photo-a-letter" demos skip).

---

## The efficient-government one-liner (why i.AI funds it)

> **"This is failure demand, deleted at source. HMRC fields 38 million calls a year, 72% of them avoidable, at a 23-minute wait — because people can't understand their letters. One reusable pattern, sitting behind a QR code the government already prints, turns the most confusing moment in citizen-state contact into a self-served answer — in any language — and feeds back a heatmap of exactly which sentences to rewrite."**

---

## What is real vs mocked (explicit and honest)

**Real (working in the demo):**
- The **ElevenLabs Conversational AI voice agent** — speech-to-text, reasoning, and natural spoken reply, with native multi-language detection.
- **Claude Sonnet 4.5** as the agent's brain (selectable natively inside ElevenLabs — no proxy).
- **Live GOV.UK grounding** — official guidance pulled from the GOV.UK Content API (no key) and loaded as the agent's knowledge base, with real source citations shown on screen.
- **The deterministic "we caught your error" check** — the tax-code formula is computed in our backend, not guessed by the model.
- **QR generation and scan** — a real printed letter, a real phone scan, a real HTTPS page.

**Mocked (and we say so on stage):**
- **The letters themselves.** Real P2/P800 letters contain real personal data we can't use, so we generate realistic demo letters (authentic section headings and wording, fabricated-but-plausible figures and names). The *structure and language are real*; the person is invented.
- **The action backends.** Updating a tax code or claiming a refund routes to a GOV.UK-styled "Start now" screen and stops — we don't write to HMRC.
- **Identity.** A GOV.UK-Design-System "Sign in with GOV.UK One Login" button backed by the **official One Login Docker simulator** (real integration needs a government email and a ~5-day onboarding — infeasible in 2 days). Note: One Login never exposes a National Insurance number, so we never claim it does.
- **The confusion heatmap** is seeded with synthetic scan data plus the live demo events.

---

### Key sources
- HMRC P800/P2 comprehension research (gov.uk); NAO *HMRC Customer Service* HC 726 (2024) — 38m calls, 23-min waits, 72% failure demand.
- HMRC QR codes on letters: https://www.gov.uk/guidance/check-if-a-qr-code-on-a-letter-youve-received-from-hmrc-is-genuine
- DSIT–ElevenLabs accessibility MoU (8 Jun 2026): https://elevenlabs.io/blog/uk-mou-and-expansion
- DWP closer stat — 66% of PIP appeals overturned at tribunal: gov.uk PIP official statistics (2025/26).
- GOV.UK content under Open Government Licence v3.0 (attribution required).
