-- Migration: create_scan_events
-- One logical change: introduce the scan_events table (confusion heatmap log).
--
-- High-volume internal log → bigint identity PK (not uuid), per convention.
-- NO PII: we record only which letter section a question hit, the language, and
-- session metadata — never names, NI numbers, or transcript text.

begin;

create table public.scan_events (
  id              bigint      generated always as identity primary key,
  letter_type     text        not null,
  letter_section  text        not null,
  language        text        not null,
  resolved        boolean     not null,
  session_seconds integer     not null,
  -- `timestamp` is a non-reserved column name in Postgres; quoting not required.
  timestamp       timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

comment on table public.scan_events is
  'Confusion-heatmap log: one row per scan/question. No PII — section + language + session only.';
comment on column public.scan_events.letter_section is
  'Which letter hotspot the question hit (tax-code, adjustments, what-to-do, ...).';
comment on column public.scan_events.resolved is
  'Answered in-app (true) vs escalated to "call HMRC" (false).';

-- Same reasoning as letters: the FastAPI backend writes these as the table owner
-- and BYPASSES RLS; this enable + permissive policy only guards the unused
-- PostgREST/JS path. No PII here, so a permissive read policy is safe.
alter table public.scan_events enable row level security;

create policy "scan events are publicly readable"
  on public.scan_events
  for select
  to authenticated
  using (true);

commit;
