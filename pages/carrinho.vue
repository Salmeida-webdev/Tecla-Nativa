<script setup lang="ts">
import type { CartLine } from '~/stores/cart';
import { cartLineSku } from '~/utils/catalog';

type FreightOption = {
  quote_id: string;
  service_id: string;
  carrier: string;
  service_name: string;
  amount: number;
  delivery_days: number | null;
  expires_at: string;
};
type QuoteResponse = { options: FreightOption[]; cart_sha256: string; expires_at: string };
type CheckoutResponse = { order_number?: string; checkout_url?: string; total?: number; environment?: 'sandbox'; paid?: boolean; error?: string };

useSeoMeta({ title: 'Sacola e entrega | Tecla Nativa', robots: 'noindex,nofollow' });
const cart = useCartStore();
const { $supabase } = useNuxtApp();
const form = reactive({
  name: '', email: '', phone: '', postalCode: '', street: '', number: '', complement: '',
  neighborhood: '', city: '', state: '', coupon: '', note: '',
});
const quoteOptions = ref<FreightOption[]>([]);
const selectedQuoteId = ref('');
const quoteCartHash = ref('');
const quoting = ref(false);
const checkingOut = ref(false);
const quoteError = ref('');
const checkoutError = ref('');
const checkoutStarted = ref(false);
const createdOrderNumber = ref('');
const createdTotal = ref<number | null>(null);
const quoteClock = ref(Date.now());
let quoteTimer: ReturnType<typeof setInterval> | undefined;

const items = computed(() => cart.lines.map((line: CartLine) => ({
  sku: line.sku || cartLineSku(line.product, line.variantKey),
  quantity: line.quantity,
})));
const cartSignature = computed(() => JSON.stringify(items.value));
const selectedQuote = computed(() => quoteOptions.value.find((option) => option.quote_id === selectedQuoteId.value) ?? null);
const subtotal = computed(() => cart.lines.reduce((sum: number, line: CartLine) => sum + line.product.price * line.quantity, 0));
const quoteStillValid = computed(() => Boolean(selectedQuote.value && Date.parse(selectedQuote.value.expires_at) > quoteClock.value));
const checkoutTotalEstimate = computed(() => selectedQuote.value ? Math.max(0, subtotal.value + selectedQuote.value.amount) : subtotal.value);

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

async function functionError(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { error?: unknown };
        if (typeof body.error === 'string') return body.error;
      } catch { /* use the Supabase SDK message below */ }
    }
  }
  if (error instanceof Error) return error.message;
  return 'Não foi possível concluir esta etapa.';
}

function friendlyError(code: string) {
  const messages: Record<string, string> = {
    shipping_unavailable: 'Não foi possível consultar o frete agora. Revise o CEP e tente novamente.',
    shipping_provider_unavailable: 'O Melhor Envio está indisponível no momento. Tente novamente em instantes.',
    no_shipping_services: 'Não há serviços de entrega disponíveis para este CEP.',
    shipping_dimensions_missing: 'Uma variante do carrinho precisa de peso e dimensões para cotar o frete.',
    insufficient_stock: 'A quantidade selecionada não está disponível. Atualize a sacola e tente novamente.',
    variant_unavailable: 'Um produto não está disponível. Atualize a página de produto.',
    invalid_coupon_code: 'O cupom deve usar somente letras, números, hífen ou sublinhado.',
    checkout_unavailable: 'Não foi possível abrir o checkout PagBank Sandbox. O pedido foi mantido para uma nova tentativa.',
    checkout_in_progress: 'O checkout deste pedido está sendo preparado. Aguarde alguns segundos e tente novamente.',
    invalid_shipping_quote: 'A cotação expirou ou mudou. Consulte o frete novamente.',
    store_not_active: 'A loja está temporariamente indisponível para checkout.',
  };
  return messages[code] ?? code;
}

watch(cartSignature, () => {
  quoteOptions.value = [];
  selectedQuoteId.value = '';
  quoteCartHash.value = '';
  quoteError.value = '';
  checkoutError.value = '';
  checkoutStarted.value = false;
}, { deep: true });

watch(() => form.postalCode, () => {
  quoteOptions.value = [];
  selectedQuoteId.value = '';
  quoteCartHash.value = '';
});

onMounted(() => { quoteTimer = setInterval(() => { quoteClock.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { if (quoteTimer) clearInterval(quoteTimer); });

async function quoteShipping() {
  quoteError.value = '';
  checkoutError.value = '';
  if (!$supabase) {
    quoteError.value = 'O serviço de checkout ainda não foi configurado neste ambiente.';
    return;
  }
  if (!/^\d{5}-?\d{3}$/.test(form.postalCode.replace(/\s/g, ''))) {
    quoteError.value = 'Informe um CEP de entrega válido com 8 números.';
    return;
  }
  quoting.value = true;
  quoteOptions.value = [];
  selectedQuoteId.value = '';
  try {
    const { data, error } = await $supabase.functions.invoke<QuoteResponse>('melhor-envio-quote', {
      body: { postal_code: form.postalCode, items: items.value },
    });
    if (error) throw new Error(await functionError(error));
    if (!data || !Array.isArray(data.options) || !data.options.length || !data.cart_sha256) throw new Error('Não recebemos opções de frete válidas.');
    quoteOptions.value = data.options;
    quoteCartHash.value = data.cart_sha256;
    selectedQuoteId.value = data.options[0]?.quote_id ?? '';
  } catch (error) {
    quoteError.value = friendlyError(await functionError(error));
  } finally {
    quoting.value = false;
  }
}

function checkoutPayloadFingerprint() {
  return JSON.stringify({
    items: items.value,
    name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim(),
    address: { postal_code: form.postalCode, street: form.street, number: form.number, complement: form.complement, neighborhood: form.neighborhood, city: form.city, state: form.state },
    quote_id: selectedQuote.value?.quote_id,
    coupon: form.coupon.trim().toUpperCase(), note: form.note.trim(),
  });
}

function checkoutIdempotencyKey(fingerprint: string) {
  const storageKey = 'tecla-checkout-attempt';
  try {
    const existing = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as { fingerprint?: string; key?: string } | null;
    if (existing?.fingerprint === fingerprint && existing.key) return existing.key;
    const key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }));
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

async function startCheckout() {
  checkoutError.value = '';
  if (!$supabase) {
    checkoutError.value = 'O serviço de checkout ainda não foi configurado neste ambiente.';
    return;
  }
  if (!selectedQuote.value || !quoteStillValid.value || !quoteCartHash.value) {
    checkoutError.value = 'Consulte e selecione uma opção de frete válida antes de continuar.';
    return;
  }
  const requiredFields: Array<[string, string]> = [
    [form.name, 'Informe seu nome completo.'], [form.email, 'Informe seu e-mail.'],
    [form.street, 'Informe o logradouro.'], [form.number, 'Informe o número do endereço.'],
    [form.neighborhood, 'Informe o bairro.'], [form.city, 'Informe a cidade.'], [form.state, 'Informe o estado.'],
  ];
  const missingField = requiredFields.find(([value]) => !value.trim());
  if (missingField) { checkoutError.value = missingField[1]; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { checkoutError.value = 'Informe um e-mail válido.'; return; }
  if (!/^[a-z]{2}$/i.test(form.state.trim())) { checkoutError.value = 'Informe a sigla do estado com duas letras.'; return; }
  const fingerprint = checkoutPayloadFingerprint();
  checkingOut.value = true;
  try {
    const idempotencyKey = checkoutIdempotencyKey(fingerprint);
    const { data, error } = await $supabase.functions.invoke<CheckoutResponse>('pagbank-demo-checkout', {
      body: {
        idempotency_key: idempotencyKey,
        customer_name: form.name,
        customer_email: form.email,
        customer_phone: form.phone,
        address: {
          postal_code: form.postalCode,
          street: form.street,
          number: form.number,
          complement: form.complement,
          neighborhood: form.neighborhood,
          city: form.city,
          state: form.state,
        },
        items: items.value,
        shipping_quote_id: selectedQuote.value.quote_id,
        cart_sha256: quoteCartHash.value,
        coupon_code: form.coupon,
        customer_note: form.note,
      },
    });
    if (error) throw new Error(await functionError(error));
    if (!data) throw new Error('O PagBank não retornou os dados do checkout.');
    if (data.paid) {
      createdOrderNumber.value = data.order_number ?? '';
      checkoutStarted.value = true;
      window.location.assign(`/checkout/retorno?pedido=${encodeURIComponent(createdOrderNumber.value)}&status=confirmado`);
      return;
    }
    if (!data.checkout_url || !data.order_number) throw new Error(data.error || 'O PagBank não retornou um link de pagamento.');
    const paymentUrl = new URL(data.checkout_url);
    const allowedPaymentHosts = ['pagamento.pagseguro.uol.com.br', 'sandbox.pagseguro.uol.com.br', 'sandbox.pagamento.pagseguro.uol.com.br', 'qa.pagamento.pagseguro.uol.com.br', 'sandbox.pagbank.com.br', 'qa.pagbank.com.br'];
    if (paymentUrl.protocol !== 'https:' || !allowedPaymentHosts.includes(paymentUrl.hostname)) throw new Error('O link seguro do PagBank não passou na validação.');
    createdOrderNumber.value = data.order_number;
    createdTotal.value = Number(data.total ?? checkoutTotalEstimate.value);
    checkoutStarted.value = true;
    window.location.assign(paymentUrl.toString());
  } catch (error) {
    checkoutError.value = friendlyError(await functionError(error));
  } finally {
    checkingOut.value = false;
  }
}
</script>

<template>
  <div class="wrap page-wrap">
    <div class="breadcrumb"><NuxtLink to="/">Início</NuxtLink><span>/</span><span>Sacola</span></div>
    <div class="simple-page-heading"><span class="eyebrow">SUA SELEÇÃO</span><h1>Sacola <em>de escolhas.</em></h1><p>{{ cart.count }} {{ cart.count === 1 ? 'item' : 'itens' }} na sua sacola.</p></div>

    <div v-if="cart.lines.length" class="cart-layout checkout-layout">
      <div class="checkout-main">
        <section class="checkout-panel">
          <div class="checkout-section-title"><span>01</span><div><h2>Seus itens</h2><p>Confira as variantes e quantidades.</p></div></div>
          <div class="cart-lines"><article v-for="line in cart.lines" :key="line.product.id + line.variant" class="cart-line">
            <NuxtLink :to="`/produtos/${line.product.slug}`"><img :src="line.image || line.product.image" :alt="`${line.product.name} — ${line.variant}`" width="160" height="160"/></NuxtLink>
            <div class="cart-line-info"><NuxtLink :to="`/produtos/${line.product.slug}`" class="product-name">{{ line.product.name }}</NuxtLink><span>{{ line.variant }} · {{ line.product.priceLabel }}</span><button class="remove-link" @click="cart.remove(line.product.id,line.variant)">Remover</button></div>
            <div class="cart-quantity"><button aria-label="Diminuir" @click="cart.setQuantity(line.product.id,line.variant,line.quantity-1)">−</button><span>{{ line.quantity }}</span><button aria-label="Aumentar" @click="cart.setQuantity(line.product.id,line.variant,line.quantity+1)">＋</button></div>
            <b class="cart-line-price">{{ money(line.product.price*line.quantity) }}</b>
          </article></div>
        </section>

        <section class="checkout-panel">
          <div class="checkout-section-title"><span>02</span><div><h2>Contato e entrega</h2><p>O CEP é usado para consultar as opções do Melhor Envio.</p></div></div>
          <div class="checkout-fields">
            <label class="checkout-field checkout-field-full">Nome completo<input v-model.trim="form.name" autocomplete="name" maxlength="120" required placeholder="Como podemos chamar você?"></label>
            <label class="checkout-field">E-mail<input v-model.trim="form.email" type="email" autocomplete="email" maxlength="254" required placeholder="voce@email.com"></label>
            <label class="checkout-field">Telefone / WhatsApp<input v-model="form.phone" type="tel" autocomplete="tel" maxlength="20" placeholder="(83) 99999-9999"></label>
            <label class="checkout-field">CEP<input v-model.trim="form.postalCode" autocomplete="postal-code" inputmode="numeric" maxlength="9" required placeholder="00000-000"></label>
            <button class="button button-outline checkout-quote-button" type="button" :disabled="quoting || !form.postalCode" @click="quoteShipping">{{ quoting ? 'Consultando…' : 'Consultar frete' }}</button>
            <label class="checkout-field checkout-field-full">Rua / logradouro<input v-model.trim="form.street" autocomplete="address-line1" maxlength="160" required placeholder="Nome da rua ou avenida"></label>
            <label class="checkout-field">Número<input v-model.trim="form.number" autocomplete="address-line2" maxlength="20" required placeholder="Número"></label>
            <label class="checkout-field">Complemento <small>opcional</small><input v-model.trim="form.complement" maxlength="40" placeholder="Apto, bloco, referência"></label>
            <label class="checkout-field">Bairro<input v-model.trim="form.neighborhood" autocomplete="address-level3" maxlength="60" required placeholder="Bairro"></label>
            <label class="checkout-field">Cidade<input v-model.trim="form.city" autocomplete="address-level2" maxlength="90" required placeholder="Cidade"></label>
            <label class="checkout-field">Estado<input v-model.trim="form.state" autocomplete="address-level1" maxlength="2" required placeholder="PB"></label>
          </div>
          <p v-if="quoteError" class="checkout-error" role="alert">{{ quoteError }}</p>
          <div v-if="quoteOptions.length" class="checkout-freight-options" aria-label="Serviços de frete disponíveis">
            <label v-for="option in quoteOptions" :key="option.quote_id" class="checkout-freight-option" :class="{ selected: selectedQuoteId === option.quote_id }">
              <input v-model="selectedQuoteId" type="radio" name="shipping-option" :value="option.quote_id">
              <span><b>{{ option.carrier }} · {{ option.service_name }}</b><small>{{ option.delivery_days === null ? 'Prazo sob consulta' : `${option.delivery_days} dias úteis estimados` }}</small></span>
              <strong>{{ money(option.amount) }}</strong>
            </label>
            <small class="checkout-quote-expiry">Cotação temporária. O valor é guardado no pedido; nenhuma etiqueta será criada.</small>
          </div>
        </section>

        <section class="checkout-panel">
          <div class="checkout-section-title"><span>03</span><div><h2>Cupom e observações</h2><p>As regras do cupom serão conferidas no servidor.</p></div></div>
          <div class="checkout-fields">
            <label class="checkout-field">Cupom<input v-model.trim="form.coupon" maxlength="60" placeholder="Se você tiver um código"></label>
            <label class="checkout-field checkout-field-full">Observação do pedido <small>opcional</small><textarea v-model.trim="form.note" maxlength="1000" rows="3" placeholder="Instruções relevantes para a demonstração"></textarea></label>
          </div>
        </section>
      </div>

      <aside class="cart-summary checkout-summary">
        <span class="eyebrow">RESUMO DO PEDIDO</span>
        <div><span>Subtotal</span><b>{{ money(subtotal) }}</b></div>
        <div><span>Entrega</span><b>{{ selectedQuote ? money(selectedQuote.amount) : 'Calcule o frete' }}</b></div>
        <div v-if="form.coupon"><span>Cupom</span><b>Validado ao continuar</b></div>
        <div class="checkout-total"><span>Total estimado</span><b>{{ money(checkoutTotalEstimate) }}</b></div>
        <p class="checkout-disclosure"><strong>Pagamento demonstrativo em ambiente seguro PagBank Sandbox.</strong> Nenhuma cobrança real será feita. A confirmação do pedido depende do webhook assinado do PagBank.</p>
        <p v-if="checkoutError" class="checkout-error" role="alert">{{ checkoutError }}</p>
        <button class="button button-coral checkout-submit" type="button" :disabled="checkingOut || quoting || !quoteStillValid" @click="startCheckout">{{ checkingOut ? 'Preparando checkout…' : 'Continuar para pagamento' }} <span>↗</span></button>
        <p v-if="checkoutStarted" class="checkout-success" role="status">Pedido {{ createdOrderNumber }} criado. Total confirmado pelo servidor: {{ createdTotal === null ? 'calculando…' : money(createdTotal) }}.</p>
        <NuxtLink class="text-link" to="/produtos">Continuar explorando <span>→</span></NuxtLink>
      </aside>
    </div>

    <div v-else class="empty-state"><span>▢</span><h2>Sua sacola está esperando boas ideias.</h2><p>Explore a curadoria e adicione algo que combine com seu espaço.</p><NuxtLink class="button button-dark" to="/produtos">Explorar produtos <span>↗</span></NuxtLink></div>
    <p class="catalog-disclaimer">Projeto de portfólio: pagamentos em Sandbox e estoque sintético. Nenhuma cobrança real ou etiqueta de envio será criada.</p>
  </div>
</template>

<style scoped>
.checkout-layout{align-items:start}.checkout-main{display:grid;gap:14px;min-width:0}.checkout-panel{padding:22px;border:1px solid var(--line);border-radius:20px;background:var(--white)}.checkout-section-title{display:flex;align-items:flex-start;gap:12px;margin-bottom:18px}.checkout-section-title>span{display:grid;place-items:center;width:28px;height:28px;flex:none;border:1px solid #4ce2d277;border-radius:50%;color:#4ce2d2;font-size:10px;font-weight:800}.checkout-section-title h2{margin:2px 0 5px;font-family:'Sora',sans-serif;font-size:19px;letter-spacing:-.04em}.checkout-section-title p{margin:0;color:var(--muted);font-size:11px}.checkout-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.checkout-field{display:flex;flex-direction:column;gap:6px;color:var(--ink);font-size:10px;font-weight:700}.checkout-field-full{grid-column:1/-1}.checkout-field input,.checkout-field textarea{width:100%;min-width:0;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:#0b1320;color:var(--ink);font:inherit;font-size:12px;outline:none}.checkout-field textarea{resize:vertical}.checkout-field input:focus,.checkout-field textarea:focus{border-color:#4ce2d2;box-shadow:0 0 0 3px #4ce2d21a}.checkout-field small{color:var(--muted);font-size:9px;font-weight:500}.checkout-quote-button{align-self:end;min-height:41px;padding:0 14px;font-size:10px}.checkout-quote-button:disabled,.checkout-submit:disabled{opacity:.55;cursor:not-allowed;transform:none}.checkout-freight-options{display:grid;gap:8px;margin-top:16px}.checkout-freight-option{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:11px;padding:12px;border:1px solid var(--line);border-radius:12px;background:#0b1320;cursor:pointer}.checkout-freight-option.selected{border-color:#4ce2d2;box-shadow:0 0 0 2px #4ce2d21b}.checkout-freight-option input{accent-color:#4ce2d2}.checkout-freight-option span{display:flex;flex-direction:column;gap:3px;min-width:0}.checkout-freight-option b{font-size:11px}.checkout-freight-option small,.checkout-quote-expiry{color:var(--muted);font-size:9px}.checkout-freight-option strong{font-size:11px;white-space:nowrap}.checkout-quote-expiry{margin-top:2px}.checkout-summary{position:sticky;top:100px;display:grid;gap:13px}.checkout-summary>div{display:flex;justify-content:space-between;gap:10px;color:var(--muted);font-size:11px}.checkout-summary .checkout-total{padding-top:12px;border-top:1px solid var(--line);color:var(--ink);font-size:13px}.checkout-total b{font-size:18px}.checkout-disclosure{margin:0;padding:12px;border:1px solid #4ce2d233;border-radius:12px;background:#4ce2d20a;color:var(--muted);font-size:10px;line-height:1.6}.checkout-disclosure strong{display:block;margin-bottom:4px;color:var(--ink)}.checkout-submit{width:100%;font-size:11px}.checkout-error,.checkout-success{margin:0;color:#ff9a9a;font-size:10px;line-height:1.5}.checkout-success{color:#64dfc0}.checkout-summary .text-link{justify-self:start}.cart-lines{display:grid;gap:8px}.checkout-panel .cart-lines .cart-line{padding:9px 0;border-bottom:1px solid var(--line)}
@media(max-width:800px){.checkout-layout{grid-template-columns:1fr}.checkout-summary{position:static;order:-1}.checkout-panel{padding:17px}}
@media(max-width:520px){.checkout-fields{grid-template-columns:1fr;gap:11px}.checkout-field-full{grid-column:auto}.checkout-quote-button{width:100%}.checkout-freight-option{grid-template-columns:18px minmax(0,1fr) auto;gap:8px;padding:10px}.checkout-section-title h2{font-size:17px}}
</style>
