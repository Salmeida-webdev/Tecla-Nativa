-- Persist the remaining panel actions. All stock/order state changes use
-- transactional functions; no live payment or shipping-label API is called.
begin;

alter table public.store_memberships add column email_snapshot text;
alter table public.store_memberships add constraint store_memberships_email_snapshot_check
  check (email_snapshot is null or (length(email_snapshot) between 3 and 254 and email_snapshot !~ '[[:cntrl:]]'));
alter table public.purchase_orders add column idempotency_key uuid;
alter table public.purchase_orders add column request_sha256 text;
alter table public.purchase_orders add constraint purchase_orders_request_sha_check
  check ((idempotency_key is null and request_sha256 is null) or (idempotency_key is not null and request_sha256 ~ '^[0-9a-f]{64}$'));
create unique index purchase_orders_idempotency_idx on public.purchase_orders(store_id,idempotency_key) where idempotency_key is not null;

create table public.purchase_receipt_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  purchase_order_id uuid not null,
  idempotency_key uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (store_id,idempotency_key),
  unique (id,store_id),
  foreign key (purchase_order_id,store_id) references public.purchase_orders(id,store_id) on delete restrict
);
create table public.purchase_receipt_batch_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  batch_id uuid not null,
  variant_id uuid not null,
  quantity integer not null check (quantity > 0),
  unique (batch_id,variant_id),
  foreign key (batch_id,store_id) references public.purchase_receipt_batches(id,store_id) on delete restrict,
  foreign key (variant_id,store_id) references public.product_variants(id,store_id) on delete restrict
);
create index purchase_receipt_batches_order_idx on public.purchase_receipt_batches(store_id,purchase_order_id,created_at desc);
alter table public.purchase_receipt_batches enable row level security;
alter table public.purchase_receipt_batch_items enable row level security;
revoke all on public.purchase_receipt_batches,public.purchase_receipt_batch_items from anon,authenticated;
grant select on public.purchase_receipt_batches,public.purchase_receipt_batch_items to authenticated;
create policy purchase_receipt_batches_staff_read on public.purchase_receipt_batches
  for select to authenticated using (private.is_store_member(store_id,array['owner','admin','purchasing','finance']));
create policy purchase_receipt_batch_items_staff_read on public.purchase_receipt_batch_items
  for select to authenticated using (private.is_store_member(store_id,array['owner','admin','purchasing','finance']));

drop policy if exists cases_staff_insert on public.service_cases;
create policy cases_staff_insert on public.service_cases for insert to authenticated
  with check (private.is_store_member(store_id,array['owner','admin','support']));
drop policy if exists case_events_staff_insert on public.service_case_events;
grant insert on public.service_case_events to authenticated;
create policy case_events_staff_insert on public.service_case_events for insert to authenticated
  with check (private.is_store_member(store_id,array['owner','admin','support']));

create or replace function public.create_admin_service_case(
  p_store_id uuid,
  p_order_id uuid,
  p_case_type text,
  p_priority text,
  p_reason text
)
returns table(result_case_id uuid,result_case_number text)
language plpgsql security definer set search_path = '' as $$
declare
  v_case_id uuid := gen_random_uuid();
  v_case_number text;
  v_customer_id uuid;
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if p_store_id is null or not private.is_store_member(p_store_id,array['owner','admin','support']) then
    raise exception using errcode='42501',message='Você não tem acesso à fila de atendimento.';
  end if;
  if p_case_type not in ('exchange','return','defect','delivery_issue','question','other')
     or p_priority not in ('low','normal','high','urgent') then
    raise exception using errcode='22023',message='Tipo ou prioridade de atendimento inválidos.';
  end if;
  if length(v_reason)<5 or length(v_reason)>4000 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode='22023',message='Descreva o caso com 5 a 4000 caracteres.';
  end if;
  if p_order_id is not null then
    select o.customer_id into v_customer_id from public.orders o
    where o.id=p_order_id and o.store_id=p_store_id;
    if not found then raise exception using errcode='22023',message='O pedido relacionado não pertence à loja.'; end if;
  end if;
  v_case_number := 'TN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(v_case_id::text,'-',''),1,6));
  insert into public.service_cases(id,store_id,case_number,order_id,customer_id,case_type,reason,status,priority,assigned_to)
  values(v_case_id,p_store_id,v_case_number,p_order_id,v_customer_id,p_case_type,v_reason,'new',p_priority,v_actor);
  insert into public.service_case_events(store_id,case_id,actor_user_id,event_type,body)
  values(p_store_id,v_case_id,v_actor,'note','Caso aberto pelo painel.');
  insert into public.audit_events(store_id,actor_user_id,action,entity_table,entity_id,safe_changes,source)
  values(p_store_id,v_actor,'service_case.created','service_cases',v_case_id,
    jsonb_build_object('case_type',p_case_type,'priority',p_priority,'order_linked',p_order_id is not null),'admin');
  return query select v_case_id,v_case_number;
end $$;
revoke all on function public.create_admin_service_case(uuid,uuid,text,text,text) from public,anon,service_role;
grant execute on function public.create_admin_service_case(uuid,uuid,text,text,text) to authenticated;

create or replace function public.transition_admin_service_case(
  p_case_id uuid,
  p_status text,
  p_resolution text default null,
  p_note text default null
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_case public.service_cases%rowtype;
  v_actor uuid := auth.uid();
  v_resolution text := nullif(btrim(coalesce(p_resolution,'')),'');
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
begin
  select * into v_case from public.service_cases where id=p_case_id for update;
  if not found then raise exception using errcode='22023',message='Caso não encontrado.'; end if;
  if not private.is_store_member(v_case.store_id,array['owner','admin','support']) then
    raise exception using errcode='42501',message='Você não tem permissão para atualizar este caso.';
  end if;
  if p_status not in ('new','under_review','awaiting_customer','awaiting_return','resolved','rejected','closed') then
    raise exception using errcode='22023',message='Etapa de atendimento inválida.';
  end if;
  if p_status in ('resolved','rejected','closed') and v_resolution is null and v_case.resolution is null then
    raise exception using errcode='22023',message='Registre a resolução antes de encerrar o caso.';
  end if;
  if v_resolution is not null and length(v_resolution)>2000 then
    raise exception using errcode='22023',message='A resolução deve ter até 2000 caracteres.';
  end if;
  update public.service_cases set status=p_status,resolution=coalesce(v_resolution,resolution),updated_at=now()
  where id=p_case_id;
  insert into public.service_case_events(store_id,case_id,actor_user_id,event_type,body,safe_metadata)
  values(v_case.store_id,p_case_id,v_actor,'status_change',coalesce(v_note,'Etapa atualizada no painel.'),
    jsonb_build_object('from_status',v_case.status,'to_status',p_status));
  insert into public.audit_events(store_id,actor_user_id,action,entity_table,entity_id,safe_changes,source)
  values(v_case.store_id,v_actor,'service_case.status_changed','service_cases',p_case_id,
    jsonb_build_object('from_status',v_case.status,'to_status',p_status),'admin');
  return p_status;
end $$;
revoke all on function public.transition_admin_service_case(uuid,text,text,text) from public,anon,service_role;
grant execute on function public.transition_admin_service_case(uuid,text,text,text) to authenticated;

create or replace function public.create_admin_purchase_order(
  p_store_id uuid,
  p_idempotency_key uuid,
  p_request_sha256 text,
  p_supplier_id uuid,
  p_expected_at timestamptz,
  p_notes text,
  p_items jsonb
)
returns table(result_purchase_order_id uuid,result_purchase_number text,is_idempotent_replay boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_purchase_id uuid := gen_random_uuid();
  v_number text;
  v_existing public.purchase_orders%rowtype;
  v_item record;
  v_total numeric(12,2);
  v_actor uuid := auth.uid();
begin
  if p_store_id is null or not private.is_store_member(p_store_id,array['owner','admin','purchasing']) then
    raise exception using errcode='42501',message='Você não tem permissão para criar pedidos de compra.';
  end if;
  if p_idempotency_key is null or p_request_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='Chave idempotente ou resumo da compra inválidos.';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then
    raise exception using errcode='22023',message='A compra deve conter de 1 a 100 variantes.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) x(value)
    where jsonb_typeof(x.value)<>'object'
      or coalesce(x.value->>'variant_id','') !~* '^[0-9a-f-]{36}$'
      or jsonb_typeof(x.value->'quantity')<>'number'
      or (x.value->>'quantity') !~ '^[1-9][0-9]*$'
      or (x.value->>'quantity')::integer>100000
      or jsonb_typeof(x.value->'unit_cost')<>'number'
      or (x.value->>'unit_cost')::numeric<0) then
    raise exception using errcode='22023',message='Uma variante, quantidade ou custo da compra é inválido.';
  end if;
  if exists(select (x.value->>'variant_id')::uuid from jsonb_array_elements(p_items) x(value)
    group by (x.value->>'variant_id')::uuid having count(*)>1) then
    raise exception using errcode='22023',message='Remova variantes duplicadas da compra.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_idempotency_key::text,0));
  select * into v_existing from public.purchase_orders po
  where po.store_id=p_store_id and po.idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.request_sha256 is distinct from p_request_sha256 then
      raise exception using errcode='22023',message='Esta chave já foi usada para outra compra.';
    end if;
    return query select v_existing.id,v_existing.purchase_number,true;
    return;
  end if;
  if not exists(select 1 from public.suppliers s where s.id=p_supplier_id and s.store_id=p_store_id and s.status='active') then
    raise exception using errcode='22023',message='Selecione um fornecedor ativo da loja.';
  end if;
  if p_expected_at is not null and p_expected_at < now()-interval '1 day' then
    raise exception using errcode='22023',message='A data prevista não pode estar no passado.';
  end if;
  for v_item in select (x.value->>'variant_id')::uuid as variant_id,
      (x.value->>'quantity')::integer as quantity,(x.value->>'unit_cost')::numeric(12,2) as unit_cost
    from jsonb_array_elements(p_items) x(value) order by (x.value->>'variant_id')::uuid
  loop
    if not exists(select 1 from public.product_variants pv where pv.id=v_item.variant_id and pv.store_id=p_store_id) then
      raise exception using errcode='22023',message='Uma variante da compra não pertence à loja.';
    end if;
  end loop;
  select sum((x.value->>'quantity')::integer*(x.value->>'unit_cost')::numeric)::numeric(12,2)
    into v_total from jsonb_array_elements(p_items) x(value);
  v_number := 'CP-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(v_purchase_id::text,'-',''),1,6));
  insert into public.purchase_orders(id,store_id,supplier_id,purchase_number,status,subtotal,expected_at,notes,idempotency_key,request_sha256)
  values(v_purchase_id,p_store_id,p_supplier_id,v_number,'draft',v_total,p_expected_at,nullif(left(btrim(coalesce(p_notes,'')),2000),''),p_idempotency_key,p_request_sha256);
  insert into public.purchase_order_items(store_id,purchase_order_id,variant_id,quantity_ordered,unit_cost)
  select p_store_id,v_purchase_id,(x.value->>'variant_id')::uuid,(x.value->>'quantity')::integer,(x.value->>'unit_cost')::numeric(12,2)
  from jsonb_array_elements(p_items) x(value);
  insert into public.audit_events(store_id,actor_user_id,action,entity_table,entity_id,safe_changes,source)
  values(p_store_id,v_actor,'purchase_order.created','purchase_orders',v_purchase_id,
    jsonb_build_object('item_count',jsonb_array_length(p_items),'subtotal',v_total),'admin');
  return query select v_purchase_id,v_number,false;
end $$;
revoke all on function public.create_admin_purchase_order(uuid,uuid,text,uuid,timestamptz,text,jsonb) from public,anon;
grant execute on function public.create_admin_purchase_order(uuid,uuid,text,uuid,timestamptz,text,jsonb) to authenticated;

create or replace function public.receive_admin_purchase_order(
  p_purchase_order_id uuid,
  p_idempotency_key uuid,
  p_items jsonb
)
returns table(result_batch_id uuid,result_status text,is_idempotent_replay boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.purchase_orders%rowtype;
  v_batch public.purchase_receipt_batches%rowtype;
  v_item record;
  v_expected integer;
  v_actor uuid := auth.uid();
  v_status text;
begin
  select * into v_order from public.purchase_orders where id=p_purchase_order_id for update;
  if not found then raise exception using errcode='22023',message='Pedido de compra não encontrado.'; end if;
  if not private.is_store_member(v_order.store_id,array['owner','admin','purchasing']) then
    raise exception using errcode='42501',message='Você não tem permissão para receber esta compra.';
  end if;
  if p_idempotency_key is null or p_items is null or jsonb_typeof(p_items)<>'array'
     or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then
    raise exception using errcode='22023',message='Os dados do recebimento são inválidos.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) x(value)
    where jsonb_typeof(x.value)<>'object' or coalesce(x.value->>'variant_id','') !~* '^[0-9a-f-]{36}$'
      or jsonb_typeof(x.value->'quantity')<>'number' or (x.value->>'quantity') !~ '^[1-9][0-9]*$'
      or (x.value->>'quantity')::integer>100000) then
    raise exception using errcode='22023',message='Informe quantidades inteiras positivas para as variantes recebidas.';
  end if;
  if exists(select (x.value->>'variant_id')::uuid from jsonb_array_elements(p_items) x(value)
    group by (x.value->>'variant_id')::uuid having count(*)>1) then
    raise exception using errcode='22023',message='Remova variantes duplicadas do recebimento.';
  end if;
  select * into v_batch from public.purchase_receipt_batches b
  where b.store_id=v_order.store_id and b.idempotency_key=p_idempotency_key for update;
  if found then
    if v_batch.purchase_order_id<>p_purchase_order_id
      or (select count(*) from public.purchase_receipt_batch_items bi where bi.batch_id=v_batch.id)
          <> jsonb_array_length(p_items)
      or exists(select 1 from jsonb_array_elements(p_items) x(value)
        left join public.purchase_receipt_batch_items bi on bi.batch_id=v_batch.id
          and bi.variant_id=(x.value->>'variant_id')::uuid and bi.quantity=(x.value->>'quantity')::integer
        where bi.id is null) then
      raise exception using errcode='22023',message='Esta chave já foi usada em outro recebimento.';
    end if;
    return query select v_batch.id,v_order.status,true;
    return;
  end if;
  if v_order.status not in ('sent','partially_received') then
    raise exception using errcode='22023',message='Marque o pedido de compra como enviado antes de receber itens.';
  end if;
  v_batch.id := gen_random_uuid();
  insert into public.purchase_receipt_batches(id,store_id,purchase_order_id,idempotency_key,actor_user_id)
  values(v_batch.id,v_order.store_id,v_order.id,p_idempotency_key,v_actor);
  for v_item in select (x.value->>'variant_id')::uuid as variant_id,(x.value->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) x(value) order by (x.value->>'variant_id')::uuid
  loop
    select poi.quantity_ordered-poi.quantity_received into v_expected
    from public.purchase_order_items poi
    where poi.store_id=v_order.store_id and poi.purchase_order_id=v_order.id and poi.variant_id=v_item.variant_id
    for update;
    if not found then raise exception using errcode='22023',message='A variante não pertence a este pedido de compra.'; end if;
    if v_item.quantity>v_expected then
      raise exception using errcode='22023',message='A quantidade recebida supera o saldo do item comprado.';
    end if;
    update public.purchase_order_items set quantity_received=quantity_received+v_item.quantity
    where store_id=v_order.store_id and purchase_order_id=v_order.id and variant_id=v_item.variant_id;
    insert into public.purchase_receipt_batch_items(store_id,batch_id,variant_id,quantity)
    values(v_order.store_id,v_batch.id,v_item.variant_id,v_item.quantity);
    insert into public.inventory_levels(store_id,variant_id,on_hand,reserved,reorder_point)
    values(v_order.store_id,v_item.variant_id,v_item.quantity,0,0)
    on conflict (variant_id) do update set on_hand=public.inventory_levels.on_hand+excluded.on_hand,updated_at=now();
    insert into public.stock_movements(store_id,variant_id,movement_type,quantity_delta,reason,purchase_order_id,actor_user_id,idempotency_key)
    values(v_order.store_id,v_item.variant_id,'purchase_receipt',v_item.quantity,
      'Recebimento do pedido '||v_order.purchase_number,v_order.id,v_actor,v_batch.id::text||':'||v_item.variant_id::text);
  end loop;
  if exists(select 1 from public.purchase_order_items poi where poi.store_id=v_order.store_id
    and poi.purchase_order_id=v_order.id and poi.quantity_received<poi.quantity_ordered) then
    v_status := 'partially_received';
  else
    v_status := 'received';
  end if;
  update public.purchase_orders set status=v_status,received_at=case when v_status='received' then now() else received_at end,updated_at=now()
  where id=v_order.id;
  insert into public.audit_events(store_id,actor_user_id,action,entity_table,entity_id,safe_changes,source)
  values(v_order.store_id,v_actor,'purchase_order.received','purchase_orders',v_order.id,
    jsonb_build_object('batch_id',v_batch.id,'item_count',jsonb_array_length(p_items),'status',v_status),'admin');
  return query select v_batch.id,v_status,false;
end $$;
revoke all on function public.receive_admin_purchase_order(uuid,uuid,jsonb) from public,anon;
grant execute on function public.receive_admin_purchase_order(uuid,uuid,jsonb) to authenticated;

create or replace function private.audit_panel_row_change()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_store_id uuid := (v_new->>'store_id')::uuid;
  v_entity_id uuid := (v_new->>'id')::uuid;
  v_fields text[];
begin
  if tg_op='INSERT' then
    select coalesce(array_agg(key order by key),'{}'::text[]) into v_fields
    from jsonb_object_keys(v_new) as keys(key)
    where key not in ('id','store_id','created_at','updated_at');
  else
    select coalesce(array_agg(current.key order by current.key),'{}'::text[]) into v_fields
    from jsonb_each(v_new-'updated_at') as new_fields(key,value)
    left join jsonb_each(v_old-'updated_at') as old_fields(key,value) using(key)
    where new_fields.value is distinct from old_fields.value;
  end if;
  insert into public.audit_events(store_id,actor_user_id,action,entity_table,entity_id,safe_changes,source)
  values(v_store_id,auth.uid(),lower(tg_table_name)||case when tg_op='INSERT' then '.created' else '.updated' end,
    tg_table_name,v_entity_id,jsonb_build_object('fields',to_jsonb(v_fields)),'admin');
  return new;
end $$;
revoke all on function private.audit_panel_row_change() from public,anon,authenticated,service_role;
create trigger panel_audit_products after insert or update on public.products for each row execute function private.audit_panel_row_change();
create trigger panel_audit_coupons after insert or update on public.coupons for each row execute function private.audit_panel_row_change();
create trigger panel_audit_suppliers after insert or update on public.suppliers for each row execute function private.audit_panel_row_change();
create trigger panel_audit_purchase_orders after insert or update on public.purchase_orders for each row execute function private.audit_panel_row_change();
create trigger panel_audit_content_sections after insert or update on public.content_sections for each row execute function private.audit_panel_row_change();
create trigger panel_audit_store_settings after insert or update on public.store_settings for each row execute function private.audit_panel_row_change();

-- Seed editable storefront blocks. Public rendering still has static fallbacks.
insert into public.content_sections(store_id,section_key,title,content,status,position)
select s.id,seed.section_key,seed.title,seed.content,'published',seed.position
from public.stores s
cross join (values
  ('home_hero','Chamada principal','{"eyebrow":"TECNOLOGIA COM ESPAÇO NA ROTINA","title_line_1":"Seu espaço.","title_line_2":"Do seu jeito.","description":"Uma curadoria de tecnologia para trabalhar, estudar e se conectar melhor em casa.","image_alt":"Teclado, mouse e headset em uma estação de trabalho grafite com iluminação ciano e violeta"}'::jsonb,1),
  ('home_benefits','Faixa de benefícios','{"items":["Curadoria com propósito","Informação sem complicação","Compatibilidade em primeiro lugar"]}'::jsonb,2),
  ('home_campaign','Conteúdo em destaque','{"eyebrow":"UM BOM COMEÇO, NO SEU RITMO","title":"Monte um espaço que trabalha com você.","description":"Conte como é sua rotina. A gente ajuda você a encontrar acessórios que combinam com o que já tem."}'::jsonb,3)
) as seed(section_key,title,content,position)
where s.slug='tecla-nativa'
on conflict(store_id,section_key) do nothing;

commit;
