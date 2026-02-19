-- Normalize legacy Toss customer keys from wnl_* to rnest_* and keep RNest naming in order labels.

update public.rnest_users
set toss_customer_key = concat(
  'rnest_',
  regexp_replace(coalesce(user_id, ''), '[^A-Za-z0-9_-]', '', 'g')
)
where coalesce(toss_customer_key, '') = ''
   or toss_customer_key like 'wnl_%';

update public.billing_orders
set order_name = regexp_replace(order_name, '(?i)wnl', 'RNest', 'g'),
    updated_at = now()
where coalesce(order_name, '') ~* 'wnl';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'billing_orders'
      and column_name = 'order_kind'
  ) then
    create index if not exists idx_billing_orders_admin_status_kind_created
      on public.billing_orders (status, order_kind, created_at desc);
  end if;
end;
$$;

select pg_notify('pgrst', 'reload schema');
