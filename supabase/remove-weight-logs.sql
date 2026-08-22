update public.nutrition_state
set data = jsonb_set(
  data,
  '{weights}',
  coalesce(data->'weights', '{}'::jsonb) - '2025-07-27' - '2026-08-21'
)
where id = 'diet_90_97';
