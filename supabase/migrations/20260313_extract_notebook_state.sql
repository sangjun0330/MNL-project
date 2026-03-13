begin;

create table if not exists public.rnest_notebook_state (
  user_id text primary key references public.rnest_users(user_id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rnest_notebook_state_payload_object_check
    check (jsonb_typeof(payload) = 'object')
);

drop trigger if exists trg_set_updated_at_rnest_notebook_state on public.rnest_notebook_state;
create trigger trg_set_updated_at_rnest_notebook_state
before update on public.rnest_notebook_state
for each row execute function public.tg_set_updated_at();

create index if not exists idx_rnest_notebook_state_updated
  on public.rnest_notebook_state (updated_at desc);

alter table public.rnest_notebook_state enable row level security;

drop policy if exists "rnest_notebook_state_select_own" on public.rnest_notebook_state;
drop policy if exists "rnest_notebook_state_insert_own" on public.rnest_notebook_state;
drop policy if exists "rnest_notebook_state_update_own" on public.rnest_notebook_state;
drop policy if exists "rnest_notebook_state_delete_own" on public.rnest_notebook_state;

create policy "rnest_notebook_state_select_own"
  on public.rnest_notebook_state
  for select
  to authenticated
  using ((select auth.uid())::text = user_id);

create policy "rnest_notebook_state_insert_own"
  on public.rnest_notebook_state
  for insert
  to authenticated
  with check ((select auth.uid())::text = user_id);

create policy "rnest_notebook_state_update_own"
  on public.rnest_notebook_state
  for update
  to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

create policy "rnest_notebook_state_delete_own"
  on public.rnest_notebook_state
  for delete
  to authenticated
  using ((select auth.uid())::text = user_id);

grant select, insert, update, delete on table public.rnest_notebook_state to authenticated;

comment on table public.rnest_notebook_state is 'RNest 메모·기록지 전용 상태 스냅샷';

commit;
