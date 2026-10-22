begin;

select plan(22);

create temporary table checkout_test_context (
  store_id uuid not null,
  category_id uuid not null,
  product_id uuid not null,
  variant_id uuid not null,
  idempotency_key uuid not null
) on commit drop;

insert into checkout_test_context
select pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
       pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
       pg_catalog.gen_random_uuid();

insert into public.stores (id, slug, name, status, currency)
select store_id, 'checkout-test-' || pg_catalog.replace(store_id::text, '-', ''),
       'Checkout test', 'active', 'BRL'
from checkout_test_context;

insert into public.categories (id, store_id, name, slug, active)
select category_id, store_id, 'Checkout test', 'checkout-test', true
from checkout_test_context;

insert into public.products (
  id, store_id, category_id, slug, sku_base, name, base_price, status
)
select product_id, store_id, category_id, 'checkout-test-product', 'CHECKOUT-TEST',
       'Produto de teste', 10.00, 'published'
from checkout_test_context;

insert into public.product_variants (
  id, store_id, product_id, sku, option_key, option_label, active
)
select variant_id, store_id, product_id, 'CHECKOUT-TEST-ONE', 'unica', 'Única', true
from checkout_test_context;

insert into public.inventory_levels (store_id, variant_id, on_hand, reserved)
select store_id, variant_id, 5, 0 from checkout_test_context;

create temporary table checkout_test_created on commit drop as
select result.*
from checkout_test_context as context
cross join lateral public.create_storefront_order(
  context.store_id,
  context.idempotency_key,
  pg_catalog.repeat('a', 64),
  'Cliente Teste',
  null,
  null,
  '{"postal_code":"58000000","city":"João Pessoa","state":"PB"}'::jsonb,
  '{}'::jsonb,
  0,
  pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'variant_id', context.variant_id,
    'quantity', 2
  ))
) as result;

select is((select pg_catalog.count(*) from checkout_test_created), 1::bigint, 'creates one order');
select is((select result_total from checkout_test_created), 20.00::numeric, 'uses the database product price');
select is((select il.available from public.inventory_levels il join checkout_test_context c using (store_id, variant_id)), 3, 'reserves available stock');

create temporary table checkout_test_replay on commit drop as
select result.*
from checkout_test_context as context
cross join lateral public.create_storefront_order(
  context.store_id,
  context.idempotency_key,
  pg_catalog.repeat('a', 64),
  'Cliente Teste',
  null,
  null,
  '{"postal_code":"58000000","city":"João Pessoa","state":"PB"}'::jsonb,
  '{}'::jsonb,
  0,
  pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'variant_id', context.variant_id,
    'quantity', 2
  ))
) as result;

select ok((select is_idempotent_replay from checkout_test_replay), 'marks a replay with the same key and payload');
select is((select result_order_id from checkout_test_replay), (select result_order_id from checkout_test_created), 'returns the original order for a replay');

select throws_ok(
  $$select * from public.create_storefront_order(
    (select store_id from checkout_test_context),
    (select idempotency_key from checkout_test_context),
    pg_catalog.repeat('b', 64), 'Cliente Teste', null, null,
    '{"postal_code":"58000000","city":"João Pessoa","state":"PB"}'::jsonb,
    '{}'::jsonb, 0,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'variant_id', (select variant_id from checkout_test_context), 'quantity', 2
    ))
  )$$,
  '22023',
  'A chave de idempotência já foi usada com dados diferentes.',
  'rejects a reused idempotency key with a different payload hash'
);

select throws_ok(
  $$select * from public.create_storefront_order(
    (select store_id from checkout_test_context),
    pg_catalog.gen_random_uuid(), pg_catalog.repeat('c', 64),
    'Cliente Teste', null, null,
    '{"postal_code":"58000000","city":"João Pessoa","state":"PB"}'::jsonb,
    '{}'::jsonb, 0,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'variant_id', (select variant_id from checkout_test_context), 'quantity', 6
    ))
  )$$,
  '22023',
  'Estoque insuficiente para um dos produtos.',
  'rejects a cart that exceeds available stock'
);

select is((select il.reserved from public.inventory_levels il join checkout_test_context c using (store_id, variant_id)), 2, 'failed reservation rolls back inventory changes');
select is((select pg_catalog.count(*) from public.orders o join checkout_test_context c using (store_id) where o.checkout_idempotency_key = c.idempotency_key), 1::bigint, 'failed checkout does not create another order');
select is((select pg_catalog.count(*) from public.order_items oi join checkout_test_created o on o.result_order_id = oi.order_id), 1::bigint, 'persists item price and product snapshots');
select is((select pg_catalog.count(*) from public.inventory_reservations ir join checkout_test_created o on o.result_order_id = ir.order_id where ir.status = 'active'), 1::bigint, 'persists one active reservation');

update public.inventory_reservations as ir
set expires_at = pg_catalog.now() - interval '1 minute'
from checkout_test_created as created
where ir.order_id = created.result_order_id;

select is(public.release_expired_storefront_reservations(1000), 1, 'releases an expired reservation');
select is((select ir.status from public.inventory_reservations ir join checkout_test_created o on o.result_order_id = ir.order_id), 'expired', 'marks the reservation as expired');
select is((select o.status from public.orders o join checkout_test_created c on c.result_order_id = o.id), 'cancelled', 'cancels an unpaid order when its reservation expires');
select is((select il.available from public.inventory_levels il join checkout_test_context c using (store_id, variant_id)), 5, 'returns expired quantity to available inventory');
select is(public.release_expired_storefront_reservations(1000), 0, 'repeated expiry processing has no second effect');

select ok(pg_catalog.has_function_privilege('service_role', 'public.create_storefront_order(uuid,uuid,text,text,text,text,jsonb,jsonb,numeric,jsonb)', 'EXECUTE'), 'backend service role can execute checkout transaction');
select ok(not pg_catalog.has_function_privilege('anon', 'public.create_storefront_order(uuid,uuid,text,text,text,text,jsonb,jsonb,numeric,jsonb)', 'EXECUTE'), 'anonymous clients cannot execute checkout transaction');
select ok(not pg_catalog.has_function_privilege('authenticated', 'public.create_storefront_order(uuid,uuid,text,text,text,text,jsonb,jsonb,numeric,jsonb)', 'EXECUTE'), 'browser user sessions cannot execute checkout transaction');
select ok(pg_catalog.has_function_privilege('service_role', 'public.release_expired_storefront_reservations(integer)', 'EXECUTE'), 'backend service role can run reservation cleanup');
select ok(not pg_catalog.has_function_privilege('anon', 'public.release_expired_storefront_reservations(integer)', 'EXECUTE'), 'anonymous clients cannot run reservation cleanup');
select ok(not pg_catalog.has_function_privilege('authenticated', 'public.release_expired_storefront_reservations(integer)', 'EXECUTE'), 'browser user sessions cannot run reservation cleanup');

select * from finish();
rollback;
