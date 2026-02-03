-- Enable RLS for user logs table (public schema)
alter table public.wnl_daily_logs enable row level security;
alter table public.wnl_user_state enable row level security;
alter table public.wnl_users enable row level security;

-- Owner-based policies (device_id stores auth.uid() when logged in)
drop policy if exists "wnl_daily_logs_select_own" on public.wnl_daily_logs;
drop policy if exists "wnl_daily_logs_insert_own" on public.wnl_daily_logs;
drop policy if exists "wnl_daily_logs_update_own" on public.wnl_daily_logs;
drop policy if exists "wnl_daily_logs_delete_own" on public.wnl_daily_logs;
create policy "wnl_daily_logs_select_own"
  on public.wnl_daily_logs
  for select
  to authenticated
  using ((select auth.uid())::text = device_id);

create policy "wnl_daily_logs_insert_own"
  on public.wnl_daily_logs
  for insert
  to authenticated
  with check ((select auth.uid())::text = device_id);

create policy "wnl_daily_logs_update_own"
  on public.wnl_daily_logs
  for update
  to authenticated
  using ((select auth.uid())::text = device_id)
  with check ((select auth.uid())::text = device_id);

create policy "wnl_daily_logs_delete_own"
  on public.wnl_daily_logs
  for delete
  to authenticated
  using ((select auth.uid())::text = device_id);

create index if not exists idx_wnl_daily_logs_device_id
  on public.wnl_daily_logs (device_id);

create index if not exists idx_wnl_daily_logs_date_iso
  on public.wnl_daily_logs (date_iso);

-- User state: owner-based policies (user_id = auth.uid())
drop policy if exists "wnl_user_state_select_own" on public.wnl_user_state;
drop policy if exists "wnl_user_state_insert_own" on public.wnl_user_state;
drop policy if exists "wnl_user_state_update_own" on public.wnl_user_state;
drop policy if exists "wnl_user_state_delete_own" on public.wnl_user_state;

create policy "wnl_user_state_select_own"
  on public.wnl_user_state
  for select
  to authenticated
  using ((select auth.uid())::text = user_id);

create policy "wnl_user_state_insert_own"
  on public.wnl_user_state
  for insert
  to authenticated
  with check ((select auth.uid())::text = user_id);

create policy "wnl_user_state_update_own"
  on public.wnl_user_state
  for update
  to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

create policy "wnl_user_state_delete_own"
  on public.wnl_user_state
  for delete
  to authenticated
  using ((select auth.uid())::text = user_id);

create index if not exists idx_wnl_user_state_user_id
  on public.wnl_user_state (user_id);

-- Users: owner-based policies (user_id = auth.uid())
drop policy if exists "wnl_users_select_own" on public.wnl_users;
drop policy if exists "wnl_users_insert_own" on public.wnl_users;
drop policy if exists "wnl_users_update_own" on public.wnl_users;
drop policy if exists "wnl_users_delete_own" on public.wnl_users;

create policy "wnl_users_select_own"
  on public.wnl_users
  for select
  to authenticated
  using ((select auth.uid())::text = user_id);

create policy "wnl_users_insert_own"
  on public.wnl_users
  for insert
  to authenticated
  with check ((select auth.uid())::text = user_id);

create policy "wnl_users_update_own"
  on public.wnl_users
  for update
  to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

create policy "wnl_users_delete_own"
  on public.wnl_users
  for delete
  to authenticated
  using ((select auth.uid())::text = user_id);

create index if not exists idx_wnl_users_user_id
  on public.wnl_users (user_id);
