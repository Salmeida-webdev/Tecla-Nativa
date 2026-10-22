export const MELHOR_ENVIO_PRODUCTION = 'https://melhorenvio.com.br';
export const MELHOR_ENVIO_SCOPES = ['shipping-calculate'] as const;
export const ACCESS_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_TOKEN_LIFETIME_MS = 45 * 24 * 60 * 60 * 1000;

export type OAuthGrant = 'authorization_code' | 'refresh_token';

export type MelhorEnvioTokenSet = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
};

export function buildMelhorEnvioUserAgent(contactEmail: string): string {
  const email = contactEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) {
    throw new Error('missing_or_invalid_MELHOR_ENVIO_CONTACT_EMAIL');
  }
  return `Tecla Nativa (${email})`;
}

export function normalizeMelhorEnvioProductionBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('invalid_MELHOR_ENVIO_BASE_URL');
  }
  if (url.origin !== MELHOR_ENVIO_PRODUCTION || !['', '/'].includes(url.pathname) || url.search || url.hash || url.username || url.password) {
    throw new Error('melhor_envio_production_only');
  }
  return MELHOR_ENVIO_PRODUCTION;
}

export function buildMelhorEnvioAuthorizationUrl(input: {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const baseUrl = normalizeMelhorEnvioProductionBaseUrl(input.baseUrl);
  if (!input.clientId.trim() || !input.redirectUri.trim() || !/^[A-Za-z0-9_-]{40,100}$/.test(input.state)) {
    throw new Error('invalid_oauth_authorization_request');
  }
  const url = new URL('/oauth/authorize', baseUrl);
  url.searchParams.set('client_id', input.clientId.trim());
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', input.state);
  url.searchParams.set('scope', MELHOR_ENVIO_SCOPES.join(' '));
  return url.toString();
}

export function buildMelhorEnvioTokenBody(input: {
  grant: OAuthGrant;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code?: string;
  refreshToken?: string;
}): URLSearchParams {
  const body = new URLSearchParams({
    grant_type: input.grant,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
  });
  if (input.grant === 'authorization_code') {
    if (!input.code?.trim()) throw new Error('authorization_code_missing');
    body.set('code', input.code.trim());
  } else {
    if (!input.refreshToken?.trim()) throw new Error('refresh_token_missing');
    body.set('refresh_token', input.refreshToken.trim());
  }
  return body;
}

export function parseMelhorEnvioTokenResponse(value: unknown, now = Date.now()): MelhorEnvioTokenSet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_oauth_token_response');
  const payload = value as Record<string, unknown>;
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token.trim() : '';
  const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token.trim() : '';
  const rawExpiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : Number(payload.expires_in);
  const tokenType = typeof payload.token_type === 'string' ? payload.token_type.toLowerCase() : '';
  if (!accessToken || accessToken.length > 8192 || !refreshToken || refreshToken.length > 8192 || tokenType !== 'bearer') {
    throw new Error('invalid_oauth_token_response');
  }
  if (!Number.isSafeInteger(rawExpiresIn) || rawExpiresIn < 60 || rawExpiresIn > 60 * 24 * 60 * 60) {
    throw new Error('invalid_oauth_token_expiry');
  }
  return {
    accessToken,
    refreshToken,
    accessExpiresAt: new Date(now + rawExpiresIn * 1000).toISOString(),
    refreshExpiresAt: new Date(now + REFRESH_TOKEN_LIFETIME_MS).toISOString(),
  };
}

export function createOAuthState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

