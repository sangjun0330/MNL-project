-- Remove legacy "basic" tier and unify paid plan to "pro"

-- 1) User subscription tier normalization
update public.wnl_users
set
  subscription_tier = 'pro',
  subscription_updated_at = coalesce(subscription_updated_at, now()),
  last_seen = coalesce(last_seen, now())
where lower(coalesce(subscription_tier, '')) = 'basic';

-- Safety: any unexpected non-free tier is treated as pro
update public.wnl_users
set
  subscription_tier = 'pro',
  subscription_updated_at = coalesce(subscription_updated_at, now()),
  last_seen = coalesce(last_seen, now())
where coalesce(subscription_tier, '') <> ''
  and subscription_tier not in ('free', 'pro');

-- 2) Billing order tier normalization
update public.billing_orders
set
  plan_tier = 'pro',
  order_name = case
    when order_name ilike '%basic%' then regexp_replace(order_name, 'basic', 'Pro', 'gi')
    else order_name
  end,
  updated_at = coalesce(updated_at, now())
where lower(coalesce(plan_tier, '')) = 'basic';

-- Safety: any unexpected paid tier is treated as pro
update public.billing_orders
set
  plan_tier = 'pro',
  updated_at = coalesce(updated_at, now())
where coalesce(plan_tier, '') <> ''
  and plan_tier <> 'pro';

-- 3) Guardrails: only free/pro in user subscription tier
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'wnl_users_subscription_tier_check'
      and conrelid = 'public.wnl_users'::regclass
  ) then
    alter table public.wnl_users
      drop constraint wnl_users_subscription_tier_check;
  end if;
end;
$$;

alter table public.wnl_users
  add constraint wnl_users_subscription_tier_check
  check (subscription_tier in ('free', 'pro'));

-- 4) Guardrails: billing_orders stores paid orders only -> pro only
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'billing_orders_plan_tier_check'
      and conrelid = 'public.billing_orders'::regclass
  ) then
    alter table public.billing_orders
      drop constraint billing_orders_plan_tier_check;
  end if;
end;
$$;

alter table public.billing_orders
  add constraint billing_orders_plan_tier_check
  check (plan_tier = 'pro');

select pg_notify('pgrst', 'reload schema');
