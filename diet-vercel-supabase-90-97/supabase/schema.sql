create table if not exists public.nutrition_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.nutrition_state (id, data)
values (
  'diet_90_97',
  '{"meals":{},"weights":{"2026-08-22":90},"prep":{}}'::jsonb
)
on conflict (id) do nothing;

alter table public.nutrition_state enable row level security;

-- Recommended setup:
-- Keep RLS enabled with no public policies, and let the Vercel API use
-- SUPABASE_SERVICE_ROLE_KEY from Vercel environment variables.
