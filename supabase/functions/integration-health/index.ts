import { readOptionalJsonResponse } from '../_shared/http-response.ts';
import { buildMelhorEnvioUserAgent, normalizeMelhorEnvioProductionBaseUrl } from '../_shared/melhor-envio-oauth.ts';
import { createMelhorEnvioTokenManager } from '../_shared/melhor-envio-token-manager.ts';

const MAX_BODY_BYTES = 4096;
const DEFAULT_ORIGINS = ['https://teclanativa.netlify.app','http://localhost:3000','http://127.0.0.1:3000'];
type JsonRecord = Record<string, unknown>;

function env(name: string) { const value = Deno.env.get(name)?.trim(); if (!value) throw new Error(`missing_env_${name}`); return value; }
function origins() { return new Set([...DEFAULT_ORIGINS, ...(Deno.env.get('STORE_ALLOWED_ORIGINS') || '').split(',').map((item) => item.trim()).filter(Boolean)]); }
function object(value: unknown): JsonRecord | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null; }
function json(body: JsonRecord, status = 200, origin: string | null = null) {
  const headers = new Headers({ 'content-type':'application/json; charset=utf-8','cache-control':'no-store' });
  if (origin && origins().has(origin)) { headers.set('access-control-allow-origin',origin); headers.set('vary','Origin'); }
  return new Response(JSON.stringify(body),{status,headers});
}
async function readBody(request: Request) {
  const reader=request.body?.getReader(); if (!reader) return {};
  const parts: Uint8Array[]=[]; let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY_BYTES){await reader.cancel();throw new Error('payload_too_large');}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  return object(JSON.parse(new TextDecoder().decode(bytes)));
}
async function database(path: string, init: RequestInit = {}) {
  const key=env('SUPABASE_SERVICE_ROLE_KEY');const headers=new Headers(init.headers);
  headers.set('apikey',key);headers.set('authorization',`Bearer ${key}`);headers.set('accept','application/json');
  if(init.body)headers.set('content-type','application/json');
  const response=await fetch(`${env('SUPABASE_URL').replace(/\/$/,'')}/rest/v1/${path}`,{...init,headers,signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error(`database_http_${response.status}`);
  return await readOptionalJsonResponse(response);
}
async function authenticate(request: Request) {
  const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))throw new Error('unauthorized');
  const response=await fetch(`${env('SUPABASE_URL').replace(/\/$/,'')}/auth/v1/user`,{headers:{apikey:env('SUPABASE_ANON_KEY'),authorization},signal:AbortSignal.timeout(8000)});
  const user=object(await response.json().catch(()=>null));if(!response.ok||typeof user?.id!=='string')throw new Error('unauthorized');
  return user.id;
}
async function checkProvider(provider: 'pagbank'|'melhor_envio', storeId: string) {
  const controller=AbortSignal.timeout(10000);
  if(provider==='pagbank'){
    const token=env('PAGBANK_ACCESS_TOKEN');
    // Read-only request against PagBank Sandbox. A deliberately nonexistent charge
    // lets us distinguish accepted credentials (4xx resource response) from 401/403.
    const response=await fetch('https://sandbox.api.pagseguro.com/orders?charge_id=CHAR_0000000000000',{headers:{authorization:`Bearer ${token}`,accept:'application/json'},signal:controller});
    const authenticated=response.status===200||response.status===400||response.status===404;
    return {ok:authenticated,status:authenticated?'sandbox':'error',message:authenticated?'Credencial aceita pelo endpoint Sandbox.':'O PagBank Sandbox recusou a credencial ou está indisponível.',httpStatus:response.status};
  }
  const supabaseUrl=env('SUPABASE_URL');
  const userAgent=buildMelhorEnvioUserAgent(env('MELHOR_ENVIO_CONTACT_EMAIL'));
  const baseUrl=normalizeMelhorEnvioProductionBaseUrl(env('MELHOR_ENVIO_BASE_URL'));
  const tokenManager=createMelhorEnvioTokenManager({
    supabaseUrl,
    serviceRoleKey:env('SUPABASE_SERVICE_ROLE_KEY'),
    clientId:env('MELHOR_ENVIO_CLIENT_ID'),
    clientSecret:env('MELHOR_ENVIO_CLIENT_SECRET'),
    baseUrl,
    redirectUri:`${supabaseUrl.replace(/\/$/,'')}/functions/v1/melhor-envio-oauth`,
    userAgent,
  });
  const token=await tokenManager.getAccessToken(storeId);
  const originRows=await database(`store_settings?select=setting_value&store_id=eq.${storeId}&setting_key=eq.shipping_origin&limit=1`) as Array<{setting_value:unknown}>;
  const origin=object(originRows?.[0]?.setting_value);
  const originPostalCode=typeof origin?.postal_code==='string'?origin.postal_code.replace(/\D/g,''):'';
  if(!/^\d{8}$/.test(originPostalCode))throw new Error('shipping_origin_not_configured');
  const response=await fetch(`${baseUrl}/api/v2/me/shipment/calculate`,{
    method:'POST',
    headers:{authorization:`Bearer ${token}`,accept:'application/json','content-type':'application/json','user-agent':userAgent},
    body:JSON.stringify({
      from:{postal_code:originPostalCode},
      to:{postal_code:'01310100'},
      products:[{id:'tecla-nativa-health-check',length:30,width:20,height:10,weight:1,insurance_value:15,quantity:1}],
      options:{receipt:false,own_hand:false},
    }),
    signal:controller,
  });
  const accepted=response.ok||response.status===422;
  const message=response.status===422
    ?'Autorização de produção aceita. O trajeto de teste não retornou frete; nenhuma etiqueta foi criada.'
    :accepted
      ?'Autorização aceita pelo serviço de cotação de produção. Nenhuma etiqueta foi criada.'
      :response.status===401||response.status===403
        ?'O Melhor Envio recusou a autorização. Reconecte a conta de produção no painel.'
        :'Não foi possível concluir a cotação de teste do Melhor Envio em produção.';
  return {ok:accepted,status:accepted?'active':'error',message,httpStatus:response.status};
}

async function handle(request: Request): Promise<Response> {
  const origin=request.headers.get('origin');const allowed=origins();
  if(request.method==='OPTIONS'){
    const headers=new Headers({'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, apikey, content-type, x-client-info','access-control-max-age':'86400'});
    if(origin&&allowed.has(origin)){headers.set('access-control-allow-origin',origin);headers.set('vary','Origin');}
    return new Response(null,{status:204,headers});
  }
  if(request.method!=='POST')return json({error:'method_not_allowed'},405,origin);
  if(origin&&!allowed.has(origin))return json({error:'origin_not_allowed'},403);
  if(request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')return json({error:'unsupported_media_type'},415,origin);
  try{
    const body=await readBody(request);const actor=await authenticate(request);
    const provider=body?.provider;
    if(provider!=='pagbank'&&provider!=='melhor_envio')return json({error:'invalid_provider'},400,origin);
    const stores=await database('stores?select=id&slug=eq.tecla-nativa&limit=1') as Array<{id:string}>;
    const store=stores?.[0];if(!store)throw new Error('store_not_found');
    const memberships=await database(`store_memberships?select=id,role,status&store_id=eq.${store.id}&user_id=eq.${actor}&limit=1`) as Array<{id:string;role:string;status:string}>;
    const member=memberships?.[0];if(!member||member.status!=='active'||!['owner','admin'].includes(member.role))throw new Error('forbidden');
    let result: {ok:boolean;status:string;message:string;httpStatus?:number};
    try{result=await checkProvider(provider,store.id);}catch(cause){
      const code=cause instanceof Error?cause.message:'provider_error';
      const notConnected=code==='melhor_envio_not_connected';
      const reauthorizationRequired=code==='melhor_envio_reauthorization_required';
      result={ok:false,status:'error',message:notConnected?'Conecte sua conta real do Melhor Envio pelo painel.':reauthorizationRequired?'A autorização do Melhor Envio expirou. Reconecte a conta pelo painel.':code==='shipping_origin_not_configured'?'Configure um CEP de origem válido nas configurações de entrega.':code.startsWith('missing_env_')||code==='melhor_envio_oauth_not_configured'?'A integração de produção do Melhor Envio ainda não está configurada no servidor.':'Não foi possível consultar o provedor agora.'};
    }
    const checkedAt=new Date().toISOString();
    const existingRows=await database(`integration_configs?select=safe_config&store_id=eq.${store.id}&provider=eq.${provider}&limit=1`) as Array<{safe_config:unknown}>;
    const existingSafeConfig=object(existingRows?.[0]?.safe_config)??{};
    const safeConfig={...existingSafeConfig,sandbox:provider==='pagbank',environment:provider==='melhor_envio'?'production':'sandbox',last_check_ok:result.ok,last_check_message:result.message,http_status:result.httpStatus??null,...(provider==='melhor_envio'&&result.ok?{oauth_authorized:true}:{})};
    await database(`integration_configs?on_conflict=store_id,provider`,{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({store_id:store.id,provider,status:result.status,last_checked_at:checkedAt,safe_config:safeConfig,secret_reference:provider==='pagbank'?'PAGBANK_ACCESS_TOKEN':'SUPABASE_VAULT:melhor_envio_oauth_credentials'})});
    await database('audit_events',{method:'POST',headers:{prefer:'return=minimal'},body:JSON.stringify({store_id:store.id,actor_user_id:actor,action:`integration.${provider}.checked`,entity_table:'integration_configs',safe_changes:{status:result.status,sandbox:provider==='pagbank',environment:provider==='melhor_envio'?'production':'sandbox',http_status:result.httpStatus??null},source:'admin'})});
    return json({ok:result.ok,status:result.status,message:result.message,checkedAt},200,origin);
  }catch(cause){
    const code=cause instanceof Error?cause.message:'unexpected_error';
    const status=code==='unauthorized'?401:code==='forbidden'?403:code==='payload_too_large'?413:code==='store_not_found'?503:500;
    console.error('integration_health_failed',code);
    return json({error:status<500?code:'integration_check_failed'},status,origin);
  }
}
Deno.serve(handle);
