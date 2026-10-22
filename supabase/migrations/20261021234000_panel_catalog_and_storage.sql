-- Make panel publication, purchase-order transitions and catalog media real.
-- This demo keeps payment in PagBank Sandbox and does not create shipping labels.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('storefront-media','storefront-media',true,8388608,array['image/avif','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=8388608,
  allowed_mime_types=array['image/avif','image/jpeg','image/png','image/webp'];

drop policy if exists storefront_media_public_read on storage.objects;
create policy storefront_media_public_read on storage.objects for select to anon,authenticated
using (bucket_id='storefront-media');
drop policy if exists storefront_media_staff_insert on storage.objects;
create policy storefront_media_staff_insert on storage.objects for insert to authenticated
with check (bucket_id='storefront-media'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.is_store_member(((storage.foldername(name))[1])::uuid,array['owner','admin','catalog']));
drop policy if exists storefront_media_staff_update on storage.objects;
create policy storefront_media_staff_update on storage.objects for update to authenticated
using (bucket_id='storefront-media'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.is_store_member(((storage.foldername(name))[1])::uuid,array['owner','admin','catalog']))
with check (bucket_id='storefront-media'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.is_store_member(((storage.foldername(name))[1])::uuid,array['owner','admin','catalog']));
drop policy if exists storefront_media_staff_delete on storage.objects;
create policy storefront_media_staff_delete on storage.objects for delete to authenticated
using (bucket_id='storefront-media'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.is_store_member(((storage.foldername(name))[1])::uuid,array['owner','admin','catalog']));

create or replace function public.set_admin_product_status(p_product_id uuid,p_status text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_product public.products%rowtype;
begin
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception using errcode='22023',message='Produto não encontrado.'; end if;
  if not private.is_store_member(v_product.store_id,array['owner','admin','catalog']) then
    raise exception using errcode='42501',message='Você não tem permissão para publicar produtos.';
  end if;
  if p_status not in ('draft','published','archived') then
    raise exception using errcode='22023',message='Status de produto inválido.';
  end if;
  if p_status='published' and (v_product.category_id is null or not exists(
    select 1 from public.categories c where c.id=v_product.category_id and c.store_id=v_product.store_id and c.active
  ) or v_product.primary_image_path is null or not exists(
    select 1 from public.product_variants pv where pv.product_id=v_product.id and pv.store_id=v_product.store_id and pv.active and pv.image_path is not null
  )) then
    raise exception using errcode='22023',message='Para publicar, informe categoria ativa, imagem principal e ao menos uma variante ativa com imagem.';
  end if;
  update public.products set status=p_status,updated_at=now() where id=v_product.id;
  insert into public.audit_events(store_id,actor_user_id,action,entity_table,entity_id,safe_changes,source)
  values(v_product.store_id,auth.uid(),'product.status_changed','products',v_product.id,
    jsonb_build_object('from',v_product.status,'to',p_status),'admin');
  return p_status;
end $$;
revoke all on function public.set_admin_product_status(uuid,text) from public,anon,service_role;
grant execute on function public.set_admin_product_status(uuid,text) to authenticated;

create or replace function public.transition_admin_purchase_order(p_purchase_order_id uuid,p_action text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_order public.purchase_orders%rowtype; v_status text;
begin
  select * into v_order from public.purchase_orders where id=p_purchase_order_id for update;
  if not found then raise exception using errcode='22023',message='Pedido de compra não encontrado.'; end if;
  if not private.is_store_member(v_order.store_id,array['owner','admin','purchasing']) then
    raise exception using errcode='42501',message='Você não tem permissão para alterar compras.';
  end if;
  if p_action='send' and v_order.status='draft' then
    v_status := 'sent';
    update public.purchase_orders set status=v_status,sent_at=now(),updated_at=now() where id=v_order.id;
  elsif p_action='cancel' and v_order.status in ('draft','sent') then
    v_status := 'cancelled';
    update public.purchase_orders set status=v_status,updated_at=now() where id=v_order.id;
  else
    raise exception using errcode='22023',message='A transição solicitada não é permitida para este pedido de compra.';
  end if;
  insert into public.audit_events(store_id,actor_user_id,action,entity_table,entity_id,safe_changes,source)
  values(v_order.store_id,auth.uid(),'purchase_order.status_changed','purchase_orders',v_order.id,
    jsonb_build_object('from',v_order.status,'to',v_status),'admin');
  return v_status;
end $$;
revoke all on function public.transition_admin_purchase_order(uuid,text) from public,anon,service_role;
grant execute on function public.transition_admin_purchase_order(uuid,text) to authenticated;

commit;
