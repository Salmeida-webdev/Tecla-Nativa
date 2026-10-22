<script setup lang="ts">
import { useAdminCommerceData, type AdminActivityView, type AdminOrderView, type AdminProductView, type AdminVariantView } from '~/composables/useAdminCommerceData';
import { useAdminOperations, type AdminCouponView, type AdminPurchaseOrderView, type AdminServiceCaseView, type AdminSupplierView } from '~/composables/useAdminOperations';

definePageMeta({ layout: false, middleware: 'admin' });
useSeoMeta({ title: 'Painel administrativo | Tecla Nativa', robots: 'noindex, nofollow' });

const adminAuth = useAdminAuth();
const route = useRoute();
const router = useRouter();
const commerce = useAdminCommerceData();
const operations = useAdminOperations();
const transactionRows = operations.transactionRows;
const storefrontCatalog = useStorefrontCatalog();
const adminAuthorized = computed(() => Boolean(adminAuth.user.value));
const accountLabel = computed(() => adminAuth.user.value?.email || 'Proprietário da loja');
const accountRoleLabel = computed(() => ({ owner: 'Proprietário', admin: 'Administrador', catalog: 'Catálogo', inventory: 'Estoque', fulfillment: 'Expedição', support: 'Atendimento', finance: 'Financeiro', marketing: 'Marketing', analyst: 'Análise', purchasing: 'Compras' } as Record<string,string>)[adminAuth.role.value ?? ''] ?? 'Membro da equipe');
const accountInitials = computed(() => {
  const name = accountLabel.value.split('@')[0] ?? '';
  return name.split(/[ ._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'TN';
});
async function logout() {
  await adminAuth.signOut();
  await navigateTo('/painel/login');
}

type Section = 'overview'|'orders'|'finance'|'returns'|'purchasing'|'products'|'variants'|'inventory'|'shipping'|'promotions'|'customers'|'content'|'analytics'|'integrations'|'team'|'activity'|'settings';
const section = ref<Section>('overview');
const sidebarOpen = ref(false);
const notificationsOpen = ref(false);
const searchTerm = ref('');
const orderFilter = ref('Todos os pedidos');
const period = ref('Últimos 7 dias');
const toast = ref('');
const connectingMelhorEnvio = ref(false);
const activeOrderId = ref('');
const activeModal = ref<''|'product'|'variant'|'movement'|'coupon'|'team'|'supplier'|'purchase'|'receive'|'case'|'content'|'tracking'>('');
const modalError = computed(() => activeModal.value==='product'?productError.value:activeModal.value==='variant'?variantError.value:activeModal.value==='movement'?movementError.value:operationError.value);
const modalTitle = ref('');
const productForm = reactive({
  id: null as string | null,
  name: '',
  skuBase: '',
  price: null as number | null,
  categoryId: '',
  description: '',
  status: 'draft' as 'draft' | 'published' | 'archived',
  featured: false,
});
const productSaving = ref(false);
const productError = ref('');
const variantForm = reactive({
  id: null as string | null,
  productId: '',
  optionLabel: '',
  swatchHex: '#697586',
  imagePath: '',
  priceOverride: '',
  weightGrams: '',
  lengthMm: '',
  widthMm: '',
  heightMm: '',
  reorderPoint: '0',
});
const variantSaving = ref(false);
const variantError = ref('');
const productImageFile = ref<File | null>(null);
const variantImageFile = ref<File | null>(null);
const movementProduct = ref('');
const movementVariantId = ref('');
const movementQuantity = ref(1);
const movementType = ref<'Entrada'|'Saída'|'Ajuste'>('Entrada');
const movementReason = ref('Reposição de fornecedor');
const movementNote = ref('');
const movementSaving = ref(false);
const movementError = ref('');
const productSearch = ref('');
const productCategory = ref('Todas as categorias');
const selectedTab = ref('Todos');
const selectedSettingsTab = ref('Dados da loja');
const inventoryLevelFilter = ref('Todos os níveis');
const activityFilter = ref('Todas as atividades');
const activityPeriodFilter = ref('Últimos 7 dias');
const couponFilter = ref('Todos os cupons');
const caseStatusFilter = ref('Todos os status');
const shippingFilter = ref('Todos');
const productPage = ref(1);
const orderPeriodFilter = ref('Qualquer período');
const panelSearch = computed({ get: () => ['products','inventory'].includes(section.value) ? productSearch.value : searchTerm.value, set: (value: string) => { if (['products','inventory'].includes(section.value)) productSearch.value = value; else searchTerm.value = value; } });
const selectedProductIds = ref<string[]>([]);
const productCsvInput = ref<HTMLInputElement | null>(null);
const productImporting = ref(false);
const modalSaving = ref(false);
const operationError = ref('');
const couponForm = reactive({ id: '', code: '', discountType: 'percentage' as 'percentage'|'fixed_amount'|'free_shipping', discountValue: 10, minimumOrderTotal: 0, usageLimit: '', perCustomerLimit: 1, startsAt: '', endsAt: '' });
const teamForm = reactive({ email: '', role: 'catalog' as 'admin'|'catalog'|'inventory'|'fulfillment'|'support'|'finance'|'marketing'|'analyst'|'purchasing' });
const supplierForm = reactive({ id: '', name: '', contactName: '', email: '', phone: '', leadTimeDays: '' });
const purchaseForm = reactive({ supplierId: '', expectedAt: '', notes: '' });
const purchaseLines = ref<Array<{variantId:string;quantity:number;unitCost:number}>>([{variantId:'',quantity:1,unitCost:0}]);
const receivingPurchaseId = ref('');
const receiptAmounts = reactive<Record<string, number>>({});
const caseForm = reactive({ id: '', orderId: '', type: 'question', priority: 'normal', reason: '', status: 'new', resolution: '', note: '' });
const contentForm = reactive({ id: '', key: '', title: '', json: '{}', status: 'published' as 'draft'|'published'|'archived', position: 1 });
const trackingForm = reactive({ orderId: '', action: 'mark_shipped' as 'mark_shipped'|'update_tracking', carrier: '', trackingCode: '', trackingUrl: '', note: '' });
const configuredWhatsApp = String(useRuntimeConfig().public.whatsappNumber || '');
const profileForm = reactive({ name: 'Tecla Nativa', email: '', whatsapp: configuredWhatsApp });
const shippingOriginForm = reactive({ postal_code: '', street: '', neighborhood: '', city: '', state: '', country: 'BRA', demo_only: true });
const notificationKeys = ['new_paid_order','stale_pending_payment','low_stock','tracking_exception','integration_failure'] as const;
const notificationLabels: Record<typeof notificationKeys[number],string> = { new_paid_order:'Novo pedido pago',stale_pending_payment:'Pagamento pendente por mais de 30 min',low_stock:'Estoque abaixo do limite mínimo',tracking_exception:'Exceção de rastreio',integration_failure:'Falha de integração' };
const notificationSettings = reactive<Record<typeof notificationKeys[number],boolean>>({new_paid_order:true,stale_pending_payment:true,low_stock:true,tracking_exception:true,integration_failure:true});
const privacyForm = reactive({ retention_days: 365, customer_export_requires_owner: true, demo_data: true });
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const sectionInfo: Record<Section, { title: string; eyebrow: string; description: string }> = {
  overview: { title: 'Visão geral', eyebrow: 'CENTRAL DE OPERAÇÃO', description: 'O que precisa da sua atenção hoje.' },
  orders: { title: 'Pedidos', eyebrow: 'VENDAS E ATENDIMENTO', description: 'Acompanhe pagamento, separação, entrega e histórico de cada pedido.' },
  finance: { title: 'Financeiro e conciliação', eyebrow: 'PAGAMENTOS E REPASSES', description: 'Acompanhe cobranças, taxas, repasses, estornos e divergências por pedido.' },
  returns: { title: 'Trocas e atendimento', eyebrow: 'PÓS-VENDA E SUPORTE', description: 'Organize solicitações de troca, devolução e suporte com pedido vinculado e prazo de resposta.' },
  purchasing: { title: 'Compras e fornecedores', eyebrow: 'REPOSIÇÃO E ABASTECIMENTO', description: 'Planeje pedidos de compra, prazos de entrega e conferência de recebimento.' },
  products: { title: 'Produtos', eyebrow: 'CATÁLOGO E MERCHANDISING', description: 'Gerencie produtos, categorias, imagens, variantes e informações de compatibilidade.' },
  inventory: { title: 'Estoque', eyebrow: 'CONTROLE DE INVENTÁRIO', description: 'Veja disponibilidade por variante e mantenha um histórico de cada movimentação.' },
  variants: { title: 'Variantes e SKUs', eyebrow: 'CATÁLOGO DETALHADO', description: 'Gerencie cada cor e opção com SKU, imagem, preço e estoque próprios.' },
  shipping: { title: 'Expedição', eyebrow: 'PREPARAÇÃO E ENTREGA', description: 'Organize os pedidos pagos desde a separação até a confirmação da entrega.' },
  promotions: { title: 'Cupons e ofertas', eyebrow: 'PREÇO E CAMPANHAS', description: 'Planeje descontos com regras claras, limites e período de validade.' },
  customers: { title: 'Clientes', eyebrow: 'RELACIONAMENTO', description: 'Consulte cadastro e histórico de compras com acesso limitado aos dados necessários.' },
  content: { title: 'Conteúdo da loja', eyebrow: 'VITRINE E EDITORIAL', description: 'Organize destaques, banners, categorias e guias sem alterar o código da loja.' },
  analytics: { title: 'Análises e relatórios', eyebrow: 'DESEMPENHO DA OPERAÇÃO', description: 'Indicadores de desempenho calculados a partir dos dados reais da loja.' },
  integrations: { title: 'Integrações', eyebrow: 'SERVIÇOS CONECTADOS', description: 'Acompanhe o estado e as verificações de cada serviço externo.' },
  team: { title: 'Equipe e permissões', eyebrow: 'ACESSO ADMINISTRATIVO', description: 'Defina acessos por função e reduza a exposição de dados e ações sensíveis.' },
  activity: { title: 'Histórico de atividade', eyebrow: 'RASTREABILIDADE', description: 'Consulte ações administrativas com responsável, horário e alteração registrada.' },
  settings: { title: 'Configurações', eyebrow: 'PREFERÊNCIAS DA LOJA', description: 'Dados comerciais, logística, notificações e preferências da operação.' },
};

const title = computed(() => sectionInfo[section.value].title);
const desc = computed(() => sectionInfo[section.value].description);
const snapshot = commerce.snapshot;
const dataLoading = commerce.loading;
const dataError = commerce.error;
const store = computed(() => snapshot.value?.store ?? null);
const storeStatusLabel = computed(() => {
  if (!store.value) return dataLoading.value ? 'CONECTANDO' : 'SEM CONEXÃO';
  return store.value.status === 'active' ? 'ATIVA' : store.value.status === 'paused' ? 'PAUSADA' : 'CONFIGURAÇÃO';
});
const productRows = computed<AdminProductView[]>(() => snapshot.value?.products ?? []);
const variantRows = computed<AdminVariantView[]>(() => snapshot.value?.variants ?? []);
const selectedMovementVariant = computed(() => variantRows.value.find((variant) => variant.id === movementVariantId.value));
const variantSkuPreview = computed(() => {
  const product = productRows.value.find((row) => row.id === variantForm.productId);
  const optionKey = variantForm.optionLabel.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return product && optionKey ? `${product.sku}-${optionKey.toUpperCase()}` : 'Será gerado pelo produto e pela opção';
});
const visibleVariants = computed(() => variantRows.value.filter((variant) => !searchTerm.value
  || (variant.product + ' ' + variant.color + ' ' + variant.sku).toLowerCase().includes(searchTerm.value.trim().toLowerCase())));
watch(movementProduct, (productId) => {
  if (productId) movementVariantId.value = variantRows.value.find((variant) => variant.productId === productId)?.id ?? '';
});
const orders = computed<AdminOrderView[]>(() => snapshot.value?.orders ?? []);
const activities = computed<AdminActivityView[]>(() => snapshot.value?.activities ?? []);
const movements = computed(() => snapshot.value?.movements ?? []);
const customers = computed(() => snapshot.value?.customers ?? []);
const teamMembers = computed(() => snapshot.value?.team ?? []);
const coupons = operations.coupons;
const serviceCases = operations.serviceCases;
const suppliers = operations.suppliers;
const purchaseOrders = operations.purchaseOrders;
const contentSections = operations.contentSections;
const receivingPurchase = computed(() => purchaseOrders.value.find((row) => row.id === receivingPurchaseId.value) ?? null);
const orderTimelineText = (event: AdminOrderView['events'][number]) => `${event.status}${event.note ? ` · ${event.note}` : ''}`;
const orderEventLabel = (status:string) => ({pending_payment:'Pedido criado',paid:'Pagamento confirmado',processing:'Em separação',ready_to_ship:'Pronto para envio',shipped:'Enviado manualmente',delivered:'Entregue',cancelled:'Cancelado'} as Record<string,string>)[status]??status;
const shippingOrders = computed(() => orders.value.filter((order) => ['Em separação','Pronto para envio','Enviado','Entregue'].includes(order.status) || (order.payment === 'Pago' && order.shipping !== 'Aguardando')));
const shippingStats = computed(() => [
  {label:'Aguardando separação',value:String(orders.value.filter((order)=>order.payment==='Pago'&&order.shipping==='Aguardando').length),color:'var(--a-orange)'},
  {label:'Prontos para envio',value:String(orders.value.filter((order)=>order.shipping==='Pronto para envio').length),color:'var(--a-blue)'},
  {label:'Em trânsito',value:String(orders.value.filter((order)=>order.shipping==='Em trânsito').length),color:'var(--a-cyan)'},
  {label:'Entregues',value:String(orders.value.filter((order)=>order.shipping==='Entregue').length),color:'var(--a-green)'},
]);
const couponStats = computed(() => [
  {label:'Cupons ativos',value:String(coupons.value.filter((coupon)=>coupon.status==='active').length),color:'var(--a-cyan)'},
  {label:'Usos reservados/confirmados',value:String(coupons.value.reduce((sum,coupon)=>sum+coupon.redemptions,0)),color:'var(--a-blue)'},
  {label:'Desconto concedido',value:money(orders.value.reduce((sum,order)=>sum+order.discount,0)),color:'var(--a-violet)'},
  {label:'Cupons cadastrados',value:String(coupons.value.length),color:'var(--a-orange)'},
]);
const caseStats = computed(() => [
  {label:'Casos em aberto',value:String(serviceCases.value.filter((item)=>!['resolved','rejected','closed'].includes(item.status)).length),color:'var(--a-orange)'},
  {label:'Aguardando cliente',value:String(serviceCases.value.filter((item)=>item.status==='awaiting_customer').length),color:'var(--a-blue)'},
  {label:'Alta prioridade',value:String(serviceCases.value.filter((item)=>['high','urgent'].includes(item.priority)&&!['resolved','rejected','closed'].includes(item.status)).length),color:'var(--a-red)'},
  {label:'Resolvidos',value:String(serviceCases.value.filter((item)=>item.status==='resolved').length),color:'var(--a-green)'},
]);
const purchaseStats = computed(() => {
  const open=purchaseOrders.value.filter((row)=>['draft','sent','partially_received','late'].includes(row.status));
  return [
    {label:'Compras abertas',value:String(open.length),color:'var(--a-blue)'},
    {label:'Unidades pendentes',value:String(open.reduce((sum,row)=>sum+row.items.reduce((n,item)=>n+item.quantity_ordered-item.quantity_received,0),0)),color:'var(--a-cyan)'},
    {label:'Atrasadas',value:String(open.filter((row)=>row.status==='late'||(row.expected_at&&new Date(row.expected_at)<new Date()&&['sent','partially_received'].includes(row.status))).length),color:'var(--a-red)'},
    {label:'Valor aberto',value:money(open.reduce((sum,row)=>sum+Number(row.subtotal),0)),color:'var(--a-violet)'},
  ];
});
const recentPayments = computed(() => orders.value.map((order)=>({order,payment:operations.paymentRows.value.find((row)=>row.order_id===order.orderUuid)})).filter((row)=>row.order.payment==='Pago'||row.payment));
const customerStats = computed(() => [
  { label: 'Clientes cadastrados', value: String(snapshot.value?.customerCount ?? 0), color: 'var(--a-cyan)' },
  { label: 'Novos nos últimos 30 dias', value: String(snapshot.value?.newCustomerCount ?? 0), color: 'var(--a-blue)' },
  { label: 'Clientes com recompra', value: String(new Set(orders.value.filter((order) => order.payment === 'Pago').map((order) => order.email).filter((email) => orders.value.filter((order) => order.payment === 'Pago' && order.email === email).length > 1)).size), color: 'var(--a-violet)' },
  { label: 'Pedidos pendentes', value: String(periodOrders.value.filter((order) => order.payment_status === 'pending').length), color: 'var(--a-orange)' },
]);
const teamRows = computed(() => teamMembers.value.map((member) => {
  const isCurrentUser = member.userId === adminAuth.user.value?.id;
  const roleLabels: Record<string, string> = { owner: 'Proprietário', admin: 'Administrador', catalog: 'Catálogo', inventory: 'Estoque', fulfillment: 'Expedição', support: 'Atendimento', finance: 'Financeiro', marketing: 'Marketing', analyst: 'Análise', purchasing: 'Compras' };
  const canEdit = ['owner', 'admin'].includes(member.role);
  return {
    id: member.id,
    isCurrentUser,
    name: isCurrentUser ? (accountLabel.value.split('@')[0] || 'Proprietário') : (member.email.split('@')[0] || 'Membro da equipe'),
    email: isCurrentUser ? accountLabel.value : member.email || 'Convite sem e-mail salvo',
    roleKey: member.role,
    role: roleLabels[member.role] ?? member.role,
    orders: canEdit || ['support', 'fulfillment', 'finance'].includes(member.role) ? 'Acesso por função' : 'Sem acesso',
    catalog: canEdit || member.role === 'catalog' ? 'Acesso por função' : 'Sem acesso',
    customers: canEdit || ['support', 'marketing'].includes(member.role) ? 'Acesso por função' : 'Sem acesso',
    settings: canEdit ? 'Acesso por função' : 'Sem acesso',
    status: member.status === 'active' ? 'Ativo' : member.status === 'invited' ? 'Convidado' : 'Desativado',
    statusKey: member.status,
  };
}));
const canManageTeam = computed(() => ['owner','admin'].includes(adminAuth.role.value ?? ''));
const canGrantAdmin = computed(() => adminAuth.role.value === 'owner');
const visibleActivities = computed(() => activities.value.filter((event) => {
  const termMatch=!searchTerm.value||(event.actor+' '+event.action+' '+event.target+' '+event.change).toLowerCase().includes(searchTerm.value.trim().toLowerCase());
  const filterMatch=activityFilter.value==='Todas as atividades'||(activityFilter.value==='Pedidos'&&event.target.includes('orders'))||(activityFilter.value==='Catálogo'&&/products|product_variants|categories/.test(event.target))||(activityFilter.value==='Estoque'&&/inventory|stock/.test(event.target))||(activityFilter.value==='Acessos'&&/membership|team/.test(event.target));
  const age=Date.now()-new Date(event.createdAt).getTime();const days=activityPeriodFilter.value==='Hoje'?1:activityPeriodFilter.value==='Últimos 30 dias'?30:7;
  return termMatch&&filterMatch&&age<=days*86400000;
}));
const filteredShippingOrders = computed(() => shippingOrders.value.filter((order)=>{
  const termMatch=!searchTerm.value||`${order.id} ${order.customer} ${order.email}`.toLowerCase().includes(searchTerm.value.toLowerCase());
  const tab=shippingFilter.value;
  return termMatch&&(tab==='Todos'||(tab==='A separar'&&order.shipping==='Aguardando')||(tab==='Prontos para envio'&&order.shipping==='Pronto para envio')||(tab==='Em trânsito'&&order.shipping==='Em trânsito')||(tab==='Entregues'&&order.shipping==='Entregue'));
}));
const filteredCoupons = computed(()=>coupons.value.filter((coupon)=>couponFilter.value==='Todos os cupons'||(couponFilter.value==='Ativos'&&coupon.status==='active')||(couponFilter.value==='Pausados'&&coupon.status==='paused')||(couponFilter.value==='Rascunhos'&&coupon.status==='draft')));
const filteredCases = computed(()=>serviceCases.value.filter((ticket)=>caseStatusFilter.value==='Todos os status'||ticket.status===({Novo:'new','Em análise':'under_review','Aguardando cliente':'awaiting_customer',Resolvido:'resolved',Fechado:'closed'} as Record<string,string>)[caseStatusFilter.value]));
const visibleInventoryVariants = computed(()=>variantRows.value.filter((variant)=>{
  const term=!productSearch.value||`${variant.product} ${variant.color} ${variant.sku}`.toLowerCase().includes(productSearch.value.toLowerCase());
  const level=inventoryLevelFilter.value;
  return term&&(level==='Todos os níveis'||(level==='Estoque baixo'&&variant.stock>0&&variant.stock<=variant.minStock)||(level==='Sem estoque'&&variant.stock===0));
}));
const categories = computed(() => ['Todas as categorias', ...new Set(productRows.value.map((product) => product.category))]);
const productCategoryOptions = computed(() => snapshot.value?.categories ?? []);
const lowStock = computed(() => productRows.value.filter((product) => product.stock <= product.minStock));
const lowStockProducts = computed(() => lowStock.value.slice(0, 5));
const lowStockVariants = computed(() => variantRows.value.filter((variant) => variant.stock <= variant.minStock));
const periodOrders = commerce.orderSummary;
const paidOrders = computed(() => periodOrders.value.filter((order) => order.payment_status === 'paid'));
const paidOrderRecords = computed(() => orders.value.filter((order) => order.payment === 'Pago'));
const paidOrderValue = computed(() => paidOrders.value.reduce((sum, order) => sum + Number(order.total), 0));
const averagePaidOrder = computed(() => paidOrders.value.length ? paidOrderValue.value / paidOrders.value.length : 0);
const actionsPending = computed(() => orders.value.filter((order) => ['Aguardando', 'Em separação', 'Pronto para envio'].includes(order.status)).length + lowStock.value.length);
const metrics = computed(() => [
  { label: 'Pedidos pagos no período', value: money(paidOrderValue.value), change: paidOrders.value.length + ' pedidos', hint: period.value.toLowerCase(), icon: 'chart', color: 'var(--a-cyan)' },
  { label: 'Pedidos pagos', value: String(paidOrders.value.length), change: 'Pagamento confirmado', hint: period.value.toLowerCase(), icon: 'bag', color: 'var(--a-blue)' },
  { label: 'Ticket médio', value: money(averagePaidOrder.value), change: 'Pedidos pagos', hint: period.value.toLowerCase(), icon: 'tag', color: 'var(--a-violet)' },
  { label: 'Ações pendentes', value: String(actionsPending.value), change: 'Operação', hint: 'pedidos e estoque', icon: 'spark', color: 'var(--a-orange)' },
]);
const productStats = computed(() => [
  { label: 'Produtos cadastrados', value: String(productRows.value.length), color: 'var(--a-cyan)' },
  { label: 'Publicados', value: String(productRows.value.filter((product) => product.status === 'published').length), color: 'var(--a-green)' },
  { label: 'Variantes cadastradas', value: String(variantRows.value.length), color: 'var(--a-blue)' },
  { label: 'Rascunhos / arquivados', value: String(productRows.value.filter((product) => product.status !== 'published').length), color: 'var(--a-orange)' },
]);
const orderStats = computed(() => [
  { label: 'Pedidos no período', value: String(periodOrders.value.length), color: 'var(--a-blue)' },
  { label: 'Aguardando pagamento', value: String(periodOrders.value.filter((order) => order.payment_status === 'pending').length), color: 'var(--a-orange)' },
  { label: 'A separar / enviar', value: String(periodOrders.value.filter((order) => ['processing', 'ready_to_ship'].includes(order.status)).length), color: 'var(--a-violet)' },
  { label: 'Entregues no período', value: String(periodOrders.value.filter((order) => order.status === 'delivered').length), color: 'var(--a-green)' },
]);
const financeStats = computed(() => [
  { label: 'Pedidos pagos', value: money(paidOrderValue.value), color: 'var(--a-green)' },
  { label: 'Aguardando pagamento', value: String(periodOrders.value.filter((order) => order.payment_status === 'pending').length), color: 'var(--a-blue)' },
  { label: 'Taxas confirmadas', value: money(operations.transactionRows.value.filter((row) => row.kind === 'fee').reduce((sum,row)=>sum+Number(row.amount),0)), color: 'var(--a-violet)' },
  { label: 'Transações financeiras', value: String(operations.transactionRows.value.length), color: 'var(--a-orange)' },
]);
type IntegrationProvider = 'pagbank' | 'melhor_envio';
type IntegrationProviderOrNone = '' | IntegrationProvider;
const integrationCards = computed<Array<{name:string;provider:IntegrationProviderOrNone;type:string;state:string;icon:string;color:string;desc:string}>>(() => [
  { name: 'Supabase', provider: '', type: 'Banco de dados · autenticação · RLS', state: snapshot.value ? 'Conectado' : 'Sem conexão', icon: 'box', color: snapshot.value ? 'badge-green' : 'badge-red', desc: snapshot.value ? 'Catálogo, pedidos, estoque e auditoria consultados com sessão administrativa e políticas RLS.' : 'Configure URL e chave pública do Supabase para carregar os dados.' },
  { name: 'PagBank Sandbox', provider: 'pagbank', type: 'Checkout · webhook · reconciliação', state: integrationStatus('pagbank'), icon: 'bag', color: integrationColor('pagbank'), desc: 'Checkout restrito ao Sandbox. A conferência testa credencial sem criar cobrança.' },
  { name: 'Melhor Envio', provider: 'melhor_envio', type: 'Conta de produção · cotação de frete', state: integrationStatus('melhor_envio'), icon: 'truck', color: integrationColor('melhor_envio'), desc: 'A cotação consulta a conta real. O fluxo de demonstração não compra frete nem emite etiquetas.' },
  { name: 'Netlify', provider: '', type: 'Hospedagem do site', state: 'URL configurada', icon: 'plug', color: 'badge-green', desc: 'Vitrine pública em teclanativa.netlify.app. Publicação segue manual e depende de autorização.' },
]);
function integrationStatus(provider: 'pagbank'|'melhor_envio') { const item=operations.integrations.value.find((row)=>row.provider===provider); if(item?.status==='error')return 'Falha na última verificação'; if(provider==='pagbank'&&item?.status==='sandbox')return 'Sandbox verificado'; if(provider==='melhor_envio'&&item?.status==='active')return 'Produção conectada'; return 'Não verificado'; }
function integrationColor(provider: 'pagbank'|'melhor_envio') { const status=integrationStatus(provider); return ['Sandbox verificado','Produção conectada'].includes(status)?'badge-green':status==='Falha na última verificação'?'badge-red':'badge-orange'; }
function integrationLastChecked(provider: 'pagbank'|'melhor_envio') { const item=operations.integrations.value.find((row)=>row.provider===provider); return item?.last_checked_at ? activityDate(item.last_checked_at) : 'ainda não verificada'; }
const notificationItems = computed(() => {
  const items: Array<{ title: string; detail: string; section: Section; id: string }> = [];
  for (const order of orders.value.filter((item) => item.payment === 'Pago' && ['Aguardando', 'Em separação', 'Pronto para envio'].includes(item.status)).slice(0, 5)) {
    items.push({ id: `order-${order.orderUuid}`, title: `Pedido ${order.id} precisa de ação`, detail: `${order.customer} · ${order.status}`, section: 'orders' });
  }
  for (const variant of variantRows.value.filter((item) => item.stock <= item.minStock).slice(0, 5)) {
    items.push({ id: `stock-${variant.id}`, title: `${variant.product} · ${variant.color}`, detail: `${variant.stock} disponíveis · mínimo ${variant.minStock}`, section: 'inventory' });
  }
  for (const integration of operations.integrations.value.filter((item) => item.status === 'error')) {
    items.push({ id: `integration-${integration.provider}`, title: `Integração ${integration.provider} com falha`, detail: 'Execute uma nova verificação no painel de integrações.', section: 'integrations' });
  }
  return items;
});
const allVisibleProductsSelected = computed(() => paginatedProducts.value.length > 0 && paginatedProducts.value.every((product) => selectedProductIds.value.includes(product.id)));
const inventoryStats = computed(() => [
  { label: 'Unidades disponíveis', value: String(variantRows.value.reduce((sum, variant) => sum + variant.stock, 0)), color: 'var(--a-cyan)' },
  { label: 'Variantes em alerta', value: String(variantRows.value.filter((variant) => variant.stock <= variant.minStock).length), color: 'var(--a-orange)' },
  { label: 'Sem estoque', value: String(variantRows.value.filter((variant) => variant.stock === 0).length), color: 'var(--a-red)' },
  { label: 'Movimentações recentes', value: String(movements.value.length), color: 'var(--a-blue)' },
]);
const navigation = computed(() => [
  { label: 'Operação', items: [
    { id: 'overview' as Section, name: 'Visão geral', icon: 'grid' },
    { id: 'orders' as Section, name: 'Pedidos', icon: 'bag', count: String(orders.value.length) },
    { id: 'finance' as Section, name: 'Financeiro', icon: 'chart' },
    { id: 'shipping' as Section, name: 'Expedição', icon: 'truck' },
    { id: 'returns' as Section, name: 'Trocas e atendimento', icon: 'users' },
    { id: 'purchasing' as Section, name: 'Compras e fornecedores', icon: 'box' },
  ] },
  { label: 'Catálogo', items: [
    { id: 'products' as Section, name: 'Produtos', icon: 'box', count: String(productRows.value.length) },
    { id: 'variants' as Section, name: 'Variantes e SKUs', icon: 'tag' },
    { id: 'inventory' as Section, name: 'Estoque', icon: 'chart', count: String(lowStock.value.length) },
    { id: 'promotions' as Section, name: 'Cupons e ofertas', icon: 'tag' },
    { id: 'content' as Section, name: 'Conteúdo da loja', icon: 'page' },
  ] },
  { label: 'Relacionamento', items: [{ id: 'customers' as Section, name: 'Clientes', icon: 'users' }] },
  { label: 'Inteligência', items: [{ id: 'analytics' as Section, name: 'Análises e relatórios', icon: 'chart' }] },
  { label: 'Administração', items: [
    { id: 'integrations' as Section, name: 'Integrações', icon: 'plug' },
    { id: 'team' as Section, name: 'Equipe e permissões', icon: 'shield' },
    { id: 'activity' as Section, name: 'Histórico de atividade', icon: 'clock' },
    { id: 'settings' as Section, name: 'Configurações', icon: 'settings' },
  ] },
]);
const chartValues = computed(() => {
  const buckets = Array.from({ length: 14 }, () => 0);
  const now = Date.now();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period.value === 'Últimos 30 dias') start.setDate(start.getDate() - 29);
  else if (period.value === 'Este mês') start.setDate(1);
  else if (period.value === 'Este trimestre') start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  else start.setDate(start.getDate() - 6);
  const span = Math.max(now - start.getTime(), 1);
  for (const order of paidOrders.value) {
    const offset = new Date(order.placed_at).getTime() - start.getTime();
    const bucket = Math.max(0, Math.min(13, Math.floor((offset / span) * 14)));
    buckets[bucket] = (buckets[bucket] ?? 0) + Number(order.total);
  }
  return buckets;
});
const chartPoints = computed(() => {
  const max = Math.max(...chartValues.value, 1);
  return chartValues.value.map((value, index) => {
    const x = Math.round(index * 30 + 4);
    const y = Math.round(154 - (value / max) * 115);
    return x + ',' + y;
  }).join(' ');
});
const chartArea = computed(() => '4,154 ' + chartPoints.value + ' 394,154');
const chartLabels = computed(() => {
  const now = new Date();
  const format = (date: Date) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
  const start = new Date(now);
  if (period.value === 'Últimos 30 dias') start.setDate(start.getDate() - 29);
  else if (period.value === 'Este mês') start.setDate(1);
  else if (period.value === 'Este trimestre') start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  else start.setDate(start.getDate() - 6);
  const end = new Date(now);
  const at = (ratio: number) => new Date(start.getTime() + (end.getTime() - start.getTime()) * ratio);
  return [format(start), format(at(1 / 3)), format(at(2 / 3)), format(end)];
});
const pipelineStages = computed(() => {
  const stages = [
    { label: 'Aguardando ação', count: periodOrders.value.filter((order) => ['pending_payment', 'paid'].includes(order.status)).length, color: 'var(--a-orange)' },
    { label: 'Em separação', count: periodOrders.value.filter((order) => order.fulfillment_status === 'processing').length, color: 'var(--a-violet)' },
    { label: 'Pronto para envio', count: periodOrders.value.filter((order) => order.fulfillment_status === 'ready').length, color: 'var(--a-blue)' },
    { label: 'Em trânsito', count: periodOrders.value.filter((order) => ['shipped', 'partially_shipped'].includes(order.fulfillment_status)).length, color: 'var(--a-cyan)' },
    { label: 'Entregues', count: periodOrders.value.filter((order) => order.status === 'delivered').length, color: 'var(--a-green)' },
  ];
  const max = Math.max(1, ...stages.map((stage) => stage.count));
  return stages.map((stage) => ({ ...stage, width: (Math.max(stage.count ? 8 : 0, (stage.count / max) * 100)) + '%' }));
});

const visibleOrders = computed(() => orders.value.filter((order) => {
  const term = searchTerm.value.trim().toLowerCase();
  const match = !term || (order.id + ' ' + order.customer + ' ' + order.email + ' ' + order.phone).toLowerCase().includes(term);
  const filter = orderFilter.value;
  const statusMatch = filter === 'Todos os pedidos'
    || (filter === 'Aguardando pagamento' && order.payment === 'Pendente')
    || (filter === 'A separar' && ['Aguardando', 'Em separação', 'Pronto para envio'].includes(order.status))
    || (filter === 'Em trânsito' && order.shipping === 'Em trânsito')
    || (filter === 'Entregues' && order.status === 'Entregue');
  const withinPeriod=orderPeriodFilter.value==='Qualquer período'||(Date.now()-new Date(order.placedAt).getTime()<=((orderPeriodFilter.value==='Hoje'?1:orderPeriodFilter.value==='Últimos 7 dias'?7:30)*86400000));
  return match && statusMatch && withinPeriod;
}));
const visibleProducts = computed(() => productRows.value.filter((product) => {
  const term = productSearch.value.trim().toLowerCase();
  const match = !term || (product.name + ' ' + product.sku + ' ' + product.category).toLowerCase().includes(term);
  return match && (productCategory.value === 'Todas as categorias' || product.category === productCategory.value);
}));
const filteredProducts = computed(() => visibleProducts.value.filter((product) => selectedTab.value === 'Todos'
  || (selectedTab.value === 'Publicados' && product.published)
  || (selectedTab.value === 'Rascunhos' && product.status === 'draft')
  || (selectedTab.value === 'Arquivados' && product.status === 'archived')
  || (selectedTab.value === 'Com estoque baixo' && product.stock <= product.minStock)));
const productPageCount = computed(() => Math.max(1, Math.ceil(filteredProducts.value.length / 10)));
const paginatedProducts = computed(() => filteredProducts.value.slice((productPage.value - 1) * 10, productPage.value * 10));
watch([productSearch, productCategory, selectedTab], () => { productPage.value = 1; });
const selectedOrder = computed(() => orders.value.find((order) => order.id === activeOrderId.value));
const orderStatusClass = (status: string) => status === 'Entregue' ? 'badge-green' : status === 'Enviado' ? 'badge-blue' : status === 'Pronto para envio' ? 'badge-purple' : status === 'Em separação' ? 'badge-orange' : status === 'Cancelado' ? 'badge-red' : 'badge-gray';
const paymentClass = (status: string) => status === 'Pago' ? 'badge-green' : status === 'Pendente' ? 'badge-orange' : status.startsWith('Reembolso') || status === 'Reembolsado' ? 'badge-purple' : status === 'Recusado' ? 'badge-red' : 'badge-gray';
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const activityDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const couponStatusLabel=(status:string)=>status==='active'?'Ativo':status==='paused'?'Pausado':status==='draft'?'Rascunho':status;
const couponDiscountLabel=(coupon:AdminCouponView)=>coupon.discount_type==='free_shipping'?'Frete grátis':coupon.discount_type==='percentage'?`${Number(coupon.discount_value)}%`:money(Number(coupon.discount_value));
const caseStatusLabel=(status:string)=>({new:'Novo',under_review:'Em análise',awaiting_customer:'Aguardando cliente',awaiting_return:'Aguardando retorno',resolved:'Resolvido',rejected:'Recusado',closed:'Fechado'} as Record<string,string>)[status]??status;
const purchaseStatusLabel=(status:string)=>({draft:'Rascunho',sent:'Enviado',partially_received:'Recebimento parcial',received:'Recebido',cancelled:'Cancelado',late:'Atrasado'} as Record<string,string>)[status]??status;

function notify(message: string) {
  toast.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 3200);
}
function selectSection(id: Section) {
  section.value = id;
  sidebarOpen.value = false;
  notificationsOpen.value = false;
  searchTerm.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function openNotification(item: { section: Section; id: string }) { if (item.id.startsWith('order-')) { const order=orders.value.find((row)=>`order-${row.orderUuid}`===item.id); if(order)showOrder(order.id); } selectSection(item.section); }
function showOrder(id: string) { activeOrderId.value = id; }
function closeOrder() { activeOrderId.value = ''; }
async function advanceOrder() {
  const order=selectedOrder.value;if(!order)return;
  try {
    if(order.status==='Aguardando'&&order.payment==='Pago') await commerce.transitionOrder(order.orderUuid,'start_processing');
    else if(order.status==='Em separação') await commerce.transitionOrder(order.orderUuid,'mark_ready');
    else if(order.status==='Pronto para envio') { openTracking(order,'mark_shipped'); return; }
    else if(order.status==='Enviado') await commerce.transitionOrder(order.orderUuid,'mark_delivered');
    else throw new Error('Este pedido não pode avançar nesta etapa.');
    await refreshOperations();notify('Etapa do pedido atualizada e registrada no histórico.');
  }catch(cause){notify(cause instanceof Error?cause.message:'Não foi possível avançar o pedido.');}
}
function openModal(kind: typeof activeModal.value, title: string) { operationError.value = ''; activeModal.value = kind; modalTitle.value = title; }
async function refreshOperations() { if(snapshot.value) await operations.refresh(snapshot.value.store.id,orders.value); }
async function catalogRefresh() { await storefrontCatalog.refresh(true); }
function csvCell(value: unknown) { const text=String(value??'');return `"${text.replace(/"/g,'""')}"`; }
function downloadCsv(filename:string,headers:string[],rows:Array<Array<unknown>>) {
  const content='\ufeff'+[headers,...rows].map((row)=>row.map(csvCell).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportOrders(){downloadCsv('tecla-nativa-pedidos.csv',['Pedido','Cliente','Email','Data','Pagamento','Status','Subtotal','Desconto','Frete','Total'],visibleOrders.value.map((o)=>[o.id,o.customer,o.email,o.placedAt,o.payment,o.status,o.subtotal,o.discount,o.shippingTotal,o.total]));notify('CSV dos pedidos carregados foi gerado.');}
function exportCustomers(){if(privacyForm.customer_export_requires_owner&&adminAuth.role.value!=='owner'){notify('A exportação de dados pessoais está restrita ao proprietário.');return;}const term=searchTerm.value.trim().toLowerCase();const rows=customers.value.filter((customer)=>!term||`${customer.name} ${customer.email} ${customer.phone}`.toLowerCase().includes(term));downloadCsv('tecla-nativa-clientes.csv',['Nome','E-mail','Telefone','Criado em','ID'],rows.map((customer)=>[customer.name,customer.email,customer.phone,customer.createdAt,customer.id]));notify(`${rows.length} clientes exportados em CSV.`);}
function exportFinance(){downloadCsv('tecla-nativa-financeiro.csv',['Pedido','Cliente','Pagamento','Método','Valor','Frete','Desconto','Criado em'],recentPayments.value.map(({order,payment})=>[order.id,order.customer,order.payment,payment?.provider??order.method,order.total,order.shippingTotal,order.discount,order.placedAt]));notify('CSV financeiro gerado com os pedidos e pagamentos disponíveis.');}
function exportProducts(){const selected=selectedProductIds.value.length?productRows.value.filter((product)=>selectedProductIds.value.includes(product.id)):filteredProducts.value;downloadCsv('tecla-nativa-produtos.csv',['SKU base','Nome','Categoria','Preço','Descrição','Status'],selected.map((product)=>[product.sku,product.name,product.category,product.price,product.description,product.status]));notify(`${selected.length} produtos exportados em CSV.`);}
function exportInventory(){downloadCsv('tecla-nativa-estoque.csv',['Produto','Cor / opção','SKU','Em mãos','Reservado','Disponível','Estoque mínimo'],variantRows.value.map((variant)=>[variant.product,variant.color,variant.sku,variant.onHand,variant.reserved,variant.stock,variant.minStock]));notify(`${variantRows.value.length} variantes exportadas com saldo e reservas.`);}
function toggleVisibleProductSelection(event: Event){const checked=(event.target as HTMLInputElement).checked;const visible=paginatedProducts.value.map((product)=>product.id);selectedProductIds.value=checked?[...new Set([...selectedProductIds.value,...visible])]:selectedProductIds.value.filter((id)=>!visible.includes(id));}
function toggleVisibleProductSelectionForOne(event:Event,productId:string){const checked=(event.target as HTMLInputElement).checked;selectedProductIds.value=checked?[...new Set([...selectedProductIds.value,productId])]:selectedProductIds.value.filter((id)=>id!==productId);}
function saveOrderFilter(){try{localStorage.setItem('tecla-nativa:order-filter',JSON.stringify({status:orderFilter.value,period:orderPeriodFilter.value}));notify('Filtros salvos neste navegador.');}catch{notify('O navegador não permitiu salvar os filtros.');}}
function parseCsv(input:string){const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;for(let i=0;i<input.length;i++){const char=input[i]??'';if(char==='"'&&quoted&&input[i+1]==='"'){cell+='"';i++;}else if(char==='"'){quoted=!quoted;}else if(char===';'&&!quoted){row.push(cell);cell='';}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&input[i+1]==='\n')i++;row.push(cell);if(row.some((part)=>part.trim()))rows.push(row);row=[];cell='';}else cell+=char;}row.push(cell);if(row.some((part)=>part.trim()))rows.push(row);return rows;}
async function importProductsCsv(event:Event){const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;productImporting.value=true;try{if(file.size>5*1024*1024)throw new Error('O arquivo deve ter no máximo 5 MB.');const rows=parseCsv(await file.text());if(rows.length<2)throw new Error('O CSV está vazio ou não contém linhas de produtos.');const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();const headers=(rows[0]??[]).map(normalize);const index=(name:string)=>headers.indexOf(normalize(name));const skuIndex=index('SKU base'),nameIndex=index('Nome'),categoryIndex=index('Categoria'),priceIndex=index('Preço'),descriptionIndex=index('Descrição');if([skuIndex,nameIndex,priceIndex].some((value)=>value<0))throw new Error('Use as colunas SKU base;Nome;Preço. Categoria e Descrição são opcionais.');let saved=0;const failures:string[]=[];for(const [lineIndex,row] of rows.slice(1).entries()){try{const sku=(row[skuIndex]??'').trim(),name=(row[nameIndex]??'').trim(),priceText=(row[priceIndex]??'').trim().replace(',','.');const price=Number(priceText);if(!sku||!name||!Number.isFinite(price)||price<=0)throw new Error('SKU, nome e preço maior que zero são obrigatórios.');const categoryName=categoryIndex<0?'':(row[categoryIndex]??'').trim();const category=productCategoryOptions.value.find((item)=>item.name.toLowerCase()===categoryName.toLowerCase());if(categoryName&&!category)throw new Error(`Categoria "${categoryName}" não existe.`);const existing=productRows.value.find((product)=>product.sku.toLowerCase()===sku.toLowerCase());await commerce.saveProduct({id:existing?.id??null,name,skuBase:sku,price,categoryId:category?.id??'',description:descriptionIndex<0?'':(row[descriptionIndex]??''),featured:existing?.featured??false});saved++;}catch(cause){failures.push(`linha ${lineIndex+2}: ${cause instanceof Error?cause.message:'erro ao salvar'}`);}}
    await commerce.refresh(period.value);if(failures.length)notify(`${saved} produtos importados. ${failures.length} linhas com erro: ${failures.slice(0,2).join(' · ')}`);else notify(`${saved} produtos importados como rascunho.`);
  }catch(cause){notify(cause instanceof Error?cause.message:'Não foi possível importar o CSV.');}finally{productImporting.value=false;input.value='';}}
async function togglePublish(productId?:string){const product=productRows.value.find((row)=>row.id===productId);if(!product)return;try{await commerce.setProductStatus(product.id,product.published?'draft':'published');notify(product.published?'Produto removido da vitrine.':'Produto publicado na vitrine.');}catch(cause){notify(cause instanceof Error?cause.message:'Não foi possível alterar a publicação.');}}
async function setProductStatusFromEvent(event:Event,product:AdminProductView){const select=event.target as HTMLSelectElement;const nextStatus=select.value as 'draft'|'published'|'archived';if(nextStatus===product.status)return;if(nextStatus==='archived'&&!window.confirm(`Arquivar ${product.name}? Ele deixará de aparecer na vitrine.`)){select.value=product.status;return;}try{await commerce.setProductStatus(product.id,nextStatus);notify(nextStatus==='published'?'Produto publicado na vitrine.':nextStatus==='archived'?'Produto arquivado.':'Produto salvo como rascunho.');}catch(cause){select.value=product.status;notify(cause instanceof Error?cause.message:'Não foi possível alterar o status.');}}
async function runIntegrationCheck(provider:'pagbank'|'melhor_envio'){try{const result=await operations.integrationCheck(provider);await refreshOperations();notify(result.message);}catch(cause){notify(cause instanceof Error?cause.message:'Não foi possível validar a integração.');}}
async function connectMelhorEnvio(){if(connectingMelhorEnvio.value)return;connectingMelhorEnvio.value=true;try{const authorizationUrl=await operations.startMelhorEnvioAuthorization();window.location.assign(authorizationUrl);}catch(cause){connectingMelhorEnvio.value=false;notify(cause instanceof Error?cause.message:'Não foi possível conectar o Melhor Envio.');}}
function openTracking(order:AdminOrderView,action:'mark_shipped'|'update_tracking'){Object.assign(trackingForm,{orderId:order.orderUuid,action,carrier:order.carrier==='Frete consultado'?'':order.carrier,trackingCode:order.tracking,trackingUrl:order.trackingUrl,note:''});operationError.value='';openModal('tracking',action==='mark_shipped'?'Registrar envio manual':'Atualizar rastreio');}
async function saveTracking(){if(modalSaving.value)return;modalSaving.value=true;operationError.value='';try{if(trackingForm.action==='mark_shipped')await commerce.transitionOrder(trackingForm.orderId,'mark_shipped',{carrier:trackingForm.carrier,trackingCode:trackingForm.trackingCode,trackingUrl:trackingForm.trackingUrl,note:trackingForm.note});else await commerce.updateTracking(trackingForm.orderId,{carrier:trackingForm.carrier,trackingCode:trackingForm.trackingCode,trackingUrl:trackingForm.trackingUrl,note:trackingForm.note});activeModal.value='';await refreshOperations();notify('Informações de envio atualizadas. Nenhuma etiqueta foi emitida.');}catch(cause){operationError.value=cause instanceof Error?cause.message:'Falha ao registrar o rastreio.';}finally{modalSaving.value=false;}}
async function cancelSelectedOrder(){const order=selectedOrder.value;if(!order)return;if(!window.confirm(`Cancelar o pedido ${order.id}? O cancelamento só é permitido antes da confirmação do pagamento.`))return;try{await commerce.transitionOrder(order.orderUuid,'cancel');await refreshOperations();notify('Pedido cancelado e reserva liberada.');}catch(cause){notify(cause instanceof Error?cause.message:'Não foi possível cancelar o pedido.');}}
function editCoupon(coupon?:AdminCouponView){Object.assign(couponForm,{id:coupon?.id??'',code:coupon?.code??'',discountType:coupon?.discount_type??'percentage',discountValue:Number(coupon?.discount_value??10),minimumOrderTotal:Number(coupon?.minimum_order_total??0),usageLimit:coupon?.usage_limit===null?'':String(coupon?.usage_limit??''),perCustomerLimit:coupon?.per_customer_limit??1,startsAt:coupon?.starts_at?.slice(0,10)??'',endsAt:coupon?.ends_at?.slice(0,10)??''});operationError.value='';openModal('coupon',coupon?`Editar ${coupon.code}`:'Criar cupom');}
async function toggleCoupon(coupon:AdminCouponView){try{await operations.setCouponStatus(snapshot.value!.store.id,coupon.id,coupon.status==='active'?'paused':'active');await refreshOperations();notify(coupon.status==='active'?'Cupom pausado.':'Cupom ativado.');}catch(cause){notify(cause instanceof Error?cause.message:'Não foi possível mudar o cupom.');}}
function openTeamInvite(){Object.assign(teamForm,{email:'',role:'catalog'});operationError.value='';openModal('team','Convidar pessoa para o painel');}
async function changeTeam(memberId:string,field:'role'|'status',value:string){try{const body=field==='role'?{action:'update_role',membership_id:memberId,role:value}:{action:'set_status',membership_id:memberId,status:value};await operations.teamAction(body);await refreshOperations();notify('Acesso atualizado e auditado.');}catch(cause){notify(cause instanceof Error?cause.message:'Não foi possível atualizar a equipe.');}}
function changeTeamField(event:Event,memberId:string,field:'role'|'status'){void changeTeam(memberId,field,(event.target as HTMLSelectElement).value);}
function openSupplier(supplier?:AdminSupplierView){Object.assign(supplierForm,{id:supplier?.id??'',name:supplier?.name??'',contactName:supplier?.contact_name??'',email:supplier?.email??'',phone:supplier?.phone??'',leadTimeDays:supplier?.lead_time_days===null?'':String(supplier?.lead_time_days??'')});operationError.value='';openModal('supplier',supplier?'Editar fornecedor':'Novo fornecedor');}
function openPurchase(){Object.assign(purchaseForm,{supplierId:suppliers.value[0]?.id??'',expectedAt:'',notes:''});purchaseLines.value=[{variantId:variantRows.value[0]?.id??'',quantity:1,unitCost:0}];operationError.value='';openModal('purchase','Criar pedido de compra');}
async function changePurchaseStatus(purchase:AdminPurchaseOrderView,status:'sent'|'cancelled'){if(!snapshot.value)return;if(status==='cancelled'&&!window.confirm(`Cancelar a compra ${purchase.purchase_number}?`))return;try{await operations.updatePurchaseStatus(snapshot.value.store.id,purchase.id,status);await refreshOperations();notify(status==='sent'?'Pedido de compra marcado como enviado.':'Pedido de compra cancelado.');}catch(cause){notify(cause instanceof Error?cause.message:'Não foi possível atualizar a compra.');}}
function addPurchaseLine(){purchaseLines.value.push({variantId:variantRows.value[0]?.id??'',quantity:1,unitCost:0});}
function openReceiving(purchase:AdminPurchaseOrderView){receivingPurchaseId.value=purchase.id;for(const item of purchase.items)receiptAmounts[item.variant_id]=item.quantity_ordered-item.quantity_received;operationError.value='';openModal('receive',`Receber ${purchase.purchase_number}`);}
function openCase(ticket?:AdminServiceCaseView){Object.assign(caseForm,{id:ticket?.id??'',orderId:ticket?.order_id??'',type:ticket?.case_type??'question',priority:ticket?.priority??'normal',reason:ticket?.reason??'',status:ticket?.status??'new',resolution:ticket?.resolution??'',note:''});operationError.value='';openModal('case',ticket?`Atualizar ${ticket.case_number}`:'Registrar atendimento');}
function editContent(item:typeof contentSections.value[number]){Object.assign(contentForm,{id:item.id,key:item.section_key,title:item.title,json:JSON.stringify(item.content,null,2),status:item.status,position:item.position});operationError.value='';openModal('content',`Editar ${item.title}`);}
function applySettings(){if(!snapshot.value)return;const origin=operations.settings.value.shipping_origin;if(origin&&typeof origin==='object'&&!Array.isArray(origin))Object.assign(shippingOriginForm,origin);const notifications=operations.settings.value.notifications;if(notifications&&typeof notifications==='object'&&!Array.isArray(notifications))for(const key of notificationKeys)notificationSettings[key]=Boolean((notifications as Record<string,unknown>)[key]??true);const privacy=operations.settings.value.privacy;if(privacy&&typeof privacy==='object'&&!Array.isArray(privacy))Object.assign(privacyForm,privacy);}
async function saveStoreSettings(){if(!snapshot.value)return;try{await operations.saveStoreProfile(snapshot.value.store.id,profileForm);await operations.saveSetting(snapshot.value.store.id,'shipping_origin',shippingOriginForm as unknown as import('~/supabase/types/database.types').Json);await operations.saveSetting(snapshot.value.store.id,'notifications',notificationSettings as unknown as import('~/supabase/types/database.types').Json);await operations.saveSetting(snapshot.value.store.id,'privacy',privacyForm as unknown as import('~/supabase/types/database.types').Json);await commerce.refresh(period.value);await refreshOperations();notify('Configurações salvas no Supabase.');}catch(cause){notify(cause instanceof Error?cause.message:'Não foi possível salvar as configurações.');}}
function newProduct() {
  Object.assign(productForm, {
    id: null,
    name: '',
    skuBase: '',
    price: null,
    categoryId: snapshot.value?.categories[0]?.id ?? '',
    description: '',
    status: 'draft',
    featured: false,
  });
  productImageFile.value=null;
  productError.value = '';
  openModal('product', 'Novo produto');
}
function editProduct(product: AdminProductView) {
  Object.assign(productForm, {
    id: product.id,
    name: product.name,
    skuBase: product.sku,
    price: product.price,
    categoryId: product.categoryId ?? '',
    description: product.description,
    status: product.status,
    featured: product.featured,
  });
  productImageFile.value=null;
  productError.value = '';
  openModal('product', `Editar ${product.name}`);
}
function newVariant(productId = productRows.value[0]?.id ?? '') {
  Object.assign(variantForm, {
    id: null,
    productId,
    optionLabel: '',
    swatchHex: '#697586',
    imagePath: '',
    priceOverride: '',
    weightGrams: '',
    lengthMm: '',
    widthMm: '',
    heightMm: '',
    reorderPoint: '0',
  });
  variantImageFile.value=null;
  variantError.value = '';
  openModal('variant', 'Nova variante');
}
function editVariant(variant: AdminVariantView) {
  Object.assign(variantForm, {
    id: variant.id,
    productId: variant.productId,
    optionLabel: variant.color,
    swatchHex: variant.swatchHex ?? '#697586',
    imagePath: variant.imagePath ?? '',
    priceOverride: variant.priceOverride === null ? '' : String(variant.priceOverride),
    weightGrams: variant.weightGrams === null ? '' : String(variant.weightGrams),
    lengthMm: variant.lengthMm === null ? '' : String(variant.lengthMm),
    widthMm: variant.widthMm === null ? '' : String(variant.widthMm),
    heightMm: variant.heightMm === null ? '' : String(variant.heightMm),
    reorderPoint: String(variant.minStock),
  });
  variantImageFile.value=null;
  variantError.value = '';
  openModal('variant', `Editar ${variant.product} · ${variant.color}`);
}
function openStockMovement(variant?: AdminVariantView) {
  movementVariantId.value = variant?.id ?? variantRows.value[0]?.id ?? '';
  movementQuantity.value = 1;
  movementType.value = 'Entrada';
  movementReason.value = 'Reposição de fornecedor';
  movementNote.value = '';
  movementError.value = '';
  openModal('movement', variant ? `Movimentar ${variant.product} · ${variant.color}` : 'Registrar movimentação');
}
function setProductImage(event:Event){productImageFile.value=(event.target as HTMLInputElement).files?.[0]??null;}
function setVariantImage(event:Event){variantImageFile.value=(event.target as HTMLInputElement).files?.[0]??null;}
function openProductImport(){productCsvInput.value?.click();}
function optionalNumber(value: string, field: string, integer = true): number | null {
  const text = value.trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || (integer && !Number.isInteger(number))) throw new Error(`${field} deve ser ${integer ? 'um número inteiro' : 'um valor numérico'}.`);
  return number;
}
async function saveModal() {
  if (activeModal.value === 'product') {
    if (productSaving.value) return;
    productError.value = '';
    productSaving.value = true;
    try {
      const wasEditing=Boolean(productForm.id);
      const productId=await commerce.saveProduct({
        id: productForm.id,
        name: productForm.name,
        skuBase: productForm.skuBase,
        price: Number(productForm.price),
        categoryId: productForm.categoryId,
        description: productForm.description,
        featured: productForm.featured,
      });
      productForm.id=productId;
      if(productImageFile.value)await commerce.uploadProductImage(productId,productImageFile.value);
      activeModal.value = '';
      notify(wasEditing ? 'Produto e imagem atualizados no Supabase.' : 'Rascunho criado no Supabase.');
    } catch (cause) {
      productError.value = cause instanceof Error ? cause.message : 'Não foi possível salvar o produto.';
    } finally {
      productSaving.value = false;
    }
    return;
  }

  if (activeModal.value === 'variant') {
    if (variantSaving.value) return;
    variantError.value = '';
    variantSaving.value = true;
    try {
      const dimensions = [variantForm.lengthMm, variantForm.widthMm, variantForm.heightMm].map((value, index) => optionalNumber(value, ['Comprimento','Largura','Altura'][index] ?? 'Dimensão'));
      if (dimensions.some((value) => value !== null) && dimensions.some((value) => value === null)) throw new Error('Preencha comprimento, largura e altura juntos, ou deixe os três campos vazios.');
      const weight = optionalNumber(variantForm.weightGrams, 'Peso');
      if (weight !== null && weight <= 0) throw new Error('O peso deve ser maior que zero.');
      const price = optionalNumber(variantForm.priceOverride, 'Preço', false);
      const reorderPoint = optionalNumber(variantForm.reorderPoint, 'Estoque mínimo');
      if (price !== null && price < 0) throw new Error('O preço deve ser zero ou maior.');
      if (reorderPoint === null || reorderPoint < 0) throw new Error('Informe um estoque mínimo igual ou maior que zero.');
      const wasEditing=Boolean(variantForm.id);
      const variantId=await commerce.saveVariant({
        id: variantForm.id,
        productId: variantForm.productId,
        optionLabel: variantForm.optionLabel,
        swatchHex: variantForm.swatchHex,
        imagePath: variantForm.imagePath,
        priceOverride: price,
        weightGrams: weight,
        lengthMm: dimensions[0] ?? null,
        widthMm: dimensions[1] ?? null,
        heightMm: dimensions[2] ?? null,
        reorderPoint,
      });
      variantForm.id=variantId;
      if(variantImageFile.value)await commerce.uploadVariantImage(variantForm.productId,variantId,variantImageFile.value);
      activeModal.value = '';
      notify(wasEditing ? 'Variante e imagem atualizadas no Supabase.' : 'Variante criada com estoque inicial zero.');
    } catch (cause) {
      variantError.value = cause instanceof Error ? cause.message : 'Não foi possível salvar a variante.';
    } finally {
      variantSaving.value = false;
    }
    return;
  }

  if (activeModal.value === 'movement') {
    if (movementSaving.value) return;
    movementError.value = '';
    movementSaving.value = true;
    try {
      const variant = selectedMovementVariant.value;
      if (!variant) throw new Error('Selecione uma variante válida.');
      if (!Number.isInteger(movementQuantity.value) || movementQuantity.value < (movementType.value === 'Ajuste' ? 0 : 1)) throw new Error('Informe uma quantidade inteira válida.');
      const delta = movementType.value === 'Entrada'
        ? movementQuantity.value
        : movementType.value === 'Saída'
          ? -movementQuantity.value
          : movementQuantity.value - variant.onHand;
      if (delta === 0) throw new Error(`O estoque já está em ${variant.onHand}; não há alteração para registrar.`);
      await commerce.adjustVariantStock({ variantId: variant.id, delta, reason: `${movementReason.value}${movementNote.value.trim()?` — ${movementNote.value.trim()}`:''}`.slice(0,240) });
      activeModal.value = '';
      notify('Movimentação registrada e auditada no Supabase.');
    } catch (cause) {
      movementError.value = cause instanceof Error ? cause.message : 'Não foi possível registrar a movimentação.';
    } finally {
      movementSaving.value = false;
    }
    return;
  }

  if (modalSaving.value) return;
  operationError.value='';modalSaving.value=true;
  try {
    if(!snapshot.value)throw new Error('A loja ainda não foi carregada.');
    if(activeModal.value==='coupon'){
      await operations.saveCoupon({id:couponForm.id||undefined,code:couponForm.code,discountType:couponForm.discountType,discountValue:Number(couponForm.discountValue),minimumOrderTotal:Number(couponForm.minimumOrderTotal),usageLimit:couponForm.usageLimit.trim()?Number(couponForm.usageLimit):null,perCustomerLimit:Number(couponForm.perCustomerLimit),startsAt:couponForm.startsAt,endsAt:couponForm.endsAt},snapshot.value.store.id);
      notify('Cupom salvo e disponível para validação no checkout demonstrativo.');
    }else if(activeModal.value==='team'){
      await operations.teamAction({action:'invite',email:teamForm.email,role:teamForm.role});await refreshOperations();notify('Convite de acesso enviado pelo Supabase Auth.');
    }else if(activeModal.value==='supplier'){
      await operations.saveSupplier(snapshot.value.store.id,{id:supplierForm.id||undefined,name:supplierForm.name,contactName:supplierForm.contactName,email:supplierForm.email,phone:supplierForm.phone,leadTimeDays:supplierForm.leadTimeDays.trim()?Number(supplierForm.leadTimeDays):null});await refreshOperations();notify('Fornecedor salvo.');
    }else if(activeModal.value==='purchase'){
      await operations.createPurchaseOrder(snapshot.value.store.id,{supplierId:purchaseForm.supplierId,expectedAt:purchaseForm.expectedAt,notes:purchaseForm.notes,items:purchaseLines.value.map((item)=>({variantId:item.variantId,quantity:Number(item.quantity),unitCost:Number(item.unitCost)}))});await refreshOperations();notify('Pedido de compra criado como rascunho.');
    }else if(activeModal.value==='receive'){
      const purchase=purchaseOrders.value.find((row)=>row.id===receivingPurchaseId.value);if(!purchase)throw new Error('O pedido de compra não está mais disponível.');
      const items=purchase.items.map((item)=>({variant_id:item.variant_id,quantity:Number(receiptAmounts[item.variant_id]??0)})).filter((item)=>item.quantity>0);
      if(!items.length)throw new Error('Informe ao menos uma unidade recebida.');
      await operations.receivePurchase(purchase.id,items);await commerce.refresh(period.value);await refreshOperations();notify('Recebimento lançado, saldo de estoque e movimentação atualizados atomicamente.');
    }else if(activeModal.value==='case'){
      if(caseForm.id)await operations.transitionCase(caseForm.id,caseForm.status,caseForm.resolution,caseForm.note);
      else await operations.createCase(snapshot.value.store.id,{orderId:caseForm.orderId||null,type:caseForm.type,priority:caseForm.priority,reason:caseForm.reason});
      await refreshOperations();notify(caseForm.id?'Caso atualizado e auditado.':'Caso registrado na fila.');
    }else if(activeModal.value==='content'){
      const parsed=JSON.parse(contentForm.json) as unknown;if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('O conteúdo precisa ser um objeto JSON.');
      await operations.saveContent(contentForm.id,{title:contentForm.title,content:parsed as import('~/supabase/types/database.types').Json,status:contentForm.status,position:Number(contentForm.position)});await refreshOperations();await catalogRefresh();notify('Conteúdo salvo; a vitrine o carregará na próxima atualização.');
    }
    activeModal.value='';
  }catch(cause){operationError.value=cause instanceof Error?cause.message:'Não foi possível concluir a operação.';}
  finally{modalSaving.value=false;}
}
function handleEscape(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector<HTMLInputElement>('.admin-header-search input')?.focus(); return; }
  if (event.key === 'Escape') {
    closeOrder();
    activeModal.value = '';
    sidebarOpen.value = false;
  }
}
onMounted(() => {
  window.addEventListener('keydown', handleEscape);
  const oauthResult=route.query.me_oauth;
  if(typeof oauthResult==='string'){
    if(oauthResult==='connected'){
      notify('Conta de produção do Melhor Envio conectada.');
      void commerce.refresh(period.value).then(()=>refreshOperations()).catch(()=>notify('Conta conectada; atualize o painel para recarregar os dados.'));
    }else if(oauthResult==='denied')notify('A autorização do Melhor Envio foi cancelada.');
    else notify('Não foi possível concluir a autorização. Tente conectar novamente.');
    const query={...route.query};delete query.me_oauth;void router.replace({query});
  }
  try { const saved=localStorage.getItem('tecla-nativa:order-filter'); if(saved){const parsed=JSON.parse(saved) as {status?:string;period?:string};if(parsed.status&&['Todos os pedidos','Aguardando pagamento','A separar','Em trânsito','Entregues'].includes(parsed.status))orderFilter.value=parsed.status;if(parsed.period&&['Qualquer período','Hoje','Últimos 7 dias','Últimos 30 dias'].includes(parsed.period))orderPeriodFilter.value=parsed.period;} } catch { /* Filtros salvos são opcionais. */ }
  if (adminAuthorized.value) void commerce.refresh(period.value);
});
watch(store,(value)=>{if(value)Object.assign(profileForm,{name:value.name,email:value.support_email??'',whatsapp:value.support_whatsapp??configuredWhatsApp});},{immediate:true});
watch(snapshot,(value)=>{if(value)void operations.refresh(value.store.id,orders.value);},{immediate:true});
watch(operations.settings,()=>applySettings());
watch(period, (value) => {
  if (snapshot.value) void commerce.refreshSummary(value);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscape);
  if (toastTimer) clearTimeout(toastTimer);
});
</script>

<template>
  <div v-if="adminAuthorized" class="admin-app">
    <a class="skip-link" href="#admin-content">Pular para o conteúdo do painel</a>
    <div v-if="sidebarOpen" class="admin-nav-backdrop" @click="sidebarOpen=false"></div>
    <div class="admin-shell">
      <aside class="admin-sidebar" :class="{'is-open':sidebarOpen}" aria-label="Navegação administrativa">
        <NuxtLink class="admin-brand" to="/" target="_blank" rel="noopener noreferrer" aria-label="Tecla Nativa — abrir a vitrine">
          <span class="admin-brand-mark"><img src="/images/logo-mark.svg" alt="" width="30" height="30"></span>
          <span><strong>tecla nativa</strong><small>console de operação</small></span>
        </NuxtLink>
        <div class="admin-store-pill"><span class="admin-store-avatar"><img src="/images/logo-mark.svg" alt="" width="22" height="22"></span><span class="admin-store-name"><b>Tecla Nativa</b><small>Loja principal</small></span><span aria-hidden="true">⌄</span></div>
        <NuxtLink class="admin-storefront-link" to="/" target="_blank" rel="noopener noreferrer"><span>Abrir vitrine</span><b aria-hidden="true">↗</b></NuxtLink>
        <nav class="admin-nav" aria-label="Seções do painel">
          <section v-for="group in navigation" :key="group.label" class="admin-nav-group">
            <span class="admin-nav-label">{{group.label}}</span>
            <button v-for="item in group.items" :key="item.id" type="button" class="admin-nav-item" :class="{'is-active':section===item.id}" :aria-current="section===item.id?'page':undefined" @click="selectSection(item.id)">
              <span class="admin-nav-icon"><PanelIcon :name="item.icon" :size="17"/></span><span class="admin-nav-name">{{item.name}}</span><span v-if="item.count" class="admin-nav-count">{{item.count}}</span>
            </button>
          </section>
        </nav>
        <div class="admin-sidebar-bottom"><button type="button" class="admin-nav-item" @click="logout"><span class="admin-nav-icon"><PanelIcon name="close" :size="16"/></span><span class="admin-nav-name">Sair do painel</span></button><div class="admin-profile"><span class="admin-profile-avatar">{{accountInitials}}</span><span class="admin-profile-info"><b>{{accountLabel}}</b><small>{{accountRoleLabel}}</small></span><button class="admin-profile-menu" aria-label="Abrir configurações do perfil" @click="selectSection('settings')"><PanelIcon name="dots" :size="18"/></button></div></div>
      </aside>

      <main id="admin-content" class="admin-main">
        <header class="admin-topbar">
          <div class="admin-top-left"><button class="admin-mobile-menu" aria-label="Abrir menu do painel" :aria-expanded="sidebarOpen" @click="sidebarOpen=!sidebarOpen"><span aria-hidden="true">☰</span></button><span class="admin-breadcrumb">Console <span aria-hidden="true">/</span> <b>{{title}}</b></span><span class="admin-env"><i></i> {{storeStatusLabel}}</span></div>
          <div class="admin-top-actions">
            <label class="admin-header-search"><PanelIcon name="search" :size="15"/><input v-model="panelSearch" type="search" aria-label="Buscar nesta seção" placeholder="Buscar nesta seção"><kbd>⌘ K</kbd></label>
            <NuxtLink class="admin-button admin-storefront-toplink" to="/" target="_blank" rel="noopener noreferrer" aria-label="Abrir a vitrine Tecla Nativa em uma nova aba"><span>Abrir vitrine</span><b aria-hidden="true">↗</b></NuxtLink>
            <button class="admin-icon-btn" aria-label="Notificações operacionais" :aria-expanded="notificationsOpen" @click="notificationsOpen=!notificationsOpen"><PanelIcon name="bell" :size="16"/><span v-if="notificationItems.length" class="admin-nav-count">{{notificationItems.length}}</span></button>
            <button class="admin-icon-btn" aria-label="Abrir configurações" @click="selectSection('settings')"><PanelIcon name="settings" :size="16"/></button>
          </div>
        </header>
        <section v-if="notificationsOpen" class="admin-panel" aria-label="Notificações operacionais" style="margin:0 0 12px auto;max-width:520px">
          <div class="admin-panel-head"><div><h2>Pendências da operação</h2><p>{{notificationItems.length}} alertas baseados no banco atual</p></div><button class="admin-icon-btn" aria-label="Fechar notificações" @click="notificationsOpen=false"><PanelIcon name="close" :size="14"/></button></div>
          <div class="admin-panel-content"><div v-if="notificationItems.length" class="admin-feed"><button v-for="item in notificationItems" :key="item.id" class="admin-feed-row" style="width:100%;text-align:left;background:transparent;color:inherit;border:0;cursor:pointer" @click="openNotification(item)"><span class="admin-feed-icon"><PanelIcon name="spark" :size="13"/></span><span class="admin-feed-copy"><strong>{{item.title}}</strong><small>{{item.detail}}</small></span><PanelIcon name="chevron" :size="14"/></button></div><div v-else class="admin-empty"><strong>Nenhuma pendência no momento</strong><p>Os alertas são calculados a partir dos pedidos, estoque e verificações de integração.</p></div></div>
        </section>
        <div class="admin-page-head">
          <div>
            <span class="admin-page-eyebrow"><i></i>{{sectionInfo[section].eyebrow}}</span>
            <h1>{{title}}</h1>
            <p>{{desc}}</p>
          </div>
          <div class="admin-page-actions">
            <template v-if="section==='overview'">
              <label class="sr-only" for="period-select">Período dos indicadores</label>
              <select id="period-select" v-model="period" class="admin-select"><option>Últimos 7 dias</option><option>Últimos 30 dias</option><option>Este mês</option><option>Este trimestre</option></select>
              <button class="admin-button" @click="exportFinance"><PanelIcon name="download" :size="14"/> Exportar</button>
            </template>
            <template v-else-if="section==='products'">
              <NuxtLink class="admin-button" to="/produtos" target="_blank">Abrir vitrine</NuxtLink>
              <button class="admin-button admin-button-primary" @click="newProduct"><PanelIcon name="plus" :size="14"/> Novo produto</button>
            </template>
            <template v-else-if="section==='inventory'">
              <button class="admin-button" @click="exportInventory"><PanelIcon name="download" :size="14"/> Exportar</button>
              <button class="admin-button admin-button-primary" @click="openStockMovement()"><PanelIcon name="plus" :size="14"/> Ajustar estoque</button>
            </template>
            <template v-else-if="section==='promotions'"><button class="admin-button admin-button-primary" @click="editCoupon()"><PanelIcon name="plus" :size="14"/> Criar cupom</button></template>
            <template v-else-if="section==='team'"><button class="admin-button admin-button-primary" @click="openTeamInvite"><PanelIcon name="plus" :size="14"/> Convidar pessoa</button></template>
            <template v-else-if="section==='orders'">
              <NuxtLink class="admin-button" to="/produtos" target="_blank">Testar checkout</NuxtLink>
              <button class="admin-button" @click="exportOrders"><PanelIcon name="download" :size="14"/> Exportar CSV</button>
            </template>
            <template v-else-if="section==='customers'"><button class="admin-button" @click="exportCustomers"><PanelIcon name="download" :size="14"/> Exportar CSV</button></template>
          </div>
        </div>
        <div class="admin-demo-note" role="status"><PanelIcon name="spark" :size="15"/><span><strong>{{snapshot ? "Leitura conectada ao Supabase." : "Conexão do Supabase pendente."}}</strong> {{snapshot ? "Catálogo, estoque, pedidos, clientes e auditoria usam os registros da loja." : (dataError || "Configure as variáveis públicas do Supabase no ambiente de build.")}}</span><span v-if="store">Portfólio demonstrativo · estoque sintético · sem venda nem pagamento real.</span></div>

        <template v-if="section==='overview'">
          <section class="admin-stat-grid" aria-label="Indicadores reais da loja">
            <article v-for="metric in metrics" :key="metric.label" class="admin-stat-card" :style="{'--stat-color':metric.color}"><div class="admin-stat-top"><span>{{metric.label}}</span><span class="admin-stat-icon"><PanelIcon :name="metric.icon" :size="16"/></span></div><div class="admin-stat-value">{{metric.value}}</div><div class="admin-stat-foot"><span class="admin-delta" :class="{warn:metric.label==='Ações pendentes'}">{{metric.change}}</span><span>· {{metric.hint}}</span></div></article>
          </section>
          <div class="admin-grid-2">
            <section class="admin-panel"><div class="admin-panel-head"><div><h2>Pedidos pagos</h2><p>Pagamentos confirmados · {{period.toLowerCase()}}</p></div><span class="admin-mini-kpi"><i></i><b>{{money(paidOrderValue)}}</b></span></div><div class="admin-panel-content"><svg class="admin-chart" viewBox="0 0 410 180" role="img" aria-label="Gráfico do valor dos pedidos pagos no período selecionado"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#4ce2d2" stop-opacity=".25"/><stop offset="100%" stop-color="#4ce2d2" stop-opacity="0"/></linearGradient></defs><line v-for="y in [25,65,105,145]" :key="y" x1="3" :y1="y" x2="405" :y2="y" class="admin-chart-grid"/><polygon :points="chartArea" class="admin-chart-area"/><polyline :points="chartPoints" class="admin-chart-line"/><circle v-for="point in chartPoints.split(' ')" :key="point" :cx="Number(point.split(',')[0])" :cy="Number(point.split(',')[1])" r="2.4" class="admin-chart-dot"/><text x="4" y="174" class="admin-chart-label">{{chartLabels[0]}}</text><text x="112" y="174" class="admin-chart-label">{{chartLabels[1]}}</text><text x="224" y="174" class="admin-chart-label">{{chartLabels[2]}}</text><text x="355" y="174" class="admin-chart-label">{{chartLabels[3]}}</text></svg><div class="admin-chart-legend"><span>Pedidos pagos <b>{{money(paidOrderValue)}}</b></span><span class="admin-delta">{{paidOrders.length}} pagamentos</span></div></div></section>
            <section class="admin-panel"><div class="admin-panel-head"><div><h2>Pedidos por etapa</h2><p>Visão rápida do fluxo operacional</p></div><button class="admin-link-button" @click="selectSection('orders')">Ver pedidos →</button></div><div class="admin-panel-content"><div class="admin-pipeline"><div v-for="stage in pipelineStages" :key="stage.label" class="admin-pipeline-item"><span>{{stage.label}}</span><span class="admin-pipeline-track"><span class="admin-pipeline-fill" :style="{width:stage.width,'--bar-color':stage.color}"></span></span><b>{{stage.count}}</b></div></div><div class="admin-insight"><span class="admin-insight-icon"><PanelIcon name="spark" :size="15"/></span><div><strong>{{actionsPending}} itens precisam de atenção</strong><p>Contagem baseada nos pedidos carregados e no estoque registrado.</p></div></div></div></section>
          </div>
          <div class="admin-grid-2">
            <section class="admin-panel"><div class="admin-panel-head"><div><h2>Pedidos recentes</h2><p>Mais recentes primeiro · clique para ver o detalhe completo</p></div><button class="admin-link-button" @click="selectSection('orders')">Ver todos →</button></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Pagamento</th><th>Total</th><th></th></tr></thead><tbody><tr v-for="order in orders.slice(0,5)" :key="order.id" tabindex="0" @click="showOrder(order.id)" @keydown.enter="showOrder(order.id)"><td><strong class="admin-order-id">{{order.id}}</strong></td><td><strong>{{order.customer}}</strong><small>{{order.email}}</small></td><td>{{order.date}}</td><td><span class="admin-badge" :class="paymentClass(order.payment)">{{order.payment}}</span></td><td><strong>{{money(order.total)}}</strong></td><td><button class="admin-icon-btn" :aria-label="`Abrir pedido ${order.id}`" @click.stop="showOrder(order.id)"><PanelIcon name="chevron" :size="15"/></button></td></tr></tbody></table></div></section>
            <section class="admin-panel"><div class="admin-panel-head"><div><h2>Estoque para acompanhar</h2><p>Variantes no limite ou abaixo dele</p></div><button class="admin-link-button" @click="selectSection('inventory')">Abrir estoque →</button></div><div class="admin-panel-content"><div v-if="lowStockProducts.length" class="admin-alert-list"><div v-for="product in lowStockProducts.slice(0,4)" :key="product.id" class="admin-alert-item"><span class="admin-alert-bar"></span><span class="admin-alert-copy"><strong>{{product.name}}</strong><small>{{product.sku}} · mínimo {{product.minStock}} un.</small></span><b class="admin-alert-count">{{product.stock}} un.</b></div></div><div v-else class="admin-empty"><strong>Estoque em dia</strong><p>Nenhum produto está abaixo do limite.</p></div></div></section>
          </div>
            <section class="admin-panel" style="margin-top:13px"><div class="admin-panel-head"><div><h2>Atividade recente</h2><p>Últimas alterações registradas no banco</p></div><button class="admin-link-button" @click="selectSection('activity')">Ver histórico →</button></div><div class="admin-panel-content"><div class="admin-feed"><div v-for="activity in activities" :key="activity.id" class="admin-feed-row"><span class="admin-feed-icon"><PanelIcon name="clock" :size="14"/></span><span class="admin-feed-copy"><strong>{{activity.title}}</strong><small>{{activity.description}}</small></span><span class="admin-feed-time">{{activityDate(activity.createdAt)}}</span></div><div v-if="!activities.length" class="admin-empty"><strong>Sem atividade registrada</strong><p>As próximas alterações auditadas aparecerão aqui.</p></div></div></div></section>
        </template>

        <template v-else-if="section==='orders'">
          <section class="admin-stat-grid" aria-label="Resumo de pedidos"><article v-for="stat in orderStats" :key="stat.label" class="admin-stat-card" :style="{'--stat-color':stat.color}"><div class="admin-stat-top"><span>{{stat.label}}</span><span class="admin-stat-icon"><PanelIcon name="bag" :size="15"/></span></div><div class="admin-stat-value">{{stat.value}}</div><div class="admin-stat-foot">Pedidos persistidos no Supabase</div></article></section>
          <section class="admin-panel" style="margin-top:13px">
            <div class="admin-toolbar">
              <label class="admin-toolbar-search"><PanelIcon name="search" :size="14"/><input class="admin-input" v-model="searchTerm" aria-label="Buscar pedido por número ou cliente" placeholder="Pedido, nome, e-mail ou telefone"></label>
              <label class="sr-only" for="order-filter">Filtrar pedidos</label><select id="order-filter" v-model="orderFilter" class="admin-select"><option>Todos os pedidos</option><option>Aguardando pagamento</option><option>A separar</option><option>Em trânsito</option><option>Entregues</option></select>
              <label class="sr-only" for="order-period">Período</label><select id="order-period" v-model="orderPeriodFilter" class="admin-select"><option>Qualquer período</option><option>Hoje</option><option>Últimos 7 dias</option><option>Últimos 30 dias</option></select>
              <span class="admin-toolbar-spacer"></span><button class="admin-button admin-button-sm" @click="saveOrderFilter">Salvar filtro</button><button class="admin-button admin-button-sm" @click="exportOrders"><PanelIcon name="download" :size="13"/> Exportar CSV</button>
            </div>
            <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Pagamento</th><th>Preparação</th><th>Frete</th><th>Total</th><th></th></tr></thead><tbody>
              <tr v-for="order in visibleOrders" :key="order.id" tabindex="0" @click="showOrder(order.id)" @keydown.enter="showOrder(order.id)" @keydown.space.prevent="showOrder(order.id)"><td><strong class="admin-order-id">{{order.id}}</strong><small>{{order.items.length}} {{order.items.length===1?'item':'itens'}}</small></td><td><strong>{{order.customer}}</strong><small>{{order.email}}</small></td><td>{{order.date}}</td><td><span class="admin-badge" :class="paymentClass(order.payment)">{{order.payment}}</span></td><td><span class="admin-badge" :class="orderStatusClass(order.status)">{{order.status}}</span></td><td>{{money(order.shippingTotal)}}</td><td><strong>{{money(order.total)}}</strong></td><td><button class="admin-icon-btn" :aria-label="'Ver detalhes do pedido '+order.id" @click.stop="showOrder(order.id)"><PanelIcon name="chevron" :size="15"/></button></td></tr>
              <tr v-if="!visibleOrders.length"><td colspan="8"><div class="admin-empty"><strong>Nenhum pedido encontrado</strong><p>Os filtros consultam somente os pedidos carregados do banco.</p></div></td></tr>
            </tbody></table></div><div class="admin-pagination"><span>{{visibleOrders.length}} pedidos visíveis · até 100 registros recentes carregados</span></div>
          </section>
        </template>

        <template v-else-if="section==='products'">
          <section class="admin-stat-grid" aria-label="Resumo do catálogo"><article v-for="stat in productStats" :key="stat.label" class="admin-stat-card" :style="{'--stat-color':stat.color}"><div class="admin-stat-top">{{stat.label}}<span class="admin-stat-icon"><PanelIcon name="box" :size="15"/></span></div><div class="admin-stat-value">{{stat.value}}</div><div class="admin-stat-foot">Catálogo consultado no Supabase</div></article></section>
          <section class="admin-panel" style="margin-top:13px">
            <div class="admin-toolbar"><label class="admin-toolbar-search"><PanelIcon name="search" :size="14"/><input class="admin-input" v-model="productSearch" aria-label="Buscar produtos" placeholder="Nome, SKU ou categoria"></label>
              <label class="sr-only" for="product-category">Filtrar categoria</label><select id="product-category" v-model="productCategory" class="admin-select"><option v-for="category in categories" :key="category">{{category}}</option></select>
              <div class="admin-section-tabs"><button v-for="tab in ['Todos','Publicados','Rascunhos','Arquivados','Com estoque baixo']" :key="tab" :class="{active:selectedTab===tab}" @click="selectedTab=tab">{{tab}}</button></div>
              <span class="admin-toolbar-spacer"></span><span v-if="selectedProductIds.length" class="admin-badge badge-blue">{{selectedProductIds.length}} selecionados</span>
              <input ref="productCsvInput" type="file" accept=".csv,text/csv" hidden @change="importProductsCsv"><button class="admin-button admin-button-sm" :disabled="productImporting" @click="openProductImport">{{productImporting?'Importando…':'Importar CSV'}}</button><button class="admin-button admin-button-sm" @click="exportProducts"><PanelIcon name="download" :size="13"/> Exportar CSV</button>
            </div>
            <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th><input class="admin-table-check" type="checkbox" aria-label="Selecionar produtos desta página" :checked="allVisibleProductsSelected" @change="toggleVisibleProductSelection"></th><th>Produto</th><th>SKU base</th><th>Categoria</th><th>Variantes</th><th>Preço inicial</th><th>Disponível</th><th>Status</th><th>Ações</th></tr></thead><tbody>
              <tr v-for="product in paginatedProducts" :key="product.id"><td><input class="admin-table-check" type="checkbox" :checked="selectedProductIds.includes(product.id)" :aria-label="'Selecionar '+product.name" @change="toggleVisibleProductSelectionForOne($event,product.id)"></td><td><span class="admin-cell-product"><span class="admin-thumb"><img :src="product.image" alt="" loading="lazy"></span><span><strong>{{product.name}}</strong><small>{{product.featured?'Em destaque':'Catálogo'}}</small></span></span></td><td>{{product.sku}}</td><td>{{product.category}}</td><td>{{product.variants}} opções</td><td><strong>{{money(product.price)}}</strong></td><td><span class="admin-badge" :class="product.stock<=product.minStock?'badge-orange':'badge-green'">{{product.stock}} un.</span></td><td><span class="admin-badge" :class="product.status==='published'?'badge-green':product.status==='archived'?'badge-gray':'badge-orange'">{{product.status==='published'?'Publicado':product.status==='archived'?'Arquivado':'Rascunho'}}</span></td><td><div class="admin-inline-actions"><button class="admin-icon-btn" :aria-label="'Editar '+product.name" @click="editProduct(product)"><PanelIcon name="settings" :size="14"/></button><button class="admin-button admin-button-sm" :aria-label="'Adicionar variante a '+product.name" @click="newVariant(product.id)">Variante</button><select class="admin-select" :value="product.status" :aria-label="'Status de publicação de '+product.name" @change="setProductStatusFromEvent($event,product)"><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="archived">Arquivado</option></select></div></td></tr>
              <tr v-if="!filteredProducts.length"><td colspan="9"><div class="admin-empty"><strong>Nenhum produto encontrado</strong><p>Ajuste os filtros ou importe CSV; novos produtos começam como rascunho.</p></div></td></tr>
            </tbody></table></div><div class="admin-pagination"><span>{{filteredProducts.length}} produtos · página {{productPage}} de {{productPageCount}}</span><span class="admin-pagination-actions"><button :disabled="productPage===1" aria-label="Página anterior" @click="productPage--">‹</button><button v-for="page in productPageCount" :key="page" :class="{current:productPage===page}" :aria-current="productPage===page?'page':undefined" @click="productPage=page">{{page}}</button><button :disabled="productPage===productPageCount" aria-label="Próxima página" @click="productPage++">›</button></span></div>
            <p class="admin-demo-note">CSV usa o modelo exportado. Importações são salvas como rascunho; publicar segue as validações do servidor.</p>
          </section>
        </template>

        <template v-else-if="section==='inventory'">
          <section class="admin-stat-grid" aria-label="Resumo do estoque"><article v-for="stat in inventoryStats" :key="stat.label" class="admin-stat-card" :style="{'--stat-color':stat.color}"><div class="admin-stat-top">{{stat.label}}<span class="admin-stat-icon"><PanelIcon name="box" :size="15"/></span></div><div class="admin-stat-value">{{stat.value}}</div><div class="admin-stat-foot">Saldo e reservas por variante</div></article></section>
          <section class="admin-panel" style="margin-top:13px"><div class="admin-panel-head"><div><h2>Estoque por variante</h2><p>Quantidade, reserva e mínimo vêm do banco.</p></div><button class="admin-button admin-button-sm" @click="exportInventory"><PanelIcon name="download" :size="13"/> Exportar CSV</button></div>
            <div class="admin-toolbar"><label class="admin-toolbar-search"><PanelIcon name="search" :size="14"/><input v-model="productSearch" class="admin-input" aria-label="Buscar variante" placeholder="Produto, cor ou SKU"></label><label class="sr-only" for="inventory-level">Filtrar estoque</label><select id="inventory-level" v-model="inventoryLevelFilter" class="admin-select"><option>Todos os níveis</option><option>Estoque baixo</option><option>Sem estoque</option></select><span class="admin-toolbar-spacer"></span><button class="admin-button admin-button-primary admin-button-sm" :disabled="!variantRows.length" @click="openStockMovement()"><PanelIcon name="plus" :size="13"/> Movimentar estoque</button></div>
            <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Produto / cor</th><th>SKU</th><th>Em mãos</th><th>Reservado</th><th>Disponível</th><th>Mínimo</th><th></th></tr></thead><tbody>
              <tr v-for="variant in visibleInventoryVariants" :key="variant.id"><td><span class="admin-cell-product"><span class="admin-thumb"><img :src="variant.image" alt="" loading="lazy"></span><span><strong>{{variant.product}}</strong><small>{{variant.color}}</small></span></span></td><td>{{variant.sku}}</td><td>{{variant.onHand}}</td><td>{{variant.reserved}}</td><td><span class="admin-badge" :class="variant.stock===0?'badge-red':variant.stock<=variant.minStock?'badge-orange':'badge-green'">{{variant.stock}}</span></td><td>{{variant.minStock}}</td><td><button class="admin-button admin-button-sm" @click="openStockMovement(variant)">Ajustar</button></td></tr>
              <tr v-if="!visibleInventoryVariants.length"><td colspan="7"><div class="admin-empty"><strong>Nenhuma variante encontrada</strong><p>Confira a busca e o filtro de estoque.</p></div></td></tr>
            </tbody></table></div>
          </section>
          <div class="admin-grid-2" style="margin-top:13px"><section class="admin-panel"><div class="admin-panel-head"><div><h2>Alertas de reposição</h2><p>Variantes no mínimo ou abaixo dele</p></div><span class="admin-badge badge-orange">{{lowStockVariants.length}} alertas</span></div><div class="admin-panel-content"><div class="admin-alert-list"><div v-for="variant in lowStockVariants.slice(0,8)" :key="variant.id" class="admin-alert-item"><span class="admin-alert-bar"></span><span class="admin-alert-copy"><strong>{{variant.product}} · {{variant.color}}</strong><small>{{variant.sku}} · mínimo {{variant.minStock}}</small></span><b class="admin-alert-count">{{variant.stock}}</b></div><div v-if="!lowStockVariants.length" class="admin-empty"><strong>Estoque acima dos mínimos</strong><p>Nenhuma variante em alerta.</p></div></div></div></section>
            <section class="admin-panel"><div class="admin-panel-head"><div><h2>Últimas movimentações</h2><p>Alterações auditadas no Supabase</p></div><button class="admin-link-button" @click="selectSection('activity')">Ver auditoria →</button></div><div class="admin-panel-content"><div class="admin-feed"><div v-for="movement in movements" :key="movement.id" class="admin-feed-row"><span class="admin-feed-icon"><PanelIcon name="box" :size="13"/></span><span class="admin-feed-copy"><strong>{{movement.product}} · {{movement.sku}}</strong><small>{{movement.type}} · {{movement.quantity>0?'+':''}}{{movement.quantity}} un. · {{movement.reason}}</small></span><span class="admin-feed-time">{{activityDate(movement.createdAt)}}</span></div><div v-if="!movements.length" class="admin-empty"><strong>Sem movimentações</strong><p>Entradas, saídas e ajustes aparecerão aqui.</p></div></div></div></section>
          </div>
        </template>

        <template v-else-if="section==='shipping'">
          <section class="admin-stat-grid"><article v-for="stat in shippingStats" :key="stat.label" class="admin-stat-card" :style="{'--stat-color':stat.color}"><div class="admin-stat-top">{{stat.label}}<span class="admin-stat-icon"><PanelIcon name="truck" :size="15"/></span></div><div class="admin-stat-value">{{stat.value}}</div><div class="admin-stat-foot">Pedidos pagos carregados do Supabase</div></article></section>
          <div class="admin-section-tabs" style="padding:12px 0 4px"><button v-for="tab in ['Todos','A separar','Prontos para envio','Em trânsito','Entregues']" :key="tab" :class="{active:shippingFilter===tab}" @click="shippingFilter=tab">{{tab}}</button></div>
          <section class="admin-panel"><div class="admin-toolbar"><label class="admin-toolbar-search"><PanelIcon name="search" :size="14"/><input class="admin-input" v-model="searchTerm" placeholder="Pedido, cliente ou e-mail" aria-label="Buscar expedição"></label><span class="admin-toolbar-spacer"></span><button class="admin-button admin-button-sm" @click="commerce.refresh(period);refreshOperations()">Atualizar dados</button></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Pedido / destinatário</th><th>Itens</th><th>Serviço cotado</th><th>Frete</th><th>Etapa</th><th>Rastreio</th><th></th></tr></thead><tbody><tr v-for="order in filteredShippingOrders" :key="order.orderUuid"><td><strong class="admin-order-id">{{order.id}}</strong><small>{{order.customer}} · {{order.city.split(' · ')[0]}}</small></td><td>{{order.items.reduce((sum,item)=>sum+item.qty,0)}} un.</td><td>{{order.carrier}} · {{order.shippingService}}</td><td>{{money(order.shippingTotal)}}</td><td><span class="admin-badge" :class="order.shipping==='Entregue'?'badge-green':order.shipping==='Aguardando'?'badge-orange':'badge-blue'">{{order.shipping}}</span></td><td><a v-if="order.trackingUrl" :href="order.trackingUrl" target="_blank" rel="noopener noreferrer">{{order.tracking||'Abrir rastreio'}} ↗</a><span v-else>{{order.tracking||'Sem código'}}</span></td><td><button class="admin-button admin-button-sm" @click="showOrder(order.id)">Gerenciar</button></td></tr><tr v-if="!filteredShippingOrders.length"><td colspan="7"><div class="admin-empty"><strong>Nenhum envio nesta etapa</strong><p>Pedidos pagos aparecem conforme avançam no fluxo.</p></div></td></tr></tbody></table></div></section>
          <section class="admin-panel" style="margin-top:13px"><div class="admin-panel-head"><div><h2>Fluxo de expedição da demonstração</h2><p>O valor de frete fica no pedido; etiqueta não é comprada nem emitida.</p></div><span class="admin-badge badge-purple">Cotação apenas</span></div><div class="admin-panel-content"><div class="admin-pipeline"><div v-for="stage in pipelineStages" :key="stage.label" class="admin-pipeline-item"><span>{{stage.label}}</span><span class="admin-pipeline-track"><span class="admin-pipeline-fill" :style="{width:stage.width,'--bar-color':stage.color}"></span></span><b>{{stage.count}}</b></div></div></div></section>
        </template>

        <template v-else-if="section==='promotions'">
  <section class="admin-stat-grid"><article v-for="stat in couponStats" :key="stat.label" class="admin-stat-card" :style="{'--stat-color':stat.color}"><div class="admin-stat-top">{{stat.label}}<span class="admin-stat-icon"><PanelIcon name="tag" :size="15"/></span></div><div class="admin-stat-value">{{stat.value}}</div><div class="admin-stat-foot">Dados de cupons e pedidos do Supabase</div></article></section>
  <section class="admin-panel" style="margin-top:13px"><div class="admin-panel-head"><div><h2>Cupons da loja</h2><p>Descontos, limites, validade e utilização persistidos.</p></div><select v-model="couponFilter" class="admin-select" aria-label="Filtrar cupons"><option>Todos os cupons</option><option>Ativos</option><option>Pausados</option><option>Rascunhos</option></select></div>
    <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Código</th><th>Desconto</th><th>Pedido mínimo</th><th>Usos</th><th>Vigência</th><th>Status</th><th>Ações</th></tr></thead><tbody>
      <tr v-for="coupon in filteredCoupons" :key="coupon.id"><td><strong class="admin-order-id">{{coupon.code}}</strong></td><td>{{couponDiscountLabel(coupon)}}</td><td>{{money(Number(coupon.minimum_order_total))}}</td><td>{{coupon.redemptions}}{{coupon.usage_limit===null?'':' / '+coupon.usage_limit}}</td><td>{{coupon.starts_at?activityDate(coupon.starts_at):'Sem início'}} – {{coupon.ends_at?activityDate(coupon.ends_at):'Sem fim'}}</td><td><span class="admin-badge" :class="coupon.status==='active'?'badge-green':coupon.status==='paused'?'badge-orange':'badge-gray'">{{couponStatusLabel(coupon.status)}}</span></td><td><div class="admin-inline-actions"><button class="admin-icon-btn" :aria-label="'Editar '+coupon.code" @click="editCoupon(coupon)"><PanelIcon name="settings" :size="14"/></button><button class="admin-button admin-button-sm" @click="toggleCoupon(coupon)">{{coupon.status==='active'?'Pausar':'Ativar'}}</button></div></td></tr>
      <tr v-if="!filteredCoupons.length"><td colspan="7"><div class="admin-empty"><strong>Nenhum cupom encontrado</strong><p>Crie um cupom para demonstrar o desconto no checkout de portfólio.</p></div></td></tr>
    </tbody></table></div>
    <div class="admin-insight" style="margin:12px"><span class="admin-insight-icon"><PanelIcon name="shield" :size="15"/></span><div><strong>O servidor confere os limites no checkout</strong><p>O painel não aplica cupom fora das regras nem contabiliza reservas como pagamento confirmado.</p></div></div>
  </section>
</template>

        <template v-else-if="section==='finance'">
          <section class="admin-stat-grid"><article v-for="stat in financeStats" :key="stat.label" class="admin-stat-card" :style="{'--stat-color':stat.color}"><div class="admin-stat-top">{{stat.label}}<span class="admin-stat-icon"><PanelIcon name="chart" :size="15"/></span></div><div class="admin-stat-value">{{stat.value}}</div><div class="admin-stat-foot">Valores confirmados nos dados disponíveis</div></article></section>
          <section class="admin-panel" style="margin-top:13px"><div class="admin-panel-head"><div><h2>Pedidos e cobranças</h2><p>Valores reais do banco; taxas só aparecem quando houver lançamento financeiro confirmado.</p></div><button class="admin-button admin-button-sm" @click="exportFinance"><PanelIcon name="download" :size="14"/> Exportar CSV</button></div><div class="admin-toolbar"><label class="admin-toolbar-search"><PanelIcon name="search" :size="14"/><input v-model="searchTerm" class="admin-input" aria-label="Buscar pagamentos" placeholder="Pedido, cliente ou transação"></label><span class="admin-toolbar-spacer"></span><span class="admin-badge badge-purple">PagBank Sandbox</span></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Pedido / cliente</th><th>Gateway</th><th>Status</th><th>Bruto</th><th>Frete</th><th>Desconto</th><th>Total</th><th>Data</th></tr></thead><tbody><tr v-for="row in recentPayments.filter(({order})=>!searchTerm||(order.id+' '+order.customer+' '+order.email).toLowerCase().includes(searchTerm.toLowerCase()))" :key="row.order.orderUuid" @click="showOrder(row.order.id)"><td><strong class="admin-order-id">{{row.order.id}}</strong><small>{{row.order.customer}} · {{row.order.email}}</small></td><td>{{row.payment?.provider?.toUpperCase()||row.order.method}}</td><td><span class="admin-badge" :class="paymentClass(row.order.payment)">{{row.order.payment}}</span></td><td>{{money(row.order.subtotal)}}</td><td>{{money(row.order.shippingTotal)}}</td><td>{{money(row.order.discount)}}</td><td><strong>{{money(row.order.total)}}</strong></td><td>{{row.order.date}}</td></tr><tr v-if="!recentPayments.length"><td colspan="8"><div class="admin-empty"><strong>Sem pagamentos registrados</strong><p>Pedidos criados no checkout e eventos PagBank aparecerão aqui.</p></div></td></tr></tbody></table></div></section>
          <section class="admin-panel" style="margin-top:13px"><div class="admin-panel-head"><div><h2>Lançamentos financeiros confirmados</h2><p>Taxas e estornos não são estimados pelo painel.</p></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Pedido</th><th>Tipo</th><th>Valor</th><th>Data</th><th>Referência do gateway</th></tr></thead><tbody><tr v-for="row in transactionRows" :key="row.order_id+row.kind+row.effective_at"><td>{{orders.find((item)=>item.orderUuid===row.order_id)?.id||row.order_id.slice(0,8)}}</td><td>{{row.kind}}</td><td>{{money(Number(row.amount))}}</td><td>{{activityDate(row.effective_at)}}</td><td>{{row.provider_transaction_id||'—'}}</td></tr><tr v-if="!transactionRows.length"><td colspan="5"><div class="admin-empty"><strong>Nenhum lançamento financeiro confirmado</strong><p>O webhook precisa registrar a movimentação para haver conciliação.</p></div></td></tr></tbody></table></div></section>
        </template>

        <template v-else-if="section==='returns'">
          <section class="admin-stat-grid"><article v-for="stat in caseStats" :key="stat.label" class="admin-stat-card" :style="{'--stat-color':stat.color}"><div class="admin-stat-top">{{stat.label}}<span class="admin-stat-icon"><PanelIcon name="users" :size="15"/></span></div><div class="admin-stat-value">{{stat.value}}</div><div class="admin-stat-foot">Fila de atendimento persistida</div></article></section>
          <section class="admin-panel" style="margin-top:13px"><div class="admin-panel-head"><div><h2>Fila de pós-venda</h2><p>Casos ligados a clientes e pedidos do Supabase.</p></div><select v-model="caseStatusFilter" class="admin-select" aria-label="Filtrar status dos casos"><option>Todos os status</option><option>Novo</option><option>Em análise</option><option>Aguardando cliente</option><option>Resolvido</option><option>Fechado</option></select></div><div class="admin-toolbar"><label class="admin-toolbar-search"><PanelIcon name="search" :size="14"/><input v-model="searchTerm" class="admin-input" aria-label="Buscar casos" placeholder="Caso, pedido ou cliente"></label><span class="admin-toolbar-spacer"></span><button class="admin-button admin-button-primary admin-button-sm" @click="openCase()"><PanelIcon name="plus" :size="14"/> Registrar caso</button></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Caso / pedido</th><th>Cliente</th><th>Tipo e motivo</th><th>Aberto em</th><th>Prioridade</th><th>Status</th><th></th></tr></thead><tbody><tr v-for="ticket in filteredCases.filter((item)=>!searchTerm||(item.case_number+' '+item.orderNumber+' '+item.customer+' '+item.reason).toLowerCase().includes(searchTerm.toLowerCase()))" :key="ticket.id"><td><strong class="admin-order-id">{{ticket.case_number}}</strong><small>{{ticket.orderNumber}}</small></td><td>{{ticket.customer}}</td><td>{{ticket.case_type}} · {{ticket.reason}}</td><td>{{activityDate(ticket.created_at)}}</td><td>{{ticket.priority}}</td><td><span class="admin-badge" :class="['resolved','closed'].includes(ticket.status)?'badge-green':ticket.status==='new'?'badge-blue':'badge-orange'">{{caseStatusLabel(ticket.status)}}</span></td><td><button class="admin-button admin-button-sm" @click="openCase(ticket)">Gerenciar</button></td></tr><tr v-if="!filteredCases.length"><td colspan="7"><div class="admin-empty"><strong>Nenhum caso registrado</strong><p>Registre uma solicitação para abrir a fila de atendimento.</p></div></td></tr></tbody></table></div></section>
        </template>

        <template v-else-if="section==='purchasing'">
          <section class="admin-stat-grid"><article v-for="stat in purchaseStats" :key="stat.label" class="admin-stat-card" :style="{'--stat-color':stat.color}"><div class="admin-stat-top">{{stat.label}}<span class="admin-stat-icon"><PanelIcon name="box" :size="15"/></span></div><div class="admin-stat-value">{{stat.value}}</div><div class="admin-stat-foot">Ordens e itens de compra do banco</div></article></section>
          <section class="admin-panel" style="margin-top:13px"><div class="admin-panel-head"><div><h2>Pedidos de compra</h2><p>Recebimentos atualizam estoque e histórico em uma transação.</p></div><button class="admin-button admin-button-primary admin-button-sm" @click="openPurchase"><PanelIcon name="plus" :size="14"/> Nova compra</button></div><div class="admin-toolbar"><label class="admin-toolbar-search"><PanelIcon name="search" :size="14"/><input v-model="searchTerm" class="admin-input" aria-label="Buscar compras" placeholder="Número ou fornecedor"></label><span class="admin-toolbar-spacer"></span><button class="admin-button admin-button-sm" @click="openSupplier()"><PanelIcon name="plus" :size="14"/> Novo fornecedor</button></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Pedido</th><th>Fornecedor</th><th>Itens</th><th>Criado</th><th>Previsão</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody><tr v-for="purchase in purchaseOrders.filter((row)=>!searchTerm||(row.purchase_number+' '+row.supplier).toLowerCase().includes(searchTerm.toLowerCase()))" :key="purchase.id"><td><strong class="admin-order-id">{{purchase.purchase_number}}</strong></td><td>{{purchase.supplier}}</td><td>{{purchase.items.length}} linhas · {{purchase.items.reduce((sum,item)=>sum+item.quantity_ordered,0)}} un.</td><td>{{activityDate(purchase.created_at)}}</td><td>{{purchase.expected_at?activityDate(purchase.expected_at):'Não definida'}}</td><td>{{money(Number(purchase.subtotal))}}</td><td><span class="admin-badge" :class="purchase.status==='received'?'badge-green':purchase.status==='cancelled'?'badge-gray':'badge-orange'">{{purchaseStatusLabel(purchase.status)}}</span></td><td><div class="admin-inline-actions"><button v-if="purchase.status==='draft'" class="admin-button admin-button-sm" @click="changePurchaseStatus(purchase,'sent')">Marcar enviada</button><button v-if="['sent','partially_received'].includes(purchase.status)" class="admin-button admin-button-sm" @click="openReceiving(purchase)">Receber</button><button v-if="['draft','sent'].includes(purchase.status)" class="admin-icon-btn" aria-label="Cancelar pedido de compra" @click="changePurchaseStatus(purchase,'cancelled')"><PanelIcon name="close" :size="14"/></button></div></td></tr><tr v-if="!purchaseOrders.length"><td colspan="8"><div class="admin-empty"><strong>Nenhum pedido de compra</strong><p>Cadastre fornecedores e registre uma ordem para movimentar estoque.</p></div></td></tr></tbody></table></div></section>
          <section class="admin-panel" style="margin-top:13px"><div class="admin-panel-head"><div><h2>Fornecedores</h2><p>Contatos e prazo médio registrados no banco.</p></div></div><div class="admin-panel-content"><div class="admin-feed"><div v-for="supplier in suppliers" :key="supplier.id" class="admin-feed-row"><span class="admin-feed-icon"><PanelIcon name="box" :size="13"/></span><span class="admin-feed-copy"><strong>{{supplier.name}}</strong><small>{{supplier.contact_name||'Sem contato'}} · {{supplier.email||'Sem e-mail'}} · {{supplier.lead_time_days===null?'Prazo não informado':supplier.lead_time_days+' dias'}}</small></span><button class="admin-link-button" @click="openSupplier(supplier)">Editar</button></div><div v-if="!suppliers.length" class="admin-empty"><strong>Nenhum fornecedor cadastrado</strong><p>Adicione fornecedores para poder criar pedidos de compra.</p></div></div></div></section>
        </template>

        <template v-else-if="section==='variants'">
          <section class="admin-stat-grid"><article class="admin-stat-card" v-for="stat in [{label:'Variantes cadastradas',value:String(variantRows.length),color:'var(--a-cyan)'},{label:'Opções de cor',value:String(new Set(variantRows.map(v=>v.color)).size),color:'var(--a-violet)'},{label:'Abaixo do mínimo',value:String(variantRows.filter(v=>v.stock<=v.minStock).length),color:'var(--a-orange)'},{label:'Logística incompleta',value:String(variantRows.filter(v=>!v.weightGrams||!v.lengthMm||!v.widthMm||!v.heightMm).length),color:'var(--a-blue)'}]" :key="stat.label" :style="{'--stat-color':stat.color}"><div class="admin-stat-top">{{stat.label}}<span class="admin-stat-icon"><PanelIcon name="tag" :size="15"/></span></div><div class="admin-stat-value">{{stat.value}}</div><div class="admin-stat-foot">Dados carregados do Supabase</div></article></section>
          <section class="admin-panel" style="margin-top:13px"><div class="admin-panel-head"><div><h2>Variantes e SKUs</h2><p>Cor, preço, imagem e medidas vinculados ao SKU individual</p></div><button class="admin-button admin-button-primary admin-button-sm" :disabled="!productRows.length" @click="newVariant()"><PanelIcon name="plus" :size="14"/> Nova variante</button></div><div class="admin-toolbar"><label class="admin-toolbar-search"><PanelIcon name="search" :size="14"/><input v-model="searchTerm" class="admin-input" aria-label="Buscar variantes" placeholder="Produto, cor ou SKU"></label><span class="admin-toolbar-spacer"></span><button class="admin-button admin-button-sm" :disabled="!variantRows.length" @click="openStockMovement()"><PanelIcon name="plus" :size="13"/> Movimentar estoque</button></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Produto / variante</th><th>SKU da variante</th><th>Preço</th><th>Disponível</th><th>Peso</th><th>Dimensões</th><th>Situação</th><th>Ações</th></tr></thead><tbody><tr v-for="variant in visibleVariants.slice(0,30)" :key="variant.id"><td><span class="admin-cell-product"><span class="admin-thumb"><img :src="variant.image" alt="" loading="lazy"></span><span><strong>{{variant.product}}</strong><small><i :style="{display:'inline-block',width:'8px',height:'8px',borderRadius:'50%',background:variant.swatchHex||'#697586',marginRight:'5px'}"></i>{{variant.color}} · {{variant.onHand}} em mãos / {{variant.reserved}} reservadas</small></span></span></td><td><strong>{{variant.sku}}</strong></td><td>{{money(variant.price)}}</td><td><span class="admin-badge" :class="variant.stock===0?'badge-red':variant.stock<=variant.minStock?'badge-orange':'badge-green'">{{variant.stock}} un.</span></td><td>{{variant.weight}}</td><td>{{variant.dimensions}}</td><td><span class="admin-badge" :class="variant.stock===0?'badge-red':variant.stock<=variant.minStock?'badge-orange':'badge-green'">{{variant.stock===0?'Sem estoque':variant.stock<=variant.minStock?'Estoque baixo':'Em estoque'}}</span></td><td><div class="admin-inline-actions"><button class="admin-icon-btn" :aria-label="`Editar variante ${variant.sku}`" @click="editVariant(variant)"><PanelIcon name="settings" :size="14"/></button><button class="admin-button admin-button-sm" @click="openStockMovement(variant)">Estoque</button></div></td></tr><tr v-if="!visibleVariants.length"><td colspan="8"><div class="admin-empty"><strong>Nenhuma variante encontrada</strong><p>{{searchTerm?'Ajuste o texto da busca.':'Cadastre a primeira variante para este catálogo.'}}</p></div></td></tr></tbody></table></div><div class="admin-pagination"><span>Mostrando {{Math.min(30,visibleVariants.length)}} de {{visibleVariants.length}} variantes carregadas</span></div></section>
          <div class="admin-insight" style="margin-top:13px"><span class="admin-insight-icon"><PanelIcon name="shield" :size="15"/></span><div><strong>Estoque inicial sempre zerado</strong><p>Entradas e saídas geram movimentação com responsável, motivo, horário e proteção contra repetição da mesma solicitação. SKU e chave da opção permanecem estáveis depois da criação.</p></div></div>
        </template>

        <template v-else-if="section==='customers'">
          <section class="admin-stat-grid"><article class="admin-stat-card" v-for="stat in customerStats" :key="stat.label" :style="{'--stat-color':stat.color}"><div class="admin-stat-top">{{stat.label}}<span class="admin-stat-icon"><PanelIcon name="users" :size="15"/></span></div><div class="admin-stat-value">{{stat.value}}</div><div class="admin-stat-foot">Dados consultados no Supabase</div></article></section>
          <section class="admin-panel" style="margin-top:13px"><div class="admin-toolbar"><label class="admin-toolbar-search"><PanelIcon name="search" :size="14"/><input class="admin-input" v-model="searchTerm" placeholder="Nome, e-mail ou telefone" aria-label="Buscar clientes"></label><span class="admin-toolbar-spacer"></span><span class="admin-pagination">Dados pessoais visíveis somente a membros autorizados</span></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Cliente</th><th>E-mail</th><th>Telefone</th><th>Cadastro</th><th>Identificador</th></tr></thead><tbody><tr v-for="customer in customers.filter(item => !searchTerm || (item.name + ' ' + item.email + ' ' + item.phone).toLowerCase().includes(searchTerm.toLowerCase()))" :key="customer.id"><td><strong>{{customer.name}}</strong></td><td>{{customer.email}}</td><td>{{customer.phone}}</td><td>{{activityDate(customer.createdAt)}}</td><td><small>{{customer.id.slice(0, 8)}}</small></td></tr><tr v-if="!customers.length"><td colspan="5"><div class="admin-empty"><strong>Nenhum cliente cadastrado</strong><p>Os clientes aparecerão aqui quando houver cadastros reais.</p></div></td></tr></tbody></table></div></section>
        </template>

        <template v-else-if="section==='content'">
          <section class="admin-panel"><div class="admin-panel-head"><div><h2>Seções editáveis da vitrine</h2><p>Altere chamadas, benefícios e campanhas usados na página inicial.</p></div><NuxtLink class="admin-button admin-button-sm" to="/" target="_blank" rel="noopener noreferrer">Abrir vitrine ↗</NuxtLink></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Chave</th><th>Seção</th><th>Status</th><th>Posição</th><th>Atualizada em</th><th></th></tr></thead><tbody><tr v-for="item in contentSections" :key="item.id"><td><strong class="admin-order-id">{{item.section_key}}</strong></td><td>{{item.title}}</td><td><span class="admin-badge" :class="item.status==='published'?'badge-green':'badge-gray'">{{item.status}}</span></td><td>{{item.position}}</td><td>{{activityDate(item.updated_at)}}</td><td><button class="admin-button admin-button-sm" @click="editContent(item)">Editar</button></td></tr><tr v-if="!contentSections.length"><td colspan="6"><div class="admin-empty"><strong>Nenhuma seção editável carregada</strong><p>Confirme que a migração de operações do painel foi aplicada.</p></div></td></tr></tbody></table></div></section>
          <div class="admin-insight" style="margin-top:13px"><span class="admin-insight-icon"><PanelIcon name="shield" :size="15"/></span><div><strong>Publicação é imediata na próxima atualização da vitrine</strong><p>O conteúdo publicado é servido pela política pública do Supabase; rascunhos permanecem visíveis somente no painel.</p></div></div>
        </template>

        <template v-else-if="section==='analytics'">
          <section class="admin-toolbar" style="padding:0 0 12px"><select v-model="period" class="admin-select" aria-label="Período do relatório"><option>Últimos 7 dias</option><option>Últimos 30 dias</option><option>Este mês</option><option>Este trimestre</option></select><span class="admin-toolbar-spacer"></span><button class="admin-button" @click="exportFinance"><PanelIcon name="download" :size="14"/> Exportar CSV</button></section>
          <section class="admin-stat-grid"><article v-for="metric in metrics.slice(0,3)" :key="metric.label" class="admin-stat-card" :style="{'--stat-color':metric.color}"><div class="admin-stat-top">{{metric.label}}<span class="admin-stat-icon"><PanelIcon :name="metric.icon" :size="15"/></span></div><div class="admin-stat-value">{{metric.value}}</div><div class="admin-stat-foot">{{metric.change}} · {{metric.hint}}</div></article><article class="admin-stat-card" style="--stat-color:var(--a-orange)"><div class="admin-stat-top">Conversão da loja<span class="admin-stat-icon"><PanelIcon name="chart" :size="15"/></span></div><div class="admin-stat-value">Sem eventos</div><div class="admin-stat-foot">Analytics com consentimento ainda não configurado</div></article></section>
          <div class="admin-grid-2"><section class="admin-panel"><div class="admin-panel-head"><div><h2>Receita paga por período</h2><p>Soma de pedidos com status de pagamento confirmado.</p></div></div><div class="admin-panel-content"><svg class="admin-chart" viewBox="0 0 410 180" role="img" aria-label="Gráfico de receita paga calculado a partir dos pedidos"><defs><linearGradient id="chartFill2" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#58b7ed" stop-opacity=".23"/><stop offset="100%" stop-color="#58b7ed" stop-opacity="0"/></linearGradient></defs><line v-for="y in [25,65,105,145]" :key="y" x1="3" :y1="y" x2="405" :y2="y" class="admin-chart-grid"/><polygon :points="chartArea" fill="url(#chartFill2)"/><polyline :points="chartPoints" fill="none" stroke="#58b7ed" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><text x="4" y="174" class="admin-chart-label">{{chartLabels[0]}}</text><text x="112" y="174" class="admin-chart-label">{{chartLabels[1]}}</text><text x="224" y="174" class="admin-chart-label">{{chartLabels[2]}}</text><text x="355" y="174" class="admin-chart-label">{{chartLabels[3]}}</text></svg></div></section><section class="admin-panel"><div class="admin-panel-head"><div><h2>Pedidos pagos recentes</h2><p>Registro comercial do checkout demonstrativo.</p></div></div><div class="admin-panel-content"><div class="admin-feed"><div v-for="order in paidOrderRecords.slice(0,8)" :key="order.orderUuid" class="admin-feed-row"><span class="admin-feed-icon"><PanelIcon name="bag" :size="13"/></span><span class="admin-feed-copy"><strong>{{order.id}} · {{order.customer}}</strong><small>{{order.items.length}} itens · {{order.date}}</small></span><b>{{money(order.total)}}</b></div><div v-if="!paidOrderRecords.length" class="admin-empty"><strong>Sem vendas confirmadas no período</strong><p>O webhook de pagamento é a fonte do estado confirmado.</p></div></div></div></section></div>
          <section class="admin-panel" style="margin-top:13px"><div class="admin-panel-head"><div><h2>Limites dos indicadores</h2><p>O painel não estima taxas, conversão nem margem.</p></div></div><div class="admin-panel-content"><p style="color:var(--a-muted);font-size:10px;line-height:1.7">A receita vem de pedidos pagos. Conversão exige analytics com consentimento, taxas exigem lançamentos financeiros confirmados e margem depende do custo de compra cadastrado.</p></div></section>
        </template>

        <template v-else-if="section==='integrations'">
          <div class="admin-cards-grid"><article v-for="integration in integrationCards" :key="integration.name" class="admin-feature-card"><div class="admin-feature-top"><span class="admin-feature-icon"><PanelIcon :name="integration.icon" :size="18"/></span><span class="admin-badge" :class="integration.color">{{integration.state}}</span></div><h3>{{integration.name}}</h3><p>{{integration.type}}</p><p style="margin-top:7px">{{integration.desc}}</p><button v-if="integration.provider==='melhor_envio'" class="admin-button admin-button-sm" :disabled="connectingMelhorEnvio" @click="connectMelhorEnvio">{{connectingMelhorEnvio?'Conectando…':'Conectar / reconectar conta'}}</button><button v-if="integration.provider" class="admin-button admin-button-sm" style="margin-left:6px" @click="runIntegrationCheck(integration.provider)">Testar integração</button><small v-if="integration.provider" class="admin-field full">Última verificação: {{integrationLastChecked(integration.provider)}}</small></article></div>
          <section class="admin-panel" style="margin-top:13px"><div class="admin-panel-head"><div><h2>Segurança do fluxo</h2><p>Credenciais são usadas pelas funções server-side e nunca retornadas ao navegador.</p></div></div><div class="admin-panel-content"><p class="admin-demo-note">PagBank está fixado no Sandbox. Melhor Envio é consultado para cotar; esta loja de portfólio não compra nem emite etiquetas.</p></div></section>
        </template>

        <template v-else-if="section==='team'">
  <section class="admin-stat-grid"><article v-for="stat in [{label:'Pessoas cadastradas',value:String(teamRows.length),color:'var(--a-blue)'},{label:'Convites pendentes',value:String(teamRows.filter((person)=>person.statusKey==='invited').length),color:'var(--a-orange)'},{label:'Funções em uso',value:String(new Set(teamRows.map((person)=>person.roleKey)).size),color:'var(--a-violet)'},{label:'Acessos ativos',value:String(teamRows.filter((person)=>person.statusKey==='active').length),color:'var(--a-green)'}]" :key="stat.label" class="admin-stat-card" :style="{'--stat-color':stat.color}"><div class="admin-stat-top">{{stat.label}}<span class="admin-stat-icon"><PanelIcon name="users" :size="15"/></span></div><div class="admin-stat-value">{{stat.value}}</div><div class="admin-stat-foot">Membros retornados pelo banco</div></article></section>
  <section class="admin-panel" style="margin-top:13px"><div class="admin-panel-head"><div><h2>Pessoas e permissões</h2><p>Alterações passam pela função server-side e geram auditoria.</p></div><button class="admin-button admin-button-primary admin-button-sm" :disabled="!canManageTeam" @click="openTeamInvite"><PanelIcon name="plus" :size="14"/> Convidar pessoa</button></div>
    <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Pessoa</th><th>Função</th><th>Pedidos</th><th>Catálogo</th><th>Clientes</th><th>Status</th><th>Acesso</th></tr></thead><tbody>
      <tr v-for="person in teamRows" :key="person.id"><td><strong>{{person.name}}</strong><small>{{person.email}}</small></td><td><select class="admin-select" :value="person.roleKey" :disabled="!canManageTeam||person.isCurrentUser||person.roleKey==='owner'||person.statusKey==='invited'" :aria-label="'Função de '+person.name" @change="changeTeamField($event,person.id,'role')"><option value="admin">Administrador</option><option value="catalog">Catálogo</option><option value="inventory">Estoque</option><option value="fulfillment">Expedição</option><option value="support">Atendimento</option><option value="finance">Financeiro</option><option value="marketing">Marketing</option><option value="analyst">Análise</option><option value="purchasing">Compras</option></select></td><td>{{person.orders}}</td><td>{{person.catalog}}</td><td>{{person.customers}}</td><td><span class="admin-badge" :class="person.statusKey==='active'?'badge-green':person.statusKey==='invited'?'badge-orange':'badge-gray'">{{person.status}}</span></td><td><select v-if="person.statusKey!=='invited'" class="admin-select" :value="person.statusKey" :disabled="!canManageTeam||person.isCurrentUser||person.roleKey==='owner'" :aria-label="'Status de acesso de '+person.name" @change="changeTeamField($event,person.id,'status')"><option value="active">Ativo</option><option value="disabled">Desativado</option></select><span v-else>Convite enviado</span></td></tr>
      <tr v-if="!teamRows.length"><td colspan="7"><div class="admin-empty"><strong>Nenhum membro carregado</strong><p>Confirme a sessão e o vínculo da loja no Supabase.</p></div></td></tr>
    </tbody></table></div>
    <p class="admin-demo-note">Membros convidados só entram depois de aceitar o convite e definir a senha. O proprietário e a própria conta não podem ser desativados nesta tabela.</p>
  </section>
</template>

        <template v-else-if="section==='activity'">
          <div class="admin-toolbar" style="padding:0 0 12px"><label class="admin-toolbar-search"><PanelIcon name="search" :size="14"/><input v-model="searchTerm" class="admin-input" aria-label="Buscar no histórico de atividade" placeholder="Pessoa, ação ou registro"></label><select v-model="activityFilter" class="admin-select" aria-label="Tipo de atividade"><option>Todas as atividades</option><option>Pedidos</option><option>Catálogo</option><option>Estoque</option><option>Acessos</option></select><select v-model="activityPeriodFilter" class="admin-select" aria-label="Período"><option>Últimos 7 dias</option><option>Hoje</option><option>Últimos 30 dias</option></select></div>
          <section class="admin-panel"><div class="admin-panel-head"><div><h2>Registro administrativo</h2><p>Quem fez o quê, quando e quais valores foram alterados</p></div><span class="admin-badge badge-purple">Auditável no backend</span></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Data e hora</th><th>Responsável</th><th>Ação</th><th>Registro</th><th>Alteração</th><th>Origem</th></tr></thead><tbody><tr v-for="event in visibleActivities" :key="event.id"><td>{{activityDate(event.createdAt)}}</td><td><strong>{{event.actor}}</strong></td><td>{{event.action}}</td><td>{{event.target}}</td><td>{{event.change}}</td><td><span class="admin-badge badge-gray">{{event.source}}</span></td></tr><tr v-if="!visibleActivities.length"><td colspan="6"><div class="admin-empty"><strong>Sem eventos registrados</strong><p>As alterações auditadas aparecerão aqui.</p></div></td></tr></tbody></table></div><div class="admin-pagination"><span>{{visibleActivities.length}} eventos de auditoria carregados</span></div></section>
        </template>

        <template v-else-if="section==='settings'">
          <div class="admin-section-tabs" style="padding:0 0 12px"><button v-for="tab in ['Dados da loja','Entrega','Notificações','Privacidade']" :key="tab" :class="{active:selectedSettingsTab===tab}" @click="selectedSettingsTab=tab">{{tab}}</button></div>
          <section v-if="selectedSettingsTab==='Dados da loja'" class="admin-panel"><div class="admin-panel-head"><div><h2>Dados públicos da loja</h2><p>Valores persistidos na tabela de lojas.</p></div></div><div class="admin-panel-content"><div class="admin-product-fields"><div class="admin-field full"><label for="store-name">Nome da loja</label><input id="store-name" v-model="profileForm.name" class="admin-input" maxlength="120"></div><div class="admin-field"><label for="store-email">E-mail de atendimento</label><input id="store-email" v-model="profileForm.email" class="admin-input" type="email"></div><div class="admin-field"><label for="store-whatsapp">WhatsApp</label><input id="store-whatsapp" v-model="profileForm.whatsapp" class="admin-input" inputmode="tel"></div></div><button class="admin-button admin-button-primary" style="margin-top:12px" @click="saveStoreSettings">Salvar configurações</button></div></section>
          <section v-else-if="selectedSettingsTab==='Entrega'" class="admin-panel"><div class="admin-panel-head"><div><h2>Origem da cotação</h2><p>Endereço usado para cotar fretes na conta de produção do Melhor Envio.</p></div><span class="admin-badge badge-purple">Sem etiqueta</span></div><div class="admin-panel-content"><div class="admin-product-fields"><div class="admin-field"><label for="origin-zip">CEP de origem</label><input id="origin-zip" v-model="shippingOriginForm.postal_code" class="admin-input" inputmode="numeric"></div><div class="admin-field"><label for="origin-street">Rua</label><input id="origin-street" v-model="shippingOriginForm.street" class="admin-input"></div><div class="admin-field"><label for="origin-neighborhood">Bairro</label><input id="origin-neighborhood" v-model="shippingOriginForm.neighborhood" class="admin-input"></div><div class="admin-field"><label for="origin-city">Cidade</label><input id="origin-city" v-model="shippingOriginForm.city" class="admin-input"></div><div class="admin-field"><label for="origin-state">UF</label><input id="origin-state" v-model="shippingOriginForm.state" class="admin-input" maxlength="2"></div><div class="admin-field"><label for="origin-country">País</label><input id="origin-country" v-model="shippingOriginForm.country" class="admin-input" maxlength="3"></div></div><p class="admin-demo-note">Origem atual: {{shippingOriginForm.street}}, {{shippingOriginForm.neighborhood}}, {{shippingOriginForm.city}} / {{shippingOriginForm.state}} · {{shippingOriginForm.postal_code}}</p><button class="admin-button admin-button-primary" style="margin-top:12px" @click="saveStoreSettings">Salvar origem e preferências</button></div></section>
          <section v-else-if="selectedSettingsTab==='Notificações'" class="admin-panel"><div class="admin-panel-head"><div><h2>Preferências de notificação</h2><p>Gravadas em store_settings para futuras filas de notificação.</p></div></div><div class="admin-panel-content"><label v-for="key in notificationKeys" :key="key" class="admin-check-row" style="padding:8px 0;border-bottom:1px solid #26364c88"><input v-model="notificationSettings[key]" type="checkbox">{{notificationLabels[key]}}</label><button class="admin-button admin-button-primary" style="margin-top:12px" @click="saveStoreSettings">Salvar preferências</button></div></section>
          <section v-else class="admin-panel"><div class="admin-panel-head"><div><h2>Privacidade e retenção</h2><p>Preferências operacionais salvas; a demo mantém todos os dados fictícios.</p></div></div><div class="admin-panel-content"><div class="admin-product-fields"><div class="admin-field"><label for="retention-days">Retenção (dias)</label><input id="retention-days" v-model.number="privacyForm.retention_days" class="admin-input" type="number" min="30" max="3650"></div><label class="admin-check-row"><input v-model="privacyForm.customer_export_requires_owner" type="checkbox">Exigir proprietário para exportar dados pessoais</label><label class="admin-check-row"><input v-model="privacyForm.demo_data" type="checkbox">Marcar ambiente e pedidos como demonstração</label></div><button class="admin-button admin-button-primary" style="margin-top:12px" @click="saveStoreSettings">Salvar preferências</button></div></section>
        </template>


        <div class="admin-footer"><span>Tecla Nativa · Console de operação</span><span>Desenvolvido por LMX Soluções Digitais / Segundo Almeida</span></div>
      </main>
    </div>

    <div v-if="activeOrderId" class="admin-overlay" @click.self="closeOrder">
      <section class="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="order-drawer-title" tabindex="-1">
        <div class="admin-drawer-head"><div><h2 id="order-drawer-title">{{selectedOrder?.id}}</h2><p>Pedido salvo no Supabase · {{selectedOrder?.date}}</p></div><button class="admin-icon-btn" aria-label="Fechar detalhes do pedido" @click="closeOrder"><PanelIcon name="close" :size="16"/></button></div>
        <template v-if="selectedOrder">
          <div class="admin-drawer-section"><div style="display:flex;gap:7px;flex-wrap:wrap"><span class="admin-badge" :class="paymentClass(selectedOrder.payment)">{{selectedOrder.payment}}</span><span class="admin-badge" :class="orderStatusClass(selectedOrder.status)">{{selectedOrder.status}}</span><span class="admin-badge badge-gray">{{selectedOrder.shipping}}</span><span v-if="!selectedOrder.labelCreated" class="admin-badge badge-purple">Sem etiqueta</span></div></div>
          <div class="admin-drawer-section"><h3>Itens · snapshot do pedido</h3><div class="admin-order-lines"><div v-for="item in selectedOrder.items" :key="item.sku" class="admin-order-line"><span class="admin-thumb"><img :src="item.image" alt="" loading="lazy"></span><span><strong>{{item.name}}</strong><small>{{item.variant}} · {{item.sku}} · {{item.qty}} un.</small></span><b>{{money(item.price*item.qty)}}</b></div></div></div>
          <div class="admin-detail-grid admin-drawer-section"><div class="admin-detail-block"><h3>Cliente</h3><p>{{selectedOrder.customer}}<br>{{selectedOrder.email}}<br>{{selectedOrder.phone}}</p></div><div class="admin-detail-block"><h3>Entrega</h3><p>{{selectedOrder.address}}<br>{{selectedOrder.city}}</p></div><div class="admin-detail-block"><h3>Pagamento</h3><p>{{selectedOrder.method}}<br>{{selectedOrder.payment}}</p></div><div class="admin-detail-block"><h3>Totais</h3><p>Itens: {{money(selectedOrder.subtotal)}}<br>Desconto: −{{money(selectedOrder.discount)}}<br>Frete cotado: {{money(selectedOrder.shippingTotal)}}<br><strong>Total: {{money(selectedOrder.total)}}</strong></p></div></div>
          <div class="admin-drawer-section"><h3>Frete e rastreio</h3><div class="admin-detail-block"><p>{{selectedOrder.carrier}} · {{selectedOrder.shippingService}}<br>{{selectedOrder.tracking||'Código de rastreio ainda não registrado'}}</p><a v-if="selectedOrder.trackingUrl" :href="selectedOrder.trackingUrl" target="_blank" rel="noopener noreferrer">Abrir rastreio ↗</a></div></div>
          <div class="admin-drawer-section"><h3>Observação do pedido</h3><div class="admin-detail-block"><p>{{selectedOrder.note||'Nenhuma observação cadastrada.'}}</p></div></div>
          <div class="admin-drawer-section"><h3>Histórico do pedido</h3><div class="admin-timeline"><div v-for="(event,index) in selectedOrder.events" :key="event.createdAt+event.status+index" class="admin-timeline-row">{{orderEventLabel(event.status)}}<small>{{activityDate(event.createdAt)}} · {{event.source}}{{event.note?' · '+event.note:''}}</small></div><div v-if="!selectedOrder.events.length" class="admin-timeline-row">Pedido criado<small>{{selectedOrder.date}} · registro do checkout</small></div></div></div>
          <div class="admin-drawer-actions"><button class="admin-button admin-button-primary" :disabled="selectedOrder.payment!=='Pago'||['Entregue','Cancelado'].includes(selectedOrder.status)" @click="advanceOrder">Avançar etapa</button><button v-if="['Pronto para envio','Enviado'].includes(selectedOrder.status)" class="admin-button" @click="openTracking(selectedOrder,selectedOrder.status==='Enviado'?'update_tracking':'mark_shipped')">{{selectedOrder.status==='Enviado'?'Atualizar rastreio':'Registrar envio manual'}}</button><button class="admin-button admin-button-danger" :disabled="selectedOrder.payment==='Pago'||['Cancelado','Entregue','Enviado'].includes(selectedOrder.status)" @click="cancelSelectedOrder">Cancelar pedido</button></div>
          <p class="admin-demo-note" style="margin-top:14px">Checkout PagBank em Sandbox, sem cobrança real. O frete foi apenas cotado; registrar código de rastreio não compra nem emite etiqueta.</p>
        </template>
      </section>
    </div>

    <div v-if="activeModal" class="admin-modal-wrap" @click.self="activeModal=''">
      <section class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="admin-modal-head"><div><h2 id="modal-title">{{modalTitle}}</h2><p>{{activeModal==='tracking'?'Envio manual: registre o código recebido por fora do painel; nenhuma etiqueta será comprada.':activeModal==='product'?'O produto é salvo no catálogo; novos itens começam como rascunho.':activeModal==='variant'?'Cada cor/opção tem SKU, imagem, medidas e estoque próprios.':activeModal==='team'?'O convite é enviado pelo Supabase Auth com a função selecionada.':'Esta ação grava dados no Supabase e registra a operação.'}}</p></div><button class="admin-icon-btn" aria-label="Fechar janela" :disabled="modalSaving" @click="activeModal=''"><PanelIcon name="close" :size="16"/></button></div>
        <div class="admin-modal-body">
          <template v-if="activeModal==='movement'">
            <div class="admin-product-fields">
              <div class="admin-field full"><label for="movement-variant">Produto / cor / SKU</label><select id="movement-variant" v-model="movementVariantId" class="admin-select" required><option value="">Selecione uma variante</option><option v-for="variant in variantRows" :key="variant.id" :value="variant.id">{{variant.product}} · {{variant.color}} · {{variant.sku}} · disponível {{variant.stock}}</option></select></div>
              <div class="admin-field"><label for="movement-kind">Tipo de movimento</label><select id="movement-kind" v-model="movementType" class="admin-select"><option>Entrada</option><option>Saída</option><option>Ajuste</option></select></div>
              <div class="admin-field"><label for="movement-quantity">{{movementType==='Ajuste'?'Novo saldo em mãos':'Quantidade'}}</label><input id="movement-quantity" v-model.number="movementQuantity" class="admin-input" type="number" :min="movementType==='Ajuste'?0:1" step="1" required></div>
              <div class="admin-field full"><label for="movement-reason">Motivo</label><select id="movement-reason" v-model="movementReason" class="admin-select"><option>Reposição de fornecedor</option><option>Correção de inventário</option><option>Avaria / perda</option><option>Devolução de cliente</option><option>Estoque fictício de portfólio</option></select></div>
              <div class="admin-field full"><label for="movement-notes">Observação</label><textarea id="movement-notes" v-model="movementNote" class="admin-textarea" maxlength="180" placeholder="Referência ou explicação para o histórico"></textarea></div>
            </div>
          </template>
          <template v-else-if="activeModal==='product'">
            <div class="admin-product-fields">
              <div class="admin-field full"><label for="product-title">Nome do produto</label><input id="product-title" v-model="productForm.name" class="admin-input" maxlength="160" required placeholder="Nome exibido na vitrine"></div>
              <div class="admin-field"><label for="product-sku">SKU base</label><input id="product-sku" v-model="productForm.skuBase" class="admin-input" maxlength="40" required :disabled="Boolean(productForm.id)" placeholder="TN-051"></div>
              <div class="admin-field"><label for="product-price">Preço inicial (R$)</label><input id="product-price" v-model.number="productForm.price" class="admin-input" type="number" min="0.01" max="9999999999.99" step="0.01" required></div>
              <div class="admin-field"><label for="product-category-form">Categoria</label><select id="product-category-form" v-model="productForm.categoryId" class="admin-select"><option value="">Sem categoria</option><option v-for="category in productCategoryOptions" :key="category.id" :value="category.id">{{category.name}}</option></select></div>
              <div class="admin-field"><label>Status ao salvar</label><input class="admin-input" value="Rascunho — publicar depois de cadastrar variante e imagem" disabled></div>
              <div class="admin-field full"><label for="product-description">Descrição</label><textarea id="product-description" v-model="productForm.description" class="admin-textarea" maxlength="5000" placeholder="Benefícios, compatibilidade, limitações e conteúdo da embalagem"></textarea></div>
              <div class="admin-field full"><label for="product-image">Imagem principal (PNG, JPG, WebP ou AVIF; até 8 MB)</label><input id="product-image" class="admin-input" type="file" accept="image/avif,image/jpeg,image/png,image/webp" @change="setProductImage"><small>{{productImageFile?.name||'A imagem será enviada ao bucket público storefront-media.'}}</small></div>
              <label class="admin-check-row admin-field full"><input v-model="productForm.featured" type="checkbox">Em destaque na vitrine</label>
            </div>
          </template>
          <template v-else-if="activeModal==='variant'">
            <div class="admin-product-fields">
              <div class="admin-field full"><label for="variant-product">Produto</label><select id="variant-product" v-model="variantForm.productId" class="admin-select" required><option value="">Selecione o produto</option><option v-for="product in productRows" :key="product.id" :value="product.id">{{product.name}} · {{product.sku}}</option></select></div>
              <div class="admin-field"><label for="variant-label">Cor ou opção</label><input id="variant-label" v-model="variantForm.optionLabel" class="admin-input" maxlength="80" required placeholder="Grafite"></div>
              <div class="admin-field"><label for="variant-swatch">Cor do seletor</label><input id="variant-swatch" v-model="variantForm.swatchHex" class="admin-input" type="color" aria-label="Cor do seletor da variante"></div>
              <div class="admin-field full"><label>SKU da variante</label><input class="admin-input" :value="variantSkuPreview" disabled></div>
              <div class="admin-field"><label for="variant-price">Preço alternativo (opcional)</label><input id="variant-price" v-model="variantForm.priceOverride" class="admin-input" type="number" min="0" step="0.01"></div>
              <div class="admin-field"><label for="variant-stock-min">Mínimo para alerta</label><input id="variant-stock-min" v-model="variantForm.reorderPoint" class="admin-input" type="number" min="0" step="1" required></div>
              <div class="admin-field"><label for="variant-weight">Peso embalado (gramas)</label><input id="variant-weight" v-model="variantForm.weightGrams" class="admin-input" type="number" min="1" step="1"></div>
              <div class="admin-field"><label for="variant-length">Comprimento (mm)</label><input id="variant-length" v-model="variantForm.lengthMm" class="admin-input" type="number" min="1" step="1"></div>
              <div class="admin-field"><label for="variant-width">Largura (mm)</label><input id="variant-width" v-model="variantForm.widthMm" class="admin-input" type="number" min="1" step="1"></div>
              <div class="admin-field"><label for="variant-height">Altura (mm)</label><input id="variant-height" v-model="variantForm.heightMm" class="admin-input" type="number" min="1" step="1"></div>
              <div class="admin-field full"><label for="variant-image">Imagem do produto nesta cor (até 8 MB)</label><input id="variant-image" class="admin-input" type="file" accept="image/avif,image/jpeg,image/png,image/webp" @change="setVariantImage"><small>{{variantImageFile?.name||'Use uma imagem do mesmo produto e enquadramento das outras variantes.'}}</small></div>
              <p class="admin-demo-note">Nova variante começa com estoque zero. Use a tela de estoque ou recebimento de compra para registrar saldo.</p>
            </div>
          </template>
          <template v-else-if="activeModal==='coupon'">
            <div class="admin-product-fields">
              <div class="admin-field"><label for="coupon-code">Código</label><input id="coupon-code" v-model="couponForm.code" class="admin-input" maxlength="60" required placeholder="BEMVINDO10"></div>
              <div class="admin-field"><label for="coupon-type">Tipo de desconto</label><select id="coupon-type" v-model="couponForm.discountType" class="admin-select"><option value="percentage">Percentual</option><option value="fixed_amount">Valor fixo</option><option value="free_shipping">Frete grátis</option></select></div>
              <div class="admin-field"><label for="coupon-value">Valor</label><input id="coupon-value" v-model.number="couponForm.discountValue" class="admin-input" type="number" min="0" :max="couponForm.discountType==='percentage'?100:999999" step="0.01" :disabled="couponForm.discountType==='free_shipping'"></div>
              <div class="admin-field"><label for="coupon-minimum">Pedido mínimo (R$)</label><input id="coupon-minimum" v-model.number="couponForm.minimumOrderTotal" class="admin-input" type="number" min="0" step="0.01"></div>
              <div class="admin-field"><label for="coupon-start">Válido a partir de</label><input id="coupon-start" v-model="couponForm.startsAt" class="admin-input" type="date"></div>
              <div class="admin-field"><label for="coupon-end">Válido até</label><input id="coupon-end" v-model="couponForm.endsAt" class="admin-input" type="date"></div>
              <div class="admin-field"><label for="coupon-total">Limite total (vazio = sem limite)</label><input id="coupon-total" v-model="couponForm.usageLimit" class="admin-input" type="number" min="1" step="1"></div>
              <div class="admin-field"><label for="coupon-customer">Limite por cliente</label><input id="coupon-customer" v-model.number="couponForm.perCustomerLimit" class="admin-input" type="number" min="1" step="1"></div>
            </div>
          </template>
          <template v-else-if="activeModal==='team'">
            <div class="admin-product-fields"><div class="admin-field full"><label for="team-email">E-mail do convite</label><input id="team-email" v-model="teamForm.email" class="admin-input" type="email" maxlength="254" required placeholder="pessoa@empresa.com.br"></div><div class="admin-field full"><label for="team-role">Função inicial</label><select id="team-role" v-model="teamForm.role" class="admin-select"><option v-if="canGrantAdmin" value="admin">Administrador</option><option value="catalog">Catálogo</option><option value="inventory">Estoque</option><option value="fulfillment">Expedição</option><option value="support">Atendimento</option><option value="finance">Financeiro</option><option value="marketing">Marketing</option><option value="analyst">Análise</option><option value="purchasing">Compras</option></select></div><p class="admin-demo-note">O convite usa a URL pública configurada e só ativa a conta depois que a pessoa aceitar e definir uma senha.</p></div>
          </template>
          <template v-else-if="activeModal==='supplier'">
            <div class="admin-product-fields"><div class="admin-field full"><label for="supplier-name">Fornecedor</label><input id="supplier-name" v-model="supplierForm.name" class="admin-input" maxlength="160" required></div><div class="admin-field"><label for="supplier-contact">Pessoa de contato</label><input id="supplier-contact" v-model="supplierForm.contactName" class="admin-input" maxlength="120"></div><div class="admin-field"><label for="supplier-email">E-mail</label><input id="supplier-email" v-model="supplierForm.email" class="admin-input" type="email" maxlength="254"></div><div class="admin-field"><label for="supplier-phone">Telefone</label><input id="supplier-phone" v-model="supplierForm.phone" class="admin-input" inputmode="tel" maxlength="40"></div><div class="admin-field"><label for="supplier-lead">Prazo médio (dias)</label><input id="supplier-lead" v-model="supplierForm.leadTimeDays" class="admin-input" type="number" min="0" step="1"></div></div>
          </template>
          <template v-else-if="activeModal==='purchase'">
            <div class="admin-product-fields"><div class="admin-field full"><label for="purchase-supplier">Fornecedor</label><select id="purchase-supplier" v-model="purchaseForm.supplierId" class="admin-select" required><option value="">Selecione o fornecedor</option><option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">{{supplier.name}}</option></select></div><div class="admin-field"><label for="purchase-expected">Previsão de recebimento</label><input id="purchase-expected" v-model="purchaseForm.expectedAt" class="admin-input" type="date"></div><div class="admin-field"><label for="purchase-notes">Observação</label><input id="purchase-notes" v-model="purchaseForm.notes" class="admin-input" maxlength="500"></div></div>
            <div v-for="(line,index) in purchaseLines" :key="index" class="admin-product-fields" style="margin-top:10px"><div class="admin-field full"><label :for="'purchase-variant-'+index">Variante / SKU</label><select :id="'purchase-variant-'+index" v-model="line.variantId" class="admin-select" required><option value="">Selecione variante</option><option v-for="variant in variantRows" :key="variant.id" :value="variant.id">{{variant.product}} · {{variant.color}} · {{variant.sku}}</option></select></div><div class="admin-field"><label :for="'purchase-quantity-'+index">Quantidade</label><input :id="'purchase-quantity-'+index" v-model.number="line.quantity" class="admin-input" type="number" min="1" step="1"></div><div class="admin-field"><label :for="'purchase-cost-'+index">Custo unitário (R$)</label><input :id="'purchase-cost-'+index" v-model.number="line.unitCost" class="admin-input" type="number" min="0" step="0.01"></div><div class="admin-field"><button type="button" class="admin-button admin-button-sm" :disabled="purchaseLines.length<2" @click="purchaseLines.splice(index,1)">Remover esta linha</button></div></div>
            <button type="button" class="admin-button admin-button-sm" style="margin-top:10px" @click="addPurchaseLine"><PanelIcon name="plus" :size="13"/> Adicionar variante</button>
          </template>
          <template v-else-if="activeModal==='receive'">
            <p v-if="receivingPurchase" class="admin-demo-note">Compra {{receivingPurchase.purchase_number}} · {{receivingPurchase.supplier}}. Registre somente a quantidade recebida agora.</p>
            <div v-for="item in receivingPurchase?.items||[]" :key="item.variant_id" class="admin-product-fields" style="margin-top:10px"><div class="admin-field full"><label :for="'receive-'+item.variant_id">{{item.product}} · {{item.sku}} · pendente {{item.quantity_ordered-item.quantity_received}}</label><input :id="'receive-'+item.variant_id" v-model.number="receiptAmounts[item.variant_id]" class="admin-input" type="number" min="0" :max="item.quantity_ordered-item.quantity_received" step="1"></div></div>
          </template>
          <template v-else-if="activeModal==='case'">
            <div class="admin-product-fields"><div class="admin-field"><label for="case-type">Tipo</label><select id="case-type" v-model="caseForm.type" class="admin-select" :disabled="Boolean(caseForm.id)"><option value="exchange">Troca</option><option value="return">Devolução</option><option value="defect">Defeito</option><option value="delivery_issue">Problema na entrega</option><option value="question">Dúvida</option><option value="other">Outro</option></select></div><div class="admin-field"><label for="case-priority">Prioridade</label><select id="case-priority" v-model="caseForm.priority" class="admin-select" :disabled="Boolean(caseForm.id)"><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div><div class="admin-field full"><label for="case-order">Pedido vinculado (opcional)</label><select id="case-order" v-model="caseForm.orderId" class="admin-select" :disabled="Boolean(caseForm.id)"><option value="">Sem pedido</option><option v-for="order in orders" :key="order.orderUuid" :value="order.orderUuid">{{order.id}} · {{order.customer}} · {{money(order.total)}}</option></select></div><div class="admin-field full"><label for="case-reason">Solicitação / motivo</label><textarea id="case-reason" v-model="caseForm.reason" class="admin-textarea" maxlength="2000" required :disabled="Boolean(caseForm.id)"></textarea></div><div v-if="caseForm.id" class="admin-field"><label for="case-status">Novo status</label><select id="case-status" v-model="caseForm.status" class="admin-select"><option value="under_review">Em análise</option><option value="awaiting_customer">Aguardando cliente</option><option value="awaiting_return">Aguardando devolução</option><option value="resolved">Resolvido</option><option value="rejected">Recusado</option><option value="closed">Fechado</option></select></div><div v-if="caseForm.id" class="admin-field"><label for="case-resolution">Resolução</label><input id="case-resolution" v-model="caseForm.resolution" class="admin-input" maxlength="1000"></div><div v-if="caseForm.id" class="admin-field full"><label for="case-note">Nota interna</label><textarea id="case-note" v-model="caseForm.note" class="admin-textarea" maxlength="1000"></textarea></div></div>
          </template>
          <template v-else-if="activeModal==='content'">
            <div class="admin-product-fields"><div class="admin-field full"><label>Chave da seção</label><input class="admin-input" :value="contentForm.key" disabled></div><div class="admin-field full"><label for="content-title">Título</label><input id="content-title" v-model="contentForm.title" class="admin-input" maxlength="160" required></div><div class="admin-field"><label for="content-status">Status</label><select id="content-status" v-model="contentForm.status" class="admin-select"><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="archived">Arquivado</option></select></div><div class="admin-field"><label for="content-position">Posição</label><input id="content-position" v-model.number="contentForm.position" class="admin-input" type="number" min="0" step="1"></div><div class="admin-field full"><label for="content-json">Conteúdo (objeto JSON)</label><textarea id="content-json" v-model="contentForm.json" class="admin-textarea" rows="10" spellcheck="false"></textarea></div></div>
          </template>
          <template v-else-if="activeModal==='tracking'">
            <div class="admin-product-fields"><div class="admin-field"><label for="tracking-carrier">Transportadora / serviço</label><input id="tracking-carrier" v-model="trackingForm.carrier" class="admin-input" maxlength="80" required></div><div class="admin-field"><label for="tracking-code">Código de rastreio</label><input id="tracking-code" v-model="trackingForm.trackingCode" class="admin-input" maxlength="120"></div><div class="admin-field full"><label for="tracking-url">Link HTTPS de rastreio</label><input id="tracking-url" v-model="trackingForm.trackingUrl" class="admin-input" type="url" maxlength="2048" placeholder="https://"></div><div class="admin-field full"><label for="tracking-note">Observação interna</label><textarea id="tracking-note" v-model="trackingForm.note" class="admin-textarea" maxlength="500"></textarea></div></div><p class="admin-demo-note">Esta tela apenas grava o rastreio manual no pedido; não compra, imprime nem emite etiqueta.</p>
          </template>
          <p v-if="modalError" class="admin-field full" role="alert" style="color:#ff9b9b;margin:12px 0 0">{{modalError}}</p>
        </div>
        <div class="admin-modal-actions"><button class="admin-button" :disabled="modalSaving||productSaving||variantSaving||movementSaving" @click="activeModal=''">Cancelar</button><button class="admin-button admin-button-primary" :disabled="modalSaving||productSaving||variantSaving||movementSaving||(activeModal==='purchase'&&!suppliers.length)||(activeModal==='receive'&&!receivingPurchase)" @click="activeModal==='tracking'?saveTracking():saveModal()">{{activeModal==='product'?(productSaving?'Salvando…':'Salvar rascunho'):activeModal==='variant'?(variantSaving?'Salvando…':'Salvar variante'):activeModal==='movement'?(movementSaving?'Registrando…':'Registrar movimentação'):modalSaving?'Salvando…':activeModal==='tracking'?'Salvar rastreio':activeModal==='team'?'Enviar convite':activeModal==='coupon'?'Salvar cupom':activeModal==='supplier'?'Salvar fornecedor':activeModal==='purchase'?'Criar compra':activeModal==='receive'?'Confirmar recebimento':activeModal==='case'?'Salvar caso':activeModal==='content'?'Salvar seção':'Salvar'}}</button></div>
      </section>
    </div>
    <div v-if="toast" class="admin-toast" role="status" aria-live="polite">{{toast}}</div>
  </div>
  <main v-else class="admin-app" role="status" aria-live="polite" style="min-height:100vh;display:grid;place-items:center;color:#a6b5c7;background:#080d17">Verificando o acesso seguro…</main>
</template>
