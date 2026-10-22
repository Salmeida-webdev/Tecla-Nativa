import {
  buildMelhorEnvioTokenBody,
  normalizeMelhorEnvioProductionBaseUrl,
  parseMelhorEnvioTokenResponse,
} from './melhor-envio-oauth.ts';

type JsonRecord = Record<string, unknown>;
type TokenRow = {
  access_token: string;
  refresh_token: string;
  access_expires_at: string;
  refresh_expires_at: string;
  reauthorization_required: boolean;
  last_safe_error: string | null;
};
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type MelhorEnvioTokenManagerOptions = {
  supabaseUrl: string;
  serviceRoleKey: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  redirectUri: string;
  userAgent: string;
  fetcher?: Fetcher;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

function object(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

async function responseJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body.trim()) return null;
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('invalid_json_response');
  }
}

function parseRows(value: unknown): TokenRow[] {
  if (!Array.isArray(value)) throw new Error('melhor_envio_token_store_unavailable');
  return value.flatMap((item) => {
    const row = object(item);
    if (!row || typeof row.access_token !== 'string' || typeof row.refresh_token !== 'string'
      || typeof row.access_expires_at !== 'string' || typeof row.refresh_expires_at !== 'string'
      || typeof row.reauthorization_required !== 'boolean') return [];
    return [{
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      access_expires_at: row.access_expires_at,
      refresh_expires_at: row.refresh_expires_at,
      reauthorization_required: row.reauthorization_required,
      last_safe_error: typeof row.last_safe_error === 'string' ? row.last_safe_error : null,
    }];
  });
}

export function createMelhorEnvioTokenManager(options: MelhorEnvioTokenManagerOptions) {
  const baseUrl = normalizeMelhorEnvioProductionBaseUrl(options.baseUrl);
  const supabaseUrl = options.supabaseUrl.replace(/\/$/, '');
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  if (!supabaseUrl || !options.serviceRoleKey || !options.clientId || !options.clientSecret || !options.redirectUri) {
    throw new Error('melhor_envio_oauth_not_configured');
  }

  async function rpc(name: string, body: JsonRecord): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(`${supabaseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: options.serviceRoleKey,
          authorization: `Bearer ${options.serviceRoleKey}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new Error('melhor_envio_token_store_unavailable');
    }
    if (!response.ok) throw new Error('melhor_envio_token_store_unavailable');
    return await responseJson(response);
  }

  async function load(storeId: string): Promise<TokenRow | null> {
    const value = await rpc('tn_get_me_oauth_tokens', { p_store_id: storeId });
    return parseRows(value)[0] ?? null;
  }

  async function release(storeId: string, safeError: string | null, reauthorizationRequired = false): Promise<void> {
    await rpc('tn_release_me_oauth_refresh', {
      p_store_id: storeId,
      p_safe_error: safeError,
      p_reauthorization_required: reauthorizationRequired,
    });
  }

  function assertReauthorization(row: TokenRow): void {
    const refreshExpiry = Date.parse(row.refresh_expires_at);
    if (row.reauthorization_required || !Number.isFinite(refreshExpiry) || refreshExpiry <= now()) {
      throw new Error('melhor_envio_reauthorization_required');
    }
  }

  function hasFreshAccessToken(row: TokenRow): boolean {
    const expiry = Date.parse(row.access_expires_at);
    return Number.isFinite(expiry) && expiry > now() + 5 * 60 * 1000;
  }

  async function waitForRefresh(storeId: string): Promise<string> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await sleep(250);
      const row = await load(storeId);
      if (!row) throw new Error('melhor_envio_not_connected');
      assertReauthorization(row);
      if (hasFreshAccessToken(row)) return row.access_token;
    }
    throw new Error('melhor_envio_token_refresh_busy');
  }

  async function refresh(storeId: string, row: TokenRow): Promise<string> {
    if (Date.parse(row.refresh_expires_at) <= now()) {
      await release(storeId, 'refresh_expired', true);
      throw new Error('melhor_envio_reauthorization_required');
    }

    let response: Response;
    try {
      response = await fetcher(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': options.userAgent,
        },
        body: buildMelhorEnvioTokenBody({
          grant: 'refresh_token',
          clientId: options.clientId,
          clientSecret: options.clientSecret,
          redirectUri: options.redirectUri,
          refreshToken: row.refresh_token,
        }).toString(),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      try { await release(storeId, 'refresh_failed', false); } catch { /* preserve the stable error */ }
      throw new Error('melhor_envio_token_refresh_failed');
    }
    if (!response.ok) {
      const expired = response.status === 400 || response.status === 401;
      await release(storeId, expired ? 'refresh_expired' : 'refresh_failed', expired);
      throw new Error(expired ? 'melhor_envio_reauthorization_required' : 'melhor_envio_token_refresh_failed');
    }

    let tokenSet;
    try {
      tokenSet = parseMelhorEnvioTokenResponse(await responseJson(response), now());
    } catch {
      await release(storeId, 'refresh_expired', true);
      throw new Error('melhor_envio_reauthorization_required');
    }

    const saveArgs = {
      p_store_id: storeId,
      p_access_token: tokenSet.accessToken,
      p_refresh_token: tokenSet.refreshToken,
      p_access_expires_at: tokenSet.accessExpiresAt,
      p_refresh_expires_at: tokenSet.refreshExpiresAt,
    };
    try {
      await rpc('tn_save_me_oauth_tokens', saveArgs);
    } catch {
      // A repeated save is safe: the Vault update is transactional and token values
      // are the same. This covers a lost response after a successful database write.
      try {
        await rpc('tn_save_me_oauth_tokens', saveArgs);
      } catch {
        try { await release(storeId, 'token_storage_failed', true); } catch { /* preserve the stable error */ }
        throw new Error('melhor_envio_token_storage_failed');
      }
    }
    return tokenSet.accessToken;
  }

  async function getAccessToken(storeId: string): Promise<string> {
    let row = await load(storeId);
    if (!row) throw new Error('melhor_envio_not_connected');
    assertReauthorization(row);
    if (hasFreshAccessToken(row)) return row.access_token;

    const claimed = await rpc('tn_claim_me_oauth_refresh', { p_store_id: storeId });
    if (claimed !== true) return await waitForRefresh(storeId);

    try {
      row = await load(storeId);
      if (!row) throw new Error('melhor_envio_not_connected');
      assertReauthorization(row);
      if (hasFreshAccessToken(row)) {
        await release(storeId, null, false);
        return row.access_token;
      }
      return await refresh(storeId, row);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'melhor_envio_token_refresh_failed';
      if (!['melhor_envio_reauthorization_required', 'melhor_envio_token_refresh_failed', 'melhor_envio_token_storage_failed'].includes(code)) {
        try { await release(storeId, 'refresh_failed', false); } catch { /* do not hide the original stable error */ }
      }
      throw cause;
    }
  }

  return { getAccessToken };
}

