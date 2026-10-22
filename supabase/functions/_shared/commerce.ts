import { sha256Hex } from './sha256.ts';

export type CartItemInput = { sku: string; quantity: number };
export type CheckoutAddress = {
  postal_code: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
};
export type QuoteToken = {
  storeId: string;
  postalCode: string;
  cartHash: string;
  serviceId: string;
  serviceName: string;
  carrier: string;
  amountCents: number;
  deliveryDays: number | null;
  quoteId: string;
  expiresAt: string;
};

export function normalizePostalCode(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Informe um CEP válido.');
  const postalCode = value.replace(/\D/g, '');
  if (!/^\d{8}$/.test(postalCode)) throw new Error('Informe um CEP válido com 8 números.');
  return postalCode;
}

function requiredText(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== 'string') throw new Error(`${label} é obrigatório.`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${label} deve ter entre ${minimum} e ${maximum} caracteres.`);
  }
  return normalized;
}

export function normalizeCustomerName(value: unknown): string {
  return requiredText(value, 'O nome', 2, 120);
}

export function normalizeCustomerEmail(value: unknown): string {
  const email = requiredText(value, 'O e-mail', 5, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  return email;
}

export function normalizeCustomerPhone(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error('O telefone é inválido.');
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) throw new Error('Informe um telefone com DDD válido.');
  return digits;
}

export function normalizeCheckoutAddress(value: unknown): CheckoutAddress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('O endereço de entrega é inválido.');
  const address = value as Record<string, unknown>;
  const state = requiredText(address.state, 'O estado', 2, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new Error('Informe a sigla do estado com duas letras.');
  const complement = typeof address.complement === 'string' ? address.complement.trim().replace(/\s+/g, ' ') : '';
  if (complement.length > 40 || /[\u0000-\u001f\u007f]/.test(complement)) throw new Error('O complemento deve ter até 40 caracteres.');
  return {
    postal_code: normalizePostalCode(address.postal_code),
    street: requiredText(address.street, 'O logradouro', 2, 160),
    number: requiredText(address.number, 'O número', 1, 20),
    complement: complement || null,
    neighborhood: requiredText(address.neighborhood, 'O bairro', 2, 60),
    city: requiredText(address.city, 'A cidade', 2, 90),
    state,
  };
}

export type PagBankCheckoutItem = { sku: string; name: string; variant: string; quantity: number; unitPrice: number };

export function buildPagBankSandboxCheckout(input: {
  orderId: string;
  items: PagBankCheckoutItem[];
  shippingCents: number;
  discountCents: number;
  address: CheckoutAddress;
  returnUrl: string;
  webhookUrl: string;
  expiresAt: string;
}) {
  const safeUrl = (value: string, label: string) => {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(`${label} deve usar HTTPS.`);
    return parsed.toString();
  };
  if (!/^[0-9a-f-]{36}$/i.test(input.orderId) || !input.items.length || input.items.length > 20) {
    throw new Error('O pedido não possui uma referência ou itens válidos.');
  }
  if (!Number.isSafeInteger(input.shippingCents) || input.shippingCents < 0
    || !Number.isSafeInteger(input.discountCents) || input.discountCents < 0) {
    throw new Error('Frete ou desconto inválido para o checkout.');
  }
  const items = input.items.map((item) => {
    const unitAmount = Math.round(item.unitPrice * 100);
    if (!/^[A-Z0-9-]{2,60}$/i.test(item.sku) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10
      || !Number.isSafeInteger(unitAmount) || unitAmount < 1) throw new Error('Um item do pedido é inválido para o checkout.');
    const name = `${item.name}${item.variant ? ` · ${item.variant}` : ''}`.trim().slice(0, 100);
    if (!name) throw new Error('Um item do pedido está sem nome.');
    return { reference_id: item.sku, name, quantity: item.quantity, unit_amount: unitAmount };
  });
  const productTotal = items.reduce((sum, item) => sum + item.quantity * item.unit_amount, 0);
  if (input.discountCents > productTotal + input.shippingCents) throw new Error('O desconto não pode superar o total do pedido.');
  const address = input.address;
  const webhook = safeUrl(input.webhookUrl, 'O webhook');
  const returnUrl = safeUrl(input.returnUrl, 'O retorno');
  return {
    reference_id: input.orderId,
    expiration_date: input.expiresAt,
    customer_modifiable: true,
    items,
    shipping: {
      type: 'FIXED',
      amount: input.shippingCents,
      address_modifiable: false,
      address: {
        country: 'BRA',
        region_code: address.state,
        city: address.city,
        postal_code: address.postal_code,
        street: address.street,
        number: address.number,
        ...(address.complement ? { complement: address.complement } : {}),
        locality: address.neighborhood,
      },
    },
    ...(input.discountCents ? { discount_amount: input.discountCents } : {}),
    redirect_url: returnUrl,
    return_url: returnUrl,
    redirect_waiting_time: 10,
    notification_urls: [webhook],
    payment_notification_urls: [webhook],
  };
}

export function normalizeCart(value: unknown): CartItemInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new Error('A sacola deve ter de 1 a 20 variantes diferentes.');
  }
  const items = value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Um item da sacola é inválido.');
    const item = raw as Record<string, unknown>;
    if (typeof item.sku !== 'string' || !/^[A-Za-z0-9-]{2,60}$/.test(item.sku)) throw new Error('Uma variante está sem SKU válido.');
    if (!Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 10) throw new Error('A quantidade deve ficar entre 1 e 10 unidades.');
    return { sku: item.sku.toUpperCase(), quantity: Number(item.quantity) };
  });
  if (new Set(items.map((item) => item.sku)).size !== items.length) throw new Error('Remova variantes duplicadas da sacola.');
  if (items.reduce((sum, item) => sum + item.quantity, 0) > 40) throw new Error('A quantidade total excede o limite por pedido.');
  return items.sort((a, b) => a.sku.localeCompare(b.sku));
}

export async function cartFingerprint(items: CartItemInput[]): Promise<string> {
  return sha256Hex(JSON.stringify(normalizeCart(items)));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacSha256(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

export async function signQuoteToken(payload: QuoteToken, secret: string): Promise<string> {
  if (secret.length < 32) throw new Error('O segredo de cotação precisa ter ao menos 32 caracteres.');
  const body = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = encodeBase64Url(await hmacSha256(body, secret));
  return `${body}.${signature}`;
}

export async function verifyQuoteToken(token: unknown, secret: string, now = Date.now()): Promise<QuoteToken> {
  if (typeof token !== 'string' || token.length > 2048) throw new Error('Atualize a cotação do frete e tente novamente.');
  const [body, suppliedSignature, extra] = token.split('.');
  if (!body || !suppliedSignature || extra) throw new Error('A cotação do frete é inválida.');
  const expected = await hmacSha256(body, secret);
  const actual = decodeBase64Url(suppliedSignature);
  if (actual.length !== expected.length) throw new Error('A cotação do frete é inválida.');
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= (expected[i] ?? 0) ^ (actual[i] ?? 0);
  if (mismatch !== 0) throw new Error('A cotação do frete é inválida.');
  let payload: QuoteToken;
  try { payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(body))) as QuoteToken; }
  catch { throw new Error('A cotação do frete é inválida.'); }
  if (!payload.quoteId || !payload.storeId || !payload.cartHash || !payload.serviceId || !Number.isSafeInteger(payload.amountCents) || payload.amountCents < 0) {
    throw new Error('A cotação do frete é inválida.');
  }
  if (!Number.isFinite(Date.parse(payload.expiresAt)) || Date.parse(payload.expiresAt) <= now) throw new Error('A cotação do frete expirou. Consulte o frete novamente.');
  return payload;
}

export function shippingMethodSnapshot(quote: QuoteToken) {
  return {
    provider: 'melhor_envio',
    quote_id: quote.quoteId,
    service_id: quote.serviceId,
    service_name: quote.serviceName,
    carrier: quote.carrier,
    shipping_total: (quote.amountCents / 100).toFixed(2),
    estimated_delivery_days: quote.deliveryDays,
    quoted_at: new Date().toISOString(),
    label_created: false,
  };
}

