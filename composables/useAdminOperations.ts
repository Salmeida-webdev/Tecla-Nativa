import type { Database, Json } from '~/supabase/types/database.types';
import type { AdminOrderView } from '~/composables/useAdminCommerceData';

type CouponRow = Database['public']['Tables']['coupons']['Row'];
type CaseRow = Database['public']['Tables']['service_cases']['Row'];
type SupplierRow = Database['public']['Tables']['suppliers']['Row'];
type PurchaseRow = Database['public']['Tables']['purchase_orders']['Row'];
type PurchaseItemRow = Database['public']['Tables']['purchase_order_items']['Row'];
type ContentRow = Database['public']['Tables']['content_sections']['Row'];
type SettingsRow = Database['public']['Tables']['store_settings']['Row'];
type IntegrationRow = Database['public']['Tables']['integration_configs']['Row'];
type InventoryVariant = { id: string; sku: string; product: string };

export interface AdminCouponView extends CouponRow { redemptions: number }
export interface AdminServiceCaseView extends CaseRow { orderNumber: string; customer: string }
export interface AdminSupplierView extends SupplierRow {}
export interface AdminPurchaseItemView extends Pick<PurchaseItemRow, 'id' | 'variant_id' | 'quantity_ordered' | 'quantity_received' | 'unit_cost'> { sku: string; product: string }
export interface AdminPurchaseOrderView extends PurchaseRow { supplier: string; items: AdminPurchaseItemView[] }
export interface AdminIntegrationView extends IntegrationRow {}

export function useAdminOperations() {
  const { $supabase } = useNuxtApp();
  const loading = ref(false);
  const error = ref('');
  const coupons = shallowRef<AdminCouponView[]>([]);
  const serviceCases = shallowRef<AdminServiceCaseView[]>([]);
  const suppliers = shallowRef<AdminSupplierView[]>([]);
  const purchaseOrders = shallowRef<AdminPurchaseOrderView[]>([]);
  const contentSections = shallowRef<ContentRow[]>([]);
  const settings = shallowRef<Record<string, Json>>({});
  const integrations = shallowRef<AdminIntegrationView[]>([]);
  const paymentRows = shallowRef<Array<{ order_id: string; provider: string; method: string | null; status: string; amount: number; created_at: string }>>([]);
  const transactionRows = shallowRef<Array<{ order_id: string; kind: string; amount: number; effective_at: string; provider_transaction_id: string | null }>>([]);
  let pendingPurchaseReceipt: { fingerprint: string; key: string } | null = null;
  let pendingPurchaseCreate: { fingerprint: string; key: string } | null = null;
  let activeStoreId = '';
  let activeOrders: AdminOrderView[] = [];

  function fail(context: string, cause: { message: string } | null) { if (cause) throw new Error(`${context}: ${cause.message}`); }
  function optionalDate(value: string, end = false) {
    if (!value) return null;
    const iso = new Date(`${value}T${end ? '23:59:59' : '00:00:00'}-03:00`).toISOString();
    return iso;
  }

  async function refresh(storeId = activeStoreId, orders = activeOrders) {
    if (!$supabase) return;
    if (!storeId) return;
    activeStoreId = storeId;
    activeOrders = orders;
    loading.value = true;
    error.value = '';
    const orderIds = orders.map((order) => order.orderUuid);
    try {
      const [couponResult, redemptionResult, caseResult, supplierResult, purchaseResult, purchaseItemResult, contentResult, settingsResult, integrationResult] = await Promise.all([
        $supabase.from('coupons').select('*').eq('store_id', storeId).order('created_at', { ascending: false }),
        $supabase.from('coupon_redemptions').select('coupon_id,redemption_status').eq('store_id', storeId),
        $supabase.from('service_cases').select('*').eq('store_id', storeId).order('created_at', { ascending: false }).limit(200),
        $supabase.from('suppliers').select('*').eq('store_id', storeId).order('name', { ascending: true }),
        $supabase.from('purchase_orders').select('*').eq('store_id', storeId).order('created_at', { ascending: false }).limit(100),
        $supabase.from('purchase_order_items').select('*').eq('store_id', storeId),
        $supabase.from('content_sections').select('*').eq('store_id', storeId).order('position', { ascending: true }),
        $supabase.from('store_settings').select('*').eq('store_id', storeId),
        $supabase.from('integration_configs').select('*').eq('store_id', storeId),
      ]);
      fail('Não foi possível carregar os cupons', couponResult.error);
      fail('Não foi possível carregar o uso dos cupons', redemptionResult.error);
      fail('Não foi possível carregar os casos de atendimento', caseResult.error);
      fail('Não foi possível carregar fornecedores', supplierResult.error);
      fail('Não foi possível carregar pedidos de compra', purchaseResult.error);
      fail('Não foi possível carregar itens de compra', purchaseItemResult.error);
      fail('Não foi possível carregar conteúdo da vitrine', contentResult.error);
      fail('Não foi possível carregar configurações', settingsResult.error);
      fail('Não foi possível carregar o estado das integrações', integrationResult.error);

      const couponRows = couponResult.data ?? [];
      const redemptionCounts = new Map<string, number>();
      for (const row of redemptionResult.data ?? []) if (row.redemption_status !== 'released') redemptionCounts.set(row.coupon_id, (redemptionCounts.get(row.coupon_id) ?? 0) + 1);
      coupons.value = couponRows.map((coupon) => ({ ...coupon, redemptions: redemptionCounts.get(coupon.id) ?? 0 }));

      const caseRows = (caseResult.data ?? []) as CaseRow[];
      serviceCases.value = caseRows.map((row) => {
        const order = orders.find((item) => item.orderUuid === row.order_id);
        return { ...row, orderNumber: order?.id ?? (row.order_id ? row.order_id.slice(0, 8) : 'Sem pedido'), customer: order?.customer ?? 'Cliente sem pedido vinculado' };
      });
      suppliers.value = (supplierResult.data ?? []) as SupplierRow[];

      const purchaseRows = (purchaseResult.data ?? []) as PurchaseRow[];
      const purchaseItemRows = (purchaseItemResult.data ?? []) as PurchaseItemRow[];
      const variants = new Map<string, InventoryVariant>();
      // Purchase row names are resolved by a small, store-scoped product/variant read.
      const variantIds = [...new Set(purchaseItemRows.map((row) => row.variant_id))];
      if (variantIds.length) {
        const { data: variantData, error: variantError } = await $supabase
          .from('product_variants')
          .select('id,sku,product_id,products!inner(name)')
          .eq('store_id', storeId)
          .in('id', variantIds);
        fail('Não foi possível mapear os SKUs da compra', variantError);
        for (const row of (variantData ?? []) as unknown as Array<{ id: string; sku: string; products: { name: string } }>) {
          variants.set(row.id, { id: row.id, sku: row.sku, product: row.products.name });
        }
      }
      const supplierNames = new Map(suppliers.value.map((supplier) => [supplier.id, supplier.name]));
      purchaseOrders.value = purchaseRows.map((purchase) => ({
        ...purchase,
        supplier: supplierNames.get(purchase.supplier_id) ?? 'Fornecedor removido',
        items: purchaseItemRows.filter((item) => item.purchase_order_id === purchase.id).map((item) => ({
          id: item.id,
          variant_id: item.variant_id,
          quantity_ordered: item.quantity_ordered,
          quantity_received: item.quantity_received,
          unit_cost: Number(item.unit_cost),
          sku: variants.get(item.variant_id)?.sku ?? 'SKU indisponível',
          product: variants.get(item.variant_id)?.product ?? 'Produto removido',
        })),
      }));
      contentSections.value = (contentResult.data ?? []) as ContentRow[];
      settings.value = Object.fromEntries((settingsResult.data ?? []).map((row) => [row.setting_key, row.setting_value as Json]));
      integrations.value = (integrationResult.data ?? []) as IntegrationRow[];

      if (orderIds.length) {
        const [payments, transactions] = await Promise.all([
          $supabase.from('payment_attempts').select('order_id,provider,method,status,amount,created_at').eq('store_id', storeId).in('order_id', orderIds).order('created_at', { ascending: false }),
          $supabase.from('financial_transactions').select('order_id,kind,amount,effective_at,provider_transaction_id').eq('store_id', storeId).in('order_id', orderIds).order('effective_at', { ascending: false }),
        ]);
        // Finance-only RLS may deny these reads for a non-finance panel role.
        paymentRows.value = payments.error ? [] : ((payments.data ?? []) as typeof paymentRows.value);
        transactionRows.value = transactions.error ? [] : ((transactions.data ?? []) as typeof transactionRows.value);
      } else {
        paymentRows.value = [];
        transactionRows.value = [];
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Falha ao atualizar as operações do painel.';
      coupons.value = [];
      serviceCases.value = [];
      suppliers.value = [];
      purchaseOrders.value = [];
      contentSections.value = [];
      settings.value = {};
      integrations.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function saveCoupon(input: {
    id?: string;
    code: string;
    discountType: 'percentage' | 'fixed_amount' | 'free_shipping';
    discountValue: number;
    minimumOrderTotal: number;
    usageLimit: number | null;
    perCustomerLimit: number;
    startsAt: string;
    endsAt: string;
  }, storeId: string) {
    if (!$supabase) throw new Error('Supabase não configurado.');
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,60}$/.test(code)) throw new Error('Use de 2 a 60 letras, números, hífen ou sublinhado no código.');
    if (!Number.isFinite(input.minimumOrderTotal) || input.minimumOrderTotal < 0) throw new Error('Pedido mínimo inválido.');
    if (!Number.isInteger(input.perCustomerLimit) || input.perCustomerLimit < 1) throw new Error('Limite por cliente precisa ser um inteiro maior que zero.');
    if (input.usageLimit !== null && (!Number.isInteger(input.usageLimit) || input.usageLimit < 1)) throw new Error('Limite total inválido.');
    if (input.discountType === 'percentage' && (input.discountValue <= 0 || input.discountValue > 100)) throw new Error('Percentual deve ficar entre 0 e 100.');
    if (input.discountType === 'fixed_amount' && input.discountValue <= 0) throw new Error('O desconto fixo precisa ser maior que zero.');
    const values = {
      code,
      discount_type: input.discountType,
      discount_value: input.discountType === 'free_shipping' ? 0 : Number(input.discountValue.toFixed(2)),
      minimum_order_total: Number(input.minimumOrderTotal.toFixed(2)),
      usage_limit: input.usageLimit,
      per_customer_limit: input.perCustomerLimit,
      starts_at: optionalDate(input.startsAt),
      ends_at: optionalDate(input.endsAt, true),
      status: 'active' as const,
    };
    if (values.starts_at && values.ends_at && Date.parse(values.ends_at) <= Date.parse(values.starts_at)) throw new Error('A data final deve ser posterior à data inicial.');
    const query = input.id
      ? $supabase.from('coupons').update(values).eq('store_id', storeId).eq('id', input.id)
      : $supabase.from('coupons').insert({ ...values, store_id: storeId });
    const { error: saveError } = await query;
    if (saveError?.code === '23505') throw new Error('Já existe um cupom com esse código.');
    fail('Não foi possível salvar o cupom', saveError);
    await refresh(storeId);
  }

  async function setCouponStatus(storeId: string, id: string, status: 'active' | 'paused' | 'draft') {
    if (!$supabase) throw new Error('Supabase não configurado.');
    const { error: updateError } = await $supabase.from('coupons').update({ status }).eq('store_id', storeId).eq('id', id);
    fail('Não foi possível atualizar o cupom', updateError);
    await refresh(storeId);
  }

  async function createCase(storeId: string, input: { orderId: string | null; type: string; priority: string; reason: string }) {
    if (!$supabase) throw new Error('Supabase não configurado.');
    const { data, error: createError } = await $supabase.rpc('create_admin_service_case', {
      p_store_id: storeId, p_order_id: input.orderId, p_case_type: input.type, p_priority: input.priority, p_reason: input.reason,
    });
    fail('Não foi possível abrir o caso', createError);
    const created = data?.[0];
    if (!created) throw new Error('O banco não confirmou o caso de atendimento.');
    return created;
  }

  async function transitionCase(id: string, status: string, resolution = '', note = '') {
    if (!$supabase) throw new Error('Supabase não configurado.');
    const { error: updateError } = await $supabase.rpc('transition_admin_service_case', {
      p_case_id: id, p_status: status, p_resolution: resolution || null, p_note: note || null,
    });
    fail('Não foi possível atualizar o caso', updateError);
  }

  async function saveSupplier(storeId: string, input: { id?: string; name: string; contactName: string; email: string; phone: string; leadTimeDays: number | null }) {
    if (!$supabase) throw new Error('Supabase não configurado.');
    const name = input.name.trim();
    if (name.length < 2 || name.length > 160) throw new Error('Informe um nome de fornecedor entre 2 e 160 caracteres.');
    if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw new Error('O e-mail do fornecedor é inválido.');
    if (input.leadTimeDays !== null && (!Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0)) throw new Error('O prazo do fornecedor deve ser um inteiro igual ou maior que zero.');
    const values = { name, contact_name: input.contactName.trim() || null, email: input.email.trim().toLowerCase() || null, phone: input.phone.trim() || null, lead_time_days: input.leadTimeDays, status: 'active' as const };
    const result = input.id
      ? await $supabase.from('suppliers').update(values).eq('store_id', storeId).eq('id', input.id)
      : await $supabase.from('suppliers').insert({ ...values, store_id: storeId });
    fail('Não foi possível salvar o fornecedor', result.error);
    await refresh(storeId);
  }

  async function createPurchaseOrder(storeId: string, input: { supplierId: string; expectedAt: string; notes: string; items: Array<{ variantId: string; quantity: number; unitCost: number }> }) {
    if (!$supabase) throw new Error('Supabase não configurado.');
    if (!input.supplierId || input.items.length < 1 || input.items.length > 100) throw new Error('Selecione um fornecedor e ao menos uma variante.');
    const normalized = [...input.items].map((item) => ({ variant_id: item.variantId, quantity: item.quantity, unit_cost: Number(item.unitCost.toFixed(2)) })).sort((a,b) => a.variant_id.localeCompare(b.variant_id));
    if (normalized.some((item) => !/^[0-9a-f-]{36}$/i.test(item.variant_id) || !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unit_cost) || item.unit_cost < 0)) throw new Error('Confira quantidades, variantes e custos da compra.');
    if (new Set(normalized.map((item) => item.variant_id)).size !== normalized.length) throw new Error('Use uma única linha para cada variante.');
    const request = JSON.stringify({ supplierId: input.supplierId, expectedAt: input.expectedAt || null, notes: input.notes.trim(), items: normalized });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request));
    const requestHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    if (pendingPurchaseCreate?.fingerprint !== requestHash) pendingPurchaseCreate = { fingerprint: requestHash, key: crypto.randomUUID() };
    const { data, error: createError } = await $supabase.rpc('create_admin_purchase_order', {
      p_store_id: storeId,
      p_idempotency_key: pendingPurchaseCreate.key,
      p_request_sha256: requestHash,
      p_supplier_id: input.supplierId,
      p_expected_at: input.expectedAt ? new Date(`${input.expectedAt}T12:00:00-03:00`).toISOString() : null,
      p_notes: input.notes.trim() || null,
      p_items: normalized as unknown as Json,
    });
    fail('Não foi possível criar o pedido de compra', createError);
    if (!data?.length) throw new Error('O banco não confirmou o pedido de compra.');
    pendingPurchaseCreate = null;
    await refresh(storeId);
    return data[0];
  }

  async function updatePurchaseStatus(storeId: string, purchaseOrderId: string, status: 'sent' | 'cancelled') {
    if (!$supabase) throw new Error('Supabase não configurado.');
    const { error: updateError } = await $supabase.rpc('transition_admin_purchase_order', { p_purchase_order_id: purchaseOrderId, p_action: status === 'sent' ? 'send' : 'cancel' });
    fail('Não foi possível atualizar o pedido de compra', updateError);
    await refresh(storeId);
  }

  async function receivePurchase(purchaseOrderId: string, items: Array<{ variant_id: string; quantity: number }>) {
    if (!$supabase) throw new Error('Supabase não configurado.');
    const normalized = [...items].filter((item) => item.quantity > 0).sort((a,b) => a.variant_id.localeCompare(b.variant_id));
    if (!normalized.length || normalized.some((item) => !Number.isInteger(item.quantity))) throw new Error('Informe as quantidades efetivamente recebidas.');
    const fingerprint = JSON.stringify([purchaseOrderId, normalized]);
    if (pendingPurchaseReceipt?.fingerprint !== fingerprint) pendingPurchaseReceipt = { fingerprint, key: crypto.randomUUID() };
    const { data, error: receiveError } = await $supabase.rpc('receive_admin_purchase_order', {
      p_purchase_order_id: purchaseOrderId,
      p_idempotency_key: pendingPurchaseReceipt.key,
      p_items: normalized as unknown as Json,
    });
    fail('Não foi possível registrar o recebimento', receiveError);
    if (!data?.length) throw new Error('O banco não confirmou o recebimento.');
    pendingPurchaseReceipt = null;
    return data[0];
  }

  async function saveContent(id: string, input: { title: string; content: Json; status: 'draft' | 'published' | 'archived'; position: number }) {
    if (!$supabase) throw new Error('Supabase não configurado.');
    if (input.title.trim().length < 2 || input.title.trim().length > 160) throw new Error('Informe um título entre 2 e 160 caracteres.');
    const { error: updateError } = await $supabase.from('content_sections').update({ title: input.title.trim(), content: input.content, status: input.status, position: input.position }).eq('id', id);
    fail('Não foi possível salvar esta seção', updateError);
  }

  async function saveSetting(storeId: string, key: string, value: Json) {
    if (!$supabase) throw new Error('Supabase não configurado.');
    const { error: saveError } = await $supabase.from('store_settings').upsert({ store_id: storeId, setting_key: key, setting_value: value, updated_by: (await $supabase.auth.getUser()).data.user?.id ?? null }, { onConflict: 'store_id,setting_key' });
    fail('Não foi possível salvar a configuração', saveError);
  }

  async function saveStoreProfile(storeId: string, input: { name: string; email: string; whatsapp: string }) {
    if (!$supabase) throw new Error('Supabase não configurado.');
    if (input.name.trim().length < 2 || input.name.trim().length > 120) throw new Error('O nome da loja deve ter entre 2 e 120 caracteres.');
    if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw new Error('O e-mail de suporte é inválido.');
    const { error: updateError } = await $supabase.from('stores').update({ name: input.name.trim(), support_email: input.email.trim().toLowerCase() || null, support_whatsapp: input.whatsapp.replace(/\D/g, '') || null }).eq('id', storeId);
    fail('Não foi possível salvar os dados da loja', updateError);
  }

  async function teamAction(body: Record<string, unknown>) {
    if (!$supabase) throw new Error('Supabase não configurado.');
    const { data, error: invokeError } = await $supabase.functions.invoke('team-management', { body });
    if (invokeError) throw new Error(invokeError.message || 'Não foi possível concluir a ação da equipe.');
    return data as Record<string, unknown>;
  }

  async function integrationCheck(provider: 'pagbank' | 'melhor_envio') {
    if (!$supabase) throw new Error('Supabase não configurado.');
    const { data, error: invokeError } = await $supabase.functions.invoke('integration-health', { body: { provider } });
    if (invokeError) throw new Error(invokeError.message || 'Falha ao validar a integração.');
    return data as { status: string; message: string };
  }

  async function startMelhorEnvioAuthorization() {
    if (!$supabase) throw new Error('Supabase não configurado.');
    const { data, error: invokeError } = await $supabase.functions.invoke('melhor-envio-oauth', { body: {} });
    if (invokeError) throw new Error(invokeError.message || 'Não foi possível iniciar a autorização do Melhor Envio.');
    const authorizationUrl = (data as { authorization_url?: unknown } | null)?.authorization_url;
    if (typeof authorizationUrl !== 'string') throw new Error('O Melhor Envio não retornou uma URL de autorização válida.');
    const parsedUrl = new URL(authorizationUrl);
    if (parsedUrl.origin !== 'https://melhorenvio.com.br' || parsedUrl.pathname !== '/oauth/authorize') {
      throw new Error('A URL de autorização recebida não pertence ao Melhor Envio de produção.');
    }
    return parsedUrl.toString();
  }

  return {
    loading, error, coupons, serviceCases, suppliers, purchaseOrders, contentSections, settings, integrations,
    paymentRows, transactionRows, refresh, saveCoupon, setCouponStatus, createCase, transitionCase,
    saveSupplier, createPurchaseOrder, updatePurchaseStatus, receivePurchase, saveContent, saveSetting,
    saveStoreProfile, teamAction, integrationCheck, startMelhorEnvioAuthorization,
  };
}
