import type { Letter, P2Letter } from "@/lib/letters";

// Pounds, no pence on whole amounts, and no thousands separator — HMRC coding
// notices print whole pounds as a bare run of digits (e.g. "£10600", "£18044").
const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
  useGrouping: false,
});

export function poundsSigned(amount: number): string {
  const sign = amount < 0 ? "−" : "+"; // U+2212 minus, not hyphen
  return `${sign}${gbp.format(Math.abs(amount))}`;
}

export function pounds(amount: number): string {
  return gbp.format(Math.abs(amount));
}

// "2026-01-06" → "January 2026". HMRC P2 notices are dated by month, not day.
export function monthYear(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

// The compact plain-text block injected into the agent's system prompt at
// session start. It carries every CodeLine with its plain-english gloss, the
// derived tax-free amount + code, and — crucially — the pre-computed suspected
// errors so "is this right?" surfaces the audited pound figure rather than the
// model improvising one.
export function buildLetterBlock(letter: Letter): string {
  if (letter.type === "p800") return buildP800Block(letter);
  return buildP2Block(letter);
}

function buildP2Block(letter: P2Letter): string {
  const lines = letter.lines
    .map(
      (l) =>
        `- ${l.label}: ${poundsSigned(l.amount)} — ${l.plain_english} (see GOV.UK: ${l.govuk_anchor})`,
    )
    .join("\n");

  const errors =
    letter.suspected_errors.length > 0
      ? letter.suspected_errors
          .map(
            (e) =>
              `- ${e.line_label}: ${e.reason}. Estimated overpayment about ${pounds(e.est_annual_overpay)} a year (about ${pounds(e.est_monthly_overpay)} a month). To fix: ${e.fix_action}.`,
          )
          .join("\n")
      : "None detected.";

  return [
    `This is a PAYE Coding Notice (form P2) for ${letter.recipient_name}, tax year ${letter.tax_year}.`,
    `Their employer or pension provider is ${letter.employer_name}. National Insurance number on the letter: ${letter.nino_masked}.`,
    ``,
    `How the tax-free amount was worked out:`,
    lines,
    ``,
    `Tax-free amount: ${pounds(letter.tax_free_amount)}, giving the tax code ${letter.current_code}. With no deductions the code would be ${letter.standard_code}.`,
    ``,
    `Background only — do not raise this yourself. If they ask about a particular sentence in the letter, the one people most often find confusing is, verbatim: "${letter.confusing_line}"`,
    ``,
    `Audit result (computed, authoritative — never recompute or invent these figures):`,
    errors,
  ].join("\n");
}

// Welsh translation of the same block, for the session restarted in Welsh. The
// figures and tax-code labels are kept; the surrounding prose is translated so
// the Welsh-speaking citizen hears their letter explained in Welsh from the
// first word. The confusing line is kept verbatim in English (it is the real
// English sentence on their letter) with a Welsh lead-in.
export function buildLetterBlockWelsh(letter: Letter): string {
  if (letter.type === "p800") return buildP800BlockWelsh(letter);
  return buildP2BlockWelsh(letter);
}

function buildP2BlockWelsh(letter: P2Letter): string {
  const lines = letter.lines
    .map(
      (l) =>
        `- ${l.label}: ${poundsSigned(l.amount)} — ${l.plain_english} (gweler GOV.UK: ${l.govuk_anchor})`,
    )
    .join("\n");

  const errors =
    letter.suspected_errors.length > 0
      ? letter.suspected_errors
          .map(
            (e) =>
              `- ${e.line_label}: ${e.reason}. Amcangyfrif o ordaliad o tua ${pounds(e.est_annual_overpay)} y flwyddyn (tua ${pounds(e.est_monthly_overpay)} y mis). I'w gywiro: ${e.fix_action}.`,
          )
          .join("\n")
      : "Dim wedi'i ganfod.";

  return [
    `Hysbysiad Cod Treth TWE (ffurflen P2) yw hwn ar gyfer ${letter.recipient_name}, blwyddyn dreth ${letter.tax_year}.`,
    `Eu cyflogwr neu ddarparwr pensiwn yw ${letter.employer_name}. Rhif Yswiriant Gwladol ar y llythyr: ${letter.nino_masked}.`,
    ``,
    `Sut y cyfrifwyd y swm di-dreth:`,
    lines,
    ``,
    `Swm di-dreth: ${pounds(letter.tax_free_amount)}, sy'n rhoi'r cod treth ${letter.current_code}. Heb unrhyw ddidyniadau byddai'r cod yn ${letter.standard_code}.`,
    ``,
    `Cefndir yn unig — peidiwch â chodi hyn eich hun. Os ydyn nhw'n gofyn am frawddeg benodol yn y llythyr, dyma'r un y mae pobl amlaf yn ei chael yn ddryslyd, air am air (yn Saesneg ar y llythyr): "${letter.confusing_line}"`,
    ``,
    `Canlyniad yr archwiliad (wedi'i gyfrifo, awdurdodol — peidiwch byth ag ailgyfrifo na dyfeisio'r ffigurau hyn):`,
    errors,
  ].join("\n");
}

function buildP800BlockWelsh(
  letter: Extract<Letter, { type: "p800" }>,
): string {
  return [
    `Cyfrifiad treth P800 yw hwn ar gyfer ${letter.recipient_name}, blwyddyn dreth ${letter.tax_year}. Cyfeirnod ${letter.p800_reference}. Rhif Yswiriant Gwladol ar y llythyr: ${letter.nino_masked}.`,
    ``,
    `Cyfanswm incwm: ${pounds(letter.total_income)}. Lwfans Personol: ${pounds(letter.personal_allowance)}.`,
    `Treth sy'n ddyledus: ${pounds(letter.tax_due)}. Treth a dalwyd mewn gwirionedd: ${pounds(letter.tax_paid)}.`,
    `Canlyniad: ${letter.result} o ${pounds(letter.amount)}.`,
    `Sut i hawlio neu dalu: ${letter.claim_method}.`,
    ``,
    `Cefndir yn unig — peidiwch â chodi hyn eich hun. Os ydyn nhw'n gofyn am frawddeg benodol yn y llythyr, dyma'r un y mae pobl amlaf yn ei chael yn ddryslyd, air am air (yn Saesneg ar y llythyr): "${letter.confusing_line}"`,
  ].join("\n");
}

function buildP800Block(letter: Extract<Letter, { type: "p800" }>): string {
  return [
    `This is a P800 tax calculation for ${letter.recipient_name}, tax year ${letter.tax_year}. Reference ${letter.p800_reference}. National Insurance number on the letter: ${letter.nino_masked}.`,
    ``,
    `Total income: ${pounds(letter.total_income)}. Personal Allowance: ${pounds(letter.personal_allowance)}.`,
    `Tax due: ${pounds(letter.tax_due)}. Tax actually paid: ${pounds(letter.tax_paid)}.`,
    `Result: ${letter.result} by ${pounds(letter.amount)}.`,
    `How to claim or pay: ${letter.claim_method}.`,
    ``,
    `Background only — do not raise this yourself. If they ask about a particular sentence in the letter, the one people most often find confusing is, verbatim: "${letter.confusing_line}"`,
  ].join("\n");
}
