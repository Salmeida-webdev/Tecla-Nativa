-- Índices cobrindo chaves estrangeiras e políticas sem sobreposição para authenticated.
begin;

create index if not exists audit_events_actor_user_idx on public.audit_events(actor_user_id) where actor_user_id is not null;
create index if not exists coupon_redemptions_coupon_fk_idx on public.coupon_redemptions(coupon_id,store_id);
create index if not exists coupon_redemptions_customer_fk_idx on public.coupon_redemptions(customer_id,store_id) where customer_id is not null;
create index if not exists coupon_redemptions_order_fk_idx on public.coupon_redemptions(order_id,store_id);
create index if not exists customers_auth_user_idx on public.customers(auth_user_id) where auth_user_id is not null;
create index if not exists financial_transactions_order_fk_idx on public.financial_transactions(order_id,store_id);
create index if not exists financial_transactions_payment_fk_idx on public.financial_transactions(payment_attempt_id,store_id) where payment_attempt_id is not null;
create index if not exists inventory_levels_variant_fk_idx on public.inventory_levels(variant_id,store_id);
create index if not exists inventory_reservations_order_fk_idx on public.inventory_reservations(order_id,store_id);
create index if not exists inventory_reservations_variant_fk_idx on public.inventory_reservations(variant_id,store_id);
create index if not exists order_items_order_fk_idx on public.order_items(order_id,store_id);
create index if not exists order_items_product_fk_idx on public.order_items(product_id,store_id) where product_id is not null;
create index if not exists order_items_variant_fk_idx on public.order_items(variant_id,store_id) where variant_id is not null;
create index if not exists order_status_events_actor_idx on public.order_status_events(actor_user_id) where actor_user_id is not null;
create index if not exists order_status_events_order_fk_idx on public.order_status_events(order_id,store_id);
create index if not exists orders_customer_fk_idx on public.orders(customer_id,store_id) where customer_id is not null;
create index if not exists payment_attempts_order_fk_idx on public.payment_attempts(order_id,store_id);
create index if not exists product_media_product_fk_idx on public.product_media(product_id,store_id);
create index if not exists product_media_variant_fk_idx on public.product_media(variant_id,store_id) where variant_id is not null;
create index if not exists product_variants_product_fk_idx on public.product_variants(product_id,store_id);
create index if not exists products_category_fk_idx on public.products(category_id,store_id) where category_id is not null;
create index if not exists purchase_order_items_purchase_fk_idx on public.purchase_order_items(purchase_order_id,store_id);
create index if not exists purchase_order_items_variant_fk_idx on public.purchase_order_items(variant_id,store_id);
create index if not exists purchase_orders_supplier_fk_idx on public.purchase_orders(supplier_id,store_id);
create index if not exists service_case_events_actor_idx on public.service_case_events(actor_user_id) where actor_user_id is not null;
create index if not exists service_case_events_case_fk_idx on public.service_case_events(case_id,store_id);
create index if not exists service_cases_assigned_user_idx on public.service_cases(assigned_to) where assigned_to is not null;
create index if not exists service_cases_customer_fk_idx on public.service_cases(customer_id,store_id) where customer_id is not null;
create index if not exists service_cases_order_fk_idx on public.service_cases(order_id,store_id) where order_id is not null;
create index if not exists shipment_events_shipment_fk_idx on public.shipment_events(shipment_id,store_id);
create index if not exists shipments_order_fk_idx on public.shipments(order_id,store_id);
create index if not exists stock_movements_actor_idx on public.stock_movements(actor_user_id) where actor_user_id is not null;
create index if not exists stock_movements_order_fk_idx on public.stock_movements(order_id,store_id) where order_id is not null;
create index if not exists stock_movements_purchase_fk_idx on public.stock_movements(purchase_order_id,store_id) where purchase_order_id is not null;
create index if not exists stock_movements_variant_fk_idx on public.stock_movements(variant_id,store_id);
create index if not exists store_settings_updated_user_idx on public.store_settings(updated_by) where updated_by is not null;

drop policy stores_public_read on public.stores;
drop policy stores_staff_read on public.stores;
create policy stores_public_read on public.stores for select to anon using (status='active');
create policy stores_authenticated_read on public.stores for select to authenticated using (status='active' or private.is_store_member(id));

drop policy categories_public_read on public.categories;
drop policy categories_staff_read on public.categories;
create policy categories_public_read on public.categories for select to anon using (active and exists (select 1 from public.stores s where s.id=categories.store_id and s.status='active'));
create policy categories_authenticated_read on public.categories for select to authenticated using ((active and exists (select 1 from public.stores s where s.id=categories.store_id and s.status='active')) or private.is_store_member(store_id));

drop policy products_public_read on public.products;
drop policy products_staff_read on public.products;
create policy products_public_read on public.products for select to anon using (status='published' and exists (select 1 from public.stores s where s.id=products.store_id and s.status='active'));
create policy products_authenticated_read on public.products for select to authenticated using ((status='published' and exists (select 1 from public.stores s where s.id=products.store_id and s.status='active')) or private.is_store_member(store_id));

drop policy variants_public_read on public.product_variants;
drop policy variants_staff_read on public.product_variants;
create policy variants_public_read on public.product_variants for select to anon using (active and exists (select 1 from public.products p join public.stores s on s.id=p.store_id where p.id=product_variants.product_id and p.store_id=product_variants.store_id and p.status='published' and s.status='active'));
create policy variants_authenticated_read on public.product_variants for select to authenticated using ((active and exists (select 1 from public.products p join public.stores s on s.id=p.store_id where p.id=product_variants.product_id and p.store_id=product_variants.store_id and p.status='published' and s.status='active')) or private.is_store_member(store_id));

drop policy product_media_public_read on public.product_media;
drop policy product_media_staff_read on public.product_media;
create policy product_media_public_read on public.product_media for select to anon using (exists (select 1 from public.products p join public.stores s on s.id=p.store_id where p.id=product_media.product_id and p.store_id=product_media.store_id and p.status='published' and s.status='active'));
create policy product_media_authenticated_read on public.product_media for select to authenticated using ((exists (select 1 from public.products p join public.stores s on s.id=p.store_id where p.id=product_media.product_id and p.store_id=product_media.store_id and p.status='published' and s.status='active')) or private.is_store_member(store_id));

drop policy content_public_read on public.content_sections;
drop policy content_staff_read on public.content_sections;
create policy content_public_read on public.content_sections for select to anon using (status='published' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) and exists (select 1 from public.stores s where s.id=content_sections.store_id and s.status='active'));
create policy content_authenticated_read on public.content_sections for select to authenticated using ((status='published' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) and exists (select 1 from public.stores s where s.id=content_sections.store_id and s.status='active')) or private.is_store_member(store_id));

commit;
