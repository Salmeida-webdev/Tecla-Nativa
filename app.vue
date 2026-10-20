<template>
  <NuxtPage v-if="isPanel" />
  <div v-else>
    <SiteHeader />
    <main id="conteudo"><NuxtPage /></main>
    <SiteFooter />
    <a class="whatsapp-float" :href="whatsappUrl" target="_blank" rel="noopener noreferrer" aria-label="Falar com a Tecla Nativa pelo WhatsApp" title="Falar pelo WhatsApp">
      <svg aria-hidden="true" viewBox="0 0 32 32" focusable="false"><path d="M16 4a11.5 11.5 0 0 0-9.8 17.5L5 27l5.7-1.5A11.5 11.5 0 1 0 16 4Z"/><path d="M11.3 9.8c-.4 0-.8.2-1.1.6-.4.5-1.2 1.3-1.2 3s1.2 3.5 1.4 3.7c.2.3 2.3 3.8 5.8 5.1 2.9 1.1 3.5.9 4.1.8.6-.1 1.9-.8 2.2-1.6.3-.8.3-1.5.2-1.7-.1-.2-.4-.3-.8-.5l-2.5-1.2c-.3-.1-.6-.2-.8.2l-1.1 1.3c-.2.3-.4.3-.8.1-.4-.2-1.6-.6-2.9-1.8-1.1-1-1.8-2.2-2-2.6-.2-.4 0-.6.2-.8l.6-.7c.2-.2.3-.4.4-.6.1-.3 0-.5-.1-.7l-1.1-2.6c-.3-.6-.6-.6-.9-.6h-.8Z"/></svg>
      <span class="whatsapp-label">Falar pelo WhatsApp</span>
    </a>
  </div>
</template>
<script setup lang="ts">
const route = useRoute();
const isPanel = computed(() => route.path.startsWith('/painel'));
const whatsappUrl = 'https://wa.me/5583998739712?text=' + encodeURIComponent('Olá! Vim pela loja Tecla Nativa e gostaria de tirar uma dúvida.');
</script>
