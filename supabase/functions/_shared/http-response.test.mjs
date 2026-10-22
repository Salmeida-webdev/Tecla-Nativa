import test from 'node:test';
import assert from 'node:assert/strict';
import { readOptionalJsonResponse } from './http-response.ts';

test('successful empty response is treated as no content', async () => {
  assert.equal(await readOptionalJsonResponse(new Response(null, { status: 204 })), null);
});

test('JSON response body is parsed', async () => {
  assert.deepEqual(await readOptionalJsonResponse(Response.json({ ok: true })), { ok: true });
});

test('non-empty invalid JSON is rejected with a stable error', async () => {
  await assert.rejects(() => readOptionalJsonResponse(new Response('{bad')), { message: 'invalid_json_response' });
});
