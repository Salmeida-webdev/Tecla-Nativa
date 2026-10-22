<script setup lang="ts">
useSeoMeta({ title: 'Informações da loja | Tecla Nativa', description: 'Informações sobre a demonstração, privacidade e integrações da Tecla Nativa.' });
</script>

<template>
  <div class="wrap page-wrap">
    <div class="breadcrumb"><NuxtLink to="/">Início</NuxtLink><span>/</span><span>Informações do projeto</span></div>
    <div class="simple-page-heading">
      <span class="eyebrow">INFORMAÇÃO COM TRANSPARÊNCIA</span>
      <h1>Uma experiência<br/><em>demonstrativa.</em></h1>
      <p>A Tecla Nativa é uma loja de portfólio. É possível percorrer o checkout e ver pedidos de demonstração no painel, sem cobrança ou envio de produtos.</p>
    </div>
    <div class="guide-articles">
      <article id="entrega"><span>01 · ENTREGA</span><h2>Há envio de produtos?</h2><p>Não. O Melhor Envio pode calcular cotações, mas esta loja não compra frete, não prepara pacotes e não emite etiquetas.</p></article>
      <article id="privacidade"><span>02 · PRIVACIDADE</span><h2>O que acontece com meus dados?</h2><p>O checkout demonstrativo grava os dados informados junto ao pedido no Supabase. Use informações fictícias; não preencha dados pessoais, de cartão ou endereço real.</p></article>
      <article id="trocas"><span>03 · TROCAS E DEVOLUÇÕES</span><h2>Há uma política comercial ativa?</h2><p>Não. Os pedidos são apenas demonstrativos e não criam obrigações de venda, entrega, troca ou garantia.</p></article>
      <article id="termos"><span>04 · USO DO PORTFÓLIO</span><h2>Há cobrança no checkout?</h2><p>Não. O PagBank permanece no Sandbox. O retorno do provedor não confirma pagamento e nenhuma cobrança real é feita.</p></article>
    </div>
  </div>
</template>
