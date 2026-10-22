import { ownedArrayBuffer } from './bytes.ts';

const SHA256_BYTES = 32;

function decodeBase64(value: string): Uint8Array {
  const normalized = value.trim();
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error('invalid_base64_signature');
  }

  const decoded = atob(normalized);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function constantTimeEqual(expected: Uint8Array, received: Uint8Array): boolean {
  let difference = expected.length ^ received.length;
  for (let index = 0; index < expected.length; index++) {
    difference |= (expected[index] ?? 0) ^ (received[index] ?? 0);
  }
  return difference === 0;
}

/** Melhor Envio's X-ME-Signature is Base64(HMAC-SHA256(raw body, app secret)). */
export async function verifyMelhorEnvioSignature(input: {
  rawBody: Uint8Array;
  signatureHeader: string | null;
  appSecret: string;
}): Promise<boolean> {
  if (!input.signatureHeader || !input.appSecret) return false;

  let received: Uint8Array;
  try {
    received = decodeBase64(input.signatureHeader);
  } catch {
    return false;
  }
  if (received.length !== SHA256_BYTES) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(input.appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, ownedArrayBuffer(input.rawBody)));
  return constantTimeEqual(expected, received);
}
