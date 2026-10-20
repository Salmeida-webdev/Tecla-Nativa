<script setup lang="ts">
import type { CartLine } from '~/stores/cart';
useSeoMeta({ title: 'Sacola | Tecla Nativa', robots: 'noindex,nofollow' });
const cart = useCartStore();
const whatsapp = computed(() => {
  const items = cart.lines.map((line: CartLine) => `• ${line.quantity}x ${line.product.name} (${line.variant})`).join('\n');
  const message = `Olá! Quero consultar estes itens da Tecla Nativa:\n${items}\nSubtotal ilustrativo: ${cart.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
  return `https://wa.me/5583998739712?text=${encodeURIComponent(message)}`;
});
</script>
<template>
  <div class="wrap page-wrap">
    <div class="breadcrumb"><NuxtLink to="/">Início</NuxtLink><span>/</span><span>Sacola</span></div>
    <div class="simple-page-heading"><span class="eyebrow">SUA SELEÇÃO</span><h1>Sacola <em>de escolhas.</em></h1><p>{{ cart.count }} {{ cart.count === 1 ? 'item' : 'itens' }} na sua sacola.</p></div>
    <div v-if="cart.lines.length" class="cart-layout">
      <div class="cart-lines"><article v-for="line in cart.lines" :key="line.product.id + line.variant" class="cart-line">
        <NuxtLink :to="`/produtos/${line.product.slug}`"><img :src="line.image || line.product.image" :alt="`${line.product.name} — ${line.variant}`" width="160" height="160"/></NuxtLink>
        <div class="cart-line-info"><NuxtLink :to="`/produtos/${line.product.slug}`" class="product-name">{{ line.product.name }}</NuxtLink><span>{{ line.variant }} · {{ line.product.priceLabel }}</span><button class="remove-link" @click="cart.remove(line.product.id,line.variant)">Remover</button></div>
        <div class="cart-quantity"><button aria-label="Diminuir" @click="cart.setQuantity(line.product.id,line.variant,line.quantity-1)">−</button><span>{{ line.quantity }}</span><button aria-label="Aumentar" @click="cart.setQuantity(line.product.id,line.variant,line.quantity+1)">＋</button></div>
        <b class="cart-line-price">{{ (line.product.price*line.quantity).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) }}</b>
      </article></div>
      <aside class="cart-summary"><span class="eyebrow">RESUMO</span><div><span>Subtotal ilustrativo</span><b>{{ cart.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) }}</b></div><p>Frete e disponibilidade são confirmados no atendimento. Nenhum pagamento será cobrado nesta fase.</p><a class="button button-coral" :href="whatsapp" target="_blank" rel="noopener noreferrer">Consultar pelo WhatsApp <span>↗</span></a><NuxtLink class="text-link" to="/produtos">Continuar explorando <span>→</span></NuxtLink></aside>
    </div>
    <div v-else class="empty-state"><span>▢</span><h2>Sua sacola está esperando boas ideias.</h2><p>Explore a curadoria e adicione algo que combine com seu espaço.</p><NuxtLink class="button button-dark" to="/produtos">Explorar produtos <span>↗</span></NuxtLink></div>
    <p class="catalog-disclaimer">Esta sacola é uma prévia de interface; ela não registra pedido nem efetua pagamento.</p>
  </div>
</template>
