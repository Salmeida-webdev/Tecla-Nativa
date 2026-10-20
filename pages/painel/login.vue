<script setup lang="ts">
definePageMeta({ layout:false });
useSeoMeta({title:'Acesso administrativo | Tecla Nativa',robots:'noindex, nofollow'});
const email=ref('');
const password=ref('');
const visible=ref(false);
const recover=ref(false);
const feedback=ref('');
const pending=ref(false);
const { $supabase }=useNuxtApp();
const adminAuth=useAdminAuth();
const route=useRoute();
const destination=computed(()=>{const next=typeof route.query.next==='string'?route.query.next:'';return next.startsWith('/painel/')&&!next.startsWith('//')?next:'/painel'});

onMounted(async()=>{
  if(route.query.senha==='atualizada') feedback.value='Senha atualizada. Entre com sua nova senha.';
  if((await adminAuth.checkOwnerAccess()).allowed) await navigateTo(destination.value);
});

async function submit(){
  feedback.value='';
  if(!$supabase){feedback.value='A conexão com o Supabase não está configurada neste ambiente.';return}
  pending.value=true;
  try{
    const {error}=await $supabase.auth.signInWithPassword({email:email.value.trim(),password:password.value});
    if(error){feedback.value='Não foi possível entrar. Confira o e-mail, a senha e a confirmação da conta.';return}
    const access=await adminAuth.checkOwnerAccess();
    if(!access.allowed){await adminAuth.signOut();feedback.value=access.reason==='verification-failed'?'Não foi possível validar as permissões agora. Tente novamente.':'Esta conta ainda não tem acesso de proprietário à loja.';return}
    await navigateTo(destination.value);
  }catch{
    feedback.value='Não foi possível conectar ao serviço de autenticação. Tente novamente.';
  }finally{pending.value=false}
}

async function recoverPassword(){
  feedback.value='';
  if(!$supabase){feedback.value='A conexão com o Supabase não está configurada neste ambiente.';return}
  pending.value=true;
  try{
    const {error}=await $supabase.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:`${window.location.origin}/painel/nova-senha`});
    feedback.value=error?'Não foi possível solicitar a recuperação agora. Confira as URLs de redirecionamento do Supabase e tente novamente.':'Se a conta existir, você receberá um e-mail com as instruções para redefinir a senha.';
  }catch{
    feedback.value='Não foi possível solicitar a recuperação agora. Tente novamente.';
  }finally{pending.value=false}
}
</script>

<template>
  <main class="admin-app admin-login" id="login-content">
    <a class="skip-link" href="#login-form">Pular para o formulário de acesso</a>
    <div class="admin-login-layout">
      <section class="admin-login-story" aria-labelledby="login-brand-title">
        <NuxtLink class="admin-login-brand" to="/" aria-label="Tecla Nativa, voltar para a vitrine"><span class="admin-brand-mark"><img src="/images/logo-mark.svg" alt="" width="31" height="31"></span><span><strong id="login-brand-title">tecla nativa</strong><small>console de operação</small></span></NuxtLink>
        <div class="admin-login-story-copy"><span class="admin-page-eyebrow"><i></i>OPERAÇÃO COM CLAREZA</span><h1>Uma loja bem cuidada começa <em>por dentro.</em></h1><p>Catálogo, pedidos e expedição em um só lugar. Decisões com dados e uma operação que acompanha cada etapa.</p><div class="admin-login-highlights"><span><PanelIcon name="box" :size="16"/> Catálogo e variantes organizados</span><span><PanelIcon name="truck" :size="16"/> Pedido visível até a entrega</span><span><PanelIcon name="shield" :size="16"/> Acesso planejado por função</span></div></div>
        <div class="admin-login-story-foot"><span>Acesso restrito à equipe autorizada</span><span>Desenvolvido por LMX Soluções Digitais / Segundo Almeida</span></div>
      </section>
      <section class="admin-login-form-side" aria-label="Acesso ao painel">
        <div class="admin-login-card">
          <div class="admin-login-card-head"><span class="admin-page-eyebrow"><i></i>ÁREA ADMINISTRATIVA</span><h2>{{recover?'Recuperar acesso':'Bem-vindo de volta'}}</h2><p>{{recover?'Informe o e-mail da conta para continuar.':'Entre com a conta autorizada para administrar a Tecla Nativa.'}}</p></div>
          <form v-if="!recover" id="login-form" class="admin-login-form" @submit.prevent="submit">
            <div class="admin-field"><label for="login-email">E-mail</label><input id="login-email" v-model="email" class="admin-input" type="email" autocomplete="username" placeholder="nome@empresa.com.br" required></div>
            <div class="admin-field"><label for="login-password">Senha</label><div class="admin-password-field"><input id="login-password" v-model="password" class="admin-input" :type="visible?'text':'password'" autocomplete="current-password" placeholder="Sua senha" required minlength="8"><button type="button" class="admin-password-toggle" :aria-label="visible?'Ocultar senha':'Mostrar senha'" :aria-pressed="visible" @click="visible=!visible">{{visible?'Ocultar':'Mostrar'}}</button></div></div>
            <div class="admin-login-options"><span class="admin-login-security"><PanelIcon name="shield" :size="14"/> Sessão protegida pelo Supabase</span><button type="button" class="admin-link-button" @click="recover=true;feedback=''">Esqueci minha senha</button></div>
            <p v-if="feedback" class="admin-login-feedback" role="status" aria-live="polite">{{feedback}}</p>
            <button class="admin-button admin-button-primary admin-login-submit" type="submit" :disabled="pending">{{pending?'Validando acesso…':'Entrar no painel'}} <span aria-hidden="true">→</span></button>
          </form>
          <form v-else id="login-form" class="admin-login-form" @submit.prevent="recoverPassword"><div class="admin-field"><label for="recover-email">E-mail da conta</label><input id="recover-email" v-model="email" class="admin-input" type="email" autocomplete="email" placeholder="nome@empresa.com.br" required></div><p v-if="feedback" class="admin-login-feedback" role="status" aria-live="polite">{{feedback}}</p><button class="admin-button admin-button-primary admin-login-submit" type="submit" :disabled="pending">{{pending?'Enviando…':'Solicitar recuperação'}} <span aria-hidden="true">→</span></button><button type="button" class="admin-link-button admin-login-back" @click="recover=false;feedback=''">Voltar para o login</button></form>
          <p class="admin-login-security"><PanelIcon name="shield" :size="14"/> Acesso liberado apenas para o proprietário autorizado da loja.</p>
        </div>
      </section>
    </div>
  </main>
</template>
