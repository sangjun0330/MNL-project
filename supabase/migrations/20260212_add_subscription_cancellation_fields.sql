alter table public.rnest_users
  add column if not exists subscription_cancel_at_period_end boolean not null default false,
  add column if not exists subscription_cancel_scheduled_at timestamptz,
  add column if not exists subscription_canceled_at timestamptz,
  add column if not exists subscription_cancel_reason text;
