<script setup lang="ts">
useSeoMeta({ title: 'Sobre a Tecla Nativa', description: 'Conheça a curadoria de acessórios e tecnologia para sua rotina.' });
const whatsappUrl = useWhatsAppLink('Olá, vi o portfólio demonstrativo da Tecla Nativa.');
</script>
<template><div class="wrap page-wrap"><div class="breadcrumb"><NuxtLink to="/">Início</NuxtLink><span>/</span><span>Sobre</span></div><div class="simple-page-heading"><span class="eyebrow">SOBRE A TECLA NATIVA</span><h1>Tecnologia com<br/>espaço na <em>rotina.</em></h1><p>A Tecla Nativa é uma curadoria demonstrativa de acessórios para home office, estudo, conectividade e casa inteligente. A experiência apresenta vitrine, checkout e painel com pedidos de teste, sem cobranças ou envios reais.</p><a class="button button-dark" :href="whatsappUrl" target="_blank" rel="noopener noreferrer">Fale sobre o portfólio ↗</a></div></div></template>
