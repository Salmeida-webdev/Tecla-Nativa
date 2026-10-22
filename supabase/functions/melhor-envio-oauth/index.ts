import { readOptionalJsonResponse } from '../_shared/http-response.ts';
import {
  buildMelhorEnvioAuthorizationUrl,
  buildMelhorEnvioUserAgent,
  buildMelhorEnvioTokenBody,
  createOAuthState,
  normalizeMelhorEnvioProductionBaseUrl,
  parseMelhorEnvioTokenResponse,
  sha256Hex,
} from '../_shared/melhor-envio-oauth.ts';

const MAX_BODY_BYTES = 2048;
const DEFAULT_ORIGINS = ['https://teclanativa.netlify.app', 'http://localhost:3000', 'http://127.0.0.1:3000'];
type JsonRecord = Record<string, unknown>;
type OAuthState = { store_id: string; user_id: string; return_origin: string; expires_at: string };

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}

function origins(): Set<string> {
  return new Set([...DEFAULT_ORIGINS, ...(Deno.env.get('STORE_ALLOWED_ORIGINS') || '').split(',').map((item) => item.trim()).filter(Boolean)]);
}

function object(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function json(body: JsonRecord, status = 200, origin: string | null = null): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  if (origin && origins().has(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function readBody(request: Request): Promise<JsonRecord> {
  const declaredSize = Number(request.headers.get('content-length') || 0);
  if (declaredSize > MAX_BODY_BYTES) throw new Error('payload_too_large');
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
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (bytes.length === 0) return {};
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  const parsed = object(value);
  if (!parsed) throw new Error('invalid_payload');
  return parsed;
}

async function database(path: string, init: RequestInit = {}): Promise<unknown> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  headers.set('authorization', `Bearer ${key}`);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`oauth_database_http_${response.status}`);
  return await readOptionalJsonResponse(response);
}

async function authenticate(request: Request): Promise<string> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('unauthorized');
  const response = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env('SUPABASE_ANON_KEY'), authorization },
    signal: AbortSignal.timeout(8000),
  });
  const user = object(await response.json().catch(() => null));
  if (!response.ok || typeof user?.id !== 'string') throw new Error('unauthorized');
  return user.id;
}

function redirect(returnOrigin: string, outcome: 'connected' | 'denied' | 'failed'): Response {
  const destination = new URL('/painel', returnOrigin);
  destination.searchParams.set('me_oauth', outcome);
  return Response.redirect(destination.toString(), 303);
}

function callbackErrorPage(): Response {
  return new Response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Autorização encerrada</title><body><p>Não foi possível validar esta autorização. Volte ao painel da Tecla Nativa e tente conectar novamente.</p></body></html>', {
    status: 400,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' },
  });
}

async function startAuthorization(request: Request, origin: string | null): Promise<Response> {
  if (!origin || !origins().has(origin)) return json({ error: 'origin_not_allowed' }, 403);
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    return json({ error: 'unsupported_media_type' }, 415, origin);
  }
  const body = await readBody(request);
  if (Object.keys(body).length > 0) return json({ error: 'invalid_payload' }, 400, origin);
  const userId = await authenticate(request);
  const baseUrl = normalizeMelhorEnvioProductionBaseUrl(env('MELHOR_ENVIO_BASE_URL'));
  const clientId = env('MELHOR_ENVIO_CLIENT_ID');
  const redirectUri = `${env('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/melhor-envio-oauth`;
  const storeRows = await database('stores?select=id&slug=eq.tecla-nativa&limit=1') as Array<{ id: string }> | null;
  const store = storeRows?.[0];
  if (!store?.id) throw new Error('store_not_found');
  const membershipRows = await database(`store_memberships?select=id,role,status&store_id=eq.${store.id}&user_id=eq.${userId}&status=eq.active&limit=1`) as Array<{ id: string; role: string; status: string }> | null;
  const membership = membershipRows?.[0];
  if (!membership || !['owner', 'admin'].includes(membership.role)) throw new Error('forbidden');

  const state = createOAuthState();
  const stateHash = await sha256Hex(state);
  const now = Date.now();
  await database('rpc/tn_create_me_oauth_state', {
    method: 'POST',
    body: JSON.stringify({
      p_state_hash: stateHash,
      p_store_id: store.id,
      p_user_id: userId,
      p_return_origin: origin,
      p_expires_at: new Date(now + 10 * 60 * 1000).toISOString(),
    }),
  });

  const authorizationUrl = buildMelhorEnvioAuthorizationUrl({ baseUrl, clientId, redirectUri, state });
  return json({ authorization_url: authorizationUrl }, 200, origin);
}

async function finishAuthorization(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  if (!/^[a-f0-9]{64}$/.test(state)) return callbackErrorPage();

  const stateRows = await database('rpc/tn_consume_me_oauth_state', {
    method: 'POST',
    body: JSON.stringify({ p_state_hash: await sha256Hex(state) }),
  }) as OAuthState[] | null;
  const savedState = stateRows?.[0];
  if (!savedState || !origins().has(savedState.return_origin)) return callbackErrorPage();

  if (url.searchParams.has('error')) return redirect(savedState.return_origin, 'denied');
  const code = (url.searchParams.get('code') || '').trim();
  if (!code || code.length > 2048) return redirect(savedState.return_origin, 'failed');

  const membershipRows = await database(`store_memberships?select=id,role,status&store_id=eq.${savedState.store_id}&user_id=eq.${savedState.user_id}&status=eq.active&limit=1`) as Array<{ id: string; role: string; status: string }> | null;
  const membership = membershipRows?.[0];
  if (!membership || !['owner', 'admin'].includes(membership.role)) return redirect(savedState.return_origin, 'denied');

  const baseUrl = normalizeMelhorEnvioProductionBaseUrl(env('MELHOR_ENVIO_BASE_URL'));
  const redirectUri = `${env('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/melhor-envio-oauth`;
  const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': buildMelhorEnvioUserAgent(env('MELHOR_ENVIO_CONTACT_EMAIL')),
    },
    body: buildMelhorEnvioTokenBody({
      grant: 'authorization_code',
      clientId: env('MELHOR_ENVIO_CLIENT_ID'),
      clientSecret: env('MELHOR_ENVIO_CLIENT_SECRET'),
      redirectUri,
      code,
    }).toString(),
    signal: AbortSignal.timeout(10000),
  });
  if (!tokenResponse.ok) {
    console.error('melhor_envio_oauth_exchange_failed', tokenResponse.status);
    return redirect(savedState.return_origin, 'failed');
  }

  let tokenSet;
  try {
    tokenSet = parseMelhorEnvioTokenResponse(await tokenResponse.json(), Date.now());
  } catch {
    console.error('melhor_envio_oauth_invalid_token_response');
    return redirect(savedState.return_origin, 'failed');
  }

  try {
    await database('rpc/tn_save_me_oauth_tokens', {
      method: 'POST',
      body: JSON.stringify({
        p_store_id: savedState.store_id,
        p_access_token: tokenSet.accessToken,
        p_refresh_token: tokenSet.refreshToken,
        p_access_expires_at: tokenSet.accessExpiresAt,
        p_refresh_expires_at: tokenSet.refreshExpiresAt,
      }),
    });
  } catch {
    console.error('melhor_envio_oauth_token_storage_failed');
    return redirect(savedState.return_origin, 'failed');
  }

  const safeConfig = {
    sandbox: false,
    environment: 'production',
    oauth_authorized: true,
    access_expires_at: tokenSet.accessExpiresAt,
    last_check_ok: false,
    last_check_message: 'Autorização concluída. Execute o teste de acesso no painel.',
  };
  await database('integration_configs?on_conflict=store_id,provider', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      store_id: savedState.store_id,
      provider: 'melhor_envio',
      status: 'not_configured',
      secret_reference: 'SUPABASE_VAULT:melhor_envio_oauth_credentials',
      safe_config: safeConfig,
    }),
  });
  await database('audit_events', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      store_id: savedState.store_id,
      actor_user_id: savedState.user_id,
      action: 'integration.melhor_envio.authorized',
      entity_table: 'integration_configs',
      safe_changes: { sandbox: false, environment: 'production', oauth_authorized: true },
      source: 'admin',
    }),
  });
  return redirect(savedState.return_origin, 'connected');
}

async function handle(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') {
    const headers = new Headers({
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      'access-control-max-age': '86400',
      'cache-control': 'no-store',
    });
    if (origin && origins().has(origin)) {
      headers.set('access-control-allow-origin', origin);
      headers.set('vary', 'Origin');
    }
    return new Response(null, { status: 204, headers });
  }
  if (request.method === 'GET') {
    try { return await finishAuthorization(request); }
    catch (cause) {
      const code = cause instanceof Error ? cause.message : 'unexpected_error';
      console.error('melhor_envio_oauth_callback_failed', code.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80));
      return callbackErrorPage();
    }
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
  if (origin && !origins().has(origin)) return json({ error: 'origin_not_allowed' }, 403);
  try {
    return await startAuthorization(request, origin);
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : 'unexpected_error';
    console.error('melhor_envio_oauth_start_failed', code.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80));
    const status = code === 'unauthorized' ? 401
      : code === 'forbidden' ? 403
      : code === 'payload_too_large' ? 413
      : code === 'invalid_payload' ? 400
      : code === 'store_not_found' ? 503
      : 500;
    return json({ error: status < 500 ? code : 'oauth_start_failed' }, status, origin);
  }
}

Deno.serve(handle);
