import { ownedArrayBuffer } from './bytes.ts';

export async function sha256Hex(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', ownedArrayBuffer(bytes)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
