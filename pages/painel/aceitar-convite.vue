<script setup lang="ts">
definePageMeta({ layout: false });
useSeoMeta({ title: 'Aceitar convite | Tecla Nativa', robots: 'noindex, nofollow' });

const { $supabase } = useNuxtApp();
const password = ref('');
const confirmation = ref('');
const ready = ref(false);
const pending = ref(false);
const feedback = ref('Validando o convite…');

onMounted(async () => {
  if (!$supabase) { feedback.value = 'A conexão com o Supabase não está configurada.'; return; }
  const { data, error } = await $supabase.auth.getSession();
  if (error || !data.session) { feedback.value = 'Este convite expirou ou já foi usado. Peça ao proprietário para enviar outro.'; return; }
  ready.value = true;
  feedback.value = '';
});

async function acceptInvite() {
  feedback.value = '';
  if (password.value.length < 12) { feedback.value = 'Use uma senha com pelo menos 12 caracteres.'; return; }
  if (password.value !== confirmation.value) { feedback.value = 'As senhas não coincidem.'; return; }
  if (!$supabase) { feedback.value = 'A conexão com o Supabase não está configurada.'; return; }
  pending.value = true;
  try {
    const { error: passwordError } = await $supabase.auth.updateUser({ password: password.value });
    if (passwordError) { feedback.value = 'Não foi possível definir a senha. Confira as regras de senha da conta.'; return; }
    const { error: inviteError } = await $supabase.functions.invoke('team-management', { body: { action: 'accept_invite' } });
    if (inviteError) { feedback.value = 'A senha foi definida, mas não foi possível ativar o convite. Tente entrar novamente ou peça ao proprietário para reenviar.'; return; }
    await navigateTo('/painel');
  } catch {
    feedback.value = 'Não foi possível ativar o convite agora. Tente novamente.';
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <main class="admin-app admin-login" id="invite-content">
    <div class="admin-login-layout">
      <section class="admin-login-story" aria-labelledby="invite-brand-title">
        <NuxtLink class="admin-login-brand" to="/" aria-label="Tecla Nativa, abrir vitrine"><span class="admin-brand-mark"><img src="/images/logo-mark.svg" alt="" width="31" height="31"></span><span><strong id="invite-brand-title">tecla nativa</strong><small>console de operação</small></span></NuxtLink>
        <div class="admin-login-story-copy"><span class="admin-page-eyebrow"><i></i>ACESSO SEGURO</span><h1>Um time alinhado cuida de uma loja <em>melhor.</em></h1><p>Defina sua senha para ativar o acesso concedido à equipe da Tecla Nativa.</p></div>
        <div class="admin-login-story-foot"><span>Acesso restrito à equipe autorizada</span><span>Desenvolvido por LMX Soluções Digitais / Segundo Almeida</span></div>
      </section>
      <section class="admin-login-form-side" aria-label="Aceitar convite">
        <div class="admin-login-card">
          <div class="admin-login-card-head"><span class="admin-page-eyebrow"><i></i>CONVITE DA EQUIPE</span><h2>Ativar acesso</h2><p>Crie sua senha para entrar no painel.</p></div>
          <form v-if="ready" class="admin-login-form" @submit.prevent="acceptInvite">
            <div class="admin-field"><label for="invite-password">Nova senha</label><input id="invite-password" v-model="password" class="admin-input" type="password" autocomplete="new-password" required minlength="12"></div>
            <div class="admin-field"><label for="invite-confirmation">Repita a senha</label><input id="invite-confirmation" v-model="confirmation" class="admin-input" type="password" autocomplete="new-password" required minlength="12"></div>
            <p v-if="feedback" class="admin-login-feedback" role="status" aria-live="polite">{{feedback}}</p>
            <button class="admin-button admin-button-primary admin-login-submit" type="submit" :disabled="pending">{{pending?'Ativando acesso…':'Definir senha e entrar'}} <span aria-hidden="true">→</span></button>
          </form>
          <p v-else class="admin-login-feedback" role="status" aria-live="polite">{{feedback}}</p>
          <NuxtLink to="/painel/login" class="admin-link-button admin-login-back">Voltar para o login</NuxtLink>
        </div>
      </section>
    </div>
  </main>
</template>
