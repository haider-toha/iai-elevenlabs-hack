// Inlined demo dataset. Replaces the FastAPI GET /letters/{id} path: the two
// letters are immutable fixtures (source: the former supabase seed migration),
// so they live as typed literals, not a fetched + Zod-parsed payload. Inline
// data is not a trust boundary, so there is no Zod here (per CLAUDE.md).

export type CodeLine = {
  label: string;
  amount: number; // signed: additions +, deductions −
  source_type: string;
  plain_english: string;
  govuk_anchor: string;
};

export type SuspectedError = {
  line_label: string;
  reason: string;
  est_annual_overpay: number;
  est_monthly_overpay: number;
  fix_action: string;
};

export type P2Letter = {
  type: "p2";
  id: string;
  recipient_name: string;
  nino_masked: string;
  tax_year: string;
  issue_date: string; // ISO date
  employer_name: string;
  current_code: string;
  standard_code: string;
  personal_allowance: number;
  lines: CodeLine[];
  tax_free_amount: number; // derived; negative → K code
  confusing_line: string;
  suspected_errors: SuspectedError[];
};

export type P800Letter = {
  type: "p800";
  id: string;
  recipient_name: string;
  nino_masked: string;
  p800_reference: string;
  tax_year: string;
  total_income: number;
  personal_allowance: number;
  tax_due: number;
  tax_paid: number;
  result: string; // "overpaid" | "underpaid"
  amount: number;
  claim_method: string;
  confusing_line: string;
};

export type Letter = P2Letter | P800Letter;

const LETTERS: Record<string, Letter> = {
  "maria-p2": {
    type: "p2",
    id: "maria-p2",
    recipient_name: "Ms Maria Davies",
    nino_masked: "QQ 12 34 ▒▒ C",
    tax_year: "2026 to 2027",
    issue_date: "2026-04-06",
    employer_name: "Bridgwater & Co Ltd",
    current_code: "883L",
    standard_code: "1257L",
    personal_allowance: 12570,
    confusing_line:
      "We have included an adjustment to reduce your tax-free allowance by £3,740 so we can collect the tax in equal instalments.",
    tax_free_amount: 8830,
    lines: [
      {
        label: "Personal Allowance",
        amount: 12570,
        source_type: "allowance",
        plain_english:
          "The amount you can earn each year before you pay any Income Tax.",
        govuk_anchor: "income-tax",
      },
      {
        label: "Car benefit",
        amount: -3740,
        source_type: "company_benefit",
        plain_english:
          "HMRC believes you get a company car. This lowers your tax-free amount, so more tax is collected from your pay.",
        govuk_anchor: "tax-company-benefits",
      },
    ],
    suspected_errors: [
      {
        line_label: "Car benefit",
        reason:
          "You told us you no longer have this company car — you returned it to your previous employer last year.",
        est_annual_overpay: 748,
        est_monthly_overpay: 62,
        fix_action:
          "Update your company car details in your Personal Tax Account so HMRC can correct your tax code.",
      },
    ],
  },
  "maria-p800": {
    type: "p800",
    id: "maria-p800",
    recipient_name: "Ms Maria Davies",
    nino_masked: "QQ 12 34 ▒▒ C",
    tax_year: "2025 to 2026",
    p800_reference: "P800-2026-0R4291",
    personal_allowance: 12570,
    total_income: 24800,
    tax_due: 2446,
    tax_paid: 3194,
    result: "overpaid",
    amount: 748,
    claim_method: "online bank transfer (5 working days) or cheque (6 weeks)",
    confusing_line:
      "Our calculation shows you paid too much tax because your tax code did not change when your company car benefit ended.",
  },
};

// A missing letter is a real state the caller renders as notFound(). Synchronous
// now that the data is local — callers must drop the `await`.
export function getLetter(id: string): Letter | null {
  return LETTERS[id] ?? null;
}
