begin;

select plan(37);

create temporary table webhook_test_context (
  store_id uuid not null,
  category_id uuid not null,
  product_id uuid not null,
  variant_id uuid not null,
  checkout_key uuid not null,
  order_id uuid,
  provider_shipment_id text not null
) on commit drop;

insert into webhook_test_context
select pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
       pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
       pg_catalog.gen_random_uuid(), null,
       '0000aaaa-aa00-00aa-aa00-000000aaaaaa';

insert into public.stores (id, slug, name, status, currency)
select store_id, 'webhook-test-' || pg_catalog.replace(store_id::text, '-', ''),
       'Webhook test', 'active', 'BRL'
from webhook_test_context;

insert into public.categories (id, store_id, name, slug, active)
select category_id, store_id, 'Webhook test', 'webhook-test', true
from webhook_test_context;

insert into public.products (id, store_id, category_id, slug, sku_base, name, base_price, status)
select product_id, store_id, category_id, 'webhook-test-product', 'WEBHOOK-TEST',
       'Produto de teste webhook', 10.00, 'published'
from webhook_test_context;

insert into public.product_variants (id, store_id, product_id, sku, option_key, option_label, active)
select variant_id, store_id, product_id, 'WEBHOOK-TEST-ONE', 'unica', 'Única', true
from webhook_test_context;

insert into public.inventory_levels (store_id, variant_id, on_hand, reserved)
select store_id, variant_id, 5, 0 from webhook_test_context;

create temporary table webhook_test_order on commit drop as
select result.*
from webhook_test_context as context
cross join lateral public.create_storefront_order(
  context.store_id,
  context.checkout_key,
  pg_catalog.repeat('a', 64),
  'Cliente de teste', null, null,
  '{"postal_code":"58000000","city":"João Pessoa","state":"PB"}'::jsonb,
  '{}'::jsonb,
  0,
  pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'variant_id', context.variant_id,
    'quantity', 2
  ))
) as result;

update webhook_test_context
set order_id = created.result_order_id
from webhook_test_order as created;

insert into public.payment_attempts (
  store_id, order_id, provider, provider_checkout_id, idempotency_key,
  method, status, amount, currency
)
select store_id, order_id, 'pagbank', 'CHEC_WEBHOOK_TEST',
       'pagbank-webhook-test-' || pg_catalog.replace(store_id::text, '-', ''),
       'pix', 'pending', 20.00, 'BRL'
from webhook_test_context;

select is(
  public.apply_pagbank_webhook(
    (select order_id from webhook_test_context), pg_catalog.repeat('1', 64), 'PAID',
    pg_catalog.repeat('a', 64), 'CHEC_WEBHOOK_TEST', 'CHAR_WEBHOOK_TEST',
    2000, 'BRL', pg_catalog.now(), '{"event_status":"PAID"}'::jsonb
  ), 'processed', 'PagBank marks a matched sandbox payment paid'
);
select is((select pa.status from public.payment_attempts pa join webhook_test_context c using (store_id, order_id)), 'paid', 'stores the paid payment-attempt state');
select is((select o.status from public.orders o join webhook_test_context c on c.store_id = o.store_id and c.order_id = o.id), 'paid', 'advances the order to paid');
select is((select o.payment_status from public.orders o join webhook_test_context c on c.store_id = o.store_id and c.order_id = o.id), 'paid', 'advances the order payment state');
select is((select il.on_hand from public.inventory_levels il join webhook_test_context c using (store_id, variant_id)), 3, 'consumes reserved inventory once');
select is((select il.reserved from public.inventory_levels il join webhook_test_context c using (store_id, variant_id)), 0, 'clears the matching reservation');
select is((select pg_catalog.count(*)::integer from public.stock_movements sm join webhook_test_context c using (store_id) where sm.order_id = c.order_id and sm.movement_type = 'sale'), 1, 'writes one sale stock movement');
select is((select pg_catalog.count(*)::integer from public.financial_transactions ft join webhook_test_context c using (store_id) where ft.order_id = c.order_id and ft.kind = 'capture'), 1, 'writes one financial capture');

select is(
  public.apply_pagbank_webhook(
    (select order_id from webhook_test_context), pg_catalog.repeat('1', 64), 'PAID',
    pg_catalog.repeat('a', 64), 'CHEC_WEBHOOK_TEST', 'CHAR_WEBHOOK_TEST',
    2000, 'BRL', pg_catalog.now(), '{"event_status":"PAID"}'::jsonb
  ), 'duplicate', 'deduplicates an identical PagBank delivery'
);
select is((select il.on_hand from public.inventory_levels il join webhook_test_context c using (store_id, variant_id)), 3, 'duplicate delivery does not consume inventory twice');
select is(
  public.apply_pagbank_webhook(
    (select order_id from webhook_test_context), pg_catalog.repeat('2', 64), 'WAITING',
    pg_catalog.repeat('b', 64), 'CHEC_WEBHOOK_TEST', 'CHAR_WEBHOOK_TEST',
    2000, 'BRL', null, '{"event_status":"WAITING"}'::jsonb
  ), 'ignored_out_of_order', 'a delayed pending state cannot undo payment'
);
select is(
  public.apply_pagbank_webhook(
    (select order_id from webhook_test_context), pg_catalog.repeat('3', 64), 'PAID',
    pg_catalog.repeat('c', 64), 'CHEC_WEBHOOK_TEST', 'CHAR_BAD_AMOUNT',
    1999, 'BRL', pg_catalog.now(), '{"event_status":"PAID"}'::jsonb
  ), 'payment_attempt_mismatch', 'rejects a payment amount different from its attempt'
);
select is(
  public.apply_pagbank_webhook(
    (select order_id from webhook_test_context), pg_catalog.repeat('4', 64), 'PAID',
    pg_catalog.repeat('d', 64), 'CHEC_WEBHOOK_TEST', 'CHAR_DUPLICATE_CAPTURE',
    2000, 'BRL', pg_catalog.now(), '{"event_status":"PAID"}'::jsonb
  ), 'duplicate_capture_review', 'flags a second charge for human review'
);
select is((select pg_catalog.count(*)::integer from public.financial_transactions ft join webhook_test_context c using (store_id) where ft.order_id = c.order_id and ft.kind = 'capture'), 2, 'records the second capture separately for reconciliation');
select is((select pg_catalog.count(*)::integer from public.stock_movements sm join webhook_test_context c using (store_id) where sm.order_id = c.order_id and sm.movement_type = 'sale'), 1, 'second capture does not decrement stock again');

insert into public.shipments (store_id, order_id, provider, provider_shipment_id, status)
select store_id, order_id, 'melhor_envio', provider_shipment_id, 'quoted'
from webhook_test_context;

select is(
  public.apply_melhor_envio_webhook(
    (select provider_shipment_id from webhook_test_context), pg_catalog.repeat('5', 64),
    'order.posted', pg_catalog.repeat('e', 64), 'posted', 'AB123456789BR',
    '2026-10-21T15:00:00-03:00'::timestamptz,
    '{"event":"order.posted","tracking_present":true}'::jsonb
  ), 'processed', 'applies a signed posted event'
);
select is((select s.status from public.shipments s join webhook_test_context c using (store_id) where s.order_id = c.order_id), 'posted', 'stores the carrier status');
select is((select s.tracking_code from public.shipments s join webhook_test_context c using (store_id) where s.order_id = c.order_id), 'AB123456789BR', 'stores a safe tracking code');
select is((select o.status from public.orders o join webhook_test_context c on c.store_id = o.store_id and c.order_id = o.id), 'shipped', 'advances order status when shipment is posted');
select is((select o.fulfillment_status from public.orders o join webhook_test_context c on c.store_id = o.store_id and c.order_id = o.id), 'shipped', 'advances fulfillment status when shipment is posted');
select is(
  public.apply_melhor_envio_webhook(
    (select provider_shipment_id from webhook_test_context), pg_catalog.repeat('5', 64),
    'order.posted', pg_catalog.repeat('e', 64), 'posted', 'AB123456789BR',
    '2026-10-21T15:00:00-03:00'::timestamptz,
    '{"event":"order.posted","tracking_present":true}'::jsonb
  ), 'duplicate', 'deduplicates a repeated Melhor Envio delivery'
);
select is((select pg_catalog.count(*)::integer from public.shipment_events se join webhook_test_context c using (store_id) join public.shipments s on s.id = se.shipment_id where s.order_id = c.order_id), 1, 'repeated delivery creates only one shipment event');
select is(
  public.apply_melhor_envio_webhook(
    (select provider_shipment_id from webhook_test_context), pg_catalog.repeat('6', 64),
    'order.received', pg_catalog.repeat('f', 64), 'in_transit', null,
    '2026-10-21T14:00:00-03:00'::timestamptz,
    '{"event":"order.received","tracking_present":false}'::jsonb
  ), 'stale_event', 'stores but does not apply an older carrier status'
);
select is((select s.status from public.shipments s join webhook_test_context c using (store_id) where s.order_id = c.order_id), 'posted', 'older carrier status cannot roll shipment back');
select is(
  public.apply_melhor_envio_webhook(
    (select provider_shipment_id from webhook_test_context), pg_catalog.repeat('7', 64),
    'order.delivered', pg_catalog.repeat('1', 64), 'delivered', 'AB123456789BR',
    '2026-10-22T12:00:00-03:00'::timestamptz,
    '{"event":"order.delivered","tracking_present":true}'::jsonb
  ), 'processed', 'applies a later delivery confirmation'
);
select is((select o.status from public.orders o join webhook_test_context c on c.store_id = o.store_id and c.order_id = o.id), 'delivered', 'marks the order delivered');
select is((select o.fulfillment_status from public.orders o join webhook_test_context c on c.store_id = o.store_id and c.order_id = o.id), 'delivered', 'marks fulfillment delivered');
select is(
  public.apply_melhor_envio_webhook(
    (select provider_shipment_id from webhook_test_context), pg_catalog.repeat('8', 64),
    'order.posted', pg_catalog.repeat('2', 64), 'posted', 'AB123456789BR',
    '2026-10-21T15:00:00-03:00'::timestamptz,
    '{"event":"order.posted","tracking_present":true}'::jsonb
  ), 'stale_event', 'a later-arriving older event cannot undo delivery'
);
select is((select s.status from public.shipments s join webhook_test_context c using (store_id) where s.order_id = c.order_id), 'delivered', 'keeps the delivered shipment terminal');
select is((select pg_catalog.count(*)::integer from public.shipment_events se join webhook_test_context c using (store_id) join public.shipments s on s.id = se.shipment_id where s.order_id = c.order_id), 4, 'retains each distinct carrier event in the timeline');
select is(
  public.apply_melhor_envio_webhook(
    (select provider_shipment_id from webhook_test_context), pg_catalog.repeat('7', 64),
    'order.delivered', pg_catalog.repeat('3', 64), 'delivered', 'AB123456789BR',
    '2026-10-22T12:00:00-03:00'::timestamptz,
    '{"event":"order.delivered","tracking_present":true}'::jsonb
  ), 'event_conflict', 'rejects a reused carrier event id with a changed body'
);

select ok(pg_catalog.has_function_privilege('service_role', 'public.apply_pagbank_webhook(uuid,text,text,text,text,text,bigint,text,timestamptz,jsonb)', 'EXECUTE'), 'service role can execute PagBank RPC');
select ok(not pg_catalog.has_function_privilege('anon', 'public.apply_pagbank_webhook(uuid,text,text,text,text,text,bigint,text,timestamptz,jsonb)', 'EXECUTE'), 'anonymous role cannot execute PagBank RPC');
select ok(not pg_catalog.has_function_privilege('authenticated', 'public.apply_pagbank_webhook(uuid,text,text,text,text,text,bigint,text,timestamptz,jsonb)', 'EXECUTE'), 'authenticated role cannot execute PagBank RPC');
select ok(pg_catalog.has_function_privilege('service_role', 'public.apply_melhor_envio_webhook(text,text,text,text,text,text,timestamptz,jsonb)', 'EXECUTE'), 'service role can execute Melhor Envio RPC');
select ok(not pg_catalog.has_function_privilege('anon', 'public.apply_melhor_envio_webhook(text,text,text,text,text,text,timestamptz,jsonb)', 'EXECUTE'), 'anonymous role cannot execute Melhor Envio RPC');
select ok(not pg_catalog.has_function_privilege('authenticated', 'public.apply_melhor_envio_webhook(text,text,text,text,text,text,timestamptz,jsonb)', 'EXECUTE'), 'authenticated role cannot execute Melhor Envio RPC');

select * from finish();
rollback;
