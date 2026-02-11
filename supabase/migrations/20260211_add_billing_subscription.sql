alter table public.wnl_users
  add column if not exists subscription_tier text not null default 'free',
  add column if not exists subscription_status text not null default 'inactive',
  add column if not exists subscription_started_at timestamptz,
  add column if not exists subscription_current_period_end timestamptz,
  add column if not exists subscription_updated_at timestamptz,
  add column if not exists toss_customer_key text,
  add column if not exists toss_last_order_id text;

create table if not exists public.billing_orders (
  order_id text primary key,
  user_id text not null,
  plan_tier text not null,
  amount integer not null,
  currency text not null default 'KRW',
  status text not null default 'READY',
  order_name text not null,
  payment_key text,
  fail_code text,
  fail_message text,
  toss_response jsonb,
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_billing_orders_user_id_created_at
  on public.billing_orders (user_id, created_at desc);

create index if not exists idx_billing_orders_status
  on public.billing_orders (status);

alter table public.billing_orders enable row level security;

drop policy if exists "billing_orders_select_own" on public.billing_orders;
drop policy if exists "billing_orders_insert_own" on public.billing_orders;
drop policy if exists "billing_orders_update_own" on public.billing_orders;
drop policy if exists "billing_orders_delete_own" on public.billing_orders;

create policy "billing_orders_select_own"
  on public.billing_orders
  for select
  to authenticated
  using ((select auth.uid())::text = user_id);

create policy "billing_orders_insert_own"
  on public.billing_orders
  for insert
  to authenticated
  with check ((select auth.uid())::text = user_id);

create policy "billing_orders_update_own"
  on public.billing_orders
  for update
  to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

create policy "billing_orders_delete_own"
  on public.billing_orders
  for delete
  to authenticated
  using ((select auth.uid())::text = user_id);
