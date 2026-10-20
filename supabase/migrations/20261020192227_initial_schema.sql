-- Tecla Nativa: núcleo transacional inicial para Supabase/Postgres 17.
-- Catálogo e dados de operação permanecem em rascunho até validação comercial.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  status text not null default 'setup' check (status in ('setup','active','paused')),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  support_email text,
  support_whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_memberships (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','catalog','inventory','fulfillment','support','finance','marketing','analyst','purchasing')),
  status text not null default 'active' check (status in ('invited','active','disabled')),
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (store_id,user_id),
  unique (id,store_id)
);
create index store_memberships_user_idx on public.store_memberships(user_id,store_id) where status='active';

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  image_path text,
  position integer not null default 0,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id,slug),
  unique (id,store_id)
);
create index categories_store_position_idx on public.categories(store_id,position) where active;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid,
  slug text not null,
  sku_base text not null,
  name text not null,
  summary text not null default '',
  description text not null default '',
  primary_image_path text,
  base_price numeric(12,2) not null check (base_price >= 0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  featured boolean not null default false,
  specifications jsonb not null default '[]'::jsonb check (jsonb_typeof(specifications)='array'),
  compatibility text not null default '',
  box_contents text not null default '',
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id,slug),
  unique (store_id,sku_base),
  unique (id,store_id),
  foreign key (category_id,store_id) references public.categories(id,store_id) on delete restrict
);
create index products_store_status_idx on public.products(store_id,status,created_at desc);
create index products_store_category_idx on public.products(store_id,category_id,status);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  sku text not null,
  option_key text not null,
  option_label text not null,
  swatch_hex text check (swatch_hex is null or swatch_hex ~ '^#[0-9A-Fa-f]{6}$'),
  image_path text,
  price_override numeric(12,2) check (price_override is null or price_override >= 0),
  weight_grams integer check (weight_grams is null or weight_grams > 0),
  length_mm integer check (length_mm is null or length_mm > 0),
  width_mm integer check (width_mm is null or width_mm > 0),
  height_mm integer check (height_mm is null or height_mm > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id,sku),
  unique (product_id,option_key),
  unique (id,store_id),
  foreign key (product_id,store_id) references public.products(id,store_id) on delete cascade
);
create index product_variants_product_idx on public.product_variants(store_id,product_id,active);

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  image_path text not null,
  alt_text text not null default '',
  position integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id,store_id),
  unique (store_id,product_id,image_path,position),
  foreign key (product_id,store_id) references public.products(id,store_id) on delete cascade,
  foreign key (variant_id,store_id) references public.product_variants(id,store_id) on delete restrict
);
create index product_media_product_order_idx on public.product_media(store_id,product_id,position);

create table public.inventory_levels (
  variant_id uuid primary key,
  store_id uuid not null,
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0 and reserved <= on_hand),
  available integer generated always as (on_hand-reserved) stored,
  reorder_point integer not null default 0 check (reorder_point >= 0),
  updated_at timestamptz not null default now(),
  foreign key (variant_id,store_id) references public.product_variants(id,store_id) on delete cascade
);
create index inventory_levels_store_available_idx on public.inventory_levels(store_id,available) where available = 0;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  email_normalized text generated always as (lower(btrim(email))) stored,
  phone text,
  marketing_consent_at timestamptz,
  marketing_consent_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,store_id)
);
create unique index customers_store_email_idx on public.customers(store_id,email_normalized) where email_normalized is not null;
create index customers_store_created_idx on public.customers(store_id,created_at desc);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  customer_id uuid,
  order_number text not null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  status text not null default 'pending_payment' check (status in ('pending_payment','paid','processing','ready_to_ship','shipped','delivered','cancelled','partially_refunded','refunded')),
  payment_status text not null default 'pending' check (payment_status in ('pending','authorized','paid','partially_refunded','refunded','failed','disputed')),
  fulfillment_status text not null default 'unfulfilled' check (fulfillment_status in ('unfulfilled','processing','ready','partially_shipped','shipped','delivered','returned')),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  shipping_total numeric(12,2) not null default 0 check (shipping_total >= 0),
  total numeric(12,2) not null check (total >= 0),
  shipping_address jsonb not null check (jsonb_typeof(shipping_address)='object'),
  billing_address jsonb check (billing_address is null or jsonb_typeof(billing_address)='object'),
  customer_note text,
  internal_note text,
  placed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id,order_number),
  unique (id,store_id),
  check (total = subtotal-discount_total+shipping_total),
  foreign key (customer_id,store_id) references public.customers(id,store_id) on delete restrict
);
create index orders_store_status_created_idx on public.orders(store_id,status,created_at desc);
create index orders_store_payment_created_idx on public.orders(store_id,payment_status,created_at desc);
create index orders_customer_created_idx on public.orders(store_id,customer_id,created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  product_id uuid,
  variant_id uuid,
  product_name_snapshot text not null,
  variant_name_snapshot text not null default '',
  sku_snapshot text not null,
  image_path_snapshot text,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) generated always as (unit_price*quantity) stored,
  created_at timestamptz not null default now(),
  foreign key (order_id,store_id) references public.orders(id,store_id) on delete restrict,
  foreign key (product_id,store_id) references public.products(id,store_id) on delete restrict,
  foreign key (variant_id,store_id) references public.product_variants(id,store_id) on delete restrict
);
create index order_items_order_idx on public.order_items(store_id,order_id);
create index order_items_variant_idx on public.order_items(store_id,variant_id) where variant_id is not null;

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  provider text not null check (provider in ('pagbank')),
  provider_payment_id text,
  idempotency_key text not null,
  method text check (method is null or method in ('pix','credit_card','debit_card','boleto')),
  status text not null default 'created' check (status in ('created','pending','authorized','paid','declined','cancelled','expired','partially_refunded','refunded','disputed')),
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  checkout_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id,idempotency_key),
  unique (store_id,provider,provider_payment_id),
  unique (id,store_id),
  foreign key (order_id,store_id) references public.orders(id,store_id) on delete restrict
);
create index payment_attempts_order_idx on public.payment_attempts(store_id,order_id,created_at desc);

create table public.webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  provider text not null check (provider in ('pagbank','melhor_envio')),
  provider_event_id text not null,
  event_type text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object'),
  signature_valid boolean not null,
  processing_status text not null default 'received' check (processing_status in ('received','processing','processed','retry','rejected')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error_code text,
  unique (store_id,provider,provider_event_id)
);
create index webhook_inbox_retry_idx on public.webhook_inbox(processing_status,received_at) where processing_status in ('received','retry');

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  payment_attempt_id uuid,
  provider text not null check (provider in ('pagbank')),
  provider_transaction_id text,
  kind text not null check (kind in ('authorization','capture','fee','refund','chargeback','chargeback_reversal','adjustment')),
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  effective_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  foreign key (order_id,store_id) references public.orders(id,store_id) on delete restrict,
  foreign key (payment_attempt_id,store_id) references public.payment_attempts(id,store_id) on delete restrict
);
create unique index financial_transactions_provider_ref_idx on public.financial_transactions(store_id,provider,provider_transaction_id,kind) where provider_transaction_id is not null;
create index financial_transactions_store_effective_idx on public.financial_transactions(store_id,effective_at desc);

create table public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('admin','pagbank_webhook','melhor_envio_webhook','system')),
  note text,
  created_at timestamptz not null default now(),
  foreign key (order_id,store_id) references public.orders(id,store_id) on delete restrict
);
create index order_status_events_timeline_idx on public.order_status_events(store_id,order_id,created_at);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  variant_id uuid not null,
  quantity integer not null check (quantity > 0),
  status text not null default 'active' check (status in ('active','consumed','released','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (order_id,store_id) references public.orders(id,store_id) on delete restrict,
  foreign key (variant_id,store_id) references public.product_variants(id,store_id) on delete restrict
);
create index inventory_reservations_expiry_idx on public.inventory_reservations(expires_at) where status='active';
create index inventory_reservations_order_idx on public.inventory_reservations(store_id,order_id,status);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  variant_id uuid not null,
  movement_type text not null check (movement_type in ('purchase_receipt','sale','return','adjustment_in','adjustment_out','damage','loss')),
  quantity_delta integer not null check (quantity_delta <> 0),
  reason text not null,
  order_id uuid,
  purchase_order_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (store_id,idempotency_key),
  foreign key (variant_id,store_id) references public.product_variants(id,store_id) on delete restrict,
  foreign key (order_id,store_id) references public.orders(id,store_id) on delete restrict
);
create index stock_movements_variant_timeline_idx on public.stock_movements(store_id,variant_id,created_at desc);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  provider text not null default 'melhor_envio' check (provider in ('melhor_envio')),
  provider_shipment_id text,
  service_code text,
  service_name text,
  status text not null default 'quoted' check (status in ('quoted','awaiting_payment','ready','posted','in_transit','delivered','exception','cancelled','returned')),
  tracking_code text,
  shipping_cost numeric(12,2) check (shipping_cost is null or shipping_cost >= 0),
  estimated_delivery_at timestamptz,
  label_storage_path text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id,provider,provider_shipment_id),
  unique (id,store_id),
  foreign key (order_id,store_id) references public.orders(id,store_id) on delete restrict
);
create index shipments_store_status_idx on public.shipments(store_id,status,created_at desc);
create index shipments_tracking_idx on public.shipments(store_id,tracking_code) where tracking_code is not null;

create table public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  shipment_id uuid not null,
  provider_event_id text,
  event_code text not null,
  description text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  foreign key (shipment_id,store_id) references public.shipments(id,store_id) on delete restrict
);
create unique index shipment_events_provider_event_idx on public.shipment_events(store_id,shipment_id,provider_event_id) where provider_event_id is not null;
create index shipment_events_timeline_idx on public.shipment_events(store_id,shipment_id,occurred_at desc);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percentage','fixed_amount','free_shipping')),
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  minimum_order_total numeric(12,2) not null default 0 check (minimum_order_total >= 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','active','paused','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id,code),
  unique (id,store_id),
  check ((discount_type='percentage' and discount_value > 0 and discount_value <= 100) or (discount_type='fixed_amount' and discount_value > 0) or (discount_type='free_shipping' and discount_value=0)),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index coupons_store_status_idx on public.coupons(store_id,status,starts_at,ends_at);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  coupon_id uuid not null,
  order_id uuid not null,
  customer_id uuid,
  discount_amount numeric(12,2) not null check (discount_amount >= 0),
  redeemed_at timestamptz not null default now(),
  unique (store_id,coupon_id,order_id),
  foreign key (coupon_id,store_id) references public.coupons(id,store_id) on delete restrict,
  foreign key (order_id,store_id) references public.orders(id,store_id) on delete restrict,
  foreign key (customer_id,store_id) references public.customers(id,store_id) on delete restrict
);
create index coupon_redemptions_customer_idx on public.coupon_redemptions(store_id,coupon_id,customer_id) where customer_id is not null;

create table public.service_cases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  case_number text not null,
  order_id uuid,
  customer_id uuid,
  case_type text not null check (case_type in ('exchange','return','defect','delivery_issue','question','other')),
  reason text not null,
  status text not null default 'new' check (status in ('new','under_review','awaiting_customer','awaiting_return','resolved','rejected','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  response_due_at timestamptz,
  resolution text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id,case_number),
  unique (id,store_id),
  foreign key (order_id,store_id) references public.orders(id,store_id) on delete restrict,
  foreign key (customer_id,store_id) references public.customers(id,store_id) on delete restrict
);
create index service_cases_queue_idx on public.service_cases(store_id,status,response_due_at);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,store_id)
);
create index suppliers_store_status_idx on public.suppliers(store_id,status,name);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  supplier_id uuid not null,
  purchase_number text not null,
  status text not null default 'draft' check (status in ('draft','sent','partially_received','received','cancelled','late')),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  expected_at timestamptz,
  sent_at timestamptz,
  received_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id,purchase_number),
  unique (id,store_id),
  foreign key (supplier_id,store_id) references public.suppliers(id,store_id) on delete restrict
);
create index purchase_orders_queue_idx on public.purchase_orders(store_id,status,expected_at);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  purchase_order_id uuid not null,
  variant_id uuid not null,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0 and quantity_received <= quantity_ordered),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  foreign key (purchase_order_id,store_id) references public.purchase_orders(id,store_id) on delete restrict,
  foreign key (variant_id,store_id) references public.product_variants(id,store_id) on delete restrict
);
create index purchase_order_items_order_idx on public.purchase_order_items(store_id,purchase_order_id);
alter table public.stock_movements add constraint stock_movements_purchase_order_fk
  foreign key (purchase_order_id,store_id) references public.purchase_orders(id,store_id) on delete restrict;

create table public.service_case_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  case_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('note','status_change','customer_message','attachment','refund','exchange','return_label')),
  body text not null default '',
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object'),
  created_at timestamptz not null default now(),
  foreign key (case_id,store_id) references public.service_cases(id,store_id) on delete restrict
);
create index service_case_events_timeline_idx on public.service_case_events(store_id,case_id,created_at);

create table public.content_sections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  section_key text not null,
  title text not null,
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content)='object'),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id,section_key)
);
create index content_sections_public_idx on public.content_sections(store_id,position) where status='published';

create table public.store_settings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  setting_key text not null,
  setting_value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (store_id,setting_key)
);

create table public.integration_configs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null check (provider in ('pagbank','melhor_envio','email','analytics')),
  status text not null default 'not_configured' check (status in ('not_configured','sandbox','active','paused','error')),
  secret_reference text,
  safe_config jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_config)='object'),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id,provider)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  safe_changes jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_changes)='object'),
  source text not null default 'admin',
  created_at timestamptz not null default now()
);
create index audit_events_store_timeline_idx on public.audit_events(store_id,created_at desc);

create function private.is_store_member(p_store_id uuid,p_roles text[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.store_memberships sm
    where sm.store_id=p_store_id and sm.user_id=(select auth.uid()) and sm.status='active'
      and (p_roles is null or sm.role=any(p_roles))
  );
$$;
revoke all on function private.is_store_member(uuid,text[]) from public, anon;
grant execute on function private.is_store_member(uuid,text[]) to authenticated;

create function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at=now(); return new; end;
$$;

do $$
declare t text;
begin
  foreach t in array array['stores','categories','products','product_variants','inventory_levels','customers','orders','payment_attempts','inventory_reservations','shipments','coupons','service_cases','suppliers','purchase_orders','content_sections','store_settings','integration_configs'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['stores','store_memberships','categories','products','product_variants','product_media','inventory_levels','customers','orders','order_items','payment_attempts','webhook_inbox','financial_transactions','order_status_events','inventory_reservations','stock_movements','shipments','shipment_events','coupons','coupon_redemptions','service_cases','service_case_events','suppliers','purchase_orders','purchase_order_items','content_sections','store_settings','integration_configs','audit_events'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

revoke all on all tables in schema public from anon,authenticated;
grant usage on schema public to anon,authenticated,service_role;
grant select on public.stores,public.categories,public.products,public.product_variants,public.product_media to anon,authenticated;
grant select,insert,update,delete on public.stores,public.categories,public.products,public.product_variants,public.product_media,public.coupons,public.content_sections to authenticated;
grant select on public.store_memberships,public.inventory_levels,public.stock_movements,public.customers,public.orders,public.order_items,public.payment_attempts,public.webhook_inbox,public.financial_transactions,public.order_status_events,public.inventory_reservations,public.shipments,public.shipment_events,public.coupon_redemptions,public.service_cases,public.service_case_events,public.suppliers,public.purchase_orders,public.purchase_order_items,public.store_settings,public.integration_configs,public.audit_events to authenticated;
grant update on public.orders,public.shipments,public.service_cases,public.purchase_orders,public.purchase_order_items,public.store_settings,public.integration_configs to authenticated;
grant insert,update,delete on public.store_memberships to service_role;

create policy stores_public_read on public.stores for select to anon,authenticated using (status='active');
create policy stores_staff_read on public.stores for select to authenticated using (private.is_store_member(id));
create policy stores_admin_update on public.stores for update to authenticated using (private.is_store_member(id,array['owner','admin'])) with check (private.is_store_member(id,array['owner','admin']));

create policy memberships_self_read on public.store_memberships for select to authenticated using (user_id=(select auth.uid()) or private.is_store_member(store_id,array['owner','admin']));

create policy categories_public_read on public.categories for select to anon,authenticated using (active and exists (select 1 from public.stores s where s.id=store_id and s.status='active'));
create policy categories_staff_read on public.categories for select to authenticated using (private.is_store_member(store_id));
create policy categories_staff_insert on public.categories for insert to authenticated with check (private.is_store_member(store_id,array['owner','admin','catalog']));
create policy categories_staff_update on public.categories for update to authenticated using (private.is_store_member(store_id,array['owner','admin','catalog'])) with check (private.is_store_member(store_id,array['owner','admin','catalog']));
create policy categories_staff_delete on public.categories for delete to authenticated using (private.is_store_member(store_id,array['owner','admin']));

create policy products_public_read on public.products for select to anon,authenticated using (status='published' and exists (select 1 from public.stores s where s.id=store_id and s.status='active'));
create policy products_staff_read on public.products for select to authenticated using (private.is_store_member(store_id));
create policy products_staff_insert on public.products for insert to authenticated with check (private.is_store_member(store_id,array['owner','admin','catalog']));
create policy products_staff_update on public.products for update to authenticated using (private.is_store_member(store_id,array['owner','admin','catalog'])) with check (private.is_store_member(store_id,array['owner','admin','catalog']));
create policy products_staff_delete on public.products for delete to authenticated using (private.is_store_member(store_id,array['owner','admin']));

create policy variants_public_read on public.product_variants for select to anon,authenticated using (active and exists (select 1 from public.products p join public.stores s on s.id=p.store_id where p.id=product_variants.product_id and p.store_id=product_variants.store_id and p.status='published' and s.status='active'));
create policy variants_staff_read on public.product_variants for select to authenticated using (private.is_store_member(store_id));
create policy variants_staff_insert on public.product_variants for insert to authenticated with check (private.is_store_member(store_id,array['owner','admin','catalog']));
create policy variants_staff_update on public.product_variants for update to authenticated using (private.is_store_member(store_id,array['owner','admin','catalog'])) with check (private.is_store_member(store_id,array['owner','admin','catalog']));
create policy variants_staff_delete on public.product_variants for delete to authenticated using (private.is_store_member(store_id,array['owner','admin']));
create policy product_media_public_read on public.product_media for select to anon,authenticated using (exists (select 1 from public.products p join public.stores s on s.id=p.store_id where p.id=product_media.product_id and p.store_id=product_media.store_id and p.status='published' and s.status='active'));
create policy product_media_staff_read on public.product_media for select to authenticated using (private.is_store_member(store_id));
create policy product_media_staff_insert on public.product_media for insert to authenticated with check (private.is_store_member(store_id,array['owner','admin','catalog']));
create policy product_media_staff_update on public.product_media for update to authenticated using (private.is_store_member(store_id,array['owner','admin','catalog'])) with check (private.is_store_member(store_id,array['owner','admin','catalog']));
create policy product_media_staff_delete on public.product_media for delete to authenticated using (private.is_store_member(store_id,array['owner','admin','catalog']));

create policy inventory_staff_read on public.inventory_levels for select to authenticated using (private.is_store_member(store_id,array['owner','admin','inventory','fulfillment']));
create policy stock_movements_staff_read on public.stock_movements for select to authenticated using (private.is_store_member(store_id,array['owner','admin','inventory','fulfillment']));
create policy customers_staff_read on public.customers for select to authenticated using (private.is_store_member(store_id,array['owner','admin','support','marketing']));
create policy orders_staff_read on public.orders for select to authenticated using (private.is_store_member(store_id,array['owner','admin','support','fulfillment','finance']));
create policy orders_staff_update on public.orders for update to authenticated using (private.is_store_member(store_id,array['owner','admin','support','fulfillment'])) with check (private.is_store_member(store_id,array['owner','admin','support','fulfillment']));
create policy order_items_staff_read on public.order_items for select to authenticated using (private.is_store_member(store_id,array['owner','admin','support','fulfillment','finance']));
create policy payments_staff_read on public.payment_attempts for select to authenticated using (private.is_store_member(store_id,array['owner','admin','finance']));
create policy webhook_staff_read on public.webhook_inbox for select to authenticated using (private.is_store_member(store_id,array['owner','admin','finance']));
create policy financial_staff_read on public.financial_transactions for select to authenticated using (private.is_store_member(store_id,array['owner','admin','finance']));
create policy order_events_staff_read on public.order_status_events for select to authenticated using (private.is_store_member(store_id,array['owner','admin','support','fulfillment']));
create policy reservations_staff_read on public.inventory_reservations for select to authenticated using (private.is_store_member(store_id,array['owner','admin','inventory','fulfillment']));
create policy shipments_staff_read on public.shipments for select to authenticated using (private.is_store_member(store_id,array['owner','admin','fulfillment','support']));
create policy shipments_staff_update on public.shipments for update to authenticated using (private.is_store_member(store_id,array['owner','admin','fulfillment'])) with check (private.is_store_member(store_id,array['owner','admin','fulfillment']));
create policy shipment_events_staff_read on public.shipment_events for select to authenticated using (private.is_store_member(store_id,array['owner','admin','fulfillment','support']));
create policy coupons_staff_read on public.coupons for select to authenticated using (private.is_store_member(store_id,array['owner','admin','marketing']));
create policy coupons_staff_insert on public.coupons for insert to authenticated with check (private.is_store_member(store_id,array['owner','admin','marketing']));
create policy coupons_staff_update on public.coupons for update to authenticated using (private.is_store_member(store_id,array['owner','admin','marketing'])) with check (private.is_store_member(store_id,array['owner','admin','marketing']));
create policy coupons_staff_delete on public.coupons for delete to authenticated using (private.is_store_member(store_id,array['owner','admin']));
create policy coupon_redemptions_staff_read on public.coupon_redemptions for select to authenticated using (private.is_store_member(store_id,array['owner','admin','finance','marketing']));
create policy cases_staff_read on public.service_cases for select to authenticated using (private.is_store_member(store_id,array['owner','admin','support']));
create policy cases_staff_update on public.service_cases for update to authenticated using (private.is_store_member(store_id,array['owner','admin','support'])) with check (private.is_store_member(store_id,array['owner','admin','support']));
create policy case_events_staff_read on public.service_case_events for select to authenticated using (private.is_store_member(store_id,array['owner','admin','support']));
create policy suppliers_staff_read on public.suppliers for select to authenticated using (private.is_store_member(store_id,array['owner','admin','purchasing','finance']));
create policy suppliers_staff_insert on public.suppliers for insert to authenticated with check (private.is_store_member(store_id,array['owner','admin','purchasing']));
create policy suppliers_staff_update on public.suppliers for update to authenticated using (private.is_store_member(store_id,array['owner','admin','purchasing'])) with check (private.is_store_member(store_id,array['owner','admin','purchasing']));
create policy purchase_orders_staff_read on public.purchase_orders for select to authenticated using (private.is_store_member(store_id,array['owner','admin','purchasing','finance']));
create policy purchase_orders_staff_insert on public.purchase_orders for insert to authenticated with check (private.is_store_member(store_id,array['owner','admin','purchasing']));
create policy purchase_orders_staff_update on public.purchase_orders for update to authenticated using (private.is_store_member(store_id,array['owner','admin','purchasing'])) with check (private.is_store_member(store_id,array['owner','admin','purchasing']));
create policy purchase_items_staff_read on public.purchase_order_items for select to authenticated using (private.is_store_member(store_id,array['owner','admin','purchasing','finance']));
create policy purchase_items_staff_insert on public.purchase_order_items for insert to authenticated with check (private.is_store_member(store_id,array['owner','admin','purchasing']));
create policy purchase_items_staff_update on public.purchase_order_items for update to authenticated using (private.is_store_member(store_id,array['owner','admin','purchasing'])) with check (private.is_store_member(store_id,array['owner','admin','purchasing']));
create policy content_public_read on public.content_sections for select to anon,authenticated using (status='published' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) and exists (select 1 from public.stores s where s.id=store_id and s.status='active'));
create policy content_staff_read on public.content_sections for select to authenticated using (private.is_store_member(store_id));
create policy content_staff_insert on public.content_sections for insert to authenticated with check (private.is_store_member(store_id,array['owner','admin','marketing']));
create policy content_staff_update on public.content_sections for update to authenticated using (private.is_store_member(store_id,array['owner','admin','marketing'])) with check (private.is_store_member(store_id,array['owner','admin','marketing']));
create policy content_staff_delete on public.content_sections for delete to authenticated using (private.is_store_member(store_id,array['owner','admin']));
create policy settings_staff_read on public.store_settings for select to authenticated using (private.is_store_member(store_id,array['owner','admin']));
create policy settings_staff_insert on public.store_settings for insert to authenticated with check (private.is_store_member(store_id,array['owner','admin']));
create policy settings_staff_update on public.store_settings for update to authenticated using (private.is_store_member(store_id,array['owner','admin'])) with check (private.is_store_member(store_id,array['owner','admin']));
create policy integrations_staff_read on public.integration_configs for select to authenticated using (private.is_store_member(store_id,array['owner','admin']));
create policy integrations_staff_insert on public.integration_configs for insert to authenticated with check (private.is_store_member(store_id,array['owner','admin']));
create policy integrations_staff_update on public.integration_configs for update to authenticated using (private.is_store_member(store_id,array['owner','admin'])) with check (private.is_store_member(store_id,array['owner','admin']));
create policy audit_staff_read on public.audit_events for select to authenticated using (private.is_store_member(store_id,array['owner','admin']));

commit;
