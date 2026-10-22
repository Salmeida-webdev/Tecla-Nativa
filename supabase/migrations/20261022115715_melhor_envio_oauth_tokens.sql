-- Keep Melhor Envio OAuth state and credentials server-side in Supabase Vault.
begin;

create extension if not exists supabase_vault with schema vault;
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create table private.melhor_envio_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_origin text not null check (return_origin in (
    'https://teclanativa.netlify.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  )),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '15 minutes')
);

create index melhor_envio_oauth_states_expiry_idx
  on private.melhor_envio_oauth_states(expires_at);

create table private.melhor_envio_oauth_credentials (
  store_id uuid primary key references public.stores(id) on delete cascade,
  access_secret_id uuid not null unique,
  refresh_secret_id uuid not null unique,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  refresh_lock_until timestamptz,
  reauthorization_required boolean not null default false,
  last_safe_error text check (last_safe_error is null or last_safe_error in (
    'refresh_failed', 'refresh_expired', 'token_storage_failed'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (refresh_expires_at > access_expires_at)
);

alter table private.melhor_envio_oauth_states enable row level security;
alter table private.melhor_envio_oauth_credentials enable row level security;
revoke all privileges on table private.melhor_envio_oauth_states, private.melhor_envio_oauth_credentials
  from public, anon, authenticated;
grant all privileges on table private.melhor_envio_oauth_states, private.melhor_envio_oauth_credentials
  to service_role;

create or replace function public.tn_create_me_oauth_state(
  p_state_hash text,
  p_store_id uuid,
  p_user_id uuid,
  p_return_origin text,
  p_expires_at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$'
    or p_store_id is null or p_user_id is null
    or p_return_origin not in ('https://teclanativa.netlify.app','http://localhost:3000','http://127.0.0.1:3000')
    or p_expires_at <= pg_catalog.now()
    or p_expires_at > pg_catalog.now() + interval '15 minutes' then
    raise exception using errcode = '22023', message = 'Os dados de autorização OAuth são inválidos.';
  end if;
  delete from private.melhor_envio_oauth_states where expires_at <= pg_catalog.now();
  insert into private.melhor_envio_oauth_states(state_hash,store_id,user_id,return_origin,expires_at)
  values (p_state_hash,p_store_id,p_user_id,p_return_origin,p_expires_at);
end;
$$;

create or replace function public.tn_consume_me_oauth_state(p_state_hash text)
returns table(store_id uuid,user_id uuid,return_origin text,expires_at timestamptz)
language sql
set search_path = ''
as $$
  delete from private.melhor_envio_oauth_states as state
  where state.state_hash = p_state_hash
    and state.expires_at > pg_catalog.now()
  returning state.store_id,state.user_id,state.return_origin,state.expires_at;
$$;

create or replace function public.tn_save_me_oauth_tokens(
  p_store_id uuid,
  p_access_token text,
  p_refresh_token text,
  p_access_expires_at timestamptz,
  p_refresh_expires_at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_existing private.melhor_envio_oauth_credentials%rowtype;
  v_access_secret_id uuid;
  v_refresh_secret_id uuid;
begin
  if p_store_id is null
    or p_access_token is null or pg_catalog.length(p_access_token) < 16 or pg_catalog.length(p_access_token) > 8192
    or p_refresh_token is null or pg_catalog.length(p_refresh_token) < 16 or pg_catalog.length(p_refresh_token) > 8192
    or p_access_expires_at <= pg_catalog.now()
    or p_refresh_expires_at <= p_access_expires_at
    or p_refresh_expires_at > pg_catalog.now() + interval '60 days' then
    raise exception using errcode = '22023', message = 'Os tokens OAuth do Melhor Envio são inválidos.';
  end if;

  select * into v_existing
  from private.melhor_envio_oauth_credentials
  where store_id = p_store_id
  for update;

  if found then
    perform vault.update_secret(v_existing.access_secret_id,p_access_token,null::text,null::text,null::uuid);
    perform vault.update_secret(v_existing.refresh_secret_id,p_refresh_token,null::text,null::text,null::uuid);
    update private.melhor_envio_oauth_credentials
    set access_expires_at = p_access_expires_at,
        refresh_expires_at = p_refresh_expires_at,
        refresh_lock_until = null,
        reauthorization_required = false,
        last_safe_error = null,
        updated_at = pg_catalog.now()
    where store_id = p_store_id;
  else
    v_access_secret_id := vault.create_secret(
      p_access_token,
      'tn-me-access-' || p_store_id::text || '-' || pg_catalog.gen_random_uuid()::text,
      'Token de acesso Melhor Envio da loja Tecla Nativa.',
      null::uuid
    );
    v_refresh_secret_id := vault.create_secret(
      p_refresh_token,
      'tn-me-refresh-' || p_store_id::text || '-' || pg_catalog.gen_random_uuid()::text,
      'Token de renovação Melhor Envio da loja Tecla Nativa.',
      null::uuid
    );
    insert into private.melhor_envio_oauth_credentials (
      store_id,access_secret_id,refresh_secret_id,access_expires_at,refresh_expires_at
    ) values (
      p_store_id,v_access_secret_id,v_refresh_secret_id,p_access_expires_at,p_refresh_expires_at
    );
  end if;
end;
$$;

create or replace function public.tn_get_me_oauth_tokens(p_store_id uuid)
returns table(
  access_token text,
  refresh_token text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  reauthorization_required boolean,
  last_safe_error text
)
language sql
stable
set search_path = ''
as $$
  select access_secret.decrypted_secret,
         refresh_secret.decrypted_secret,
         credentials.access_expires_at,
         credentials.refresh_expires_at,
         credentials.reauthorization_required,
         credentials.last_safe_error
  from private.melhor_envio_oauth_credentials as credentials
  join vault.decrypted_secrets as access_secret on access_secret.id = credentials.access_secret_id
  join vault.decrypted_secrets as refresh_secret on refresh_secret.id = credentials.refresh_secret_id
  where credentials.store_id = p_store_id;
$$;

create or replace function public.tn_claim_me_oauth_refresh(p_store_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_claimed boolean := false;
begin
  update private.melhor_envio_oauth_credentials
  set refresh_lock_until = pg_catalog.now() + interval '45 seconds',
      updated_at = pg_catalog.now()
  where store_id = p_store_id
    and access_expires_at <= pg_catalog.now() + interval '5 minutes'
    and refresh_expires_at > pg_catalog.now()
    and not reauthorization_required
    and (refresh_lock_until is null or refresh_lock_until <= pg_catalog.now())
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.tn_release_me_oauth_refresh(
  p_store_id uuid,
  p_safe_error text default null,
  p_reauthorization_required boolean default false
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_safe_error is not null and p_safe_error not in (
    'refresh_failed','refresh_expired','token_storage_failed'
  ) then
    raise exception using errcode = '22023', message = 'Código de erro OAuth não permitido.';
  end if;
  update private.melhor_envio_oauth_credentials
  set refresh_lock_until = null,
      reauthorization_required = p_reauthorization_required,
      last_safe_error = p_safe_error,
      updated_at = pg_catalog.now()
  where store_id = p_store_id;
end;
$$;

revoke all on function public.tn_create_me_oauth_state(text,uuid,uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.tn_consume_me_oauth_state(text) from public, anon, authenticated;
revoke all on function public.tn_save_me_oauth_tokens(uuid,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.tn_get_me_oauth_tokens(uuid) from public, anon, authenticated;
revoke all on function public.tn_claim_me_oauth_refresh(uuid) from public, anon, authenticated;
revoke all on function public.tn_release_me_oauth_refresh(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.tn_create_me_oauth_state(text,uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.tn_consume_me_oauth_state(text) to service_role;
grant execute on function public.tn_save_me_oauth_tokens(uuid,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.tn_get_me_oauth_tokens(uuid) to service_role;
grant execute on function public.tn_claim_me_oauth_refresh(uuid) to service_role;
grant execute on function public.tn_release_me_oauth_refresh(uuid,text,boolean) to service_role;

commit;
