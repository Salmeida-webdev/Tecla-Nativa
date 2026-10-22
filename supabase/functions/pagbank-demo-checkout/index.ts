import {
  buildPagBankSandboxCheckout,
  cartFingerprint,
  normalizeCart,
  normalizeCheckoutAddress,
  normalizeCustomerEmail,
  normalizeCustomerName,
  normalizeCustomerPhone,
  normalizePostalCode,
} from '../_shared/commerce.ts';
import { sha256Hex } from '../_shared/sha256.ts';

const PAGBANK_SANDBOX = 'https://sandbox.api.pagseguro.com';
const MAX_BODY_BYTES = 24 * 1024;
const DEFAULT_ORIGINS = ['https://teclanativa.netlify.app', 'http://localhost:3000', 'http://127.0.0.1:3000'];
type JsonRecord = Record<string, unknown>;
type OrderItem = { sku_snapshot: string; product_name_snapshot: string; variant_name_snapshot: string; unit_price: number; quantity: number };
type ProviderCheckout = { id?: unknown; expiration_date?: unknown; links?: unknown };

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function allowedOrigins(): Set<string> {
  const configured = Deno.env.get('STORE_ALLOWED_ORIGINS')?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  return new Set([...DEFAULT_ORIGINS, ...configured]);
}

function json(body: JsonRecord, status = 200, origin: string | null = null): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  if (origin && allowedOrigins().has(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('payload_too_large');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}

async function database(path: string, init: RequestInit = {}): Promise<unknown> {
  const baseUrl = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  headers.set('authorization', `Bearer ${key}`);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (init.body && !headers.has('prefer')) headers.set('prefer', 'return=representation');
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('pagbank_demo_database_error', response.status, detail.slice(0, 500));
    throw new Error(`database_http_${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function rpc<T>(name: string, payload: JsonRecord): Promise<T> {
  return await database(`rpc/${name}`, { method: 'POST', body: JSON.stringify(payload) }) as T;
}

function oneRow<T>(value: unknown, label: string): T {
  if (!Array.isArray(value) || value.length !== 1) throw new Error(label);
  return value[0] as T;
}

function cents(value: number): number {
  const result = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('invalid_order_amount');
  return result;
}

function providerPayUrl(value: unknown): string {
  const links = Array.isArray(value) ? value.map(record).filter((link): link is JsonRecord => Boolean(link)) : [];
  const link = links.find((candidate) => candidate.rel === 'PAY' && typeof candidate.href === 'string');
  if (!link || typeof link.href !== 'string') throw new Error('pagbank_pay_link_missing');
  const url = new URL(link.href);
  const host = url.hostname.toLowerCase();
  const approvedHost = host === 'pagamento.pagseguro.uol.com.br'
    || host === 'sandbox.pagseguro.uol.com.br'
    || host === 'sandbox.pagamento.pagseguro.uol.com.br'
    || host === 'qa.pagamento.pagseguro.uol.com.br'
    || host === 'sandbox.pagbank.com.br'
    || host === 'qa.pagbank.com.br';
  if (url.protocol !== 'https:' || !approvedHost || url.username || url.password) throw new Error('pagbank_pay_link_invalid');
  return url.toString();
}

function assertIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('invalid_idempotency_key');
  }
  return value.toLowerCase();
}

async function handle(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const origins = allowedOrigins();
  if (request.method === 'OPTIONS') {
    const headers = new Headers({
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      'access-control-max-age': '86400',
    });
    if (origin && origins.has(origin)) {
      headers.set('access-control-allow-origin', origin);
      headers.set('vary', 'Origin');
    }
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
  if (origin && !origins.has(origin)) return json({ error: 'origin_not_allowed' }, 403);
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    return json({ error: 'unsupported_media_type' }, 415, origin);
  }

  let claimedAttemptId: string | null = null;
  let providerCallStarted = false;
  try {
    const input = record(await readBody(request));
    if (!input) return json({ error: 'invalid_payload' }, 400, origin);
    const items = normalizeCart(input.items);
    const address = normalizeCheckoutAddress(input.address);
    const name = normalizeCustomerName(input.customer_name);
    const email = normalizeCustomerEmail(input.customer_email);
    const phone = normalizeCustomerPhone(input.customer_phone);
    const quoteId = typeof input.shipping_quote_id === 'string' && /^[0-9a-f-]{36}$/i.test(input.shipping_quote_id) ? input.shipping_quote_id : '';
    if (!quoteId) throw new Error('invalid_shipping_quote');
    if (typeof input.cart_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(input.cart_sha256)) throw new Error('invalid_shipping_quote');
    const couponCode = typeof input.coupon_code === 'string' ? input.coupon_code.trim().toUpperCase().slice(0, 60) : '';
    if (couponCode && !/^[A-Z0-9_-]+$/.test(couponCode)) throw new Error('invalid_coupon_code');
    const customerNote = typeof input.customer_note === 'string' ? input.customer_note.trim().slice(0, 1000) : '';
    const idempotencyKey = assertIdempotencyKey(input.idempotency_key);
    const cartHash = await cartFingerprint(items);
    const requestHash = await sha256Hex(JSON.stringify({
      name, email, phone, address, quoteId, cartHash, couponCode: couponCode || null, customerNote: customerNote || null,
    }));

    const store = oneRow<{ id: string; status: string }>(
      await database('stores?select=id,status&slug=eq.tecla-nativa&limit=1'), 'store_not_found',
    );
    if (store.status !== 'active') return json({ error: 'store_not_active' }, 409, origin);

    const created = oneRow<{
      result_order_id: string;
      result_order_number: string;
      result_subtotal: number;
      result_discount_total: number;
      result_shipping_total: number;
      result_total: number;
      is_idempotent_replay: boolean;
    }>(await rpc('create_portfolio_demo_order', {
      p_store_id: store.id,
      p_idempotency_key: idempotencyKey,
      p_request_sha256: requestHash,
      p_customer_name: name,
      p_customer_email: email,
      p_customer_phone: phone,
      p_shipping_address: address,
      p_shipping_quote_id: quoteId,
      p_cart_sha256: cartHash,
      p_items: items,
      p_coupon_code: couponCode || null,
      p_customer_note: customerNote || null,
    }), 'order_create_failed');

    if (!created.result_order_id || cents(created.result_total) <= 0) throw new Error('invalid_order_amount');
    const claim = oneRow<{
      result_payment_attempt_id: string | null;
      result_action: string;
      result_checkout_url: string | null;
    }>(await rpc('claim_portfolio_pagbank_checkout', { p_order_id: created.result_order_id }), 'payment_attempt_failed');
    if (claim.result_action === 'already_paid') {
      return json({ order_number: created.result_order_number, total: Number(created.result_total), environment: 'sandbox', paid: true }, 200, origin);
    }
    if (claim.result_action === 'ready' && claim.result_checkout_url) {
      return json({ order_number: created.result_order_number, checkout_url: claim.result_checkout_url, total: Number(created.result_total), environment: 'sandbox' }, 200, origin);
    }
    if (claim.result_action === 'in_progress') return json({ error: 'checkout_in_progress' }, 409, origin);
    if (claim.result_action !== 'create' || !claim.result_payment_attempt_id) throw new Error('payment_attempt_failed');
    claimedAttemptId = claim.result_payment_attempt_id;

    const orderItems = await database(`order_items?select=sku_snapshot,product_name_snapshot,variant_name_snapshot,unit_price,quantity&store_id=eq.${store.id}&order_id=eq.${created.result_order_id}&order=created_at.asc`) as OrderItem[];
    if (!Array.isArray(orderItems) || orderItems.length !== items.length) throw new Error('order_items_not_found');
    const itemTotal = orderItems.reduce((sum, item) => sum + cents(Number(item.unit_price)) * Number(item.quantity), 0);
    const shippingCents = cents(Number(created.result_shipping_total));
    const discountCents = cents(Number(created.result_discount_total));
    if (itemTotal - discountCents + shippingCents !== cents(Number(created.result_total))) throw new Error('order_amount_mismatch');

    const siteUrl = new URL(env('SITE_PUBLIC_URL'));
    if (siteUrl.protocol !== 'https:' || !origins.has(siteUrl.origin)) throw new Error('public_site_url_not_allowed');
    const returnUrlObject = new URL('/checkout/retorno', siteUrl);
    returnUrlObject.searchParams.set('pedido', created.result_order_number);
    const returnUrl = returnUrlObject.toString();
    const webhookUrl = `${env('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/pagbank-webhook`;
    const checkoutBody = buildPagBankSandboxCheckout({
      orderId: created.result_order_id,
      items: orderItems.map((item) => ({
        sku: item.sku_snapshot,
        name: item.product_name_snapshot,
        variant: item.variant_name_snapshot,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
      })),
      shippingCents,
      discountCents,
      address,
      returnUrl,
      webhookUrl,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });

    providerCallStarted = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response: Response;
    try {
      response = await fetch(`${PAGBANK_SANDBOX}/checkouts`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env('PAGBANK_ACCESS_TOKEN')}`,
          accept: 'application/json',
          'content-type': 'application/json',
          'x-idempotency-key': requestHash,
        },
        body: JSON.stringify(checkoutBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('pagbank_sandbox_checkout_http_error', response.status, detail.slice(0, 700));
      if (response.status >= 400 && response.status < 500) {
        providerCallStarted = false;
        await rpc<boolean>('release_portfolio_pagbank_checkout', { p_payment_attempt_id: claim.result_payment_attempt_id }).catch(() => false);
      }
      throw new Error(`pagbank_checkout_http_${response.status}`);
    }
    const provider = await response.json() as ProviderCheckout;
    if (typeof provider.id !== 'string' || !/^CHEC_[A-Za-z0-9_-]{4,120}$/.test(provider.id)) throw new Error('pagbank_checkout_id_invalid');
    const checkoutUrl = providerPayUrl(provider.links);
    const expiresAt = typeof provider.expiration_date === 'string' && Number.isFinite(Date.parse(provider.expiration_date))
      ? new Date(provider.expiration_date).toISOString() : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const saved = await rpc<boolean>('complete_portfolio_pagbank_checkout', {
      p_payment_attempt_id: claim.result_payment_attempt_id,
      p_provider_checkout_id: provider.id,
      p_checkout_url: checkoutUrl,
      p_expires_at: expiresAt,
    });
    if (saved !== true) throw new Error('checkout_save_failed');

    return json({ order_number: created.result_order_number, checkout_url: checkoutUrl, total: Number(created.result_total), environment: 'sandbox' }, 200, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unexpected_error';
    // If provider creation may have succeeded but its response could not be saved,
    // keep the short lease to prevent an immediate duplicate checkout.
    if (claimedAttemptId && !providerCallStarted) {
      await rpc<boolean>('release_portfolio_pagbank_checkout', { p_payment_attempt_id: claimedAttemptId }).catch(() => false);
    }
    const status = code === 'payload_too_large' ? 413
      : code.startsWith('Informe ') || code.startsWith('O nome') || code.startsWith('O e-mail')
        || code.startsWith('O telefone') || code.startsWith('O endereço') || code.startsWith('O logradouro')
        || code.startsWith('O número') || code.startsWith('O bairro') || code.startsWith('A cidade')
        || code.startsWith('O estado') || code.startsWith('O complemento') || code.startsWith('Uma variante')
        || code.startsWith('A quantidade') || code.startsWith('A sacola') || code.startsWith('Remova variantes')
        || code.startsWith('O pedido') || code.startsWith('Frete ou desconto') || code.startsWith('O desconto')
        || ['invalid_payload','invalid_idempotency_key','invalid_shipping_quote','invalid_coupon_code'].includes(code) ? 400
      : code === 'store_not_found' ? 503
      : code === 'store_not_active' ? 409
      : code === 'insufficient_stock' ? 409
      : code.includes('pagbank_checkout_http_') ? 502
      : code === 'checkout_in_progress' ? 409
      : code === 'pagbank_api_not_configured' ? 503
      : 422;
    console.error('pagbank_demo_checkout_failed', code);
    return json({ error: status < 500 ? code : 'checkout_unavailable' }, status, origin);
  }
}

Deno.serve(handle);
