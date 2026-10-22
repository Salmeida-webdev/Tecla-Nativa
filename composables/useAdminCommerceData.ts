import type { Database, Json } from '~/supabase/types/database.types';
import { colorVariantSku } from '~/utils/catalog';

type StoreRow = Database['public']['Tables']['stores']['Row'];
type ProductRow = Database['public']['Tables']['products']['Row'];
type CategoryRow = Database['public']['Tables']['categories']['Row'];
type VariantRow = Database['public']['Tables']['product_variants']['Row'];
type InventoryRow = Database['public']['Tables']['inventory_levels']['Row'];
type OrderRow = Database['public']['Tables']['orders']['Row'];
type OrderItemRow = Database['public']['Tables']['order_items']['Row'];
type CustomerRow = Database['public']['Tables']['customers']['Row'];
type MembershipRow = Database['public']['Tables']['store_memberships']['Row'];
type AuditRow = Database['public']['Tables']['audit_events']['Row'];
type StockMovementRow = Database['public']['Tables']['stock_movements']['Row'];
type PaymentAttemptRow = Database['public']['Tables']['payment_attempts']['Row'];
type OrderStatusEventRow = Database['public']['Tables']['order_status_events']['Row'];

export interface AdminProductView {
  id: string;
  slug: string;
  categoryId: string | null;
  name: string;
  category: string;
  summary: string;
  description: string;
  price: number;
  image: string;
  sku: string;
  status: ProductRow['status'];
  colors: number;
  variants: number;
  stock: number;
  minStock: number;
  published: boolean;
  featured: boolean;
}

export interface AdminCategoryOption {
  id: string;
  name: string;
  slug: string;
  active: boolean;
}

export interface AdminProductInput {
  id?: string | null;
  name: string;
  skuBase: string;
  categoryId: string;
  price: number;
  description: string;
  featured: boolean;
}

export interface AdminVariantView {
  id: string;
  productId: string;
  productBaseSku: string;
  optionKey: string;
  product: string;
  color: string;
  swatchHex: string | null;
  imagePath: string | null;
  sku: string;
  image: string;
  price: number;
  priceOverride: number | null;
  onHand: number;
  reserved: number;
  stock: number;
  minStock: number;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  weight: string;
  dimensions: string;
}

export interface AdminVariantInput {
  id?: string | null;
  productId: string;
  optionLabel: string;
  swatchHex: string;
  imagePath: string;
  priceOverride: number | null;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  reorderPoint: number;
}

export interface AdminStockAdjustmentInput {
  variantId: string;
  delta: number;
  reason: string;
}

export interface AdminOrderItemView {
  name: string;
  variant: string;
  sku: string;
  qty: number;
  price: number;
  image: string;
}

export interface AdminOrderView {
  id: string;
  orderUuid: string;
  customer: string;
  initials: string;
  email: string;
  phone: string;
  date: string;
  placedAt: string;
  total: number;
  subtotal: number;
  discount: number;
  shippingTotal: number;
  items: AdminOrderItemView[];
  payment: string;
  status: string;
  shipping: string;
  method: string;
  carrier: string;
  shippingService: string;
  tracking: string;
  trackingUrl: string;
  labelCreated: boolean;
  events: Array<{ status: string; createdAt: string; note: string; source: string }>;
  address: string;
  city: string;
  note: string;
}

export interface AdminActivityView {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  actor: string;
  action: string;
  target: string;
  change: string;
  source: string;
}

export interface AdminCustomerView {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
}

export interface AdminTeamMemberView {
  id: string;
  userId: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  joinedAt: string | null;
}

export interface AdminStockMovementView {
  id: string;
  type: string;
  product: string;
  sku: string;
  quantity: number;
  actor: string;
  createdAt: string;
  reason: string;
}

export interface AdminOrderSummary {
  total: number;
  payment_status: string;
  status: string;
  fulfillment_status: string;
  placed_at: string;
}

export interface AdminCommerceSnapshot {
  store: Pick<StoreRow, 'id' | 'name' | 'slug' | 'status' | 'currency' | 'support_email' | 'support_whatsapp'>;
  categories: AdminCategoryOption[];
  products: AdminProductView[];
  variants: AdminVariantView[];
  orders: AdminOrderView[];
  activities: AdminActivityView[];
  movements: AdminStockMovementView[];
  customers: AdminCustomerView[];
  customerCount: number;
  newCustomerCount: number;
  team: AdminTeamMemberView[];
}

const PLACEHOLDER_IMAGE = '/images/product-placeholder.svg';

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Pendente',
  authorized: 'Autorizado',
  paid: 'Pago',
  partially_refunded: 'Reembolso parcial',
  refunded: 'Reembolsado',
  failed: 'Recusado',
  disputed: 'Em contestação',
};

const ORDER_LABELS: Record<string, string> = {
  pending_payment: 'Aguardando',
  paid: 'Aguardando',
  processing: 'Em separação',
  ready_to_ship: 'Pronto para envio',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
  partially_refunded: 'Reembolso parcial',
  refunded: 'Reembolsado',
};

const FULFILLMENT_LABELS: Record<string, string> = {
  unfulfilled: 'Aguardando',
  processing: 'Em separação',
  ready: 'Pronto para envio',
  partially_shipped: 'Envio parcial',
  shipped: 'Em trânsito',
  delivered: 'Entregue',
  returned: 'Devolvido',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function addressFields(value: Json): { address: string; city: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { address: 'Endereço não registrado', city: '—' };
  }

  const fields = value as Record<string, Json | undefined>;
  const address = [
    fields.street ?? fields.address_line_1 ?? fields.line1 ?? fields.address,
    fields.number,
    fields.complement,
  ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(', ');
  const city = [fields.neighborhood, fields.city, fields.state, fields.postal_code ?? fields.zip_code]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' · ');

  return {
    address: address || 'Endereço não registrado',
    city: city || '—',
  };
}

function periodStart(period: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  if (period === 'Últimos 30 dias') start.setDate(start.getDate() - 29);
  else if (period === 'Este mês') start.setDate(1);
  else if (period === 'Este trimestre') {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  } else start.setDate(start.getDate() - 6);

  return start.toISOString();
}

function throwIfError(context: string, error: { message: string } | null) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function productSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function useAdminCommerceData() {
  const { $supabase } = useNuxtApp();
  const loading = ref(false);
  const summaryLoading = ref(false);
  const error = ref('');
  const snapshot = shallowRef<AdminCommerceSnapshot | null>(null);
  const orderSummary = shallowRef<AdminOrderSummary[]>([]);
  let pendingStockAdjustment: { fingerprint: string; idempotencyKey: string } | null = null;

  async function loadOrderSummary(storeId: string, period: string) {
    if (!$supabase) return;

    summaryLoading.value = true;
    try {
      const rows: AdminOrderSummary[] = [];
      const pageSize = 500;
      let offset = 0;

      while (true) {
        const { data, error: queryError } = await $supabase
          .from('orders')
          .select('total,payment_status,status,fulfillment_status,placed_at')
          .eq('store_id', storeId)
          .gte('placed_at', periodStart(period))
          .order('placed_at', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);

        throwIfError('Não foi possível calcular os indicadores do período', queryError);
        const page = (data ?? []) as AdminOrderSummary[];
        rows.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }

      orderSummary.value = rows;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Falha ao calcular os indicadores.';
      orderSummary.value = [];
    } finally {
      summaryLoading.value = false;
    }
  }

  async function refresh(period = 'Últimos 7 dias') {
    if (!$supabase) {
      error.value = 'Supabase ainda não está configurado neste ambiente.';
      return;
    }

    loading.value = true;
    error.value = '';

    try {
      const { data: store, error: storeError } = await $supabase
        .from('stores')
        .select('id,name,slug,status,currency,support_email,support_whatsapp')
        .eq('slug', 'tecla-nativa')
        .maybeSingle();

      throwIfError('Não foi possível localizar a loja', storeError);
      if (!store) throw new Error('A conta autenticada não tem acesso à loja Tecla Nativa.');

      const storeId = store.id;
      const [productResult, categoryResult, variantResult, inventoryResult, orderResult, activityResult, movementResult, customerResult, customerCountResult, newCustomerCountResult, teamResult] = await Promise.all([
        $supabase.from('products').select('id,category_id,slug,sku_base,name,summary,description,primary_image_path,base_price,status,featured,created_at').eq('store_id', storeId).order('created_at', { ascending: false }),
        $supabase.from('categories').select('id,name,slug,active').eq('store_id', storeId).order('position', { ascending: true }),
        $supabase.from('product_variants').select('id,product_id,sku,option_key,option_label,swatch_hex,image_path,price_override,weight_grams,length_mm,width_mm,height_mm,active').eq('store_id', storeId).order('created_at', { ascending: true }),
        $supabase.from('inventory_levels').select('variant_id,on_hand,reserved,available,reorder_point').eq('store_id', storeId),
        $supabase.from('orders').select('id,order_number,customer_name,customer_email,customer_phone,status,payment_status,fulfillment_status,subtotal,discount_total,shipping_total,total,shipping_address,shipping_method_snapshot,fulfillment_carrier,tracking_code,tracking_url,customer_note,placed_at,created_at').eq('store_id', storeId).order('placed_at', { ascending: false }).limit(100),
        $supabase.from('audit_events').select('id,action,entity_table,entity_id,actor_user_id,source,safe_changes,created_at').eq('store_id', storeId).order('created_at', { ascending: false }).limit(20),
        $supabase.from('stock_movements').select('id,variant_id,movement_type,quantity_delta,reason,actor_user_id,created_at').eq('store_id', storeId).order('created_at', { ascending: false }).limit(10),
        $supabase.from('customers').select('id,full_name,email,phone,created_at').eq('store_id', storeId).order('created_at', { ascending: false }).limit(100),
        $supabase.from('customers').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
        $supabase.from('customers').select('id', { count: 'exact', head: true }).eq('store_id', storeId).gte('created_at', periodStart('Últimos 30 dias')),
        $supabase.from('store_memberships').select('id,user_id,email_snapshot,role,status,created_at,joined_at').eq('store_id', storeId).order('created_at', { ascending: true }),
      ]);

      throwIfError('Não foi possível carregar os produtos', productResult.error);
      throwIfError('Não foi possível carregar as categorias', categoryResult.error);
      throwIfError('Não foi possível carregar as variantes', variantResult.error);
      throwIfError('Não foi possível carregar o estoque', inventoryResult.error);
      throwIfError('Não foi possível carregar os pedidos', orderResult.error);
      throwIfError('Não foi possível carregar a atividade', activityResult.error);
      throwIfError('Não foi possível carregar as movimentações de estoque', movementResult.error);
      throwIfError('Não foi possível carregar os clientes', customerResult.error);
      throwIfError('Não foi possível contar os clientes', customerCountResult.error);
      throwIfError('Não foi possível contar os novos clientes', newCustomerCountResult.error);
      throwIfError('Não foi possível carregar as permissões da equipe', teamResult.error);

      const productRows = (productResult.data ?? []) as Pick<ProductRow, 'id' | 'category_id' | 'slug' | 'sku_base' | 'name' | 'summary' | 'description' | 'primary_image_path' | 'base_price' | 'status' | 'featured' | 'created_at'>[];
      const categoryRows = (categoryResult.data ?? []) as Pick<CategoryRow, 'id' | 'name' | 'slug' | 'active'>[];
      const variantRows = (variantResult.data ?? []) as Pick<VariantRow, 'id' | 'product_id' | 'sku' | 'option_key' | 'option_label' | 'swatch_hex' | 'image_path' | 'price_override' | 'weight_grams' | 'length_mm' | 'width_mm' | 'height_mm' | 'active'>[];
      const inventoryRows = (inventoryResult.data ?? []) as Pick<InventoryRow, 'variant_id' | 'on_hand' | 'reserved' | 'available' | 'reorder_point'>[];
      const orderRows = (orderResult.data ?? []) as Pick<OrderRow, 'id' | 'order_number' | 'customer_name' | 'customer_email' | 'customer_phone' | 'status' | 'payment_status' | 'fulfillment_status' | 'subtotal' | 'discount_total' | 'shipping_total' | 'total' | 'shipping_address' | 'shipping_method_snapshot' | 'fulfillment_carrier' | 'tracking_code' | 'tracking_url' | 'customer_note' | 'placed_at' | 'created_at'>[];
      const activityRows = (activityResult.data ?? []) as Pick<AuditRow, 'id' | 'action' | 'entity_table' | 'entity_id' | 'actor_user_id' | 'source' | 'safe_changes' | 'created_at'>[];
      const movementRows = (movementResult.data ?? []) as Pick<StockMovementRow, 'id' | 'variant_id' | 'movement_type' | 'quantity_delta' | 'reason' | 'actor_user_id' | 'created_at'>[];
      const customerRows = (customerResult.data ?? []) as Pick<CustomerRow, 'id' | 'full_name' | 'email' | 'phone' | 'created_at'>[];
      const teamRows = (teamResult.data ?? []) as Pick<MembershipRow, 'id' | 'user_id' | 'email_snapshot' | 'role' | 'status' | 'created_at' | 'joined_at'>[];
      const orderIds = orderRows.map((order) => order.id);
      const role = useAdminAuth().role.value;
      const paymentAttemptRows: Pick<PaymentAttemptRow, 'order_id' | 'method' | 'provider' | 'status' | 'environment' | 'created_at'>[] = [];
      if (orderIds.length && ['owner','admin','finance'].includes(role ?? '')) {
        const { data: paymentRows, error: paymentError } = await $supabase
          .from('payment_attempts')
          .select('order_id,method,provider,status,environment,created_at')
          .eq('store_id', storeId)
          .in('order_id', orderIds)
          .order('created_at', { ascending: false });
        if (!paymentError) paymentAttemptRows.push(...((paymentRows ?? []) as typeof paymentAttemptRows));
      }
      const orderEvents: Pick<OrderStatusEventRow, 'order_id' | 'from_status' | 'to_status' | 'actor_user_id' | 'source' | 'note' | 'created_at'>[] = [];
      if (orderIds.length) {
        const { data: eventRows, error: eventError } = await $supabase
          .from('order_status_events')
          .select('order_id,from_status,to_status,actor_user_id,source,note,created_at')
          .eq('store_id', storeId)
          .in('order_id', orderIds)
          .order('created_at', { ascending: true });
        if (!eventError) orderEvents.push(...((eventRows ?? []) as typeof orderEvents));
      }
      let itemRows: Pick<OrderItemRow, 'order_id' | 'product_name_snapshot' | 'variant_name_snapshot' | 'sku_snapshot' | 'image_path_snapshot' | 'unit_price' | 'quantity'>[] = [];

      if (orderIds.length) {
        const { data: items, error: itemsError } = await $supabase
          .from('order_items')
          .select('order_id,product_name_snapshot,variant_name_snapshot,sku_snapshot,image_path_snapshot,unit_price,quantity')
          .eq('store_id', storeId)
          .in('order_id', orderIds);

        throwIfError('Não foi possível carregar os itens dos pedidos', itemsError);
        itemRows = (items ?? []) as typeof itemRows;
      }

      const categoryNameById = new Map(categoryRows.map((category) => [category.id, category.name]));
      const productById = new Map(productRows.map((product) => [product.id, product]));
      const inventoryByVariant = new Map(inventoryRows.map((inventory) => [inventory.variant_id, inventory]));
      const variantsByProduct = new Map<string, typeof variantRows>();
      for (const variant of variantRows) {
        const variants = variantsByProduct.get(variant.product_id) ?? [];
        variants.push(variant);
        variantsByProduct.set(variant.product_id, variants);
      }

      const products: AdminProductView[] = productRows.map((product) => {
        const variants = variantsByProduct.get(product.id) ?? [];
        const stockRows = variants.map((variant) => inventoryByVariant.get(variant.id)).filter((row): row is typeof inventoryRows[number] => Boolean(row));
        const stock = stockRows.reduce((sum, row) => sum + (row.available ?? row.on_hand - row.reserved), 0);
        const minStock = stockRows.reduce((sum, row) => sum + row.reorder_point, 0);

        return {
          id: product.id,
          slug: product.slug,
          categoryId: product.category_id,
          name: product.name,
          category: product.category_id ? categoryNameById.get(product.category_id) ?? 'Sem categoria' : 'Sem categoria',
          summary: product.summary,
          description: product.description,
          price: Number(product.base_price),
          image: product.primary_image_path || PLACEHOLDER_IMAGE,
          sku: product.sku_base,
          status: product.status,
          colors: variants.length,
          variants: variants.length,
          stock,
          minStock,
          published: product.status === 'published',
          featured: product.featured,
        };
      });

      const variants: AdminVariantView[] = variantRows.map((variant) => {
        const product = productById.get(variant.product_id);
        const inventory = inventoryByVariant.get(variant.id);
        const dimensions = [variant.length_mm, variant.width_mm, variant.height_mm];

        return {
          id: variant.id,
          productId: variant.product_id,
          productBaseSku: product?.sku_base ?? '',
          optionKey: variant.option_key,
          product: product?.name ?? 'Produto removido',
          color: variant.option_label,
          swatchHex: variant.swatch_hex,
          imagePath: variant.image_path,
          sku: variant.sku,
          image: variant.image_path || product?.primary_image_path || PLACEHOLDER_IMAGE,
          price: Number(variant.price_override ?? product?.base_price ?? 0),
          priceOverride: variant.price_override === null ? null : Number(variant.price_override),
          onHand: inventory?.on_hand ?? 0,
          reserved: inventory?.reserved ?? 0,
          stock: inventory?.available ?? ((inventory?.on_hand ?? 0) - (inventory?.reserved ?? 0)),
          minStock: inventory?.reorder_point ?? 0,
          weightGrams: variant.weight_grams,
          lengthMm: variant.length_mm,
          widthMm: variant.width_mm,
          heightMm: variant.height_mm,
          weight: variant.weight_grams ? `${variant.weight_grams} g` : 'A revisar',
          dimensions: dimensions.every((dimension) => dimension !== null) ? `${dimensions[0]} × ${dimensions[1]} × ${dimensions[2]} mm` : 'A revisar',
        };
      });

      const itemsByOrder = new Map<string, typeof itemRows>();
      for (const item of itemRows) {
        const items = itemsByOrder.get(item.order_id) ?? [];
        items.push(item);
        itemsByOrder.set(item.order_id, items);
      }

      const paymentByOrder = new Map<string, typeof paymentAttemptRows[number]>();
      for (const payment of paymentAttemptRows) if (!paymentByOrder.has(payment.order_id)) paymentByOrder.set(payment.order_id, payment);
      const eventsByOrder = new Map<string, typeof orderEvents>();
      for (const event of orderEvents) {
        const current = eventsByOrder.get(event.order_id) ?? [];
        current.push(event);
        eventsByOrder.set(event.order_id, current);
      }

      const orders: AdminOrderView[] = orderRows.map((order) => {
        const address = addressFields(order.shipping_address);
        const shippingSnapshot = order.shipping_method_snapshot && typeof order.shipping_method_snapshot === 'object' && !Array.isArray(order.shipping_method_snapshot)
          ? order.shipping_method_snapshot as Record<string, Json | undefined>
          : {};
        const paymentAttempt = paymentByOrder.get(order.id);
        const items = (itemsByOrder.get(order.id) ?? []).map((item) => ({
          name: item.product_name_snapshot,
          variant: item.variant_name_snapshot || 'Padrão',
          sku: item.sku_snapshot,
          qty: item.quantity,
          price: Number(item.unit_price),
          image: item.image_path_snapshot || PLACEHOLDER_IMAGE,
        }));
        const customer = order.customer_name || 'Cliente';

        return {
          id: order.order_number,
          orderUuid: order.id,
          customer,
          initials: customer.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CL',
          email: order.customer_email || 'E-mail não informado',
          phone: order.customer_phone || 'Telefone não informado',
          date: formatDate(order.placed_at),
          placedAt: order.placed_at,
          total: Number(order.total),
          subtotal: Number(order.subtotal),
          discount: Number(order.discount_total),
          shippingTotal: Number(order.shipping_total),
          items,
          payment: PAYMENT_LABELS[order.payment_status] ?? order.payment_status,
          status: ORDER_LABELS[order.status] ?? order.status,
          shipping: FULFILLMENT_LABELS[order.fulfillment_status] ?? order.fulfillment_status,
          method: paymentAttempt?.method ? `${paymentAttempt.provider.toUpperCase()} · ${paymentAttempt.method}` : paymentAttempt?.provider === 'pagbank' ? 'PagBank Sandbox' : 'Aguardando confirmação',
          carrier: order.fulfillment_carrier || (typeof shippingSnapshot.carrier === 'string' ? shippingSnapshot.carrier : 'Frete consultado'),
          shippingService: typeof shippingSnapshot.service_name === 'string' ? shippingSnapshot.service_name : 'Cotação não registrada',
          tracking: order.tracking_code ?? '',
          trackingUrl: order.tracking_url ?? '',
          labelCreated: shippingSnapshot.label_created === true,
          events: (eventsByOrder.get(order.id) ?? []).map((event) => ({ status: event.to_status, createdAt: event.created_at, note: event.note || '', source: event.source })),
          address: address.address,
          city: address.city,
          note: order.customer_note || '',
        };
      });

      const activities: AdminActivityView[] = activityRows.map((activity) => ({
        id: activity.id,
        title: `${activity.action} · ${activity.entity_table}`,
        description: 'Registro de auditoria da loja',
        createdAt: activity.created_at,
        actor: activity.actor_user_id ? 'Usuário autenticado' : 'Sistema',
        action: activity.action,
        target: activity.entity_table + (activity.entity_id ? ` · ${activity.entity_id.slice(0, 8)}` : ''),
        change: activity.safe_changes && typeof activity.safe_changes === 'object' && !Array.isArray(activity.safe_changes)
          ? Object.keys(activity.safe_changes).join(', ') || 'Registro administrativo'
          : 'Registro administrativo',
        source: activity.source,
      }));

      const movementLabels: Record<string, string> = {
        purchase_receipt: 'Entrada',
        sale: 'Saída',
        return: 'Devolução',
        adjustment_in: 'Ajuste de entrada',
        adjustment_out: 'Ajuste de saída',
        damage: 'Avaria',
        loss: 'Perda',
      };
      const movements: AdminStockMovementView[] = movementRows.map((movement) => {
        const variant = variantRows.find((item) => item.id === movement.variant_id);
        const product = variant ? productById.get(variant.product_id) : undefined;

        return {
          id: movement.id,
          type: movementLabels[movement.movement_type] ?? movement.movement_type,
          product: product?.name ?? 'Produto removido',
          sku: variant?.sku ?? '—',
          quantity: movement.quantity_delta,
          actor: movement.actor_user_id ? 'Usuário da equipe' : 'Sistema',
          createdAt: movement.created_at,
          reason: movement.reason,
        };
      });

      const customers: AdminCustomerView[] = customerRows.map((customer) => ({
        id: customer.id,
        name: customer.full_name,
        email: customer.email || 'E-mail não informado',
        phone: customer.phone || 'Telefone não informado',
        createdAt: customer.created_at,
      }));
      const team: AdminTeamMemberView[] = teamRows.map((member) => ({
        id: member.id,
        userId: member.user_id,
        email: member.email_snapshot ?? '',
        role: member.role,
        status: member.status,
        createdAt: member.created_at,
        joinedAt: member.joined_at,
      }));

      snapshot.value = {
        store: {
          id: store.id,
          name: store.name,
          slug: store.slug,
          status: store.status,
          currency: store.currency,
          support_email: store.support_email,
          support_whatsapp: store.support_whatsapp,
        },
        categories: categoryRows,
        products,
        variants,
        orders,
        activities,
        movements,
        customers,
        customerCount: customerCountResult.count ?? customers.length,
        newCustomerCount: newCustomerCountResult.count ?? 0,
        team,
      };

      await loadOrderSummary(storeId, period);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Falha ao carregar os dados da loja.';
    } finally {
      loading.value = false;
    }
  }

  async function refreshSummary(period: string) {
    if (snapshot.value?.store.id) await loadOrderSummary(snapshot.value.store.id, period);
  }

  async function saveProduct(input: AdminProductInput) {
    if (!$supabase) throw new Error('Supabase ainda não está configurado neste ambiente.');
    const currentSnapshot = snapshot.value;
    if (!currentSnapshot) throw new Error('Carregue os dados da loja antes de salvar um produto.');

    const name = input.name.trim();
    const skuBase = input.skuBase.trim().toUpperCase();
    const description = input.description.trim();
    const categoryId = input.categoryId.trim();

    if (name.length < 2 || name.length > 160) throw new Error('Informe um nome entre 2 e 160 caracteres.');
    if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(skuBase)) throw new Error('O SKU base deve usar de 1 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.');
    if (!Number.isFinite(input.price) || input.price <= 0 || input.price > 9999999999.99) throw new Error('Informe um preço maior que zero e dentro do limite permitido.');
    if (categoryId && !currentSnapshot.categories.some((category) => category.id === categoryId)) throw new Error('Selecione uma categoria válida da loja.');

    const product = input.id ? currentSnapshot.products.find((row) => row.id === input.id) : undefined;
    if (input.id && !product) throw new Error('Este produto não está mais disponível. Atualize o painel e tente novamente.');

    const fields = {
      category_id: categoryId || null,
      name,
      summary: description.slice(0, 240),
      description,
      base_price: Number(input.price.toFixed(2)),
      featured: input.featured,
    };

    if (product) {
      const { data, error: updateError } = await $supabase
        .from('products')
        .update(fields)
        .eq('id', product.id)
        .eq('store_id', currentSnapshot.store.id)
        .select('id')
        .maybeSingle();

      if (updateError?.code === '23505') throw new Error('Já existe um produto com esse SKU base ou endereço.');
      throwIfError('Não foi possível atualizar o produto', updateError);
      if (!data) throw new Error('O produto não foi atualizado. Confirme sua permissão e atualize o painel.');
    } else {
      const slug = productSlug(name);
      if (!slug) throw new Error('O nome precisa conter letras ou números para gerar o endereço do produto.');

      const { data, error: insertError } = await $supabase
        .from('products')
        .insert({
          ...fields,
          store_id: currentSnapshot.store.id,
          slug,
          sku_base: skuBase,
          status: 'draft',
          primary_image_path: null,
        })
        .select('id')
        .single();

      if (insertError?.code === '23505') throw new Error('Já existe um produto com esse SKU base ou endereço.');
      throwIfError('Não foi possível criar o produto', insertError);
      if (!data) throw new Error('O banco não confirmou a criação do produto.');
      await refresh();
      return data.id;
    }

    await refresh();
    return product?.id ?? '';
  }

  async function saveVariant(input: AdminVariantInput) {
    if (!$supabase) throw new Error('Supabase ainda não está configurado neste ambiente.');
    const currentSnapshot = snapshot.value;
    if (!currentSnapshot) throw new Error('Carregue os dados da loja antes de salvar uma variante.');

    const label = input.optionLabel.trim();
    const product = currentSnapshot.products.find((row) => row.id === input.productId);
    if (!product) throw new Error('Selecione um produto válido desta loja.');
    if (label.length < 1 || label.length > 60) throw new Error('Informe uma opção entre 1 e 60 caracteres.');
    if (input.swatchHex && !/^#[0-9a-f]{6}$/i.test(input.swatchHex)) throw new Error('Informe a cor no formato hexadecimal #RRGGBB.');
    if (input.priceOverride !== null && (!Number.isFinite(input.priceOverride) || input.priceOverride < 0 || input.priceOverride > 9999999999.99)) throw new Error('O preço da variante precisa ser zero ou maior e estar dentro do limite permitido.');
    if (input.weightGrams !== null && (!Number.isInteger(input.weightGrams) || input.weightGrams <= 0)) throw new Error('O peso deve ser informado em gramas, como um número inteiro maior que zero.');
    const dimensions = [input.lengthMm, input.widthMm, input.heightMm];
    if (dimensions.some((dimension) => dimension !== null) && dimensions.some((dimension) => !Number.isInteger(dimension) || Number(dimension) <= 0)) throw new Error('Informe as três dimensões em milímetros ou deixe todas vazias.');
    if (!Number.isInteger(input.reorderPoint) || input.reorderPoint < 0) throw new Error('O estoque mínimo deve ser um número inteiro igual ou maior que zero.');
    const imagePath = input.imagePath.trim();
    if (imagePath.length > 2048 || /[\u0000-\u001f\u007f]/.test(imagePath)) throw new Error('O caminho ou URL da imagem é inválido.');

    if (input.id) {
      const existing = currentSnapshot.variants.find((row) => row.id === input.id);
      if (!existing || existing.productId !== product.id) throw new Error('Esta variante não está mais disponível. Atualize o painel e tente novamente.');
      const { data, error: updateError } = await $supabase.rpc('update_product_variant', {
        p_store_id: currentSnapshot.store.id,
        p_variant_id: existing.id,
        p_option_label: label,
        p_swatch_hex: input.swatchHex || null,
        p_image_path: imagePath || null,
        p_price_override: input.priceOverride,
        p_weight_grams: input.weightGrams,
        p_length_mm: input.lengthMm,
        p_width_mm: input.widthMm,
        p_height_mm: input.heightMm,
        p_reorder_point: input.reorderPoint,
      });

      if (updateError?.code === '23505') throw new Error('A atualização conflita com outra variante desta loja.');
      throwIfError('Não foi possível atualizar a variante', updateError);
      if (!data) throw new Error('A variante não foi atualizada. Confirme sua permissão e atualize o painel.');
      await refresh();
      return existing.id;
    } else {
      const optionKey = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const sku = colorVariantSku(product.sku, optionKey);
      if (!optionKey || optionKey.length > 60) throw new Error('O nome da opção precisa gerar uma chave válida de até 60 caracteres.');
      if (sku.length > 60) throw new Error('O SKU automático excede 60 caracteres. Encurte o SKU base do produto antes de criar esta variante.');

      const { data: variantId, error: insertError } = await $supabase.rpc('create_product_variant', {
        p_store_id: currentSnapshot.store.id,
        p_product_id: product.id,
        p_sku: sku,
        p_option_key: optionKey,
        p_option_label: label,
        p_swatch_hex: input.swatchHex || null,
        p_image_path: imagePath || null,
        p_price_override: input.priceOverride,
        p_weight_grams: input.weightGrams,
        p_length_mm: input.lengthMm,
        p_width_mm: input.widthMm,
        p_height_mm: input.heightMm,
        p_reorder_point: input.reorderPoint,
      });

      if (insertError?.code === '23505') throw new Error('Já existe uma variante com esse nome de opção ou SKU.');
      throwIfError('Não foi possível criar a variante', insertError);
      if (!variantId) throw new Error('O banco não confirmou a criação da variante.');
      await refresh();
      return variantId;
    }

    await refresh();
    return input.id ?? '';
  }

  async function setProductStatus(productId: string, status: 'draft' | 'published' | 'archived') {
    if (!$supabase) throw new Error('Supabase ainda não está configurado neste ambiente.');
    const { error: statusError } = await $supabase.rpc('set_admin_product_status', { p_product_id: productId, p_status: status });
    throwIfError('Não foi possível alterar a publicação', statusError);
    await refresh();
  }

  async function transitionOrder(orderId: string, action: 'start_processing' | 'mark_ready' | 'mark_shipped' | 'mark_delivered' | 'cancel', input: { carrier?: string; trackingCode?: string; trackingUrl?: string; note?: string } = {}) {
    if (!$supabase) throw new Error('Supabase ainda não está configurado neste ambiente.');
    const { error: transitionError } = await $supabase.rpc('transition_storefront_order', {
      p_order_id: orderId,
      p_action: action,
      p_carrier: input.carrier || null,
      p_tracking_code: input.trackingCode || null,
      p_tracking_url: input.trackingUrl || null,
      p_note: input.note || null,
    });
    throwIfError('Não foi possível atualizar o pedido', transitionError);
    await refresh();
  }

  async function updateTracking(orderId: string, input: { carrier: string; trackingCode: string; trackingUrl: string; note?: string }) {
    if (!$supabase) throw new Error('Supabase ainda não está configurado neste ambiente.');
    const carrier = input.carrier.trim();
    const code = input.trackingCode.trim();
    const url = input.trackingUrl.trim();
    if (carrier.length < 2 || carrier.length > 80) throw new Error('Informe uma transportadora ou serviço entre 2 e 80 caracteres.');
    if (code.length > 120 || /[\u0000-\u001f\u007f]/.test(code)) throw new Error('O código de rastreio é inválido.');
    if (url && (url.length > 2048 || !/^https:\/\//i.test(url))) throw new Error('O link de rastreio precisa começar com https://.');
    const { error: updateError } = await $supabase.rpc('update_storefront_tracking', {
      p_order_id: orderId,
      p_carrier: carrier,
      p_tracking_code: code || null,
      p_tracking_url: url || null,
      p_note: input.note || null,
    });
    throwIfError('Não foi possível atualizar o rastreio', updateError);
    await refresh();
  }

  async function uploadProductImage(productId: string, file: File) {
    if (!$supabase || !snapshot.value) throw new Error('Supabase ainda não está configurado neste ambiente.');
    validateImage(file);
    const storeId = snapshot.value.store.id;
    const extension = imageExtension(file.type);
    const path = `${storeId}/products/${productId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await $supabase.storage.from('storefront-media').upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
    throwIfError('Não foi possível enviar a imagem', uploadError);
    const imageUrl = $supabase.storage.from('storefront-media').getPublicUrl(path).data.publicUrl;
    const { error: updateError } = await $supabase.from('products').update({ primary_image_path: imageUrl }).eq('id', productId).eq('store_id', storeId);
    throwIfError('A imagem foi enviada, mas não pôde ser vinculada ao produto', updateError);
    const { data: existing } = await $supabase.from('product_media').select('position').eq('store_id', storeId).eq('product_id', productId).order('position', { ascending: false }).limit(1);
    const { error: mediaError } = await $supabase.from('product_media').insert({ store_id: storeId, product_id: productId, image_path: imageUrl, alt_text: `Imagem principal do produto ${snapshot.value.products.find((item) => item.id === productId)?.name ?? ''}`.trim(), position: (existing?.[0]?.position ?? -1) + 1, is_primary: true });
    throwIfError('A imagem foi vinculada, mas não foi registrada na galeria', mediaError);
    await refresh();
  }

  async function uploadVariantImage(productId: string, variantId: string, file: File) {
    if (!$supabase || !snapshot.value) throw new Error('Supabase ainda não está configurado neste ambiente.');
    validateImage(file);
    const storeId = snapshot.value.store.id;
    const variant = snapshot.value.variants.find((item) => item.id === variantId && item.productId === productId);
    if (!variant) throw new Error('A variante selecionada não pertence ao produto.');
    const path = `${storeId}/products/${productId}/variants/${variantId}/${crypto.randomUUID()}.${imageExtension(file.type)}`;
    const { error: uploadError } = await $supabase.storage.from('storefront-media').upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
    throwIfError('Não foi possível enviar a imagem', uploadError);
    const imageUrl = $supabase.storage.from('storefront-media').getPublicUrl(path).data.publicUrl;
    const { error: updateError } = await $supabase.from('product_variants').update({ image_path: imageUrl }).eq('id', variantId).eq('store_id', storeId);
    throwIfError('A imagem foi enviada, mas não pôde ser vinculada à variante', updateError);
    const { data: existing } = await $supabase.from('product_media').select('position').eq('store_id', storeId).eq('product_id', productId).order('position', { ascending: false }).limit(1);
    const { error: mediaError } = await $supabase.from('product_media').insert({ store_id: storeId, product_id: productId, variant_id: variantId, image_path: imageUrl, alt_text: `${variant.product} na cor ${variant.color}`, position: (existing?.[0]?.position ?? -1) + 1, is_primary: false });
    throwIfError('A imagem foi vinculada, mas não foi registrada na galeria', mediaError);
    await refresh();
  }

  async function adjustVariantStock(input: AdminStockAdjustmentInput) {
    if (!$supabase) throw new Error('Supabase ainda não está configurado neste ambiente.');
    const currentSnapshot = snapshot.value;
    if (!currentSnapshot) throw new Error('Carregue os dados da loja antes de movimentar o estoque.');
    const variant = currentSnapshot.variants.find((row) => row.id === input.variantId);
    if (!variant) throw new Error('Esta variante não está mais disponível. Atualize o painel e tente novamente.');
    const reason = input.reason.trim();
    if (!Number.isInteger(input.delta) || input.delta === 0 || Math.abs(input.delta) > 1000000) throw new Error('Informe uma alteração diferente de zero, de até 1.000.000 de unidades.');
    if (reason.length < 3 || reason.length > 500) throw new Error('Informe um motivo entre 3 e 500 caracteres.');

    const fingerprint = JSON.stringify([currentSnapshot.store.id, variant.id, input.delta, reason]);
    if (pendingStockAdjustment?.fingerprint !== fingerprint) {
      pendingStockAdjustment = { fingerprint, idempotencyKey: crypto.randomUUID() };
    }

    const { data, error: adjustmentError } = await $supabase.rpc('adjust_variant_stock', {
      p_store_id: currentSnapshot.store.id,
      p_variant_id: variant.id,
      p_delta: input.delta,
      p_reason: reason,
      p_idempotency_key: pendingStockAdjustment.idempotencyKey,
    });
    throwIfError('Não foi possível registrar a movimentação de estoque', adjustmentError);
    if (!data?.length) throw new Error('O banco não confirmou a movimentação. Atualize o painel antes de tentar novamente.');
    pendingStockAdjustment = null;
    await refresh();
  }

  return { loading, summaryLoading, error, snapshot, orderSummary, refresh, refreshSummary, saveProduct, saveVariant, setProductStatus, transitionOrder, updateTracking, uploadProductImage, uploadVariantImage, adjustVariantStock };
}

function validateImage(file: File) {
  if (!['image/avif','image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Envie uma imagem AVIF, JPEG, PNG ou WebP.');
  if (file.size < 1 || file.size > 8 * 1024 * 1024) throw new Error('A imagem precisa ter até 8 MB.');
}
function imageExtension(type: string) { return ({ 'image/avif': 'avif', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string,string>)[type] ?? 'webp'; }
