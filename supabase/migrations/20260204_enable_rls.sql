-- Enable RLS for user logs table (public schema)
alter table public.rnest_daily_logs enable row level security;
alter table public.rnest_user_state enable row level security;
alter table public.rnest_users enable row level security;

-- Owner-based policies (device_id stores auth.uid() when logged in)
drop policy if exists "rnest_daily_logs_select_own" on public.rnest_daily_logs;
drop policy if exists "rnest_daily_logs_insert_own" on public.rnest_daily_logs;
drop policy if exists "rnest_daily_logs_update_own" on public.rnest_daily_logs;
drop policy if exists "rnest_daily_logs_delete_own" on public.rnest_daily_logs;
create policy "rnest_daily_logs_select_own"
  on public.rnest_daily_logs
  for select
  to authenticated
  using ((select auth.uid())::text = device_id);

create policy "rnest_daily_logs_insert_own"
  on public.rnest_daily_logs
  for insert
  to authenticated
  with check ((select auth.uid())::text = device_id);

create policy "rnest_daily_logs_update_own"
  on public.rnest_daily_logs
  for update
  to authenticated
  using ((select auth.uid())::text = device_id)
  with check ((select auth.uid())::text = device_id);

create policy "rnest_daily_logs_delete_own"
  on public.rnest_daily_logs
  for delete
  to authenticated
  using ((select auth.uid())::text = device_id);

create index if not exists idx_rnest_daily_logs_device_id
  on public.rnest_daily_logs (device_id);

create index if not exists idx_rnest_daily_logs_date_iso
  on public.rnest_daily_logs (date_iso);

-- User state: owner-based policies (user_id = auth.uid())
drop policy if exists "rnest_user_state_select_own" on public.rnest_user_state;
drop policy if exists "rnest_user_state_insert_own" on public.rnest_user_state;
drop policy if exists "rnest_user_state_update_own" on public.rnest_user_state;
drop policy if exists "rnest_user_state_delete_own" on public.rnest_user_state;

create policy "rnest_user_state_select_own"
  on public.rnest_user_state
  for select
  to authenticated
  using ((select auth.uid())::text = user_id);

create policy "rnest_user_state_insert_own"
  on public.rnest_user_state
  for insert
  to authenticated
  with check ((select auth.uid())::text = user_id);

create policy "rnest_user_state_update_own"
  on public.rnest_user_state
  for update
  to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

create policy "rnest_user_state_delete_own"
  on public.rnest_user_state
  for delete
  to authenticated
  using ((select auth.uid())::text = user_id);

create index if not exists idx_rnest_user_state_user_id
  on public.rnest_user_state (user_id);

-- Users: owner-based policies (user_id = auth.uid())
drop policy if exists "rnest_users_select_own" on public.rnest_users;
drop policy if exists "rnest_users_insert_own" on public.rnest_users;
drop policy if exists "rnest_users_update_own" on public.rnest_users;
drop policy if exists "rnest_users_delete_own" on public.rnest_users;

create policy "rnest_users_select_own"
  on public.rnest_users
  for select
  to authenticated
  using ((select auth.uid())::text = user_id);

create policy "rnest_users_insert_own"
  on public.rnest_users
  for insert
  to authenticated
  with check ((select auth.uid())::text = user_id);

create policy "rnest_users_update_own"
  on public.rnest_users
  for update
  to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

create policy "rnest_users_delete_own"
  on public.rnest_users
  for delete
  to authenticated
  using ((select auth.uid())::text = user_id);

create index if not exists idx_rnest_users_user_id
  on public.rnest_users (user_id);
