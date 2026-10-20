-- Keep SQL privileges aligned with existing RLS policies for authorized back-office writes.
-- Row-level policies remain the authorization boundary; these grants only enable the intended operations.
begin;

grant insert, update on public.suppliers to authenticated;
grant insert on public.purchase_orders, public.purchase_order_items to authenticated;
grant insert on public.store_settings, public.integration_configs to authenticated;

commit;
