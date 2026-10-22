import { ownedArrayBuffer } from './bytes.ts';

const P256_COORDINATE_BYTES = 32;

export function decodeBase64(value: string): Uint8Array {
  const normalized = value.trim();
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error('invalid_base64');
  }

  const decoded = atob(normalized);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function readDerLength(bytes: Uint8Array, cursor: { value: number }): number {
  if (cursor.value >= bytes.length) throw new Error('invalid_der');
  const first = bytes[cursor.value++] ?? 0;
  if (first < 0x80) return first;

  const octets = first & 0x7f;
  if (octets === 0 || octets > 2 || cursor.value + octets > bytes.length) {
    throw new Error('invalid_der');
  }

  let length = 0;
  for (let i = 0; i < octets; i++) length = (length << 8) | (bytes[cursor.value++] ?? 0);
  return length;
}

function readDerInteger(bytes: Uint8Array, cursor: { value: number }): Uint8Array {
  if (bytes[cursor.value++] !== 0x02) throw new Error('invalid_der');
  const length = readDerLength(bytes, cursor);
  const end = cursor.value + length;
  if (length < 1 || end > bytes.length) throw new Error('invalid_der');

  let value = bytes.slice(cursor.value, end);
  cursor.value = end;
  while (value.length > 1 && value[0] === 0) value = value.slice(1);
  if (value.length > P256_COORDINATE_BYTES) throw new Error('invalid_der');

  const padded = new Uint8Array(P256_COORDINATE_BYTES);
  padded.set(value, P256_COORDINATE_BYTES - value.length);
  return padded;
}

/** PagBank sends ECDSA signatures as ASN.1 DER; Web Crypto expects IEEE P1363. */
export function derEcdsaToP1363(signature: Uint8Array): Uint8Array {
  // Some runtimes already expose the IEEE P1363 representation.
  if (signature.length === P256_COORDINATE_BYTES * 2) return signature;

  const cursor = { value: 0 };
  if (signature[cursor.value++] !== 0x30) throw new Error('invalid_der');
  const sequenceLength = readDerLength(signature, cursor);
  if (cursor.value + sequenceLength !== signature.length) throw new Error('invalid_der');

  const r = readDerInteger(signature, cursor);
  const s = readDerInteger(signature, cursor);
  if (cursor.value !== signature.length) throw new Error('invalid_der');

  const result = new Uint8Array(P256_COORDINATE_BYTES * 2);
  result.set(r, 0);
  result.set(s, P256_COORDINATE_BYTES);
  return result;
}

export function splitSignatureHeader(header: string | null): string[] {
  if (!header) return [];
  return header.split(',').map((part) => part.trim()).filter(Boolean);
}

export async function verifyPagbankSignature(input: {
  rawBody: Uint8Array;
  signatureHeader: string | null;
  publicKeyBase64: string;
}): Promise<boolean> {
  const signatures = splitSignatureHeader(input.signatureHeader);
  if (!signatures.length || !input.publicKeyBase64) return false;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'spki',
      ownedArrayBuffer(decodeBase64(input.publicKeyBase64)),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    throw new Error('invalid_public_key');
  }

  for (const encodedSignature of signatures) {
    try {
      const signature = derEcdsaToP1363(decodeBase64(encodedSignature));
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        ownedArrayBuffer(signature),
        ownedArrayBuffer(input.rawBody),
      );
      if (valid) return true;
    } catch {
      // During key rotation the header can contain multiple signatures. Try all.
    }
  }

  return false;
}

