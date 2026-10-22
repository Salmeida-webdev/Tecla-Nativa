<script setup lang="ts">
useSeoMeta({ title: 'Minha conta | Tecla Nativa', description: 'Área do cliente Tecla Nativa.', robots: 'noindex, nofollow' });
const whatsappUrl = useWhatsAppLink('Olá, vi o portfólio demonstrativo da Tecla Nativa.');
</script>
<template><div class="wrap page-wrap"><div class="breadcrumb"><NuxtLink to="/">Início</NuxtLink><span>/</span><span>Minha conta</span></div><div class="simple-page-heading"><span class="eyebrow">ÁREA DO CLIENTE</span><h1>Seu espaço<br/>na <em>Tecla Nativa.</em></h1><p>Esta área faz parte da demonstração do painel e não guarda contas ou pedidos de clientes. Conheça o projeto de portfólio pelo WhatsApp.</p><a class="button button-dark" :href="whatsappUrl" target="_blank" rel="noopener noreferrer">Falar sobre o projeto ↗</a></div></div></template>
