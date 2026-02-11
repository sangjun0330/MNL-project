alter table public.wnl_users
  add column if not exists subscription_cancel_at_period_end boolean not null default false,
  add column if not exists subscription_cancel_scheduled_at timestamptz,
  add column if not exists subscription_canceled_at timestamptz,
  add column if not exists subscription_cancel_reason text;

with latest_done as (
  select
    b.user_id,
    b.order_id,
    b.plan_tier,
    coalesce(b.approved_at, b.created_at, b.updated_at, now()) as paid_at,
    coalesce(b.approved_at, b.created_at, b.updated_at, now()) + interval '30 days' as paid_end_at,
    row_number() over (partition by b.user_id order by coalesce(b.approved_at, b.created_at, b.updated_at) desc nulls last) as rn
  from public.billing_orders b
  where b.status = 'DONE'
    and b.plan_tier in ('basic', 'pro')
)
update public.wnl_users u
set
  subscription_tier = ld.plan_tier,
  subscription_status = 'active',
  subscription_started_at = coalesce(u.subscription_started_at, ld.paid_at),
  subscription_current_period_end = ld.paid_end_at,
  subscription_updated_at = now(),
  subscription_cancel_at_period_end = false,
  subscription_cancel_scheduled_at = null,
  subscription_canceled_at = null,
  subscription_cancel_reason = null,
  toss_customer_key = coalesce(u.toss_customer_key, 'wnl_' || regexp_replace(u.user_id, '[^A-Za-z0-9_-]', '', 'g')),
  toss_last_order_id = ld.order_id,
  last_seen = now()
from latest_done ld
where ld.rn = 1
  and u.user_id = ld.user_id
  and ld.paid_end_at > now()
  and (
    coalesce(u.subscription_tier, 'free') = 'free'
    or coalesce(u.subscription_status, 'inactive') <> 'active'
    or u.subscription_current_period_end is null
    or u.subscription_current_period_end <= now()
  )
  and not exists (
    select 1
    from public.billing_orders c
    where c.user_id = ld.user_id
      and c.status = 'CANCELED'
      and coalesce(c.updated_at, c.created_at) >= ld.paid_at
  );

select pg_notify('pgrst', 'reload schema');
