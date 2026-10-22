-- Estoque sintético para demonstração de portfólio.
-- Não representa mercadoria física; não aplicar a uma operação comercial.
-- Seguro para repetir: após a primeira aplicação, o marcador impede sobrescrita
-- de ajustes feitos depois no painel.
-- Mantenha este arquivo como uma única instrução SQL (DO). O comando
-- `supabase db query --file` usa uma prepared statement e rejeita vários
-- comandos de topo no mesmo arquivo. O bloco DO executa atomicamente.
do $portfolio_demo_stock$
declare
  v_store_id uuid;
  v_status text;
  v_variant_count integer;
  v_total_units bigint;
begin
  select id, status into strict v_store_id, v_status
  from public.stores
  where slug = 'tecla-nativa'
  for update;

  if exists (
    select 1 from public.store_settings
    where store_id = v_store_id
      and setting_key = 'portfolio_demo_stock_v1'
      and setting_value->>'applied' = 'true'
  ) then
    raise notice 'Estoque fictício de portfólio v1 já aplicado; nenhuma alteração feita.';
    return;
  end if;

  if v_status <> 'setup' then
    raise exception 'O estoque demonstrativo só pode ser aplicado enquanto a loja estiver em setup.';
  end if;

  if exists (
    select 1 from public.inventory_levels
    where store_id = v_store_id and (reserved <> 0 or on_hand <> 0)
  ) or exists (
    select 1 from public.stock_movements where store_id = v_store_id
  ) or exists (
    select 1 from public.orders where store_id = v_store_id
  ) then
    raise exception 'O banco não está vazio de operação; não vou substituir estoque ou histórico.';
  end if;

  with ranked_variants as (
    select
      il.store_id,
      il.variant_id,
      row_number() over (order by p.slug, v.option_key)::integer as rn
    from public.inventory_levels il
    join public.product_variants v on v.id = il.variant_id and v.store_id = il.store_id
    join public.products p on p.id = v.product_id and p.store_id = v.store_id
    where il.store_id = v_store_id
  ),
  demo_levels as (
    select
      store_id,
      variant_id,
      case when rn % 19 = 0 then 2 + (rn % 11)
           else 32 + ((rn * 73) % 269)
      end as on_hand,
      14 + ((rn * 17) % 25) as reorder_point
    from ranked_variants
  )
  update public.inventory_levels il
  set on_hand = demo_levels.on_hand,
      reserved = 0,
      reorder_point = demo_levels.reorder_point
  from demo_levels
  where il.store_id = demo_levels.store_id
    and il.variant_id = demo_levels.variant_id;

  select count(*)::integer, coalesce(sum(on_hand), 0)::bigint
  into v_variant_count, v_total_units
  from public.inventory_levels
  where store_id = v_store_id and on_hand > 0;

  insert into public.stock_movements (
    store_id, variant_id, movement_type, quantity_delta, reason, idempotency_key
  )
  select
    il.store_id,
    il.variant_id,
    'adjustment_in',
    il.on_hand,
    'Ajuste de abertura fictício para portfólio; não representa mercadoria física.',
    'portfolio-demo-stock-v1:' || il.variant_id::text
  from public.inventory_levels il
  where il.store_id = v_store_id and il.on_hand > 0;

  insert into public.audit_events (
    store_id, action, entity_table, safe_changes, source
  ) values (
    v_store_id,
    'portfolio.demo_stock_seeded',
    'inventory_levels',
    jsonb_build_object(
      'demo_only', true,
      'variant_count', v_variant_count,
      'units', v_total_units,
      'fixture', 'portfolio-stock-v1'
    ),
    'demo_fixture'
  );

  insert into public.store_settings (store_id, setting_key, setting_value)
  values (
    v_store_id,
    'portfolio_demo_stock_v1',
    jsonb_build_object(
      'applied', true,
      'demo_only', true,
      'variant_count', v_variant_count,
      'units', v_total_units,
      'applied_at', now()
    )
  );
end;
$portfolio_demo_stock$;
