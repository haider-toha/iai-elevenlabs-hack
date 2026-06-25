-- Migration: create_organizations
-- One logical change: introduce the organizations table.
--
-- Reference GOOD migration for CLAUDE.md > Database & Migrations. The whole
-- file is one atomic unit, so it is wrapped in a transaction. (We would NOT do
-- this if it contained CREATE INDEX CONCURRENTLY or ALTER TYPE ... ADD VALUE —
-- those must run outside a transaction block.)
--
-- No RLS here on purpose: organizations is a tenant table written only through
-- the backend (service-role / FastAPI path), which bypasses RLS. Any table the
-- browser reaches directly MUST enable RLS and ship a policy in the same
-- migration — see CLAUDE.md > Database & Migrations.
--
-- gen_random_uuid() is built into Postgres core (>= 13), so no extension needed.

begin;

create table public.organizations (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  slug        text        not null unique,
  -- timestamptz, never naive `timestamp`: store the instant, not a wall clock.
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.organizations is
  'Top-level tenant. One row per customer organization; users belong to an org.';
comment on column public.organizations.slug is
  'URL-safe unique handle; immutable once set.';

-- Keep updated_at honest. Defining the trigger function here keeps the migration
-- self-contained; later migrations can reuse set_updated_at() for other tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row
  execute function public.set_updated_at();

commit;
