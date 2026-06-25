-- Migration: seed_demo_letters
-- One logical change: seed the two demo letters + ~50 confusion-heatmap events.
--
-- AUTHENTIC HMRC strings only — every literal here is traceable to GOV.UK / the
-- HMRC PAYE Manual (see backend/data/letter-samples/p2-verbatim-strings.md).
-- Only personalised fields are fabricated (name, NI number, employer, amounts).
-- `make db-reset` drops everything first, so plain inserts suffice; the
-- on conflict / not exists guards keep a re-applied migration clean anyway.

begin;

-- Maria's P2 — the error-catch fixture. Tax-free amount £8,830 → code 883L,
-- because a stale £3,740 car-benefit deduction was never removed (standard 1257L).
insert into public.letters (
  id, type,
  recipient_name, nino_masked, tax_year, personal_allowance, confusing_line,
  issue_date, employer_name, current_code, standard_code,
  lines, tax_free_amount, suspected_errors
) values (
  'maria-p2', 'p2',
  'Ms Maria Davies', 'QQ 12 34 ▒▒ C', '2026 to 2027', 12570,
  'We have included an adjustment to reduce your tax-free allowance by £3,740 so we can collect the tax in equal instalments.',
  '2026-04-06', 'Bridgwater & Co Ltd', '883L', '1257L',
  '[
    {
      "label": "Personal Allowance",
      "amount": 12570,
      "source_type": "allowance",
      "plain_english": "The amount you can earn each year before you pay any Income Tax.",
      "govuk_anchor": "income-tax"
    },
    {
      "label": "Car benefit",
      "amount": -3740,
      "source_type": "company_benefit",
      "plain_english": "HMRC believes you get a company car. This lowers your tax-free amount, so more tax is collected from your pay.",
      "govuk_anchor": "tax-company-benefits"
    }
  ]'::jsonb,
  8830,
  '[
    {
      "line_label": "Car benefit",
      "reason": "You told us you no longer have this company car — you returned it to your previous employer last year.",
      "est_annual_overpay": 748,
      "est_monthly_overpay": 62,
      "fix_action": "Update your company car details in your Personal Tax Account so HMRC can correct your tax code."
    }
  ]'::jsonb
)
on conflict (id) do nothing;

-- The P800 — the refund fixture. Plausible fabricated figures; overpaid £748,
-- the same amount the P2 error would have over-collected over a year.
insert into public.letters (
  id, type,
  recipient_name, nino_masked, tax_year, personal_allowance, confusing_line,
  p800_reference, total_income, tax_due, tax_paid, result, amount, claim_method
) values (
  'maria-p800', 'p800',
  'Ms Maria Davies', 'QQ 12 34 ▒▒ C', '2025 to 2026', 12570,
  'Our calculation shows you paid too much tax because your tax code did not change when your company car benefit ended.',
  'P800-2026-0R4291', 24800, 2446, 3194, 'overpaid', 748,
  'online bank transfer (5 working days) or cheque (6 weeks)'
)
on conflict (id) do nothing;

-- ~50 synthetic confusion events so the heatmap looks alive before the live
-- demo. 'adjustments' is deliberately the single hottest section (HMRC's own
-- research predicts it dominates). Mostly English, mostly resolved, mostly P2.
insert into public.scan_events
  (letter_type, letter_section, language, resolved, session_seconds)
values
  ('p2', 'adjustments', 'en', true, 74),
  ('p2', 'adjustments', 'en', true, 88),
  ('p2', 'adjustments', 'en', false, 110),
  ('p2', 'adjustments', 'en', true, 41),
  ('p2', 'adjustments', 'en', true, 96),
  ('p2', 'adjustments', 'cy', true, 102),
  ('p2', 'adjustments', 'en', true, 55),
  ('p2', 'adjustments', 'en', false, 119),
  ('p2', 'adjustments', 'en', true, 63),
  ('p2', 'adjustments', 'pl', true, 71),
  ('p2', 'adjustments', 'en', true, 47),
  ('p2', 'adjustments', 'en', true, 84),
  ('p2', 'adjustments', 'en', true, 38),
  ('p2', 'adjustments', 'cy', false, 113),
  ('p2', 'adjustments', 'en', true, 67),
  ('p2', 'adjustments', 'en', true, 52),
  ('p2', 'adjustments', 'en', true, 79),
  ('p2', 'adjustments', 'en', true, 44),
  ('p2', 'adjustments', 'en', false, 105),
  ('p2', 'adjustments', 'en', true, 91),
  ('p2', 'adjustments', 'en', true, 58),
  ('p2', 'tax-code', 'en', true, 49),
  ('p2', 'tax-code', 'en', true, 62),
  ('p2', 'tax-code', 'en', true, 35),
  ('p2', 'tax-code', 'cy', true, 88),
  ('p2', 'tax-code', 'en', false, 97),
  ('p2', 'tax-code', 'en', true, 53),
  ('p2', 'tax-code', 'pl', true, 76),
  ('p2', 'tax-code', 'en', true, 41),
  ('p2', 'company-benefit', 'en', true, 68),
  ('p2', 'company-benefit', 'en', true, 82),
  ('p2', 'company-benefit', 'en', true, 45),
  ('p2', 'company-benefit', 'en', false, 101),
  ('p2', 'company-benefit', 'cy', true, 73),
  ('p2', 'company-benefit', 'en', true, 57),
  ('p2', 'company-benefit', 'en', true, 39),
  ('p2', 'what-to-do', 'en', true, 64),
  ('p2', 'what-to-do', 'en', true, 50),
  ('p2', 'what-to-do', 'en', true, 86),
  ('p2', 'what-to-do', 'pl', true, 70),
  ('p2', 'what-to-do', 'en', false, 108),
  ('p2', 'what-to-do', 'en', true, 43),
  ('p2', 'personal-allowance', 'en', true, 59),
  ('p2', 'personal-allowance', 'en', true, 36),
  ('p2', 'personal-allowance', 'cy', true, 92),
  ('p2', 'personal-allowance', 'en', true, 48),
  ('p2', 'personal-allowance', 'en', false, 100),
  ('p800', 'what-to-do', 'en', true, 66),
  ('p800', 'adjustments', 'en', true, 81),
  ('p800', 'tax-code', 'en', true, 54);

commit;
