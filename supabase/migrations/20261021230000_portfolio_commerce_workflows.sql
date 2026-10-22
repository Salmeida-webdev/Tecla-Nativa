-- Complete the portfolio storefront transaction without enabling live charges
-- or shipment-label purchases. Payments are sandbox-only; freight remains quote-only.
begin;

alter table public.orders
  add column is_portfolio_demo boolean not null default true,
  add column coupon_code_snapshot text,
  add column fulfillment_carrier text,
  add column tracking_code text,
  add column tracking_url text,
  add column shipped_at timestamptz,
  add column delivered_at timestamptz,
  add constraint orders_tracking_url_https_check
    check (tracking_url is null or tracking_url ~ '^https://');

alter table public.payment_attempts
  add column environment text not null default 'sandbox'
    check (environment = 'sandbox'),
  add column checkout_lock_until timestamptz;

alter table public.coupon_redemptions
  add column redemption_status text not null default 'reserved'
    check (redemption_status in ('reserved','redeemed','released'));

create index coupon_redemptions_active_limit_idx
  on public.coupon_redemptions(store_id,coupon_id,redemption_status,redeemed_at)
  where redemption_status in ('reserved','redeemed');

create table public.storefront_shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  postal_code text not null check (postal_code ~ '^[0-9]{8}$'),
  cart_sha256 text not null check (cart_sha256 ~ '^[0-9a-f]{64}$'),
  provider_service_id text not null,
  carrier text not null,
  service_name text not null,
  shipping_total numeric(12,2) not null check (shipping_total >= 0),
  estimated_delivery_days integer check (estimated_delivery_days is null or estimated_delivery_days >= 0),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object'),
  quoted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  order_id uuid,
  created_at timestamptz not null default now(),
  unique (id,store_id),
  foreign key (order_id,store_id) references public.orders(id,store_id) on delete restrict,
  check (expires_at > quoted_at)
);
create index storefront_shipping_quotes_lookup_idx
  on public.storefront_shipping_quotes(store_id,postal_code,cart_sha256,expires_at desc);
alter table public.storefront_shipping_quotes enable row level security;
revoke all on public.storefront_shipping_quotes from anon, authenticated;

-- The demo store was intentionally seeded as setup/draft. This migration enables
-- its public catalog while the payment Edge Function remains hard-pinned to PagBank Sandbox.
update public.stores
set status = 'active', updated_at = now()
where slug = 'tecla-nativa' and status = 'setup';

update public.categories c
set active = true, updated_at = now()
from public.stores s
where s.id = c.store_id and s.slug = 'tecla-nativa' and not c.active;

update public.products p
set status = 'published', updated_at = now()
from public.stores s
where s.id = p.store_id and s.slug = 'tecla-nativa' and p.status = 'draft';

-- Portfolio weights and dimensions are clearly marked as estimates in the panel;
-- the owner can replace them with measured values before commercial use.
update public.product_variants pv
set weight_grams = coalesce(pv.weight_grams, case
      when c.slug in ('perifericos','perifericos-ergonomia') then 900
      when c.slug in ('audio-video','audio-e-video') then 650
      when c.slug in ('casa-inteligente','casa') then 700
      when c.slug in ('conectividade','conectividade-acessorios') then 350
      else 600 end),
    length_mm = coalesce(pv.length_mm, case
      when c.slug in ('perifericos','perifericos-ergonomia') then 380
      when c.slug in ('audio-video','audio-e-video') then 300
      when c.slug in ('casa-inteligente','casa') then 250
      else 200 end),
    width_mm = coalesce(pv.width_mm, case
      when c.slug in ('perifericos','perifericos-ergonomia') then 180
      when c.slug in ('audio-video','audio-e-video') then 220
      when c.slug in ('casa-inteligente','casa') then 180
      else 150 end),
    height_mm = coalesce(pv.height_mm, case
      when c.slug in ('perifericos','perifericos-ergonomia') then 65
      when c.slug in ('audio-video','audio-e-video') then 130
      when c.slug in ('casa-inteligente','casa') then 110
      else 75 end),
    updated_at = now()
from public.products p
join public.categories c on c.id = p.category_id and c.store_id = p.store_id
where pv.product_id = p.id and pv.store_id = p.store_id
  and p.store_id = (select id from public.stores where slug = 'tecla-nativa')
  and (pv.weight_grams is null or pv.length_mm is null or pv.width_mm is null or pv.height_mm is null);

insert into public.store_settings(store_id,setting_key,setting_value)
select id, 'shipping_origin', jsonb_build_object(
  'postal_code','00000000',
  'street','Endereço de demonstração',
  'neighborhood','Demonstração',
  'city','Cidade de demonstração',
  'state','PB',
  'country','BRA',
  'demo_only',true
)
from public.stores where slug = 'tecla-nativa'
on conflict (store_id,setting_key) do update
  set setting_value = public.store_settings.setting_value || excluded.setting_value,
    updated_at = now();

create or replace function private.reserve_portfolio_coupon(
  p_store_id uuid,
  p_order_id uuid,
  p_coupon_code text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_coupon_code,'')));
  v_coupon public.coupons%rowtype;
  v_order public.orders%rowtype;
  v_existing public.coupon_redemptions%rowtype;
  v_discount numeric(12,2);
  v_usage_count integer;
  v_customer_count integer;
begin
  if v_code = '' then return 0; end if;
  if pg_catalog.length(v_code) > 60 or v_code !~ '^[A-Z0-9_-]+$' then
    raise exception using errcode = '22023', message = 'O código do cupom é inválido.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and store_id = p_store_id
  for update;
  if not found or not v_order.is_portfolio_demo then
    raise exception using errcode = '22023', message = 'O pedido de demonstração não foi encontrado.';
  end if;

  select cr.* into v_existing
  from public.coupon_redemptions cr
  where cr.store_id = p_store_id and cr.order_id = p_order_id;
  if found then
    if not exists (
      select 1 from public.coupons c
      where c.id = v_existing.coupon_id and c.store_id = p_store_id and c.code = v_code
    ) then
      raise exception using errcode = '22023', message = 'Este pedido já reservou outro cupom.';
    end if;
    return v_existing.discount_amount;
  end if;

  select * into v_coupon
  from public.coupons c
  where c.store_id = p_store_id and c.code = v_code
  for update;
  if not found or v_coupon.status <> 'active'
    or (v_coupon.starts_at is not null and v_coupon.starts_at > now())
    or (v_coupon.ends_at is not null and v_coupon.ends_at <= now()) then
    raise exception using errcode = '22023', message = 'Cupom inválido ou fora do período de uso.';
  end if;
  if v_order.customer_email is null then
    raise exception using errcode = '22023', message = 'Informe um e-mail para validar o limite por cliente do cupom.';
  end if;
  if v_order.subtotal + v_order.shipping_total < v_coupon.minimum_order_total then
    raise exception using errcode = '22023', message = 'O pedido não atingiu o valor mínimo do cupom.';
  end if;

  select pg_catalog.count(*)::integer into v_usage_count
  from public.coupon_redemptions cr
  where cr.store_id = p_store_id and cr.coupon_id = v_coupon.id
    and cr.redemption_status in ('reserved','redeemed');
  if v_coupon.usage_limit is not null and v_usage_count >= v_coupon.usage_limit then
    raise exception using errcode = '22023', message = 'O limite de uso deste cupom foi atingido.';
  end if;

  select pg_catalog.count(*)::integer into v_customer_count
  from public.coupon_redemptions cr
  join public.orders o on o.id = cr.order_id and o.store_id = cr.store_id
  where cr.store_id = p_store_id and cr.coupon_id = v_coupon.id
    and cr.redemption_status in ('reserved','redeemed')
    and pg_catalog.lower(pg_catalog.btrim(o.customer_email)) = pg_catalog.lower(pg_catalog.btrim(v_order.customer_email));
  if v_customer_count >= v_coupon.per_customer_limit then
    raise exception using errcode = '22023', message = 'Você já atingiu o limite de uso deste cupom.';
  end if;

  v_discount := case v_coupon.discount_type
    when 'percentage' then pg_catalog.round(v_order.subtotal * v_coupon.discount_value / 100, 2)
    when 'fixed_amount' then v_coupon.discount_value
    when 'free_shipping' then v_order.shipping_total
  end;
  v_discount := least(v_order.subtotal + v_order.shipping_total, v_discount);
  if v_discount <= 0 then
    raise exception using errcode = '22023', message = 'O cupom não gera desconto para este pedido.';
  end if;

  update public.orders
  set discount_total = v_discount,
      total = subtotal - v_discount + shipping_total,
      coupon_code_snapshot = v_code,
      updated_at = now()
  where id = p_order_id and store_id = p_store_id;

  insert into public.coupon_redemptions(
    store_id,coupon_id,order_id,customer_id,discount_amount,redemption_status
  ) values (
    p_store_id,v_coupon.id,p_order_id,v_order.customer_id,v_discount,'reserved'
  );
  return v_discount;
end;
$$;

revoke all on function private.reserve_portfolio_coupon(uuid,uuid,text)
  from public, anon, authenticated, service_role;

create or replace function private.sync_portfolio_coupon_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status = 'paid' then
    update public.coupon_redemptions
    set redemption_status = 'redeemed', redeemed_at = coalesce(redeemed_at, now())
    where store_id = new.store_id and order_id = new.id and redemption_status = 'reserved';
  elsif new.status = 'cancelled' or new.payment_status in ('failed','refunded') then
    update public.coupon_redemptions
    set redemption_status = 'released'
    where store_id = new.store_id and order_id = new.id and redemption_status = 'reserved';
  end if;
  return new;
end;
$$;
revoke all on function private.sync_portfolio_coupon_redemption()
  from public, anon, authenticated, service_role;
create trigger orders_sync_portfolio_coupon_redemption
  after update of status,payment_status on public.orders
  for each row execute function private.sync_portfolio_coupon_redemption();

create or replace function public.create_portfolio_demo_order(
  p_store_id uuid,
  p_idempotency_key uuid,
  p_request_sha256 text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_shipping_quote_id uuid,
  p_cart_sha256 text,
  p_items jsonb,
  p_coupon_code text default null,
  p_customer_note text default null
)
returns table (
  result_order_id uuid,
  result_order_number text,
  result_subtotal numeric,
  result_discount_total numeric,
  result_shipping_total numeric,
  result_total numeric,
  result_coupon_code text,
  is_idempotent_replay boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.storefront_shipping_quotes%rowtype;
  v_existing public.orders%rowtype;
  v_items jsonb;
  v_item_count integer;
  v_order record;
  v_snapshot jsonb;
begin
  if p_store_id is null or p_idempotency_key is null
    or p_request_sha256 is null or p_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_cart_sha256 is null or p_cart_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Os dados idempotentes do pedido são inválidos.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception using errcode = '22023', message = 'O pedido deve conter de 1 a 20 variantes.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item(value)
    where jsonb_typeof(item.value) <> 'object'
      or jsonb_typeof(item.value->'sku') <> 'string'
      or (item.value->>'sku') !~* '^[A-Z0-9-]{2,60}$'
      or jsonb_typeof(item.value->'quantity') <> 'number'
      or (item.value->>'quantity') !~ '^[1-9][0-9]*$'
      or (item.value->>'quantity')::integer > 10
  ) then
    raise exception using errcode = '22023', message = 'Uma variante ou quantidade do pedido é inválida.';
  end if;
  if exists (
    select upper(item.value->>'sku') from jsonb_array_elements(p_items) item(value)
    group by upper(item.value->>'sku') having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'Remova variantes duplicadas antes de continuar.';
  end if;
  if (select sum((item.value->>'quantity')::integer) from jsonb_array_elements(p_items) item(value)) > 40 then
    raise exception using errcode = '22023', message = 'A quantidade total excede o limite por pedido.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_store_id::text || ':' || p_idempotency_key::text, 0)
  );
  select o.* into v_existing from public.orders o
  where o.store_id = p_store_id and o.checkout_idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_existing.checkout_request_sha256 is distinct from p_request_sha256 then
      raise exception using errcode = '22023', message = 'Esta tentativa do pedido já foi usada com dados diferentes.';
    end if;
    return query select v_existing.id,v_existing.order_number,v_existing.subtotal,
      v_existing.discount_total,v_existing.shipping_total,v_existing.total,
      v_existing.coupon_code_snapshot,true;
    return;
  end if;

  select * into v_quote
  from public.storefront_shipping_quotes q
  where q.id = p_shipping_quote_id and q.store_id = p_store_id
    and q.cart_sha256 = p_cart_sha256
    and q.postal_code = regexp_replace(coalesce(p_shipping_address->>'postal_code',''), '[^0-9]', '', 'g')
    and q.expires_at > now() and q.order_id is null
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'A cotação do frete expirou ou não corresponde à sacola. Consulte novamente.';
  end if;

  select jsonb_agg(jsonb_build_object('variant_id',pv.id,'quantity',(item.value->>'quantity')::integer) order by pv.id),
         count(*)::integer
  into v_items,v_item_count
  from jsonb_array_elements(p_items) item(value)
  join public.product_variants pv
    on pv.store_id = p_store_id and pv.sku = upper(item.value->>'sku') and pv.active
  join public.products p on p.id = pv.product_id and p.store_id = pv.store_id and p.status = 'published'
  join public.categories c on c.id = p.category_id and c.store_id = p.store_id and c.active;
  if v_item_count is distinct from jsonb_array_length(p_items) then
    raise exception using errcode = '22023', message = 'Uma variante da sacola não está disponível.';
  end if;

  v_snapshot := jsonb_build_object(
    'provider','melhor_envio',
    'quote_id',v_quote.id,
    'service_id',v_quote.provider_service_id,
    'service_name',v_quote.service_name,
    'carrier',v_quote.carrier,
    'shipping_total',v_quote.shipping_total,
    'estimated_delivery_days',v_quote.estimated_delivery_days,
    'quoted_at',v_quote.quoted_at,
    'label_created',false
  );

  select * into v_order
  from public.create_storefront_order(
    p_store_id,p_idempotency_key,p_request_sha256,p_customer_name,p_customer_email,
    p_customer_phone,p_shipping_address,v_snapshot,v_quote.shipping_total,v_items
  );

  update public.orders
  set is_portfolio_demo = true,
      customer_note = nullif(left(btrim(coalesce(p_customer_note,'')),1000),''),
      updated_at = now()
  where id = v_order.result_order_id and store_id = p_store_id;

  perform private.reserve_portfolio_coupon(p_store_id,v_order.result_order_id,p_coupon_code);

  update public.storefront_shipping_quotes
  set order_id = v_order.result_order_id
  where id = v_quote.id and store_id = p_store_id;

  return query
  select o.id,o.order_number,o.subtotal,o.discount_total,o.shipping_total,o.total,
         o.coupon_code_snapshot,false
  from public.orders o where o.id = v_order.result_order_id and o.store_id = p_store_id;
end;
$$;

revoke all on function public.create_portfolio_demo_order(uuid,uuid,text,text,text,text,jsonb,uuid,text,jsonb,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.create_portfolio_demo_order(uuid,uuid,text,text,text,text,jsonb,uuid,text,jsonb,text,text)
  to service_role;

create or replace function public.claim_portfolio_pagbank_checkout(p_order_id uuid)
returns table (
  result_payment_attempt_id uuid,
  result_action text,
  result_checkout_url text,
  result_provider_checkout_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_was_inserted boolean := false;
  v_key text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not v_order.is_portfolio_demo then
    raise exception using errcode = '22023', message = 'O pedido de portfólio não foi encontrado.';
  end if;
  if v_order.payment_status = 'paid' then
    return query select null::uuid,'already_paid'::text,null::text,null::text;
    return;
  end if;
  if v_order.status <> 'pending_payment' or v_order.payment_status not in ('pending','failed') then
    raise exception using errcode = '22023', message = 'Este pedido não pode iniciar outro checkout.';
  end if;

  v_key := 'portfolio-sandbox:' || v_order.id::text;
  insert into public.payment_attempts(
    store_id,order_id,provider,idempotency_key,status,amount,currency,environment,checkout_lock_until
  ) values (
    v_order.store_id,v_order.id,'pagbank',v_key,'created',v_order.total,v_order.currency,'sandbox',now()+interval '90 seconds'
  ) on conflict (store_id,idempotency_key) do nothing
  returning * into v_attempt;
  v_was_inserted := found;

  if not v_was_inserted then
    select * into v_attempt from public.payment_attempts pa
    where pa.store_id = v_order.store_id and pa.idempotency_key = v_key
    for update;
  end if;

  if v_attempt.checkout_url is not null then
    return query select v_attempt.id,'ready'::text,v_attempt.checkout_url,v_attempt.provider_checkout_id;
    return;
  end if;
  if not v_was_inserted and v_attempt.checkout_lock_until is not null and v_attempt.checkout_lock_until > now() then
    return query select v_attempt.id,'in_progress'::text,null::text,null::text;
    return;
  end if;
  update public.payment_attempts pa
  set checkout_lock_until = now()+interval '90 seconds', status = 'created', updated_at = now()
  where pa.id = v_attempt.id;
  return query select v_attempt.id,'create'::text,null::text,null::text;
end;
$$;
revoke all on function public.claim_portfolio_pagbank_checkout(uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_portfolio_pagbank_checkout(uuid) to service_role;

create or replace function public.complete_portfolio_pagbank_checkout(
  p_payment_attempt_id uuid,
  p_provider_checkout_id text,
  p_checkout_url text,
  p_expires_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_payment_attempt_id is null or p_provider_checkout_id is null
    or p_provider_checkout_id !~ '^CHEC_[A-Za-z0-9_-]{4,120}$'
    or p_checkout_url is null or p_checkout_url !~ '^https://[A-Za-z0-9.-]+/' then
    raise exception using errcode = '22023', message = 'O checkout PagBank retornado é inválido.';
  end if;
  update public.payment_attempts
  set provider_checkout_id = p_provider_checkout_id,
      checkout_url = p_checkout_url,
      expires_at = p_expires_at,
      status = 'pending',
      checkout_lock_until = null,
      updated_at = now()
  where id = p_payment_attempt_id and provider = 'pagbank' and environment = 'sandbox';
  return found;
end;
$$;
revoke all on function public.complete_portfolio_pagbank_checkout(uuid,text,text,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.complete_portfolio_pagbank_checkout(uuid,text,text,timestamptz)
  to service_role;

create or replace function public.release_portfolio_pagbank_checkout(p_payment_attempt_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_attempts
  set checkout_lock_until = null, updated_at = now()
  where id = p_payment_attempt_id and provider = 'pagbank'
    and environment = 'sandbox' and checkout_url is null;
  return found;
end;
$$;
revoke all on function public.release_portfolio_pagbank_checkout(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.release_portfolio_pagbank_checkout(uuid)
  to service_role;

create or replace function public.transition_storefront_order(
  p_order_id uuid,
  p_action text,
  p_carrier text default null,
  p_tracking_code text default null,
  p_tracking_url text default null,
  p_note text default null
)
returns table(result_status text,result_fulfillment_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_from_status text;
  v_to_status text;
  v_from_fulfillment text;
  v_to_fulfillment text;
  v_reservation record;
  v_actor uuid := auth.uid();
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = '22023', message = 'Pedido não encontrado.'; end if;
  if not private.is_store_member(v_order.store_id,array['owner','admin','fulfillment','support']) then
    raise exception using errcode = '42501', message = 'Você não tem permissão para atualizar este pedido.';
  end if;
  if p_action is null or p_action not in ('start_processing','mark_ready','mark_shipped','mark_delivered','cancel') then
    raise exception using errcode = '22023', message = 'A etapa solicitada não é válida.';
  end if;
  v_from_status := v_order.status;
  v_from_fulfillment := v_order.fulfillment_status;

  if p_action = 'start_processing' then
    if v_order.payment_status <> 'paid' or v_order.status <> 'paid' then
      raise exception using errcode = '22023', message = 'Só pedidos pagos podem entrar em separação.';
    end if;
    v_to_status := 'processing'; v_to_fulfillment := 'processing';
  elsif p_action = 'mark_ready' then
    if v_order.status <> 'processing' or v_order.fulfillment_status <> 'processing' then
      raise exception using errcode = '22023', message = 'Separe o pedido antes de marcá-lo como pronto.';
    end if;
    v_to_status := 'ready_to_ship'; v_to_fulfillment := 'ready';
  elsif p_action = 'mark_shipped' then
    if v_order.status <> 'ready_to_ship' or v_order.fulfillment_status <> 'ready' then
      raise exception using errcode = '22023', message = 'O pedido precisa estar pronto antes de ser enviado.';
    end if;
    if nullif(btrim(coalesce(p_carrier,'')),'') is null or length(btrim(p_carrier)) > 80 then
      raise exception using errcode = '22023', message = 'Informe a transportadora ou serviço usado.';
    end if;
    if p_tracking_code is not null and (length(btrim(p_tracking_code)) > 120 or p_tracking_code ~ '[[:cntrl:]]') then
      raise exception using errcode = '22023', message = 'O código de rastreio é inválido.';
    end if;
    if p_tracking_url is not null and (p_tracking_url !~ '^https://' or length(p_tracking_url) > 2048) then
      raise exception using errcode = '22023', message = 'A URL de rastreio precisa ser HTTPS.';
    end if;
    v_to_status := 'shipped'; v_to_fulfillment := 'shipped';
  elsif p_action = 'mark_delivered' then
    if v_order.status <> 'shipped' or v_order.fulfillment_status <> 'shipped' then
      raise exception using errcode = '22023', message = 'Só um pedido enviado pode ser marcado como entregue.';
    end if;
    v_to_status := 'delivered'; v_to_fulfillment := 'delivered';
  else
    if v_order.status <> 'pending_payment' or v_order.payment_status not in ('pending','failed') then
      raise exception using errcode = '22023', message = 'Um pedido pago exige estorno antes do cancelamento.';
    end if;
    for v_reservation in
      select id,variant_id,quantity from public.inventory_reservations
      where store_id = v_order.store_id and order_id = v_order.id and status = 'active'
      order by variant_id for update
    loop
      update public.inventory_levels
      set reserved = reserved - v_reservation.quantity, updated_at = now()
      where store_id = v_order.store_id and variant_id = v_reservation.variant_id
        and reserved >= v_reservation.quantity;
      if not found then raise exception using errcode = '23514', message = 'A reserva do pedido não corresponde ao estoque.'; end if;
      update public.inventory_reservations set status = 'released',updated_at = now()
      where id = v_reservation.id and status = 'active';
    end loop;
    v_to_status := 'cancelled'; v_to_fulfillment := v_order.fulfillment_status;
  end if;

  update public.orders
  set status = v_to_status,
      fulfillment_status = v_to_fulfillment,
      fulfillment_carrier = case when p_action='mark_shipped' then btrim(p_carrier) else fulfillment_carrier end,
      tracking_code = case when p_action='mark_shipped' then nullif(btrim(coalesce(p_tracking_code,'')),'') else tracking_code end,
      tracking_url = case when p_action='mark_shipped' then nullif(btrim(coalesce(p_tracking_url,'')),'') else tracking_url end,
      shipped_at = case when p_action='mark_shipped' then now() else shipped_at end,
      delivered_at = case when p_action='mark_delivered' then now() else delivered_at end,
      updated_at = now()
  where id = v_order.id and store_id = v_order.store_id;

  insert into public.order_status_events(store_id,order_id,from_status,to_status,actor_user_id,source,note)
  values (v_order.store_id,v_order.id,v_from_status,v_to_status,v_actor,'admin',left(coalesce(p_note,'Etapa atualizada pelo painel.'),500));
  insert into public.audit_events(store_id,actor_user_id,action,entity_table,entity_id,safe_changes,source)
  values (v_order.store_id,v_actor,'order.'||p_action,'orders',v_order.id,
    jsonb_build_object('from_status',v_from_status,'to_status',v_to_status,
      'from_fulfillment',v_from_fulfillment,'to_fulfillment',v_to_fulfillment,
      'tracking_present',p_action='mark_shipped' and nullif(btrim(coalesce(p_tracking_code,'')),'') is not null),
    'admin');
  return query select v_to_status,v_to_fulfillment;
end;
$$;

revoke all on function public.transition_storefront_order(uuid,text,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.transition_storefront_order(uuid,text,text,text,text,text)
  to authenticated;
revoke update on public.orders from authenticated;
drop policy if exists orders_staff_update on public.orders;

commit;
