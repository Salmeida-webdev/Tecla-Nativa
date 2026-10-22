-- Checkout groundwork: idempotent order creation and atomic stock reservation.
-- This migration does not enable the storefront checkout or contact a payment provider.
begin;

alter table public.orders
  add column checkout_idempotency_key uuid,
  add column checkout_request_sha256 text,
  add column shipping_method_snapshot jsonb not null default '{}'::jsonb,
  add constraint orders_checkout_request_pair_check
    check (
      (checkout_idempotency_key is null and checkout_request_sha256 is null)
      or (
        checkout_idempotency_key is not null
        and checkout_request_sha256 is not null
        and checkout_request_sha256 ~ '^[0-9a-f]{64}$'
      )
    ),
  add constraint orders_shipping_method_snapshot_object_check
    check (jsonb_typeof(shipping_method_snapshot) = 'object');

create unique index orders_store_checkout_idempotency_idx
  on public.orders(store_id, checkout_idempotency_key)
  where checkout_idempotency_key is not null;

create or replace function public.release_expired_storefront_reservations(
  p_limit integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_order_status text;
  v_payment_status text;
  v_variant_id uuid;
  v_quantity integer;
  v_processed integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'O limite de expiração deve ficar entre 1 e 1000.';
  end if;

  for v_candidate in
    select ir.id, ir.store_id, ir.order_id
    from public.inventory_reservations as ir
    join public.orders as o
      on o.id = ir.order_id and o.store_id = ir.store_id
    where ir.status = 'active'
      and ir.expires_at <= pg_catalog.now()
      and o.status in ('pending_payment', 'cancelled')
      and o.payment_status in ('pending', 'failed')
    order by ir.expires_at, ir.id
    limit p_limit
  loop
    -- Use the same order -> reservation -> inventory lock order as payment updates.
    select o.status, o.payment_status
    into v_order_status, v_payment_status
    from public.orders as o
    where o.id = v_candidate.order_id and o.store_id = v_candidate.store_id
    for update skip locked;
    if not found or v_payment_status not in ('pending', 'failed') or v_order_status not in ('pending_payment', 'cancelled') then
      continue;
    end if;

    select ir.quantity, ir.variant_id
    into v_quantity, v_variant_id
    from public.inventory_reservations as ir
    where ir.id = v_candidate.id
      and ir.store_id = v_candidate.store_id
      and ir.order_id = v_candidate.order_id
      and ir.status = 'active'
      and ir.expires_at <= pg_catalog.now()
    for update skip locked;
    if not found then
      continue;
    end if;

    update public.inventory_levels as il
    set reserved = il.reserved - v_quantity,
        updated_at = pg_catalog.now()
    where il.store_id = v_candidate.store_id
      and il.variant_id = v_variant_id
      and il.reserved >= v_quantity;
    if not found then
      raise exception using errcode = '23514', message = 'A reserva expirada não corresponde ao saldo reservado.';
    end if;

    update public.inventory_reservations as ir
    set status = 'expired', updated_at = pg_catalog.now()
    where ir.id = v_candidate.id and ir.status = 'active';

    update public.orders as o
    set status = 'cancelled', updated_at = pg_catalog.now()
    where o.id = v_candidate.order_id
      and o.store_id = v_candidate.store_id
      and o.status = 'pending_payment'
      and o.payment_status in ('pending', 'failed');
    if found then
      insert into public.order_status_events (
        store_id, order_id, from_status, to_status, source, note
      ) values (
        v_candidate.store_id,
        v_candidate.order_id,
        'pending_payment',
        'cancelled',
        'system',
        'Reserva do checkout expirada; pedido cancelado.'
      );
    end if;

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

revoke all on function public.release_expired_storefront_reservations(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.release_expired_storefront_reservations(integer)
  to service_role;

comment on function public.release_expired_storefront_reservations(integer)
  is 'Libera reservas vencidas de pedidos ainda não pagos e cancela os pedidos atomicamente; chamar por tarefa recorrente no backend.';

create or replace function public.create_storefront_order(
  p_store_id uuid,
  p_idempotency_key uuid,
  p_request_sha256 text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_shipping_method_snapshot jsonb,
  p_shipping_total numeric,
  p_items jsonb
)
returns table (
  result_order_id uuid,
  result_order_number text,
  result_total numeric,
  is_idempotent_replay boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_currency char(3);
  v_customer_name text := btrim(coalesce(p_customer_name, ''));
  v_customer_email text := nullif(lower(btrim(coalesce(p_customer_email, ''))), '');
  v_customer_phone text := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_existing_id uuid;
  v_existing_number text;
  v_existing_total numeric(12,2);
  v_existing_hash text;
  v_order_id uuid;
  v_order_number text;
  v_total_quantity integer;
  v_subtotal numeric(12,2) := 0;
  v_shipping_total numeric(12,2);
  v_total numeric(12,2);
  v_lines jsonb := '[]'::jsonb;
  v_requested record;
  v_product_id uuid;
  v_product_name text;
  v_variant_name text;
  v_sku text;
  v_image_path text;
  v_unit_price numeric(12,2);
  v_expires_at timestamptz := pg_catalog.now() + interval '20 minutes';
begin
  if p_store_id is null or p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'A loja e a chave de idempotência são obrigatórias.';
  end if;
  if p_request_sha256 is null or p_request_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'O hash idempotente do checkout é inválido.';
  end if;
  if pg_catalog.length(v_customer_name) < 2 or pg_catalog.length(v_customer_name) > 120 then
    raise exception using errcode = '22023', message = 'Informe um nome entre 2 e 120 caracteres.';
  end if;
  if v_customer_email is not null and (
    pg_catalog.length(v_customer_email) > 254
    or v_customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception using errcode = '22023', message = 'O e-mail informado é inválido.';
  end if;
  if v_customer_phone is not null and (
    pg_catalog.length(v_customer_phone) > 32
    or v_customer_phone ~ '[[:cntrl:]]'
  ) then
    raise exception using errcode = '22023', message = 'O telefone informado é inválido.';
  end if;
  if p_shipping_address is null or pg_catalog.jsonb_typeof(p_shipping_address) <> 'object'
    or p_shipping_address = '{}'::jsonb then
    raise exception using errcode = '22023', message = 'O endereço de entrega é obrigatório.';
  end if;
  if p_shipping_method_snapshot is null or pg_catalog.jsonb_typeof(p_shipping_method_snapshot) <> 'object' then
    raise exception using errcode = '22023', message = 'O resumo do frete é inválido.';
  end if;
  if p_shipping_total is null or p_shipping_total < 0 or p_shipping_total > 9999999999.99
    or pg_catalog.round(p_shipping_total, 2) <> p_shipping_total then
    raise exception using errcode = '22023', message = 'O valor do frete é inválido.';
  end if;
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array'
    or pg_catalog.jsonb_array_length(p_items) < 1
    or pg_catalog.jsonb_array_length(p_items) > 20 then
    raise exception using errcode = '22023', message = 'O pedido deve conter de 1 a 20 itens.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) as item(value)
    where pg_catalog.jsonb_typeof(item.value) <> 'object'
      or pg_catalog.jsonb_typeof(item.value->'variant_id') <> 'string'
      or (item.value->>'variant_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(item.value->'quantity') <> 'number'
      or (item.value->>'quantity') !~ '^[1-9][0-9]*$'
      or (item.value->>'quantity')::integer > 10
  ) then
    raise exception using errcode = '22023', message = 'Um item ou uma quantidade do pedido é inválido.';
  end if;
  if exists (
    select (item.value->>'variant_id')::uuid
    from pg_catalog.jsonb_array_elements(p_items) as item(value)
    group by (item.value->>'variant_id')::uuid
    having pg_catalog.count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'Remova variantes duplicadas antes de criar o pedido.';
  end if;
  select pg_catalog.sum((item.value->>'quantity')::integer)::integer
  into v_total_quantity
  from pg_catalog.jsonb_array_elements(p_items) as item(value);
  if v_total_quantity > 40 then
    raise exception using errcode = '22023', message = 'A quantidade total excede o limite por pedido.';
  end if;

  -- Serialize retries with the same key before looking up or creating the order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_store_id::text || ':' || p_idempotency_key::text, 0)
  );

  select o.id, o.order_number, o.total, o.checkout_request_sha256
  into v_existing_id, v_existing_number, v_existing_total, v_existing_hash
  from public.orders as o
  where o.store_id = p_store_id
    and o.checkout_idempotency_key = p_idempotency_key;
  if found then
    if v_existing_hash is distinct from p_request_sha256 then
      raise exception using errcode = '22023', message = 'A chave de idempotência já foi usada com dados diferentes.';
    end if;
    return query select v_existing_id, v_existing_number, v_existing_total, true;
    return;
  end if;

  -- A checkout request also cleans up a bounded batch of stale reservations.
  perform public.release_expired_storefront_reservations(1000);

  select s.currency into v_currency
  from public.stores as s
  where s.id = p_store_id and s.status = 'active'
  for share;
  if not found then
    raise exception using errcode = '22023', message = 'A loja não está habilitada para receber pedidos.';
  end if;

  -- Lock stock rows in a stable variant order so simultaneous multi-item carts do not oversell.
  for v_requested in
    select (item.value->>'variant_id')::uuid as variant_id,
           (item.value->>'quantity')::integer as quantity
    from pg_catalog.jsonb_array_elements(p_items) as item(value)
    order by (item.value->>'variant_id')::uuid
  loop
    select p.id,
           p.name,
           pv.option_label,
           pv.sku,
           coalesce(pv.image_path, p.primary_image_path),
           coalesce(pv.price_override, p.base_price)
    into v_product_id, v_product_name, v_variant_name, v_sku, v_image_path, v_unit_price
    from public.product_variants as pv
    join public.products as p
      on p.id = pv.product_id and p.store_id = pv.store_id
    join public.categories as c
      on c.id = p.category_id and c.store_id = p.store_id
    join public.inventory_levels as il
      on il.variant_id = pv.id and il.store_id = pv.store_id
    where pv.id = v_requested.variant_id
      and pv.store_id = p_store_id
      and pv.active
      and p.status = 'published'
      and c.active
    for update of pv, p, c, il;
    if not found then
      raise exception using errcode = '22023', message = 'Um produto do pedido não está disponível.';
    end if;
    if v_unit_price is null or v_unit_price <= 0 then
      raise exception using errcode = '22023', message = 'Um produto do pedido está sem preço válido.';
    end if;

    update public.inventory_levels as il
    set reserved = il.reserved + v_requested.quantity,
        updated_at = pg_catalog.now()
    where il.variant_id = v_requested.variant_id
      and il.store_id = p_store_id
      and il.available >= v_requested.quantity;
    if not found then
      raise exception using errcode = '22023', message = 'Estoque insuficiente para um dos produtos.';
    end if;

    v_subtotal := v_subtotal + v_unit_price * v_requested.quantity;
    v_lines := v_lines || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id', v_product_id,
        'variant_id', v_requested.variant_id,
        'product_name', v_product_name,
        'variant_name', v_variant_name,
        'sku', v_sku,
        'image_path', v_image_path,
        'unit_price', v_unit_price,
        'quantity', v_requested.quantity
      )
    );
  end loop;

  if v_subtotal > 9999999999.99 then
    raise exception using errcode = '22023', message = 'O subtotal do pedido excede o limite permitido.';
  end if;
  v_shipping_total := p_shipping_total::numeric(12,2);
  if v_subtotal + v_shipping_total > 9999999999.99 then
    raise exception using errcode = '22023', message = 'O total do pedido excede o limite permitido.';
  end if;
  v_total := (v_subtotal + v_shipping_total)::numeric(12,2);

  v_order_number := 'TN-' || pg_catalog.to_char(pg_catalog.now() at time zone 'UTC', 'YYYYMMDD')
    || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.orders (
    store_id, customer_id, order_number, customer_name, customer_email, customer_phone,
    currency, subtotal, discount_total, shipping_total, total, shipping_address,
    shipping_method_snapshot, checkout_idempotency_key, checkout_request_sha256
  ) values (
    p_store_id, null, v_order_number, v_customer_name, v_customer_email, v_customer_phone,
    v_currency, v_subtotal, 0, v_shipping_total, v_total, p_shipping_address,
    p_shipping_method_snapshot, p_idempotency_key, p_request_sha256
  ) returning id into v_order_id;

  for v_requested in
    select item.value
    from pg_catalog.jsonb_array_elements(v_lines) as item(value)
  loop
    insert into public.order_items (
      store_id, order_id, product_id, variant_id, product_name_snapshot,
      variant_name_snapshot, sku_snapshot, image_path_snapshot, unit_price, quantity
    ) values (
      p_store_id, v_order_id,
      (v_requested.value->>'product_id')::uuid,
      (v_requested.value->>'variant_id')::uuid,
      v_requested.value->>'product_name',
      v_requested.value->>'variant_name',
      v_requested.value->>'sku',
      nullif(v_requested.value->>'image_path', ''),
      (v_requested.value->>'unit_price')::numeric(12,2),
      (v_requested.value->>'quantity')::integer
    );

    insert into public.inventory_reservations (
      store_id, order_id, variant_id, quantity, status, expires_at
    ) values (
      p_store_id, v_order_id,
      (v_requested.value->>'variant_id')::uuid,
      (v_requested.value->>'quantity')::integer,
      'active', v_expires_at
    );
  end loop;

  insert into public.order_status_events (store_id, order_id, from_status, to_status, source, note)
  values (p_store_id, v_order_id, null, 'pending_payment', 'system', 'Pedido criado pelo checkout.');

  return query select v_order_id, v_order_number, v_total, false;
end;
$$;

revoke all on function public.create_storefront_order(uuid,uuid,text,text,text,text,jsonb,jsonb,numeric,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_storefront_order(uuid,uuid,text,text,text,text,jsonb,jsonb,numeric,jsonb)
  to service_role;

comment on function public.create_storefront_order(uuid,uuid,text,text,text,text,jsonb,jsonb,numeric,jsonb)
  is 'Cria pedido com preço validado no banco e reserva estoque atomicamente; somente backend service_role pode executar.';

commit;
