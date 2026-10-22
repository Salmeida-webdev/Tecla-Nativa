import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import {
  derEcdsaToP1363,
  verifyPagbankSignature,
} from './pagbank-signature.ts';
import { verifyMelhorEnvioSignature } from './hmac.ts';
import { extractMelhorEnvioShipmentEvent } from './melhor-envio-event.ts';
import { sha256Hex } from './sha256.ts';

globalThis.crypto ??= webcrypto;

function base64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function p1363ToDer(signature) {
  const integers = [signature.slice(0, 32), signature.slice(32)];
  const body = Buffer.concat(integers.map((integer) => {
    let first = 0;
    while (first < integer.length - 1 && integer[first] === 0) first++;
    let value = Buffer.from(integer.slice(first));
    if (value[0] & 0x80) value = Buffer.concat([Buffer.from([0]), value]);
    return Buffer.concat([Buffer.from([0x02, value.length]), value]);
  }));
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

test('PagBank validates raw ECDSA payload in DER form and supports key rotation signatures', async () => {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const body = new TextEncoder().encode('{ "event": "PAID", "amount": 100 }');
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keyPair.privateKey,
    body,
  ));
  const derSignature = p1363ToDer(signature);
  const publicKey = base64(await crypto.subtle.exportKey('spki', keyPair.publicKey));

  assert.deepEqual(derEcdsaToP1363(derSignature), signature);
  assert.equal(await verifyPagbankSignature({
    rawBody: body,
    signatureHeader: `not-base64, ${base64(derSignature)}`,
    publicKeyBase64: publicKey,
  }), true);
  assert.equal(await verifyPagbankSignature({
    rawBody: new TextEncoder().encode('{"event":"PAID","amount":100}'),
    signatureHeader: base64(derSignature),
    publicKeyBase64: publicKey,
  }), false);
  assert.equal(await verifyPagbankSignature({
    rawBody: body,
    signatureHeader: null,
    publicKeyBase64: publicKey,
  }), false);
});

test('Melhor Envio verifies base64 HMAC-SHA256 against the exact raw body', async () => {
  const secret = 'test-only-app-secret';
  const body = new TextEncoder().encode('{"event":"order.posted","data":{"id":"shipment"}}');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = base64(await crypto.subtle.sign('HMAC', key, body));

  assert.equal(await verifyMelhorEnvioSignature({ rawBody: body, signatureHeader: signature, appSecret: secret }), true);
  assert.equal(await verifyMelhorEnvioSignature({
    rawBody: new TextEncoder().encode('{"event":"order.posted","data":{"id":"shipment"}} '),
    signatureHeader: signature,
    appSecret: secret,
  }), false);
  assert.equal(await verifyMelhorEnvioSignature({ rawBody: body, signatureHeader: 'bad-signature', appSecret: secret }), false);
  assert.equal(await verifyMelhorEnvioSignature({ rawBody: body, signatureHeader: signature, appSecret: 'wrong-secret' }), false);
});

test('Melhor Envio event parser maps only supported shipment fields and drops personal data', async () => {
  const event = await extractMelhorEnvioShipmentEvent({
    event: 'order.posted',
    data: {
      id: '0000aaaa-aa00-00aa-aa00-000000aaaaaa',
      status: 'posted',
      tracking: 'AB123456789BR',
      user_id: 'private-account-id',
      tags: [{ tag: 'recipient', url: 'https://example.test/private' }],
      tracking_url: 'https://example.test/private-tracking',
      created_at: '2026-10-20T10:00:00Z',
      posted_at: '2026-10-21T15:00:00-03:00',
    },
  });

  assert.equal(event?.providerShipmentId, '0000aaaa-aa00-00aa-aa00-000000aaaaaa');
  assert.equal(event?.targetStatus, 'posted');
  assert.equal(event?.occurredAt, '2026-10-21T18:00:00.000Z');
  assert.deepEqual(event?.safeMetadata, {
    provider_shipment_id: '0000aaaa-aa00-00aa-aa00-000000aaaaaa',
    event: 'order.posted',
    status: 'posted',
    tracking_present: true,
  });
  assert.equal(JSON.stringify(event).includes('private'), false);
  assert.equal((await extractMelhorEnvioShipmentEvent({ event: 'order.deleted', data: { id: '0000aaaa-aa00-00aa-aa00-000000aaaaaa' } })), null);
  assert.equal((await extractMelhorEnvioShipmentEvent({ event: 'order.posted', data: { id: 'not-an-id' } })), null);
});

test('shared SHA-256 helper returns stable lowercase hexadecimal', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
