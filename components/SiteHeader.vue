<script setup lang="ts">
const cart = useCartStore(); const menuOpen = ref(false); const query = ref('');
function submitSearch(){ navigateTo({path:'/produtos', query:query.value?{busca:query.value}:{}}); menuOpen.value=false; }
</script>
<template>
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
  <div class="announcement"><span>TECNOLOGIA ESCOLHIDA COM CRITÉRIO</span><span class="announcement-dot">●</span><span>Ideias práticas para sua rotina</span></div>
  <header class="site-header"><div class="header-inner wrap">
    <NuxtLink to="/" class="brand" aria-label="Tecla Nativa, página inicial"><span class="brand-mark" aria-hidden="true"><img src="/images/logo-mark.svg" alt="" width="36" height="36"/></span><span>tecla<span class="brand-light"> nativa</span><small>tecnologia para sua rotina</small></span></NuxtLink>
    <nav class="desktop-nav" aria-label="Navegação principal"><NuxtLink to="/produtos">Produtos</NuxtLink><NuxtLink to="/monte-seu-espaco">Monte seu espaço</NuxtLink><NuxtLink to="/guias">Guias</NuxtLink></nav>
    <form class="header-search" @submit.prevent="submitSearch"><label class="sr-only" for="header-search">Buscar produtos</label><input id="header-search" v-model="query" type="search" placeholder="O que você procura?"/><button aria-label="Buscar">⌕</button></form>
    <NuxtLink to="/conta" class="account-link">Conta</NuxtLink><NuxtLink to="/painel" class="admin-panel-link" aria-label="Abrir painel administrativo" title="Painel administrativo"><PanelIcon name="grid" :size="17"/></NuxtLink><NuxtLink to="/carrinho" class="cart-link" :aria-label="`Carrinho, ${cart.count} itens`"><span aria-hidden="true">▢</span><span class="cart-word">Sacola</span><b>{{ cart.count }}</b></NuxtLink>
    <button class="mobile-menu-button" :aria-expanded="menuOpen" aria-label="Abrir menu" @click="menuOpen=!menuOpen">{{menuOpen?'×':'☰'}}</button>
  </div><nav v-if="menuOpen" class="mobile-nav wrap" aria-label="Navegação móvel"><NuxtLink to="/produtos" @click="menuOpen=false">Produtos</NuxtLink><NuxtLink to="/monte-seu-espaco" @click="menuOpen=false">Monte seu espaço</NuxtLink><NuxtLink to="/guias" @click="menuOpen=false">Guias e ideias</NuxtLink><NuxtLink to="/conta" @click="menuOpen=false">Conta</NuxtLink><NuxtLink to="/carrinho" @click="menuOpen=false">Sacola ({{cart.count}})</NuxtLink></nav></header>
</template>
