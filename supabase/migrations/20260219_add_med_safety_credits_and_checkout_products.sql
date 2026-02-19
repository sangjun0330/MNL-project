alter table public.rnest_users
  add column if not exists med_safety_extra_credits integer not null default 0,
  add column if not exists med_safety_daily_used integer not null default 0,
  add column if not exists med_safety_usage_date date;

update public.rnest_users
set
  med_safety_extra_credits = greatest(0, coalesce(med_safety_extra_credits, 0)),
  med_safety_daily_used = greatest(0, coalesce(med_safety_daily_used, 0))
where med_safety_extra_credits is null
   or med_safety_extra_credits < 0
   or med_safety_daily_used is null
   or med_safety_daily_used < 0;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'rnest_users_med_safety_extra_credits_nonnegative'
      and conrelid = 'public.rnest_users'::regclass
  ) then
    alter table public.rnest_users drop constraint rnest_users_med_safety_extra_credits_nonnegative;
  end if;
end;
$$;

alter table public.rnest_users
  add constraint rnest_users_med_safety_extra_credits_nonnegative
  check (med_safety_extra_credits >= 0);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'rnest_users_med_safety_daily_used_nonnegative'
      and conrelid = 'public.rnest_users'::regclass
  ) then
    alter table public.rnest_users drop constraint rnest_users_med_safety_daily_used_nonnegative;
  end if;
end;
$$;

alter table public.rnest_users
  add constraint rnest_users_med_safety_daily_used_nonnegative
  check (med_safety_daily_used >= 0);

alter table public.billing_orders
  add column if not exists order_kind text not null default 'subscription',
  add column if not exists credit_pack_units integer not null default 0;

update public.billing_orders
set
  order_kind = case
    when coalesce(order_kind, '') = '' then 'subscription'
    else order_kind
  end,
  credit_pack_units = greatest(0, coalesce(credit_pack_units, 0)),
  updated_at = coalesce(updated_at, now())
where coalesce(order_kind, '') = ''
   or credit_pack_units is null
   or credit_pack_units < 0;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'billing_orders_order_kind_check'
      and conrelid = 'public.billing_orders'::regclass
  ) then
    alter table public.billing_orders drop constraint billing_orders_order_kind_check;
  end if;
end;
$$;

alter table public.billing_orders
  add constraint billing_orders_order_kind_check
  check (order_kind in ('subscription', 'credit_pack'));

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'billing_orders_credit_pack_units_nonnegative'
      and conrelid = 'public.billing_orders'::regclass
  ) then
    alter table public.billing_orders drop constraint billing_orders_credit_pack_units_nonnegative;
  end if;
end;
$$;

alter table public.billing_orders
  add constraint billing_orders_credit_pack_units_nonnegative
  check (credit_pack_units >= 0);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'billing_orders_credit_pack_units_consistency_check'
      and conrelid = 'public.billing_orders'::regclass
  ) then
    alter table public.billing_orders drop constraint billing_orders_credit_pack_units_consistency_check;
  end if;
end;
$$;

alter table public.billing_orders
  add constraint billing_orders_credit_pack_units_consistency_check
  check (
    (order_kind = 'subscription' and credit_pack_units = 0)
    or
    (order_kind = 'credit_pack' and credit_pack_units > 0)
  );

create index if not exists idx_billing_orders_user_order_kind_created
  on public.billing_orders (user_id, order_kind, created_at desc);

select pg_notify('pgrst', 'reload schema');
