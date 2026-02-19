-- Purpose:
-- 1) Recover rows that were stored with legacy IDs like "google:user@example.com"
-- 2) Copy them to the current Supabase auth UUID user_id.
--
-- Safe-guard:
-- - Existing non-empty UUID rows are not overwritten.
-- - Only empty/blank UUID rows are filled from legacy rows.

begin;

with legacy_rows as (
  select
    s.user_id as legacy_user_id,
    case
      when s.user_id ~ '^[^:]+:.+@.+$' then split_part(s.user_id, ':', 2)
      when s.user_id ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then s.user_id
      else null
    end as legacy_email,
    s.payload,
    coalesce(s.updated_at, now()) as updated_at
  from public.rnest_user_state s
),
mapped as (
  select
    au.id::text as user_id,
    l.payload,
    l.updated_at
  from legacy_rows l
  join auth.users au
    on l.legacy_email is not null
   and lower(au.email) = lower(l.legacy_email)
)
insert into public.rnest_user_state as target (user_id, payload, updated_at)
select
  m.user_id,
  m.payload,
  m.updated_at
from mapped m
on conflict (user_id) do update
set
  payload = excluded.payload,
  updated_at = excluded.updated_at
where
  (target.payload is null or target.payload = '{}'::jsonb)
  and excluded.updated_at >= coalesce(target.updated_at, to_timestamp(0));

commit;

-- Optional diagnostics
-- select count(*) as total_rows from public.rnest_user_state;
-- select count(*) as legacy_rows from public.rnest_user_state where user_id like '%:%';
-- select count(*) as uuid_rows from public.rnest_user_state where user_id ~ '^[0-9a-f-]{36}$';
