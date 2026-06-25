-- Seed data for local development. Runs after migrations on `supabase db reset`.
-- Keep idempotent so repeated resets are clean.

insert into organizations (name, slug)
values ('Acme', 'acme')
on conflict (slug) do nothing;
