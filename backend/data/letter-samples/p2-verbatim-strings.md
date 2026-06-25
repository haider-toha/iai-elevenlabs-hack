# P2 PAYE Coding Notice — verbatim strings

Every authentic phrase the rendered letter (`/letters/maria-p2/preview`) uses, with
provenance. This file is the **source of truth** for the literal strings in the
render template and the seed migration
(`supabase/migrations/20260625090200_seed_demo_letters.sql`). A tax-literate judge
should be able to audit the letter against this file and the URLs in `SOURCES.md`.

**Authenticity rule:** headings, standard sentences, and footer come from real HMRC
sources. Only personalised fields are fabricated — name, NI number, employer, the
exact deduction amount, and reference numbers. Fabricated values are marked
**[FABRICATED]**.

---

## Masthead / letterhead

| String | Verdict | Source |
|---|---|---|
| `HM Revenue & Customs` | Authentic — the department's name as it appears on correspondence. | [S1] |
| `PAYE Coding Notice` | Authentic — public-facing document title. HMRC's internal name for the same letter is the "P2" / "Notice of Coding". | [S5], [S6] |
| `For the tax year 6 April 2026 to 5 April 2027` | Authentic — GOV.UK expresses the tax year as "6 April 2026 to 5 April 2027". Stored as `tax_year = "2026 to 2027"`. | [S3] |

## Salutation

| String | Verdict | Source |
|---|---|---|
| `Dear Ms Davies` | Pattern authentic (`Dear <title> <surname>`); **[FABRICATED]** name. | — |

## Opening paragraph

| String | Verdict | Source |
|---|---|---|
| `This notice tells you about the tax code we will use to work out the Income Tax taken from your pay or pension.` | Close — a faithful notice-voice paraphrase of the canonical GOV.UK clause: *"Your tax code is used by your employer or pension provider to work out how much Income Tax to take from your pay or pension."* | [S1] |

## Table — "How we worked out your tax-free amount"

| String | Verdict | Source |
|---|---|---|
| `How we worked out your tax-free amount` | Authentic concept — "tax-free amount" is exactly HMRC's term; the notice shows the Personal Allowance entitlement and anything that reduces the tax-free amount. | [S5], [S6] |
| Row label `Personal Allowance` | Authentic — HMRC's exact label. | [S4], [S6] |
| Personal Allowance gloss: `The amount you can earn each year before you pay any Income Tax.` | Authentic in substance — GOV.UK: *"The standard Personal Allowance is £12,570, which is the amount of income you do not have to pay tax on."* HMRC note: *"This is the standard amount of taxable income most people can have before they start paying Income Tax."* | [S3], [S4] |
| Personal Allowance amount `£12,570` | Authentic — confirmed current standard Personal Allowance for tax year 6 April 2026 to 5 April 2027. | [S3] |
| Row label `Car benefit` | Authentic — standard HMRC label for a company-car taxable benefit that reduces the tax-free amount. | [S4] |
| Car benefit gloss: `HMRC believes you get a company car. This lowers your tax-free amount, so more tax is collected from your pay.` | Authentic in substance — HMRC note: *"This is given to you (or your family) to use privately… You pay tax based on the value of the company car."* | [S4] |
| Car benefit amount `−£3,740` | **[FABRICATED]** — chosen so 20% × £3,740 = £748/yr ≈ £62/mo lands cleanly in the demo. | — |
| `Tax-free amount` = `£8,830` → code `883L` | Derived (£12,570 − £3,740 = £8,830; drop last digit → 883, suffix L). The number is real arithmetic on a fabricated deduction. | [S2] |

## The confusing line (oxblood-highlighted beat)

| String | Verdict | Source |
|---|---|---|
| `We have included an adjustment to reduce your tax-free allowance by £3,740 so we can collect the tax in equal instalments.` | Close — the real HMRC PAYE-Manual template reads: *"We have therefore included an adjustment to reduce your tax-free allowance by £<amount> so we can collect the £<amount> tax in equal instalments."* We keep the orchestrator-fixed wording (rendered identically by the frontend); the amount is **[FABRICATED]**. HMRC's own research flags this exact "adjustments" sentence as the most-confusing hotspot — which is why it is the demo highlight. | [S4], [S6] |

## Tax-code explainer (for the agent / page copy)

| String | Verdict | Source |
|---|---|---|
| The tax-code number × 10 = your tax-free income for the year (1257 → £12,570). | Authentic. | [S2] |
| Suffix `L` = "You're entitled to the standard tax-free Personal Allowance." | Authentic — verbatim GOV.UK. | [S2] |
| A `K` code means deductions exceed the Personal Allowance (a negative tax-free amount). | Authentic — verbatim: *"Tax codes with a 'K' mean you have income or deductions which are higher than your tax-free Personal Allowance and are not already being taxed."* | [S7] |

## Footer

| String | Verdict | Source |
|---|---|---|
| `If you think your tax code is wrong, please contact us.` | Close — the notice asks customers to check their information is correct and contact HMRC if it is not; GOV.UK's plainer register is *"If you think your tax code is wrong, contact HMRC."* "please contact us" is acceptable in-letter (the letter addresses the reader directly). | [S5], [S6] |
| OGL attribution: `Contains public sector information licensed under the Open Government Licence v3.0.` | Authentic — verbatim official OGL v3.0 attribution statement. Show in the footer; do not reproduce Crown/HMRC logos. | [S8] |

## NI number

| String | Verdict | Source |
|---|---|---|
| `QQ 12 34 56 C` | Authentic test convention — the GOV.UK Design System recommends displaying a NI number as `QQ 12 34 56 C` (spaced) and using `QQ…` instead of a real number, because `Q` is not a valid real first-prefix letter. | [S9] |

---

## Fabricated fields (and only these)

| Field | Value | Why |
|---|---|---|
| Recipient name | `Ms Maria Davies` | Plausible, London-area persona. |
| NI number | `QQ 12 34 56 C` | GOV.UK reserved test value, official spaced display format. |
| Employer | `Bridgwater & Co Ltd` | Fictitious. |
| Car-benefit deduction | `£3,740` | 20% × £3,740 = £748/yr ≈ £62/mo — clean demo figures. |
| Letter id / references | `maria-p2` | Readable slug, encoded in the QR (`/l/maria-p2`). |

## P800 fixture (`maria-p800`) — figures **[FABRICATED]**, framing authentic

GOV.UK calls it a *"tax calculation letter (also known as a P800)"*, sent *"If
you've paid too much or too little tax by the end of the tax year (5 April)."*
Refund timings are verbatim: *"5 working days if you've claimed online"* and
*"6 weeks if you've asked HMRC to send you a cheque."* All figures
(`total_income`, `tax_due`, `tax_paid`, `amount`, reference) are fabricated; the
£748 overpayment deliberately mirrors what the P2 error would over-collect in a
year. Sources: [S10], [S11].
