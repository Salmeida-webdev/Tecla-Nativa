import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMelhorEnvioUserAgent,
  buildMelhorEnvioAuthorizationUrl,
  buildMelhorEnvioTokenBody,
  createOAuthState,
  normalizeMelhorEnvioProductionBaseUrl,
  parseMelhorEnvioTokenResponse,
  sha256Hex,
} from './melhor-envio-oauth.ts';

test('provider user agent uses the configured support email and rejects invalid values', () => {
  assert.equal(buildMelhorEnvioUserAgent('support@example.test'), 'Tecla Nativa (support@example.test)');
  assert.throws(() => buildMelhorEnvioUserAgent('not-an-email'), /MELHOR_ENVIO_CONTACT_EMAIL/);
});

test('only the official Melhor Envio production origin is accepted', () => {
  assert.equal(normalizeMelhorEnvioProductionBaseUrl('https://melhorenvio.com.br/'), 'https://melhorenvio.com.br');
  for (const value of [
    'https://sandbox.melhorenvio.com.br',
    'http://melhorenvio.com.br',
    'https://melhorenvio.com.br/api/v2',
    'https://melhorenvio.com.br/?next=example',
  ]) assert.throws(() => normalizeMelhorEnvioProductionBaseUrl(value), /melhor_envio_production_only/);
});

test('OAuth authorization uses production host and the freight calculation scope', () => {
  const url = new URL(buildMelhorEnvioAuthorizationUrl({
    baseUrl: 'https://melhorenvio.com.br',
    clientId: 'client-demo',
    redirectUri: 'https://example.supabase.co/functions/v1/melhor-envio-oauth',
    state: 'a'.repeat(64),
  }));
  assert.equal(url.origin, 'https://melhorenvio.com.br');
  assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('scope'), 'shipping-calculate');
  assert.equal(url.searchParams.get('state'), 'a'.repeat(64));
});

test('OAuth token body separates authorization-code and refresh grants', () => {
  const codeBody = buildMelhorEnvioTokenBody({
    grant: 'authorization_code', clientId: 'id', clientSecret: 'secret',
    redirectUri: 'https://example.test/callback', code: 'one-time-code',
  });
  assert.equal(codeBody.get('grant_type'), 'authorization_code');
  assert.equal(codeBody.get('code'), 'one-time-code');
  assert.equal(codeBody.has('refresh_token'), false);

  const refreshBody = buildMelhorEnvioTokenBody({
    grant: 'refresh_token', clientId: 'id', clientSecret: 'secret',
    redirectUri: 'https://example.test/callback', refreshToken: 'refresh-token',
  });
  assert.equal(refreshBody.get('grant_type'), 'refresh_token');
  assert.equal(refreshBody.get('refresh_token'), 'refresh-token');
  assert.equal(refreshBody.has('code'), false);
});

test('token response validation records bounded expiry timestamps', () => {
  const tokens = parseMelhorEnvioTokenResponse({
    access_token: 'access-token-value-12345',
    refresh_token: 'refresh-token-value-12345',
    token_type: 'Bearer',
    expires_in: 3600,
  }, 1_800_000_000_000);
  assert.equal(tokens.accessExpiresAt, new Date(1_800_003_600_000).toISOString());
  assert.equal(tokens.refreshExpiresAt, new Date(1_803_888_000_000).toISOString());
  assert.throws(() => parseMelhorEnvioTokenResponse({ access_token: 'x', token_type: 'Basic', expires_in: 3600 }));
});

test('OAuth state is unguessable in shape and SHA-256 is stable', async () => {
  assert.match(createOAuthState(), /^[a-f0-9]{64}$/);
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
