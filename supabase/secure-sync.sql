-- Apply only after confirming the existing nutrition_state row is present.
create table if not exists public.diet_owner (
  singleton boolean primary key default true check (singleton), email text not null
);
alter table public.diet_owner enable row level security;
revoke all on public.diet_owner from anon, authenticated;
grant select on public.diet_owner to service_role;
create or replace function public.diet_apply_changes(changes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_data jsonb; changed_at timestamptz; change jsonb;
  path text[]; prefix text[]; n integer; previous jsonb;
begin
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 500 then raise exception 'Invalid changes'; end if;
  select data into current_data from public.nutrition_state where id = 'diet_90_97' for update;
  if not found then raise exception 'State missing'; end if;
  for change in select value from jsonb_array_elements(changes) loop
    select array_agg(value order by position) into path from jsonb_array_elements_text(change->'path') with ordinality as parts(value,position);
    if array_length(path,1) < 2 or not (path[1] = any(array['meals','weights','training','foods','favorites','mealPresets'])) then raise exception 'Invalid path'; end if;
    previous := current_data #> path;
    -- Retries are idempotent; concurrent edits to a different leaf are preserved.
    if (change->>'remove')::boolean and previous is null then continue; end if;
    if not (change->>'remove')::boolean and previous = change->'value' then continue; end if;
    if coalesce((change->>'parentDepth')::integer,0) > 0 and current_data #> path[1:(change->>'parentDepth')::integer] is null then
      raise exception 'Concurrent parent deletion' using errcode = '40001';
    end if;
    if ((previous is not null) <> (change->>'exists')::boolean)
       or ((change->>'exists')::boolean and previous is distinct from change->'before') then
      raise exception 'Concurrent edit' using errcode = '40001';
    end if;
    if (change->>'remove')::boolean then current_data := current_data #- path;
    else
      for n in 1..array_length(path,1)-1 loop
        prefix := path[1:n];
        if current_data #> prefix is null then current_data := jsonb_set(current_data, prefix, '{}'::jsonb); end if;
        if jsonb_typeof(current_data #> prefix) <> 'object' then raise exception 'Concurrent parent edit' using errcode = '40001'; end if;
      end loop;
      current_data := jsonb_set(current_data, path, change->'value');
    end if;
  end loop;
  update public.nutrition_state set data = current_data, updated_at = clock_timestamp()
    where id = 'diet_90_97' returning updated_at into changed_at;
  return jsonb_build_object('data', current_data, 'updated_at', changed_at);
end;
$$;
revoke all on function public.diet_apply_changes(jsonb) from public, anon, authenticated;
grant execute on function public.diet_apply_changes(jsonb) to service_role;
