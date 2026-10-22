begin;

select plan(17);

create temporary table portfolio_checkout_context (
  store_id uuid not null,
  category_id uuid not null,
  product_id uuid not null,
  variant_id uuid not null,
  quote_id uuid not null,
  second_quote_id uuid not null,
  coupon_id uuid not null,
  first_key uuid not null,
  second_key uuid not null,
  order_id uuid
) on commit drop;

insert into portfolio_checkout_context
select pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
       pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
       pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(), null;

insert into public.stores (id,slug,name,status,currency)
select store_id,'portfolio-checkout-'||pg_catalog.replace(store_id::text,'-',''),'Portfolio test','active','BRL'
from portfolio_checkout_context;

insert into public.categories (id,store_id,name,slug,active)
select category_id,store_id,'Portfolio test','portfolio-test',true from portfolio_checkout_context;

insert into public.products (id,store_id,category_id,slug,sku_base,name,base_price,status)
select product_id,store_id,category_id,'portfolio-test-product','PORTFOLIO-TEST','Produto demonstrativo',10.00,'published'
from portfolio_checkout_context;

insert into public.product_variants (id,store_id,product_id,sku,option_key,option_label,active)
select variant_id,store_id,product_id,'PORTFOLIO-TEST-GRAFITE','grafite','Grafite',true
from portfolio_checkout_context;

insert into public.inventory_levels(store_id,variant_id,on_hand,reserved)
select store_id,variant_id,5,0 from portfolio_checkout_context;

insert into public.storefront_shipping_quotes(
  id,store_id,postal_code,cart_sha256,provider_service_id,carrier,service_name,shipping_total,
  estimated_delivery_days,safe_metadata,quoted_at,expires_at
)
select quote_id,store_id,'12345678',pg_catalog.repeat('a',64),'1','Correios','PAC',5.00,5,
       '{"sandbox":true}'::jsonb,pg_catalog.now(),pg_catalog.now()+interval '10 minutes'
from portfolio_checkout_context;

insert into public.storefront_shipping_quotes(
  id,store_id,postal_code,cart_sha256,provider_service_id,carrier,service_name,shipping_total,
  estimated_delivery_days,safe_metadata,quoted_at,expires_at
)
select second_quote_id,store_id,'12345678',pg_catalog.repeat('a',64),'1','Correios','PAC',5.00,5,
       '{"sandbox":true}'::jsonb,pg_catalog.now(),pg_catalog.now()+interval '10 minutes'
from portfolio_checkout_context;

insert into public.coupons(id,store_id,code,discount_type,discount_value,minimum_order_total,usage_limit,per_customer_limit,status)
select coupon_id,store_id,'TESTE3','fixed_amount',3.00,0,3,1,'active' from portfolio_checkout_context;

create temporary table portfolio_checkout_created on commit drop as
select result.*
from portfolio_checkout_context context
cross join lateral public.create_portfolio_demo_order(
  context.store_id,context.first_key,pg_catalog.repeat('b',64),'Cliente de demonstração',
  'cliente@example.com','83999990000',
  '{"postal_code":"12345678","street":"Rua de Teste","number":"10","neighborhood":"Centro","city":"Cidade de Teste","state":"PB"}'::jsonb,
  context.quote_id,pg_catalog.repeat('a',64),
  pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('sku','PORTFOLIO-TEST-GRAFITE','quantity',2)),
  'teste3',null
) result;

update portfolio_checkout_context context
set order_id = created.result_order_id
from portfolio_checkout_created created;

select is((select pg_catalog.count(*) from portfolio_checkout_created),1::bigint,'creates one portfolio order');
select is((select result_subtotal from portfolio_checkout_created),20.00::numeric,'uses database price snapshots');
select is((select result_discount_total from portfolio_checkout_created),3.00::numeric,'reserves the eligible coupon discount');
select is((select result_shipping_total from portfolio_checkout_created),5.00::numeric,'stores the Melhor Envio quote amount');
select is((select result_total from portfolio_checkout_created),22.00::numeric,'calculates total from subtotal, discount, and freight');
select is((select available from public.inventory_levels il join portfolio_checkout_context c using(store_id,variant_id)),3,'reserves inventory exactly once');
select is((select shipping_method_snapshot->>'provider' from public.orders o join portfolio_checkout_context c on c.order_id=o.id),'melhor_envio','stores provider on the order snapshot');
select is((select shipping_method_snapshot->>'quote_id' from public.orders o join portfolio_checkout_context c on c.order_id=o.id),(select quote_id::text from portfolio_checkout_context),'stores the selected quote id');
select is((select shipping_method_snapshot->>'label_created' from public.orders o join portfolio_checkout_context c on c.order_id=o.id),'false','never creates a shipping label');
select is((select redemption_status from public.coupon_redemptions cr join portfolio_checkout_context c using(store_id) where cr.order_id=c.order_id),'reserved','keeps coupon reserved until payment confirmation');

create temporary table portfolio_checkout_replay on commit drop as
select result.*
from portfolio_checkout_context context
cross join lateral public.create_portfolio_demo_order(
  context.store_id,context.first_key,pg_catalog.repeat('b',64),'Cliente de demonstração',
  'cliente@example.com','83999990000',
  '{"postal_code":"12345678","street":"Rua de Teste","number":"10","neighborhood":"Centro","city":"Cidade de Teste","state":"PB"}'::jsonb,
  context.quote_id,pg_catalog.repeat('a',64),
  pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('sku','PORTFOLIO-TEST-GRAFITE','quantity',2)),
  'teste3',null
) result;

select ok((select is_idempotent_replay from portfolio_checkout_replay),'replays an identical checkout safely');
select is((select result_order_id from portfolio_checkout_replay),(select order_id from portfolio_checkout_context),'returns original order on replay');
select throws_ok(
  $$select * from public.create_portfolio_demo_order(
    (select store_id from portfolio_checkout_context),(select first_key from portfolio_checkout_context),pg_catalog.repeat('c',64),
    'Cliente de demonstração','cliente@example.com','83999990000',
    '{"postal_code":"12345678","street":"Rua de Teste","number":"10","neighborhood":"Centro","city":"Cidade de Teste","state":"PB"}'::jsonb,
    (select quote_id from portfolio_checkout_context),pg_catalog.repeat('a',64),
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('sku','PORTFOLIO-TEST-GRAFITE','quantity',2)),'teste3',null
  )$$,
  '22023','Esta tentativa do pedido já foi usada com dados diferentes.','rejects idempotency-key reuse with different content'
);

update public.orders set status='cancelled' where id=(select order_id from portfolio_checkout_context);
select is((select redemption_status from public.coupon_redemptions cr join portfolio_checkout_context c using(store_id) where cr.order_id=c.order_id),'released','releases coupon reservation after unpaid cancellation');

create temporary table portfolio_checkout_second on commit drop as
select result.*
from portfolio_checkout_context context
cross join lateral public.create_portfolio_demo_order(
  context.store_id,context.second_key,pg_catalog.repeat('d',64),'Cliente de demonstração',
  'cliente@example.com','83999990000',
  '{"postal_code":"12345678","street":"Rua de Teste","number":"10","neighborhood":"Centro","city":"Cidade de Teste","state":"PB"}'::jsonb,
  context.second_quote_id,pg_catalog.repeat('a',64),
  pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('sku','PORTFOLIO-TEST-GRAFITE','quantity',1)),
  'teste3',null
) result;

select is((select result_discount_total from portfolio_checkout_second),3.00::numeric,'makes released coupon capacity available again');
select is((select pg_catalog.count(*) from public.coupon_redemptions cr join portfolio_checkout_context c using(store_id) where cr.coupon_id=c.coupon_id),2::bigint,'retains the released redemption history');
select throws_ok(
  $$select * from public.create_portfolio_demo_order(
    (select store_id from portfolio_checkout_context),pg_catalog.gen_random_uuid(),pg_catalog.repeat('e',64),
    'Cliente de demonstração','cliente@example.com','83999990000',
    '{"postal_code":"58000000","street":"Rua de Teste","number":"10","neighborhood":"Centro","city":"Cidade de Teste","state":"PB"}'::jsonb,
    (select quote_id from portfolio_checkout_context),pg_catalog.repeat('a',64),
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('sku','PORTFOLIO-TEST-GRAFITE','quantity',1)),null,null
  )$$,
  '22023','A cotação do frete expirou ou não corresponde à sacola. Consulte novamente.','rejects a quote for a different destination CEP'
);

select * from finish();
rollback;
