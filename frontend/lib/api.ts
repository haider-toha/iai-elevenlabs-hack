import { z } from "zod";

import { env } from "@/lib/env";

const healthSchema = z.object({
  status: z.string(),
  service: z.string(),
});

export type Health = { online: true; service: string } | { online: false };

// The backend being down is a real, expected state — model it, don't throw.
export async function getHealth(): Promise<Health> {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/health`, {
      cache: "no-store",
    });
    if (!res.ok) return { online: false };
    const data = healthSchema.parse(await res.json());
    return { online: true, service: data.service };
  } catch {
    return { online: false };
  }
}

// Money crosses the FastAPI boundary as a JSON-serialised Decimal — number from
// jsonable_encoder, but a string under some serialisers. coerce to number once
// here so every component downstream treats it as a number.
const money = z.coerce.number();

const codeLineSchema = z.object({
  label: z.string(),
  amount: money, // signed: additions +, deductions −
  source_type: z.string(),
  plain_english: z.string(),
  govuk_anchor: z.string(),
});

const suspectedErrorSchema = z.object({
  line_label: z.string(),
  reason: z.string(),
  est_annual_overpay: money,
  est_monthly_overpay: money,
  fix_action: z.string(),
});

const p2Schema = z.object({
  type: z.literal("p2"),
  id: z.string(),
  recipient_name: z.string(),
  nino_masked: z.string(),
  tax_year: z.string(),
  issue_date: z.string(), // ISO date from the backend `date` field
  employer_name: z.string(),
  current_code: z.string(),
  standard_code: z.string(),
  personal_allowance: money,
  lines: z.array(codeLineSchema),
  tax_free_amount: money, // derived; negative → K code
  confusing_line: z.string(),
  suspected_errors: z.array(suspectedErrorSchema),
});

const p800Schema = z.object({
  type: z.literal("p800"),
  id: z.string(),
  recipient_name: z.string(),
  nino_masked: z.string(),
  p800_reference: z.string(),
  tax_year: z.string(),
  total_income: money,
  personal_allowance: money,
  tax_due: money,
  tax_paid: money,
  result: z.string(), // "overpaid" | "underpaid"
  amount: money,
  claim_method: z.string(),
  confusing_line: z.string(),
});

const letterSchema = z.discriminatedUnion("type", [p2Schema, p800Schema]);

export type P2Letter = z.infer<typeof p2Schema>;
export type P800Letter = z.infer<typeof p800Schema>;
export type Letter = z.infer<typeof letterSchema>;
export type CodeLine = z.infer<typeof codeLineSchema>;
export type SuspectedError = z.infer<typeof suspectedErrorSchema>;

// A missing letter is a real state (404) the caller renders as notFound(), not a
// thrown error. Any other non-OK status is a genuine fault and should throw.
export async function getLetter(id: string): Promise<Letter | null> {
  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/letters/${id}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getLetter ${id} failed: ${res.status}`);
  return letterSchema.parse(await res.json());
}
