-- PagBank webhook: signature is verified by the Edge Function; this RPC applies
-- only sanitized, signature-verified events in one database transaction.
begin;

alter table public.payment_attempts
  add column provider_checkout_id text;

create unique index payment_attempts_provider_checkout_idx
  on public.payment_attempts(store_id, provider, provider_checkout_id)
  where provider_checkout_id is not null;

-- A provider shipment ID identifies one shipment regardless of tenant scope.
create unique index shipments_provider_remote_id_idx
  on public.shipments(provider, provider_shipment_id)
  where provider_shipment_id is not null;

create or replace function private.release_pagbank_order_reservations(
  p_store_id uuid,
  p_order_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation record;
  v_count integer := 0;
begin
  for v_reservation in
    select ir.id, ir.variant_id, ir.quantity
    from public.inventory_reservations as ir
    where ir.store_id = p_store_id
      and ir.order_id = p_order_id
      and ir.status = 'active'
    order by ir.variant_id
    for update
  loop
    update public.inventory_levels as il
    set reserved = il.reserved - v_reservation.quantity,
        updated_at = pg_catalog.now()
    where il.store_id = p_store_id
      and il.variant_id = v_reservation.variant_id
      and il.reserved >= v_reservation.quantity;
    if not found then
      raise exception using errcode = '23514', message = 'A reserva PagBank não corresponde ao saldo reservado.';
    end if;

    update public.inventory_reservations as ir
    set status = 'released', updated_at = pg_catalog.now()
    where ir.id = v_reservation.id and ir.status = 'active';
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function private.release_pagbank_order_reservations(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.apply_pagbank_webhook(
  p_order_id uuid,
  p_provider_event_id text,
  p_event_status text,
  p_payload_sha256 text,
  p_checkout_id text,
  p_charge_id text,
  p_amount_cents bigint,
  p_currency text,
  p_paid_at timestamptz,
  p_safe_metadata jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_order_status text;
  v_payment_status text;
  v_order_total numeric(12,2);
  v_attempt public.payment_attempts%rowtype;
  v_webhook_id uuid;
  v_existing_hash text;
  v_reservation_count integer;
  v_item_count integer;
  v_reservation record;
  v_reservations_match boolean := false;
  v_next_payment_status text;
  v_next_order_status text;
  v_event_note text;
begin
  if p_order_id is null
    or p_provider_event_id is null
    or pg_catalog.length(p_provider_event_id) <> 64
    or p_provider_event_id !~ '^[0-9a-f]{64}$'
    or p_payload_sha256 is null
    or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_event_status is null
    or pg_catalog.length(p_event_status) > 40
    or p_event_status !~ '^[A-Z_]{2,40}$'
    or p_safe_metadata is null
    or pg_catalog.jsonb_typeof(p_safe_metadata) <> 'object'
    or pg_catalog.length(p_safe_metadata::text) > 2000 then
    raise exception using errcode = '22023', message = 'Os metadados sanitizados do webhook PagBank são inválidos.';
  end if;

  select o.store_id, o.status, o.payment_status, o.total
  into v_store_id, v_order_status, v_payment_status, v_order_total
  from public.orders as o
  where o.id = p_order_id
  for update;
  if not found then
    return 'unknown_order';
  end if;

  insert into public.webhook_inbox (
    store_id, provider, provider_event_id, event_type, payload_sha256,
    safe_metadata, signature_valid, processing_status
  ) values (
    v_store_id, 'pagbank', p_provider_event_id, p_event_status,
    p_payload_sha256, p_safe_metadata, true, 'received'
  )
  on conflict (store_id, provider, provider_event_id) do nothing
  returning id into v_webhook_id;

  if v_webhook_id is null then
    select wi.payload_sha256
    into v_existing_hash
    from public.webhook_inbox as wi
    where wi.store_id = v_store_id
      and wi.provider = 'pagbank'
      and wi.provider_event_id = p_provider_event_id;
    if v_existing_hash is distinct from p_payload_sha256 then
      return 'event_conflict';
    end if;
    return 'duplicate';
  end if;

  if p_event_status not in ('PAID', 'IN_ANALYSIS', 'WAITING', 'DECLINED', 'CANCELED', 'EXPIRED') then
    update public.webhook_inbox as wi
    set processing_status = 'rejected',
        last_error_code = 'unsupported_status',
        attempt_count = 1
    where wi.id = v_webhook_id;
    return 'unsupported_status';
  end if;

  select pa.*
  into v_attempt
  from public.payment_attempts as pa
  where pa.store_id = v_store_id
    and pa.order_id = p_order_id
    and pa.provider = 'pagbank'
    and (
      (nullif(p_checkout_id, '') is not null and pa.provider_checkout_id = p_checkout_id)
      or (nullif(p_charge_id, '') is not null and pa.provider_payment_id = p_charge_id)
    )
  order by pa.created_at desc, pa.id desc
  limit 1
  for update;
  if not found then
    update public.webhook_inbox as wi
    set processing_status = 'rejected',
        last_error_code = 'payment_attempt_missing',
        attempt_count = 1
    where wi.id = v_webhook_id;
    return 'payment_attempt_missing';
  end if;

  if (p_checkout_id is not null and pg_catalog.length(p_checkout_id) > 120)
    or (p_charge_id is not null and pg_catalog.length(p_charge_id) > 120)
    or (p_checkout_id is not null and v_attempt.provider_checkout_id is not null
      and v_attempt.provider_checkout_id is distinct from p_checkout_id)
    or (p_amount_cents is not null and p_amount_cents <> pg_catalog.round(v_attempt.amount * 100)::bigint)
    or (p_currency is not null and p_currency <> v_attempt.currency) then
    update public.webhook_inbox as wi
    set processing_status = 'rejected',
        last_error_code = 'payment_attempt_mismatch',
        attempt_count = 1
    where wi.id = v_webhook_id;
    return 'payment_attempt_mismatch';
  end if;

  if p_event_status = 'PAID' and (
    p_charge_id is null or pg_catalog.length(p_charge_id) > 120
    or p_amount_cents is null
    or p_currency is distinct from 'BRL'
    or p_amount_cents <> pg_catalog.round(v_order_total * 100)::bigint
  ) then
    update public.webhook_inbox as wi
    set processing_status = 'rejected',
        last_error_code = 'amount_or_currency_mismatch',
        attempt_count = 1
    where wi.id = v_webhook_id;
    return 'amount_or_currency_mismatch';
  end if;

  -- Payment status is monotonic for terminal states: delayed non-paid events
  -- cannot roll a confirmed payment back to pending or failed.
  if (v_attempt.status in ('paid', 'partially_refunded', 'refunded', 'disputed', 'declined', 'cancelled', 'expired')
      or v_payment_status in ('paid', 'partially_refunded', 'refunded', 'disputed'))
    and p_event_status <> 'PAID' then
    update public.webhook_inbox as wi
    set processing_status = 'processed', processed_at = pg_catalog.now(), attempt_count = 1
    where wi.id = v_webhook_id;
    return 'ignored_out_of_order';
  end if;

  if p_event_status = 'PAID' and v_attempt.status = 'paid'
    and v_attempt.provider_payment_id = p_charge_id then
    update public.webhook_inbox as wi
    set processing_status = 'processed', processed_at = pg_catalog.now(), attempt_count = 1
    where wi.id = v_webhook_id;
    return 'already_paid';
  end if;

  if p_event_status = 'PAID'
    and (v_attempt.status in ('partially_refunded', 'refunded', 'disputed')
      or (v_attempt.status = 'paid' and v_attempt.provider_payment_id is distinct from p_charge_id)
      or (v_payment_status in ('paid', 'partially_refunded', 'refunded', 'disputed') and v_attempt.status <> 'paid')) then
    insert into public.financial_transactions (
      store_id, order_id, payment_attempt_id, provider, provider_transaction_id,
      kind, amount, currency, effective_at, metadata
    ) values (
      v_store_id, p_order_id, v_attempt.id, 'pagbank', p_charge_id,
      'capture', p_amount_cents::numeric / 100, 'BRL', coalesce(p_paid_at, pg_catalog.now()),
      pg_catalog.jsonb_build_object('event_status', 'PAID', 'duplicate_capture_review', true)
    )
    on conflict (store_id, provider, provider_transaction_id, kind) where provider_transaction_id is not null
    do nothing;

    update public.orders as o
    set internal_note = pg_catalog.left(
          pg_catalog.concat_ws(E'\n', nullif(o.internal_note, ''),
            'Alerta PagBank: mais de uma cobrança foi confirmada para este pedido. Revisar antes de qualquer operação.'),
          2000
        ),
        updated_at = pg_catalog.now()
    where o.id = p_order_id and o.store_id = v_store_id;
    update public.payment_attempts as pa
    set provider_checkout_id = coalesce(nullif(p_checkout_id, ''), pa.provider_checkout_id),
        provider_payment_id = coalesce(pa.provider_payment_id, nullif(p_charge_id, '')),
        status = case when pa.status in ('partially_refunded', 'refunded', 'disputed') then pa.status else 'paid' end,
        paid_at = coalesce(pa.paid_at, p_paid_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where pa.id = v_attempt.id and pa.store_id = v_store_id;
    update public.webhook_inbox as wi
    set processing_status = 'rejected',
        last_error_code = 'duplicate_capture_review',
        attempt_count = 1
    where wi.id = v_webhook_id;
    return 'duplicate_capture_review';
  end if;

  update public.payment_attempts as pa
  set provider_checkout_id = coalesce(nullif(p_checkout_id, ''), pa.provider_checkout_id),
      provider_payment_id = coalesce(nullif(p_charge_id, ''), pa.provider_payment_id),
      status = case p_event_status
        when 'PAID' then 'paid'
        when 'IN_ANALYSIS' then 'authorized'
        when 'WAITING' then case when pa.status = 'authorized' then 'authorized' else 'pending' end
        when 'DECLINED' then 'declined'
        when 'CANCELED' then 'cancelled'
        when 'EXPIRED' then 'expired'
      end,
      paid_at = case when p_event_status = 'PAID' then coalesce(p_paid_at, pg_catalog.now()) else pa.paid_at end,
      updated_at = pg_catalog.now()
  where pa.id = v_attempt.id and pa.store_id = v_store_id;

  if p_event_status = 'PAID' then
    -- Consume every reservation only when the complete reservation set still
    -- matches the immutable order lines. A late payment never causes partial stock deduction.
    perform 1
    from public.inventory_reservations as ir
    where ir.store_id = v_store_id and ir.order_id = p_order_id and ir.status = 'active'
    order by ir.variant_id
    for update;

    select pg_catalog.count(*)::integer into v_reservation_count
    from public.inventory_reservations as ir
    where ir.store_id = v_store_id and ir.order_id = p_order_id and ir.status = 'active';
    select pg_catalog.count(*)::integer into v_item_count
    from public.order_items as oi
    where oi.store_id = v_store_id and oi.order_id = p_order_id and oi.variant_id is not null;

    v_reservations_match := v_item_count > 0 and v_reservation_count = v_item_count
      and not exists (
        select 1
        from public.order_items as oi
        left join public.inventory_reservations as ir
          on ir.store_id = oi.store_id
         and ir.order_id = oi.order_id
         and ir.variant_id = oi.variant_id
         and ir.status = 'active'
        where oi.store_id = v_store_id
          and oi.order_id = p_order_id
          and oi.variant_id is not null
          and (ir.id is null or ir.quantity <> oi.quantity)
      );

    if v_reservations_match then
      for v_reservation in
        select ir.id, ir.variant_id, ir.quantity
        from public.inventory_reservations as ir
        where ir.store_id = v_store_id
          and ir.order_id = p_order_id
          and ir.status = 'active'
        order by ir.variant_id
        for update
      loop
        update public.inventory_levels as il
        set on_hand = il.on_hand - v_reservation.quantity,
            reserved = il.reserved - v_reservation.quantity,
            updated_at = pg_catalog.now()
        where il.store_id = v_store_id
          and il.variant_id = v_reservation.variant_id
          and il.on_hand >= v_reservation.quantity
          and il.reserved >= v_reservation.quantity;
        if not found then
          raise exception using errcode = '23514', message = 'O saldo reservado não pode ser baixado pelo webhook PagBank.';
        end if;

        update public.inventory_reservations as ir
        set status = 'consumed', updated_at = pg_catalog.now()
        where ir.id = v_reservation.id and ir.status = 'active';

        insert into public.stock_movements (
          store_id, variant_id, movement_type, quantity_delta, reason,
          order_id, idempotency_key
        ) values (
          v_store_id, v_reservation.variant_id, 'sale', -v_reservation.quantity,
          'Venda confirmada pelo webhook assinado do PagBank.', p_order_id,
          'pagbank:' || p_provider_event_id || ':' || v_reservation.variant_id::text
        )
        on conflict (store_id, idempotency_key) do nothing;
      end loop;
    else
      v_event_note := 'Pagamento confirmado sem conjunto completo de reservas ativo; revisar o estoque manualmente.';
    end if;

    insert into public.financial_transactions (
      store_id, order_id, payment_attempt_id, provider, provider_transaction_id,
      kind, amount, currency, effective_at, metadata
    ) values (
      v_store_id, p_order_id, v_attempt.id, 'pagbank', p_charge_id,
      'capture', p_amount_cents::numeric / 100, 'BRL', coalesce(p_paid_at, pg_catalog.now()),
      pg_catalog.jsonb_build_object('event_status', 'PAID')
    )
    on conflict (store_id, provider, provider_transaction_id, kind) where provider_transaction_id is not null
    do nothing;

    v_next_payment_status := 'paid';
    v_next_order_status := case when v_order_status in ('pending_payment', 'cancelled') then 'paid' else v_order_status end;
  elsif p_event_status = 'IN_ANALYSIS' then
    v_next_payment_status := 'authorized';
    v_next_order_status := v_order_status;
  elsif p_event_status = 'WAITING' then
    v_next_payment_status := case when v_payment_status = 'authorized' then 'authorized' else 'pending' end;
    v_next_order_status := v_order_status;
  elsif p_event_status = 'DECLINED' then
    perform private.release_pagbank_order_reservations(v_store_id, p_order_id);
    v_next_payment_status := 'failed';
    v_next_order_status := v_order_status;
  else
    perform private.release_pagbank_order_reservations(v_store_id, p_order_id);
    v_next_payment_status := 'failed';
    v_next_order_status := 'cancelled';
  end if;

  update public.orders as o
  set payment_status = v_next_payment_status,
      status = v_next_order_status,
      internal_note = case when v_event_note is not null then pg_catalog.left(
        pg_catalog.concat_ws(E'\n', nullif(o.internal_note, ''), v_event_note), 2000
      ) else o.internal_note end,
      updated_at = pg_catalog.now()
  where o.id = p_order_id and o.store_id = v_store_id;

  if v_order_status is distinct from v_next_order_status then
    insert into public.order_status_events (
      store_id, order_id, from_status, to_status, source, note
    ) values (
      v_store_id, p_order_id, v_order_status, v_next_order_status,
      'pagbank_webhook', coalesce(v_event_note, 'Status atualizado por notificação PagBank assinada.')
    );
  end if;

  update public.webhook_inbox as wi
  set processing_status = 'processed',
      processed_at = pg_catalog.now(),
      attempt_count = 1,
      last_error_code = null
  where wi.id = v_webhook_id;

  return case when v_event_note is not null then 'paid_inventory_review' else 'processed' end;
end;
$$;

revoke all on function public.apply_pagbank_webhook(uuid, text, text, text, text, text, bigint, text, timestamptz, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_pagbank_webhook(uuid, text, text, text, text, text, bigint, text, timestamptz, jsonb)
  to service_role;

comment on function public.apply_pagbank_webhook(uuid, text, text, text, text, text, bigint, text, timestamptz, jsonb)
  is 'Aplica uma notificação PagBank já validada por ECDSA; deduplica o evento e atualiza pagamento, pedido e estoque na mesma transação.';

create or replace function public.apply_melhor_envio_webhook(
  p_provider_shipment_id text,
  p_provider_event_id text,
  p_event_type text,
  p_payload_sha256 text,
  p_target_status text,
  p_tracking_code text,
  p_occurred_at timestamptz,
  p_safe_metadata jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_shipment_id uuid;
  v_order_id uuid;
  v_current_shipment_status text;
  v_last_synced_at timestamptz;
  v_inbox_id uuid;
  v_existing_hash text;
  v_event_description text;
  v_expected_target_status text;
  v_target_status_rank integer;
  v_current_status_rank integer;
  v_apply_state boolean := true;
  v_order_status text;
  v_next_order_status text;
  v_fulfillment_status text;
  v_next_fulfillment_status text;
  v_shipment_count integer;
  v_delivered_count integer;
  v_moving_count integer;
begin
  if p_provider_shipment_id is null
    or pg_catalog.length(p_provider_shipment_id) > 120
    or p_provider_event_id is null
    or pg_catalog.length(p_provider_event_id) <> 64
    or p_provider_event_id !~ '^[0-9a-f]{64}$'
    or p_payload_sha256 is null
    or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_occurred_at is null
    or p_safe_metadata is null
    or pg_catalog.jsonb_typeof(p_safe_metadata) <> 'object'
    or pg_catalog.length(p_safe_metadata::text) > 2000
    or (p_tracking_code is not null and (
      pg_catalog.length(p_tracking_code) > 40 or p_tracking_code !~ '^[A-Za-z0-9-]{4,40}$'
    )) then
    raise exception using errcode = '22023', message = 'Os metadados sanitizados do webhook Melhor Envio são inválidos.';
  end if;

  v_event_description := case p_event_type
    when 'order.created' then 'Etiqueta criada no Melhor Envio.'
    when 'order.pending' then 'Etiqueta retornou ao carrinho no Melhor Envio.'
    when 'order.released' then 'Etiqueta paga e liberada pelo Melhor Envio.'
    when 'order.generated' then 'Etiqueta gerada pelo Melhor Envio.'
    when 'order.received' then 'Encomenda recebida em ponto de distribuição.'
    when 'order.posted' then 'Encomenda postada para transporte.'
    when 'order.delivered' then 'Encomenda entregue.'
    when 'order.cancelled' then 'Etiqueta cancelada no Melhor Envio.'
    when 'order.undelivered' then 'Transportadora informou que a encomenda não foi entregue.'
    when 'order.paused' then 'Entrega interrompida; é necessária uma ação do destinatário.'
    when 'order.suspended' then 'Envio suspenso pela transportadora.'
    else null
  end;

  v_expected_target_status := case p_event_type
    when 'order.created' then 'quoted'
    when 'order.pending' then 'awaiting_payment'
    when 'order.released' then 'ready'
    when 'order.generated' then 'ready'
    when 'order.received' then 'in_transit'
    when 'order.posted' then 'posted'
    when 'order.delivered' then 'delivered'
    when 'order.cancelled' then 'cancelled'
    when 'order.undelivered' then 'exception'
    when 'order.paused' then 'exception'
    when 'order.suspended' then 'exception'
    else null
  end;

  if v_event_description is null or p_target_status is distinct from v_expected_target_status then
    raise exception using errcode = '22023', message = 'O evento ou o status do webhook Melhor Envio não é aceito.';
  end if;

  select s.store_id, s.id, s.order_id, s.status, s.last_synced_at
  into v_store_id, v_shipment_id, v_order_id, v_current_shipment_status, v_last_synced_at
  from public.shipments as s
  where s.provider = 'melhor_envio'
    and s.provider_shipment_id = p_provider_shipment_id
  for update;
  if not found then
    return 'unknown_shipment';
  end if;

  insert into public.webhook_inbox (
    store_id, provider, provider_event_id, event_type, payload_sha256,
    safe_metadata, signature_valid, processing_status
  ) values (
    v_store_id, 'melhor_envio', p_provider_event_id, p_event_type,
    p_payload_sha256, p_safe_metadata, true, 'received'
  )
  on conflict (store_id, provider, provider_event_id) do nothing
  returning id into v_inbox_id;

  if v_inbox_id is null then
    select wi.payload_sha256 into v_existing_hash
    from public.webhook_inbox as wi
    where wi.store_id = v_store_id
      and wi.provider = 'melhor_envio'
      and wi.provider_event_id = p_provider_event_id;
    if v_existing_hash is distinct from p_payload_sha256 then
      return 'event_conflict';
    end if;
    return 'duplicate';
  end if;

  insert into public.shipment_events (
    store_id, shipment_id, provider_event_id, event_code, description, occurred_at
  ) values (
    v_store_id, v_shipment_id, p_provider_event_id, p_event_type,
    v_event_description, p_occurred_at
  ) on conflict (store_id, shipment_id, provider_event_id) where provider_event_id is not null
  do nothing;

  -- Preserve history but do not let delayed events roll the current shipment back.
  if v_last_synced_at is not null and p_occurred_at < v_last_synced_at then
    v_apply_state := false;
  elsif v_current_shipment_status in ('delivered', 'cancelled', 'returned')
    and p_target_status is distinct from v_current_shipment_status then
    v_apply_state := false;
  elsif v_last_synced_at = p_occurred_at then
    v_target_status_rank := case p_target_status
      when 'quoted' then 0
      when 'awaiting_payment' then 1
      when 'ready' then 2
      when 'posted' then 3
      when 'in_transit' then 4
      when 'exception' then 4
      when 'delivered' then 5
      else 0
    end;
    v_current_status_rank := case v_current_shipment_status
      when 'quoted' then 0
      when 'awaiting_payment' then 1
      when 'ready' then 2
      when 'posted' then 3
      when 'in_transit' then 4
      when 'exception' then 4
      when 'delivered' then 5
      else 0
    end;
    if v_target_status_rank < v_current_status_rank then
      v_apply_state := false;
    end if;
  end if;

  if v_apply_state then
    update public.shipments as s
    set status = p_target_status,
        tracking_code = coalesce(p_tracking_code, s.tracking_code),
        last_synced_at = p_occurred_at,
        updated_at = pg_catalog.now()
    where s.id = v_shipment_id and s.store_id = v_store_id;

    if p_target_status in ('posted', 'in_transit', 'delivered') then
      select o.status, o.fulfillment_status
      into v_order_status, v_fulfillment_status
      from public.orders as o
      where o.id = v_order_id and o.store_id = v_store_id
      for update;

      select pg_catalog.count(*)::integer,
             pg_catalog.count(*) filter (where s.status = 'delivered')::integer,
             pg_catalog.count(*) filter (where s.status in ('posted', 'in_transit', 'delivered'))::integer
      into v_shipment_count, v_delivered_count, v_moving_count
      from public.shipments as s
      where s.order_id = v_order_id and s.store_id = v_store_id;

      v_next_fulfillment_status := case
        when v_shipment_count > 0 and v_delivered_count = v_shipment_count then 'delivered'
        when v_delivered_count > 0 and v_delivered_count < v_shipment_count then 'partially_shipped'
        when v_moving_count > 0 then 'shipped'
        else v_fulfillment_status
      end;

      v_next_order_status := case
        when v_shipment_count > 0 and v_delivered_count = v_shipment_count
          and v_order_status in ('paid', 'processing', 'ready_to_ship', 'shipped', 'delivered') then 'delivered'
        when v_moving_count > 0
          and v_order_status in ('paid', 'processing', 'ready_to_ship') then 'shipped'
        else v_order_status
      end;

      update public.orders as o
      set fulfillment_status = v_next_fulfillment_status,
          status = v_next_order_status,
          updated_at = pg_catalog.now()
      where o.id = v_order_id and o.store_id = v_store_id
        and (o.fulfillment_status is distinct from v_next_fulfillment_status
          or o.status is distinct from v_next_order_status);

      if v_order_status is distinct from v_next_order_status then
        insert into public.order_status_events (
          store_id, order_id, from_status, to_status, source, note
        ) values (
          v_store_id, v_order_id, v_order_status, v_next_order_status,
          'melhor_envio_webhook', 'Status atualizado por evento assinado do Melhor Envio: ' || p_event_type || '.'
        );
      end if;
    end if;
  end if;

  update public.webhook_inbox as wi
  set processing_status = 'processed',
      processed_at = pg_catalog.now(),
      attempt_count = 1,
      last_error_code = null
  where wi.id = v_inbox_id;

  return case when v_apply_state then 'processed' else 'stale_event' end;
end;
$$;

revoke all on function public.apply_melhor_envio_webhook(text, text, text, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_melhor_envio_webhook(text, text, text, text, text, text, timestamptz, jsonb)
  to service_role;

comment on function public.apply_melhor_envio_webhook(text, text, text, text, text, text, timestamptz, jsonb)
  is 'Aplica eventos do Melhor Envio após validação HMAC; deduplica e atualiza expedição e pedido numa transação.';

commit;
