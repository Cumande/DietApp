create table if not exists public.nutrition_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.nutrition_state (id, data)
values (
  'diet_90_97',
  '{"meals":{},"weights":{"2026-07-05":88.6,"2026-07-14":90,"2026-07-25":92.1,"2026-08-22":90,"2026-09-08":92.3,"2026-09-15":90.75},"training":{}}'::jsonb
)
on conflict (id) do nothing;

alter table public.nutrition_state enable row level security;

-- Recommended setup:
-- Keep RLS enabled with no public policies, and let the Vercel API use
-- SUPABASE_SERVICE_ROLE_KEY from Vercel environment variables.
