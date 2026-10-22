begin;

alter table public.product_variants
  add constraint product_variants_dimensions_all_or_none_check
  check (num_nonnulls(length_mm, width_mm, height_mm) in (0, 3));

create or replace function public.create_product_variant(
  p_store_id uuid,
  p_product_id uuid,
  p_sku text,
  p_option_key text,
  p_option_label text,
  p_swatch_hex text default null,
  p_image_path text default null,
  p_price_override numeric default null,
  p_weight_grams integer default null,
  p_length_mm integer default null,
  p_width_mm integer default null,
  p_height_mm integer default null,
  p_reorder_point integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_variant_id uuid;
  v_sku text := upper(btrim(p_sku));
  v_option_key text := lower(btrim(p_option_key));
  v_option_label text := btrim(p_option_label);
  v_image_path text := nullif(btrim(p_image_path), '');
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'É necessário entrar no painel para criar uma variante.';
  end if;

  if not private.is_store_member(p_store_id, array['owner','admin','catalog']) then
    raise exception using errcode = '42501', message = 'Sua função não permite cadastrar variantes nesta loja.';
  end if;

  if not exists (
    select 1 from public.products p
    where p.id = p_product_id and p.store_id = p_store_id
  ) then
    raise exception using errcode = '22023', message = 'O produto selecionado não pertence a esta loja.';
  end if;

  if v_sku is null or v_sku !~ '^[A-Z0-9][A-Z0-9._-]{0,59}$' then
    raise exception using errcode = '22023', message = 'O SKU deve conter de 1 a 60 letras, números, ponto, hífen ou sublinhado.';
  end if;
  if v_option_key is null or length(v_option_key) > 60 or v_option_key !~ '^[a-z0-9]+([_-][a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'A chave da opção contém um formato inválido.';
  end if;
  if v_option_label is null or length(v_option_label) < 1 or length(v_option_label) > 60 then
    raise exception using errcode = '22023', message = 'Informe uma opção entre 1 e 60 caracteres.';
  end if;
  if p_swatch_hex is not null and p_swatch_hex !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception using errcode = '22023', message = 'A cor deve estar no formato hexadecimal #RRGGBB.';
  end if;
  if p_price_override is not null and (p_price_override < 0 or p_price_override > 9999999999.99) then
    raise exception using errcode = '22023', message = 'O preço da variante está fora do limite permitido.';
  end if;
  if p_weight_grams is not null and p_weight_grams <= 0 then
    raise exception using errcode = '22023', message = 'O peso deve ser maior que zero.';
  end if;
  if p_reorder_point is null or p_reorder_point < 0 then
    raise exception using errcode = '22023', message = 'O limite mínimo de estoque deve ser zero ou maior.';
  end if;
  if num_nonnulls(p_length_mm, p_width_mm, p_height_mm) not in (0, 3)
    or (p_length_mm is not null and p_length_mm <= 0)
    or (p_width_mm is not null and p_width_mm <= 0)
    or (p_height_mm is not null and p_height_mm <= 0) then
    raise exception using errcode = '22023', message = 'Informe as três dimensões em milímetros ou deixe todas vazias.';
  end if;
  if v_image_path is not null and (length(v_image_path) > 2048 or v_image_path ~ '[[:cntrl:]]') then
    raise exception using errcode = '22023', message = 'O caminho da imagem é inválido.';
  end if;

  insert into public.product_variants (
    store_id, product_id, sku, option_key, option_label, swatch_hex, image_path,
    price_override, weight_grams, length_mm, width_mm, height_mm
  ) values (
    p_store_id, p_product_id, v_sku, v_option_key, v_option_label,
    nullif(upper(p_swatch_hex), ''), v_image_path, p_price_override,
    p_weight_grams, p_length_mm, p_width_mm, p_height_mm
  ) returning id into v_variant_id;

  insert into public.inventory_levels (store_id, variant_id, on_hand, reserved, reorder_point)
  values (p_store_id, v_variant_id, 0, 0, p_reorder_point);

  insert into public.audit_events (store_id, actor_user_id, action, entity_table, entity_id, safe_changes, source)
  values (
    p_store_id, v_actor, 'variant.created', 'product_variants', v_variant_id,
    jsonb_build_object('sku', v_sku, 'option_label', v_option_label, 'initial_stock', 0), 'admin'
  );

  return v_variant_id;
end;
$$;

revoke all on function public.create_product_variant(uuid,uuid,text,text,text,text,text,numeric,integer,integer,integer,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.create_product_variant(uuid,uuid,text,text,text,text,text,numeric,integer,integer,integer,integer,integer) to authenticated;

comment on function public.create_product_variant(uuid,uuid,text,text,text,text,text,numeric,integer,integer,integer,integer,integer)
  is 'Cria uma variante do catálogo e seu saldo inicial zero com trilha de auditoria.';

create or replace function public.adjust_variant_stock(
  p_store_id uuid,
  p_variant_id uuid,
  p_delta integer,
  p_reason text,
  p_idempotency_key uuid
)
returns table (movement_id uuid, on_hand integer, reserved integer, available integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_existing public.stock_movements%rowtype;
  v_on_hand integer;
  v_reserved integer;
  v_movement_id uuid;
  v_reason text := btrim(p_reason);
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'É necessário entrar no painel para ajustar o estoque.';
  end if;
  if not private.is_store_member(p_store_id, array['owner','admin','inventory']) then
    raise exception using errcode = '42501', message = 'Sua função não permite movimentar o estoque desta loja.';
  end if;
  if p_delta is null or p_delta = 0 or p_delta < -1000000 or p_delta > 1000000 then
    raise exception using errcode = '22023', message = 'Informe uma variação diferente de zero, entre -1.000.000 e 1.000.000.';
  end if;
  if v_reason is null or length(v_reason) < 3 or length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'Informe um motivo entre 3 e 500 caracteres.';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'A chave de segurança do movimento é obrigatória.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_store_id::text || ':' || p_idempotency_key::text, 0)
  );

  perform 1
  from public.product_variants v
  where v.id = p_variant_id and v.store_id = p_store_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'A variante não pertence a esta loja ou não está mais disponível.';
  end if;

  select sm.* into v_existing
  from public.stock_movements sm
  where sm.store_id = p_store_id and sm.idempotency_key = p_idempotency_key::text;
  if found then
    if v_existing.variant_id <> p_variant_id or v_existing.quantity_delta <> p_delta or v_existing.reason <> v_reason then
      raise exception using errcode = '22023', message = 'A chave deste movimento já foi usada com dados diferentes.';
    end if;
    select il.on_hand, il.reserved into v_on_hand, v_reserved
    from public.inventory_levels il
    where il.store_id = p_store_id and il.variant_id = p_variant_id;
    if not found then
      raise exception using errcode = '23503', message = 'O saldo da variante não foi encontrado.';
    end if;
    return query select v_existing.id, v_on_hand, v_reserved, v_on_hand - v_reserved;
    return;
  end if;

  select il.on_hand, il.reserved into v_on_hand, v_reserved
  from public.inventory_levels il
  where il.store_id = p_store_id and il.variant_id = p_variant_id
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'O saldo da variante não foi encontrado.';
  end if;
  if v_on_hand::bigint + p_delta < v_reserved then
    raise exception using errcode = '23514', message = 'O saldo não pode ficar abaixo das unidades reservadas.';
  end if;
  if v_on_hand::bigint + p_delta > 2147483647 then
    raise exception using errcode = '22003', message = 'O saldo excede o limite suportado pelo banco.';
  end if;

  update public.inventory_levels il
  set on_hand = v_on_hand + p_delta
  where il.store_id = p_store_id and il.variant_id = p_variant_id;

  insert into public.stock_movements (
    store_id, variant_id, movement_type, quantity_delta, reason, actor_user_id, idempotency_key
  ) values (
    p_store_id, p_variant_id,
    case when p_delta > 0 then 'adjustment_in' else 'adjustment_out' end,
    p_delta, v_reason, v_actor, p_idempotency_key::text
  ) returning id into v_movement_id;

  insert into public.audit_events (store_id, actor_user_id, action, entity_table, entity_id, safe_changes, source)
  values (
    p_store_id, v_actor, 'stock.adjusted', 'inventory_levels', p_variant_id,
    jsonb_build_object('delta', p_delta, 'on_hand_before', v_on_hand, 'on_hand_after', v_on_hand + p_delta, 'reason', v_reason), 'admin'
  );

  return query select v_movement_id, v_on_hand + p_delta, v_reserved, v_on_hand + p_delta - v_reserved;
end;
$$;

revoke all on function public.adjust_variant_stock(uuid,uuid,integer,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.adjust_variant_stock(uuid,uuid,integer,text,uuid) to authenticated;

comment on function public.adjust_variant_stock(uuid,uuid,integer,text,uuid)
  is 'Ajusta estoque com lock transacional, idempotência e auditoria por loja.';

commit;
