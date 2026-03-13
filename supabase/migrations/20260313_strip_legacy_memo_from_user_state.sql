begin;

insert into public.rnest_notebook_state as notebook_state (
  user_id,
  payload,
  created_at,
  updated_at
)
select
  state.user_id,
  jsonb_build_object(
    'memo',
    state.payload -> 'memo'
  ),
  coalesce(state.updated_at, now()),
  coalesce(state.updated_at, now())
from public.rnest_user_state as state
where jsonb_typeof(state.payload -> 'memo') = 'object'
on conflict (user_id) do update
set
  payload = case
    when notebook_state.payload ? 'memo' then notebook_state.payload
    else notebook_state.payload || jsonb_build_object('memo', excluded.payload -> 'memo')
  end,
  updated_at = greatest(notebook_state.updated_at, excluded.updated_at);

update public.rnest_user_state
set
  payload = payload - 'memo',
  updated_at = now()
where payload ? 'memo';

commit;
