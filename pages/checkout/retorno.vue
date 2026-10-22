<script setup lang="ts">
const route = useRoute();
useSeoMeta({ title: 'Retorno do checkout | Tecla Nativa', robots: 'noindex,nofollow' });
const orderNumber = computed(() => typeof route.query.pedido === 'string' ? route.query.pedido : '');
</script>

<template>
  <main class="wrap checkout-return">
    <span class="eyebrow">RETORNO DO PAGBANK</span>
    <div class="return-icon" aria-hidden="true">✓</div>
    <h1>Recebemos seu <em>retorno.</em></h1>
    <p v-if="orderNumber">Referência do pedido: <strong>{{ orderNumber }}</strong></p>
    <p>O retorno ao site não confirma o pagamento. O status será atualizado no painel somente depois da validação do webhook assinado do PagBank Sandbox.</p>
    <div class="return-actions"><NuxtLink class="button button-dark" to="/">Voltar à vitrine <span>↗</span></NuxtLink><NuxtLink class="text-link" to="/produtos">Continuar explorando <span>→</span></NuxtLink></div>
    <small>Ambiente demonstrativo: nenhuma cobrança real ou etiqueta de envio é criada.</small>
  </main>
</template>

<style scoped>
.checkout-return{min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding-block:72px}.return-icon{display:grid;place-items:center;width:58px;height:58px;margin:20px 0;border:1px solid #4ce2d277;border-radius:50%;color:#4ce2d2;font-size:24px}.checkout-return h1{margin:0 0 14px;font-size:clamp(38px,7vw,64px)}.checkout-return>p{max-width:580px;color:var(--muted);font-size:13px;line-height:1.8}.checkout-return>p strong{color:var(--ink)}.return-actions{display:flex;align-items:center;gap:22px;margin:18px 0 26px}.checkout-return small{color:var(--muted);font-size:10px}@media(max-width:520px){.return-actions{flex-direction:column;gap:16px}}
</style>
