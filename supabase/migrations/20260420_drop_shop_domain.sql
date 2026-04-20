begin;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime drop table public.shop_orders';
    exception
      when undefined_table or undefined_object then
        null;
    end;
  end if;
end
$$;

drop schema if exists rnest_shop cascade;

drop table if exists public.shop_claim_attachments cascade;
drop table if exists public.shop_claim_events cascade;
drop table if exists public.shop_claims cascade;
drop table if exists public.shop_reviews cascade;
drop table if exists public.shop_order_events cascade;
drop table if exists public.shop_orders cascade;
drop table if exists public.shop_customer_profiles cascade;
drop table if exists public.shop_products cascade;

update public.rnest_user_state
set payload =
  coalesce(payload, '{}'::jsonb)
    - 'shopWishlist'
    - 'shopCart'
    - 'shopShippingProfile'
    - 'shopShippingAddressBook'
    - 'shopOrders'
    - 'shopOrderBundles'
    - 'shopPurchaseConfirmations'
    - 'shopClaims'
where payload is not null
  and jsonb_typeof(payload) = 'object'
  and (
    payload ? 'shopWishlist'
    or payload ? 'shopCart'
    or payload ? 'shopShippingProfile'
    or payload ? 'shopShippingAddressBook'
    or payload ? 'shopOrders'
    or payload ? 'shopOrderBundles'
    or payload ? 'shopPurchaseConfirmations'
    or payload ? 'shopClaims'
  );

commit;
