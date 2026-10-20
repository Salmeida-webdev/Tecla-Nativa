<script setup lang="ts">
definePageMeta({ layout: false });
useSeoMeta({ title: 'Redefinir senha | Tecla Nativa', robots: 'noindex, nofollow' });

const { $supabase }=useNuxtApp();
const password=ref('');
const confirmation=ref('');
const ready=ref(false);
const pending=ref(false);
const feedback=ref('Validando o link de recuperação…');

onMounted(async()=>{
  if(!$supabase){feedback.value='A conexão com o Supabase não está configurada.';return}
  const {data,error}=await $supabase.auth.getSession();
  if(error||!data.session){feedback.value='Este link expirou ou já foi usado. Solicite uma nova recuperação de senha.';return}
  ready.value=true;
  feedback.value='';
});

async function updatePassword(){
  feedback.value='';
  if(password.value!==confirmation.value){feedback.value='As senhas não coincidem.';return}
  if(!$supabase){feedback.value='A conexão com o Supabase não está configurada.';return}
  pending.value=true;
  const {error}=await $supabase.auth.updateUser({password:password.value});
  pending.value=false;
  if(error){feedback.value='Não foi possível atualizar a senha. Ela deve ter pelo menos 8 caracteres.';return}
  await $supabase.auth.signOut();
  await navigateTo('/painel/login?senha=atualizada');
}
</script>

<template>
  <main class="admin-app admin-login" id="login-content">
    <div class="admin-login-layout">
      <section class="admin-login-story" aria-labelledby="reset-brand-title">
        <NuxtLink class="admin-login-brand" to="/"><span class="admin-brand-mark"><PanelIcon name="grid" :size="21"/></span><span><strong id="reset-brand-title">tecla nativa</strong><small>console de operação</small></span></NuxtLink>
        <div class="admin-login-story-copy"><span class="admin-page-eyebrow"><i></i>ACESSO SEGURO</span><h1>Proteja o acesso à <em>sua operação.</em></h1><p>Defina uma nova senha para continuar administrando a loja.</p></div>
        <div class="admin-login-story-foot"><span>Desenvolvido por LMX Soluções Digitais / Segundo Almeida</span></div>
      </section>
      <section class="admin-login-form-side" aria-label="Redefinir senha">
        <div class="admin-login-card">
          <div class="admin-login-card-head"><span class="admin-page-eyebrow"><i></i>RECUPERAÇÃO DE CONTA</span><h2>Nova senha</h2><p>Escolha uma senha com pelo menos 8 caracteres.</p></div>
          <form v-if="ready" id="reset-form" class="admin-login-form" @submit.prevent="updatePassword">
            <div class="admin-field"><label for="new-password">Nova senha</label><input id="new-password" v-model="password" class="admin-input" type="password" autocomplete="new-password" required minlength="8"></div>
            <div class="admin-field"><label for="confirm-password">Repita a nova senha</label><input id="confirm-password" v-model="confirmation" class="admin-input" type="password" autocomplete="new-password" required minlength="8"></div>
            <p v-if="feedback" class="admin-login-feedback" role="status" aria-live="polite">{{feedback}}</p>
            <button class="admin-button admin-button-primary admin-login-submit" type="submit" :disabled="pending">{{pending?'Salvando…':'Salvar nova senha'}} <span aria-hidden="true">→</span></button>
          </form>
          <p v-else class="admin-login-feedback" role="status" aria-live="polite">{{feedback}}</p>
          <NuxtLink to="/painel/login" class="admin-link-button admin-login-back">Voltar para o login</NuxtLink>
        </div>
      </section>
    </div>
  </main>
</template>
