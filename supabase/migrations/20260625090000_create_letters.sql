-- Migration: create_letters
-- One logical change: introduce the letters table (one table, both letter types).
--
-- A single table holds BOTH demo letter types, discriminated by `type`. P2-only
-- and P800-only columns are nullable; the FastAPI repository selects * and builds
-- the matching Pydantic model (P2Letter | P800Letter), ignoring the irrelevant
-- columns. This avoids a second table for two fixtures.
--
-- DELIBERATE deviation from the uuid-PK convention: `id` is a readable text slug
-- (e.g. 'maria-p2'), NOT a uuid. These are public demo fixtures with no user_id
-- and no PII — the slug is encoded in the printed QR ('/l/maria-p2') and appears
-- in URLs, so it must be human-readable. The non-enumerable-uuid rationale does
-- not apply to fixtures we intend to be guessable links.

begin;

create table public.letters (
  -- readable slug used verbatim in the QR + URL (see header note), not a uuid
  id                  text        primary key,
  type                text        not null check (type in ('p2', 'p800')),

  -- shared across both letter types
  recipient_name      text        not null,
  nino_masked         text        not null,
  tax_year            text        not null,
  personal_allowance  numeric     not null,
  confusing_line      text        not null,

  -- P2-only (PAYE Coding Notice)
  issue_date          date,
  employer_name       text,
  current_code        text,
  standard_code       text,
  lines               jsonb,
  tax_free_amount     numeric,
  suspected_errors    jsonb,

  -- P800-only (tax calculation)
  p800_reference      text,
  total_income        numeric,
  tax_due             numeric,
  tax_paid            numeric,
  result              text,
  amount              numeric,
  claim_method        text,

  -- timestamptz, never naive `timestamp`: store the instant, not a wall clock.
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.letters is
  'Public demo letter fixtures (P2 + P800), keyed by a readable slug used in the QR.';
comment on column public.letters.id is
  'Readable slug (e.g. maria-p2) encoded in the printed QR and URL; deliberately not a uuid.';
comment on column public.letters.type is
  'Discriminator: p2 (PAYE Coding Notice) or p800 (tax calculation).';

-- Reuse the set_updated_at() defined by 20260624101500_create_organizations.sql.
create trigger letters_set_updated_at
  before update on public.letters
  for each row
  execute function public.set_updated_at();

-- The FastAPI backend owns this data and connects as the table owner, so it
-- BYPASSES RLS — this enable + policy only guards the unused PostgREST/JS path.
-- These rows carry no user PII, so a deliberate permissive read policy is safe.
alter table public.letters enable row level security;

create policy "letters are publicly readable"
  on public.letters
  for select
  to authenticated
  using (true);

commit;
