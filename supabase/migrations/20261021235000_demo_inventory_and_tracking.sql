-- Seed a visibly large but explicitly synthetic portfolio inventory and allow
-- the panel to correct a tracking code without calling Melhor Envio.
begin;

update public.inventory_levels il
set on_hand = greatest(il.on_hand, 150 + mod(abs(hashtext(il.variant_id::text)::bigint), 250)::integer),
    reorder_point = greatest(il.reorder_point, 12 + mod(abs(hashtext(il.variant_id::text || ':reorder')::bigint), 24)::integer),
    updated_at = now()
from public.stores s
where s.id=il.store_id and s.slug='tecla-nativa';

insert into public.audit_events(store_id,action,entity_table,safe_changes,source)
select s.id,'portfolio.synthetic_inventory_seeded','inventory_levels',
  jsonb_build_object('minimum_per_variant',150,'maximum_per_variant',399,'real_stock',false),'migration'
from public.stores s where s.slug='tecla-nativa'
  and not exists(select 1 from public.audit_events ae where ae.store_id=s.id and ae.action='portfolio.synthetic_inventory_seeded');

create or replace function public.update_storefront_tracking(
  p_order_id uuid,
  p_carrier text,
  p_tracking_code text default null,
  p_tracking_url text default null,
  p_note text default null
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_carrier text := nullif(btrim(coalesce(p_carrier,'')),'');
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception using errcode='22023',message='Pedido não encontrado.'; end if;
  if not private.is_store_member(v_order.store_id,array['owner','admin','fulfillment']) then
    raise exception using errcode='42501',message='Você não tem permissão para atualizar o rastreio.';
  end if;
  if v_order.fulfillment_status not in ('shipped','delivered') then
    raise exception using errcode='22023',message='Rastreio só pode ser alterado depois do envio.';
  end if;
  if v_carrier is null or length(v_carrier)>80 then raise exception using errcode='22023',message='Informe uma transportadora válida.'; end if;
  if p_tracking_code is not null and (length(btrim(p_tracking_code))>120 or p_tracking_code ~ '[[:cntrl:]]') then
    raise exception using errcode='22023',message='O código de rastreio é inválido.';
  end if;
  if p_tracking_url is not null and (p_tracking_url !~ '^https://' or length(p_tracking_url)>2048) then
    raise exception using errcode='22023',message='A URL de rastreio precisa ser HTTPS.';
  end if;
  update public.orders set fulfillment_carrier=v_carrier,
    tracking_code=nullif(btrim(coalesce(p_tracking_code,'')),''),
    tracking_url=nullif(btrim(coalesce(p_tracking_url,'')),''),updated_at=now()
  where id=v_order.id;
  insert into public.order_status_events(store_id,order_id,from_status,to_status,actor_user_id,source,note)
  values(v_order.store_id,v_order.id,v_order.status,v_order.status,auth.uid(),'admin',left(coalesce(nullif(btrim(p_note),''),'Rastreio atualizado manualmente pelo painel.'),500));
  insert into public.audit_events(store_id,actor_user_id,action,entity_table,entity_id,safe_changes,source)
  values(v_order.store_id,auth.uid(),'order.tracking_updated','orders',v_order.id,
    jsonb_build_object('carrier',v_carrier,'tracking_present',nullif(btrim(coalesce(p_tracking_code,'')),'') is not null),'admin');
  return true;
end $$;
revoke all on function public.update_storefront_tracking(uuid,text,text,text,text) from public,anon,service_role;
grant execute on function public.update_storefront_tracking(uuid,text,text,text,text) to authenticated;

commit;
