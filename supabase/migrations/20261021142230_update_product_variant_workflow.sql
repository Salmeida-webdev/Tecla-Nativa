begin;

create or replace function public.update_product_variant(
  p_store_id uuid,
  p_variant_id uuid,
  p_option_label text,
  p_swatch_hex text,
  p_image_path text,
  p_price_override numeric,
  p_weight_grams integer,
  p_length_mm integer,
  p_width_mm integer,
  p_height_mm integer,
  p_reorder_point integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old public.product_variants%rowtype;
  v_option_label text := btrim(p_option_label);
  v_swatch_hex text := nullif(upper(btrim(p_swatch_hex)), '');
  v_image_path text := nullif(btrim(p_image_path), '');
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'É necessário entrar no painel para editar uma variante.';
  end if;
  if not private.is_store_member(p_store_id, array['owner','admin','catalog']) then
    raise exception using errcode = '42501', message = 'Sua função não permite editar variantes desta loja.';
  end if;
  if v_option_label is null or length(v_option_label) < 1 or length(v_option_label) > 60 then
    raise exception using errcode = '22023', message = 'Informe uma opção entre 1 e 60 caracteres.';
  end if;
  if v_swatch_hex is not null and v_swatch_hex !~ '^#[0-9A-F]{6}$' then
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

  select v.* into v_old
  from public.product_variants v
  where v.id = p_variant_id and v.store_id = p_store_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'A variante não pertence a esta loja ou não está mais disponível.';
  end if;

  perform 1
  from public.inventory_levels il
  where il.variant_id = p_variant_id and il.store_id = p_store_id
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'O saldo da variante não foi encontrado.';
  end if;

  update public.product_variants
  set option_label = v_option_label,
      swatch_hex = v_swatch_hex,
      image_path = v_image_path,
      price_override = p_price_override,
      weight_grams = p_weight_grams,
      length_mm = p_length_mm,
      width_mm = p_width_mm,
      height_mm = p_height_mm
  where id = p_variant_id and store_id = p_store_id;

  update public.inventory_levels
  set reorder_point = p_reorder_point
  where variant_id = p_variant_id and store_id = p_store_id;

  insert into public.audit_events (store_id, actor_user_id, action, entity_table, entity_id, safe_changes, source)
  values (
    p_store_id, v_actor, 'variant.updated', 'product_variants', p_variant_id,
    jsonb_build_object(
      'option_label_changed', v_old.option_label is distinct from v_option_label,
      'swatch_changed', v_old.swatch_hex is distinct from v_swatch_hex,
      'image_changed', v_old.image_path is distinct from v_image_path,
      'price_override_changed', v_old.price_override is distinct from p_price_override,
      'weight_changed', v_old.weight_grams is distinct from p_weight_grams,
      'dimensions_changed', (v_old.length_mm, v_old.width_mm, v_old.height_mm) is distinct from (p_length_mm, p_width_mm, p_height_mm),
      'reorder_point', p_reorder_point
    ), 'admin'
  );

  return p_variant_id;
end;
$$;

revoke all on function public.update_product_variant(uuid,uuid,text,text,text,numeric,integer,integer,integer,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.update_product_variant(uuid,uuid,text,text,text,numeric,integer,integer,integer,integer,integer) to authenticated;

comment on function public.update_product_variant(uuid,uuid,text,text,text,numeric,integer,integer,integer,integer,integer)
  is 'Atualiza dados de catálogo e limite de estoque de forma atômica, com auditoria.';

commit;
