/** Copy a view into an owned ArrayBuffer for Web Crypto's strict BufferSource types. */
export function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
