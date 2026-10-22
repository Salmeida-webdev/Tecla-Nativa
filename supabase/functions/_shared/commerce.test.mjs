import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import {
  cartFingerprint,
  buildPagBankSandboxCheckout,
  normalizeCart,
  normalizeCheckoutAddress,
  normalizeCustomerEmail,
  normalizePostalCode,
  shippingMethodSnapshot,
  signQuoteToken,
  verifyQuoteToken,
} from './commerce.ts';

globalThis.crypto ??= webcrypto;

const secret = 'unit-test-quote-secret-with-more-than-32-characters';
const quote = {
  storeId: 'b43c542e-842c-4f9e-99ac-298c6ab9732f',
  postalCode: '12345678',
  cartHash: '0'.repeat(64),
  serviceId: '1',
  serviceName: 'PAC',
  carrier: 'Correios',
  amountCents: 2590,
  deliveryDays: 5,
  quoteId: 'a1ad974d-37a3-4ed6-a8fd-25af82295b1f',
  expiresAt: '2026-10-22T12:00:00.000Z',
};

test('cart inputs normalize SKU and sort deterministically for pricing and idempotency', async () => {
  const lines = normalizeCart([
    { sku: 'tn-002-azulpetroleo', quantity: 2 },
    { sku: 'TN-001-GRAFITE', quantity: 1 },
  ]);
  assert.deepEqual(lines.map((item) => item.sku), ['TN-001-GRAFITE', 'TN-002-AZULPETROLEO']);
  assert.equal(await cartFingerprint(lines), await cartFingerprint([...lines].reverse()));
});

test('cart inputs reject duplicate variants, excess quantities and forged SKUs', () => {
  assert.throws(() => normalizeCart([{ sku: 'TN-001', quantity: 1 }, { sku: 'tn-001', quantity: 1 }]), /duplicadas/);
  assert.throws(() => normalizeCart([{ sku: 'TN-001', quantity: 11 }]), /entre 1 e 10/);
  assert.throws(() => normalizeCart([{ sku: '../orders', quantity: 1 }]), /SKU válido/);
  assert.throws(() => normalizeCart(Array.from({ length: 5 }, (_, index) => ({ sku: `TN-00${index + 1}`, quantity: 9 }))), /limite por pedido/);
});

test('postal code accepts punctuation but keeps only eight digits', () => {
  assert.equal(normalizePostalCode('12345-678'), '12345678');
  assert.throws(() => normalizePostalCode('1234'), /8 números/);
});

test('checkout validates the buyer address and normalizes contact data before order creation', () => {
  assert.equal(normalizeCustomerEmail('  CLIENTE@EXEMPLO.COM '), 'cliente@exemplo.com');
  assert.equal(normalizeCheckoutAddress({ postal_code: '12345-678', street: 'Rua de Teste', number: '12', neighborhood: 'Centro', city: 'Cidade de Teste', state: 'pb' }).postal_code, '12345678');
  assert.throws(() => normalizeCustomerEmail('sem-email'), /e-mail válido/);
  assert.throws(() => normalizeCheckoutAddress({ postal_code: '12345678', street: 'Rua Um', number: '', neighborhood: 'Centro', city: 'Cidade de Teste', state: 'PB' }), /número deve ter/);
});

test('PagBank checkout uses only fixed quoted freight, snapshots, and the sandbox return/webhook URLs', () => {
  const payload = buildPagBankSandboxCheckout({
    orderId: 'b43c542e-842c-4f9e-99ac-298c6ab9732f',
    items: [{ sku: 'TN-001-GRAFITE', name: 'Teclado compacto', variant: 'Grafite', quantity: 2, unitPrice: 109.9 }],
    shippingCents: 2590,
    discountCents: 1000,
    address: { postal_code: '12345678', street: 'Rua de Teste', number: '12', complement: null, neighborhood: 'Centro', city: 'Cidade de Teste', state: 'PB' },
    returnUrl: 'https://teclanativa.netlify.app/checkout/retorno',
    webhookUrl: 'https://example.supabase.co/functions/v1/pagbank-webhook',
    expiresAt: '2026-10-22T12:00:00.000Z',
  });
  assert.equal(payload.reference_id, 'b43c542e-842c-4f9e-99ac-298c6ab9732f');
  assert.deepEqual(payload.items[0], { reference_id: 'TN-001-GRAFITE', name: 'Teclado compacto · Grafite', quantity: 2, unit_amount: 10990 });
  assert.equal(payload.shipping.amount, 2590);
  assert.equal(payload.shipping.address.postal_code, '12345678');
  assert.equal(payload.discount_amount, 1000);
  assert.equal(payload.payment_notification_urls[0], 'https://example.supabase.co/functions/v1/pagbank-webhook');
  assert.equal(Object.hasOwn(payload.shipping, 'service_type'), false);
  assert.throws(() => buildPagBankSandboxCheckout({
    orderId: 'b43c542e-842c-4f9e-99ac-298c6ab9732f', items: [], shippingCents: 0, discountCents: 0,
    address: { postal_code: '12345678', street: 'Rua', number: '12', complement: null, neighborhood: 'Centro', city: 'Cidade de Teste', state: 'PB' },
    returnUrl: 'https://teclanativa.netlify.app/checkout/retorno', webhookUrl: 'http://example.com/hook', expiresAt: '2026-10-22T12:00:00.000Z',
  }), /itens válidos/);
});

test('signed freight quote is bound to its server-issued values and expires', async () => {
  const token = await signQuoteToken(quote, secret);
  assert.deepEqual(await verifyQuoteToken(token, secret, Date.parse('2026-10-22T11:59:00.000Z')), quote);
  const [body, signature] = token.split('.');
  const tampered = `${body}.${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
  await assert.rejects(verifyQuoteToken(tampered, secret, Date.parse('2026-10-22T11:59:00.000Z')), /inválida/);
  await assert.rejects(verifyQuoteToken(token, secret, Date.parse('2026-10-22T12:00:00.000Z')), /expirou/);
  await assert.rejects(verifyQuoteToken(token, 'a-different-secret-that-is-long-enough'), /inválida/);
});

test('shipping snapshot stores the quote and explicitly does not create a label', () => {
  const snapshot = shippingMethodSnapshot(quote);
  assert.equal(snapshot.provider, 'melhor_envio');
  assert.equal(snapshot.shipping_total, '25.90');
  assert.equal(snapshot.label_created, false);
});
