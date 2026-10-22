import { cartFingerprint, normalizeCart, normalizePostalCode } from '../_shared/commerce.ts';
import { buildMelhorEnvioUserAgent, normalizeMelhorEnvioProductionBaseUrl } from '../_shared/melhor-envio-oauth.ts';
import { createMelhorEnvioTokenManager } from '../_shared/melhor-envio-token-manager.ts';

const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_ORIGINS = [
  'https://teclanativa.netlify.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function allowedOrigins(): Set<string> {
  const configured = Deno.env.get('STORE_ALLOWED_ORIGINS')?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  return new Set([...DEFAULT_ORIGINS, ...configured]);
}

type JsonRecord = Record<string, unknown>;
type CatalogVariant = {
  id: string;
  sku: string;
  product_id: string;
  weight_grams: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  price_override: number | null;
};

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function json(body: JsonRecord, status = 200, origin: string | null = null): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function readBody(request: Request): Promise<unknown> {
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
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}

async function database(path: string, init: RequestInit = {}): Promise<unknown> {
  const baseUrl = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  headers.set('authorization', `Bearer ${key}`);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (init.body && !headers.has('prefer')) headers.set('prefer', 'return=representation');
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) throw new Error(`database_http_${response.status}`);
  return response.status === 204 ? null : response.json();
}

function oneRow<T>(value: unknown, label: string): T {
  if (!Array.isArray(value) || value.length !== 1) throw new Error(label);
  return value[0] as T;
}

function listQuery(ids: string[]): string {
  return `in.(${ids.join(',')})`;
}

function cents(value: unknown): number | null {
  const amount = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function deliveryDays(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 180 ? parsed : null;
}

async function handle(request: Request): Promise<Response> {
  const requestOrigin = request.headers.get('origin');
  const origins = allowedOrigins();
  if (request.method === 'OPTIONS') {
    const headers = new Headers({
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      'access-control-max-age': '86400',
    });
    if (requestOrigin && origins.has(requestOrigin)) {
      headers.set('access-control-allow-origin', requestOrigin);
      headers.set('vary', 'Origin');
    }
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, requestOrigin);
  if (requestOrigin && !origins.has(requestOrigin)) return json({ error: 'origin_not_allowed' }, 403);
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    return json({ error: 'unsupported_media_type' }, 415, requestOrigin);
  }

  try {
    const raw = record(await readBody(request));
    if (!raw) return json({ error: 'invalid_payload' }, 400, requestOrigin);
    const postalCode = normalizePostalCode(raw.postal_code);
    const items = normalizeCart(raw.items);
    const cartHash = await cartFingerprint(items);

    const store = oneRow<{ id: string; status: string }>(
      await database('stores?select=id,status&slug=eq.tecla-nativa&limit=1'),
      'store_not_found',
    );
    if (store.status !== 'active') return json({ error: 'store_not_active' }, 409, requestOrigin);

    const storeFilter = `store_id=eq.${store.id}`;
    const variants = await database(`product_variants?select=id,sku,product_id,weight_grams,length_mm,width_mm,height_mm,price_override&${storeFilter}&active=eq.true&sku=${encodeURIComponent(listQuery(items.map((item) => item.sku)))}`) as CatalogVariant[];
    if (!Array.isArray(variants) || variants.length !== items.length) {
      return json({ error: 'variant_unavailable' }, 422, requestOrigin);
    }
    const productIds = [...new Set(variants.map((variant) => variant.product_id))];
    const products = await database(`products?select=id,name,base_price,category_id,status,primary_image_path&${storeFilter}&id=${encodeURIComponent(listQuery(productIds))}`) as Array<{ id: string; name: string; base_price: number; category_id: string | null; status: string; primary_image_path: string | null }>;
    const categoryIds = [...new Set(products.map((product) => product.category_id).filter((id): id is string => Boolean(id)))];
    const categories = await database(`categories?select=id,active&${storeFilter}&id=${encodeURIComponent(listQuery(categoryIds))}`) as Array<{ id: string; active: boolean }>;
    const inventory = await database(`inventory_levels?select=variant_id,available&${storeFilter}&variant_id=${encodeURIComponent(listQuery(variants.map((variant) => variant.id)))}`) as Array<{ variant_id: string; available: number }>;
    const settings = oneRow<{ setting_value: unknown }>(
      await database(`store_settings?select=setting_value&${storeFilter}&setting_key=eq.shipping_origin&limit=1`),
      'shipping_origin_not_configured',
    );
    const origin = record(settings.setting_value);
    const originPostalCode = typeof origin?.postal_code === 'string' ? origin.postal_code.replace(/\D/g, '') : '';
    if (!/^\d{8}$/.test(originPostalCode)) return json({ error: 'shipping_origin_not_configured' }, 409, requestOrigin);

    const productsById = new Map(products.map((product) => [product.id, product]));
    const activeCategories = new Set(categories.filter((category) => category.active).map((category) => category.id));
    const stockByVariant = new Map(inventory.map((row) => [row.variant_id, row.available]));
    const quoteProducts = items.map((item) => {
      const variant = variants.find((row) => row.sku === item.sku);
      const product = variant ? productsById.get(variant.product_id) : undefined;
      if (!variant || !product || product.status !== 'published' || !product.category_id || !activeCategories.has(product.category_id)) {
        throw new Error('variant_unavailable');
      }
      if ((stockByVariant.get(variant.id) ?? 0) < item.quantity) throw new Error('insufficient_stock');
      const dimensions = [variant.length_mm, variant.width_mm, variant.height_mm];
      if (!variant.weight_grams || dimensions.some((dimension) => !dimension || dimension <= 0)) throw new Error('shipping_dimensions_missing');
      return {
        id: variant.sku,
        length: variant.length_mm! / 10,
        width: variant.width_mm! / 10,
        height: variant.height_mm! / 10,
        weight: variant.weight_grams / 1000,
        insurance_value: Number(variant.price_override ?? product.base_price),
        quantity: item.quantity,
      };
    });

    const supabaseUrl = env('SUPABASE_URL');
    const userAgent = buildMelhorEnvioUserAgent(env('MELHOR_ENVIO_CONTACT_EMAIL'));
    const tokenManager = createMelhorEnvioTokenManager({
      supabaseUrl,
      serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
      clientId: env('MELHOR_ENVIO_CLIENT_ID'),
      clientSecret: env('MELHOR_ENVIO_CLIENT_SECRET'),
      baseUrl: normalizeMelhorEnvioProductionBaseUrl(env('MELHOR_ENVIO_BASE_URL')),
      redirectUri: `${supabaseUrl.replace(/\/$/, '')}/functions/v1/melhor-envio-oauth`,
      userAgent,
    });
    const token = await tokenManager.getAccessToken(store.id);
    const quoteUrl = `${normalizeMelhorEnvioProductionBaseUrl(env('MELHOR_ENVIO_BASE_URL'))}/api/v2/me/shipment/calculate`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let quoteResponse: Response;
    try {
      quoteResponse = await fetch(quoteUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'content-type': 'application/json',
          'user-agent': userAgent,
        },
        body: JSON.stringify({
          from: { postal_code: originPostalCode },
          to: { postal_code: postalCode },
          products: quoteProducts,
          options: { receipt: false, own_hand: false },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!quoteResponse.ok) {
      console.error('melhor_envio_quote_provider_http_error', quoteResponse.status);
      return json({ error: 'shipping_provider_unavailable' }, 502, requestOrigin);
    }
    const quotePayload: unknown = await quoteResponse.json();
    if (!Array.isArray(quotePayload)) return json({ error: 'shipping_provider_invalid_response' }, 502, requestOrigin);

    const now = Date.now();
    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    const quoteRows = quotePayload.flatMap((rawQuote) => {
      const item = record(rawQuote);
      if (!item || item.error) return [];
      const serviceId = typeof item.id === 'string' || typeof item.id === 'number' ? String(item.id) : '';
      const serviceName = typeof item.name === 'string' ? item.name.trim().slice(0, 100) : '';
      const company = record(item.company);
      const carrier = typeof company?.name === 'string' ? company.name.trim().slice(0, 100) : '';
      const amountCents = cents(item.custom_price ?? item.price);
      const delivery = deliveryDays(item.custom_delivery_time ?? item.delivery_time);
      if (!serviceId || !serviceName || !carrier || amountCents === null) return [];
      return [{
        store_id: store.id,
        postal_code: postalCode,
        cart_sha256: cartHash,
        provider_service_id: serviceId,
        carrier,
        service_name: serviceName,
        shipping_total: (amountCents / 100).toFixed(2),
        estimated_delivery_days: delivery,
        safe_metadata: { provider: 'melhor_envio', sandbox: false, environment: 'production' },
        expires_at: expiresAt,
      }];
    });
    if (!quoteRows.length) return json({ error: 'no_shipping_services' }, 422, requestOrigin);

    const inserted = await database('storefront_shipping_quotes?select=id,provider_service_id,carrier,service_name,shipping_total,estimated_delivery_days,expires_at', {
      method: 'POST',
      body: JSON.stringify(quoteRows),
    }) as Array<{ id: string; provider_service_id: string; carrier: string; service_name: string; shipping_total: number; estimated_delivery_days: number | null; expires_at: string }>;
    return json({
      cart_sha256: cartHash,
      expires_at: expiresAt,
      options: inserted.map((quote) => ({
        quote_id: quote.id,
        service_id: quote.provider_service_id,
        carrier: quote.carrier,
        service_name: quote.service_name,
        amount: Number(quote.shipping_total),
        delivery_days: quote.estimated_delivery_days,
        expires_at: quote.expires_at,
      })),
    }, 200, requestOrigin);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unexpected_error';
    const statuses: Record<string, number> = {
      payload_too_large: 413,
      invalid_payload: 400,
      'Informe um CEP válido.': 400,
      'Informe um CEP válido com 8 números.': 400,
      'A sacola deve ter de 1 a 20 variantes diferentes.': 400,
      'Uma variante está sem SKU válido.': 400,
      'A quantidade deve ficar entre 1 e 10 unidades.': 400,
      'Remova variantes duplicadas da sacola.': 400,
      'A quantidade total excede o limite por pedido.': 400,
      variant_unavailable: 422,
      insufficient_stock: 409,
      shipping_dimensions_missing: 409,
      store_not_found: 503,
      shipping_origin_not_configured: 409,
      melhor_envio_not_connected: 503,
      melhor_envio_reauthorization_required: 503,
      melhor_envio_token_refresh_busy: 503,
      melhor_envio_token_refresh_failed: 503,
      melhor_envio_token_storage_failed: 503,
      melhor_envio_token_store_unavailable: 503,
      melhor_envio_oauth_not_configured: 503,
      melhor_envio_production_only: 503,
      invalid_MELHOR_ENVIO_BASE_URL: 503,
      missing_env_MELHOR_ENVIO_CLIENT_ID: 503,
      missing_env_MELHOR_ENVIO_CLIENT_SECRET: 503,
      missing_env_MELHOR_ENVIO_BASE_URL: 503,
      missing_env_SUPABASE_URL: 503,
      missing_env_SUPABASE_SERVICE_ROLE_KEY: 503,
      shipping_provider_timeout: 503,
    };
    console.error('melhor_envio_quote_failed', code);
    return json({ error: statuses[code] === 400 ? code : statuses[code] ? 'shipping_unavailable' : 'shipping_unavailable' }, statuses[code] ?? 500, requestOrigin);
  }
}

Deno.serve(handle);
