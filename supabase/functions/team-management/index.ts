const DEFAULT_ORIGINS = ['https://teclanativa.netlify.app', 'http://localhost:3000', 'http://127.0.0.1:3000'];
const ROLE_SET = new Set(['admin','catalog','inventory','fulfillment','support','finance','marketing','analyst','purchasing']);
type JsonRecord = Record<string, unknown>;

function env(name: string): string { const value = Deno.env.get(name)?.trim(); if (!value) throw new Error(`missing_env_${name}`); return value; }
function origins() { return new Set([...DEFAULT_ORIGINS, ...(Deno.env.get('STORE_ALLOWED_ORIGINS') ?? '').split(',').map((x) => x.trim()).filter(Boolean)]); }
function json(body: JsonRecord, status = 200, origin: string | null = null) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  if (origin && origins().has(origin)) { headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); }
  return new Response(JSON.stringify(body), { status, headers });
}
function obj(value: unknown): JsonRecord | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null; }
async function readJson(request: Request) {
  const text = await request.text(); if (text.length > 12000) throw new Error('payload_too_large');
  return obj(JSON.parse(text));
}
async function serviceRequest(path: string, init: RequestInit = {}) {
  const base = env('SUPABASE_URL').replace(/\/$/, ''); const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers = new Headers(init.headers); headers.set('apikey', key); headers.set('authorization', `Bearer ${key}`); headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${base}${path}`, { ...init, headers });
  if (!response.ok) { const detail = await response.text().catch(() => ''); console.error('team_management_database_error', response.status, detail.slice(0, 400)); throw new Error(`database_http_${response.status}`); }
  return response.status === 204 ? null : response.json();
}
async function authenticate(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('unauthorized');
  const response = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env('SUPABASE_ANON_KEY'), authorization },
  });
  if (!response.ok) throw new Error('unauthorized');
  const user = obj(await response.json());
  if (typeof user?.id !== 'string' || typeof user.email !== 'string') throw new Error('unauthorized');
  return { id: user.id, email: user.email };
}

async function handle(request: Request): Promise<Response> {
  const origin = request.headers.get('origin'); const allowed = origins();
  if (request.method === 'OPTIONS') {
    const headers = new Headers({ 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-max-age': '86400' });
    if (origin && allowed.has(origin)) { headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); }
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
  if (origin && !allowed.has(origin)) return json({ error: 'origin_not_allowed' }, 403);
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return json({ error: 'unsupported_media_type' }, 415, origin);

  try {
    const body = await readJson(request); if (!body) return json({ error: 'invalid_payload' }, 400, origin);
    const user = await authenticate(request);
    const action = typeof body.action === 'string' ? body.action : '';
    const storeRows = await serviceRequest('/rest/v1/stores?select=id&slug=eq.tecla-nativa&limit=1') as Array<{ id: string }>;
    const store = storeRows?.[0]; if (!store) throw new Error('store_not_found');
    const now = new Date().toISOString();
    if (action === 'accept_invite') {
      const rows = await serviceRequest(`/rest/v1/store_memberships?select=id,email_snapshot,status&store_id=eq.${store.id}&user_id=eq.${user.id}&limit=1`) as Array<{ id: string; email_snapshot: string | null; status: string }>;
      const pending = rows?.[0];
      if (!pending || pending.status !== 'invited' || pending.email_snapshot?.toLowerCase() !== user.email.toLowerCase()) throw new Error('invite_not_found');
      await serviceRequest(`/rest/v1/store_memberships?id=eq.${pending.id}&store_id=eq.${store.id}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'active', joined_at: now }),
      });
      await serviceRequest('/rest/v1/audit_events', { method: 'POST', body: JSON.stringify({ store_id: store.id, actor_user_id: user.id, action: 'team.invite_accepted', entity_table: 'store_memberships', entity_id: pending.id, safe_changes: { status: 'active' }, source: 'admin' }) });
      return json({ ok: true, status: 'active' }, 200, origin);
    }

    const actorRows = await serviceRequest(`/rest/v1/store_memberships?select=id,role,status&store_id=eq.${store.id}&user_id=eq.${user.id}&limit=1`) as Array<{ id: string; role: string; status: string }>;
    const actor = actorRows?.[0];
    if (!actor || actor.status !== 'active' || !['owner','admin'].includes(actor.role)) throw new Error('forbidden');

    if (action === 'invite') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const role = typeof body.role === 'string' ? body.role : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('invalid_email');
      if (!ROLE_SET.has(role)) throw new Error('invalid_role');
      if (role === 'admin' && actor.role !== 'owner') throw new Error('owner_required');
      const existingRows = await serviceRequest(`/rest/v1/store_memberships?select=id,status&store_id=eq.${store.id}&email_snapshot=ilike.${encodeURIComponent(email)}&limit=1`) as Array<{ id: string; status: string }>;
      if (existingRows?.some((row) => row.status === 'active')) throw new Error('member_already_active');
      const site = new URL(env('SITE_PUBLIC_URL'));
      if (site.protocol !== 'https:' || !allowed.has(site.origin)) throw new Error('public_site_url_not_allowed');
      const redirect = new URL('/painel/aceitar-convite', site).toString();
      const inviteUrl = `${env('SUPABASE_URL').replace(/\/$/, '')}/auth/v1/invite?redirect_to=${encodeURIComponent(redirect)}`;
      const inviteResponse = await fetch(inviteUrl, {
        method: 'POST',
        headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ email }),
      });
      const invited = obj(await inviteResponse.json().catch(() => null));
      if (!inviteResponse.ok || typeof invited?.id !== 'string') {
        console.error('team_invite_provider_error', inviteResponse.status, invited?.msg ?? invited?.message ?? 'unknown');
        throw new Error(inviteResponse.status === 422 ? 'invite_already_sent' : 'invite_send_failed');
      }
      await serviceRequest('/rest/v1/store_memberships?on_conflict=store_id,user_id', {
        method: 'POST',
        headers: { prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ store_id: store.id, user_id: invited.id, email_snapshot: email, role, status: 'invited', invited_at: now, joined_at: null }),
      });
      await serviceRequest('/rest/v1/audit_events', { method: 'POST', body: JSON.stringify({ store_id: store.id, actor_user_id: user.id, action: 'team.invited', entity_table: 'store_memberships', safe_changes: { email, role }, source: 'admin' }) });
      return json({ ok: true, email, role }, 200, origin);
    }

    const membershipId = typeof body.membership_id === 'string' ? body.membership_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(membershipId)) throw new Error('invalid_membership');
    const targetRows = await serviceRequest(`/rest/v1/store_memberships?select=id,user_id,role,status,email_snapshot&store_id=eq.${store.id}&id=eq.${membershipId}&limit=1`) as Array<{ id: string; user_id: string; role: string; status: string; email_snapshot: string | null }>;
    const target = targetRows?.[0]; if (!target) throw new Error('member_not_found');
    if (target.role === 'owner' || target.user_id === user.id) throw new Error('owner_membership_locked');
    let changes: JsonRecord;
    if (action === 'update_role') {
      const role = typeof body.role === 'string' ? body.role : '';
      if (!ROLE_SET.has(role)) throw new Error('invalid_role');
      if (role === 'admin' && actor.role !== 'owner') throw new Error('owner_required');
      changes = { role };
    } else if (action === 'set_status') {
      const status = body.status === 'active' ? 'active' : body.status === 'disabled' ? 'disabled' : null;
      if (!status) throw new Error('invalid_status');
      changes = { status, ...(status === 'active' ? { joined_at: now } : {}) };
    } else throw new Error('invalid_action');

    await serviceRequest(`/rest/v1/store_memberships?id=eq.${target.id}&store_id=eq.${store.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
    await serviceRequest('/rest/v1/audit_events', { method: 'POST', body: JSON.stringify({ store_id: store.id, actor_user_id: user.id, action: `team.${action}`, entity_table: 'store_memberships', entity_id: target.id, safe_changes: changes, source: 'admin' }) });
    return json({ ok: true, membership_id: target.id, ...changes }, 200, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unexpected_error';
    const status = code === 'unauthorized' ? 401 : code === 'forbidden' || code === 'owner_required' || code === 'owner_membership_locked' ? 403
      : code === 'store_not_found' ? 503 : code === 'payload_too_large' ? 413
      : code.startsWith('invalid_') || code.startsWith('member_') || code.startsWith('invite_') ? 400 : 500;
    console.error('team_management_failed', code);
    return json({ error: status < 500 ? code : 'team_operation_failed' }, status, origin);
  }
}

Deno.serve(handle);
