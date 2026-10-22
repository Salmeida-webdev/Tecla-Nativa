<script setup lang="ts">
const route = useRoute();
const catalog = useStorefrontCatalog();
const product = computed(() => catalog.products.value.find((item) => item.slug === String(route.params.slug)));
const selectedColorId = ref('');
const selectedColor = computed(() => product.value?.colors.find((color) => color.id === selectedColorId.value) ?? product.value?.colors[0]);
const selected = ref('');
const quantity = ref(1);
const cart = useCartStore();
const whatsapp = useWhatsAppLink('Olá! Vi o portfólio da Tecla Nativa e gostaria de conversar sobre o projeto.');
watch(product, (next) => {
  selectedColorId.value = next?.colors[0]?.id ?? '';
  selected.value = next?.variants[0] ?? '';
}, { immediate: true });
onMounted(() => void catalog.refresh());

function addSelectedVariant() {
  if (!product.value || !selectedColor.value) return;
  const variant = [selectedColor.value.label, selected.value].filter(Boolean).join(' · ');
  cart.add(product.value, variant || 'Padrão', quantity.value, selectedColor.value.image, selectedColor.value.id);
  return navigateTo('/carrinho');
}

useSeoMeta({
  title: computed(() => product.value ? `${product.value.name} | Tecla Nativa` : 'Produto | Tecla Nativa'),
  description: computed(() => product.value?.summary || 'Produto demonstrativo da Tecla Nativa.'),
  ogTitle: computed(() => product.value ? `${product.value.name} | Tecla Nativa` : 'Produto | Tecla Nativa'),
  ogDescription: computed(() => product.value?.summary || 'Produto demonstrativo da Tecla Nativa.'),
});
</script>

<template>
  <div v-if="product && selectedColor" class="wrap page-wrap">
    <div class="breadcrumb"><NuxtLink to="/">Início</NuxtLink><span>/</span><NuxtLink to="/produtos">Produtos</NuxtLink><span>/</span><span>{{ product.name }}</span></div>
    <div class="product-detail">
      <div class="detail-image"><img :src="selectedColor.image" :alt="`${product.name} — ${selectedColor.label}`" width="640" height="640"><span class="detail-image-note">Imagem conceitual gerada para a apresentação</span></div>
      <div class="detail-copy">
        <span class="eyebrow">{{ product.categoryLabel }}</span>
        <h1>{{ product.name }}</h1>
        <p class="detail-summary">{{ product.description }}</p>
        <div class="detail-price">{{ product.priceLabel }}</div>
        <p class="price-note">Valor ilustrativo nesta apresentação.</p>
        <div class="detail-color-field">
          <span>Cor: <b>{{ selectedColor.label }}</b></span>
          <div class="detail-color-options" role="group" :aria-label="`Cores de ${product.name}`">
            <button v-for="color in product.colors" :key="color.id" type="button" class="color-swatch color-swatch-large" :class="{ 'is-selected': selectedColor.id === color.id }" :style="{ '--swatch-color': color.swatch }" :aria-label="`Selecionar cor ${color.label}`" :aria-pressed="selectedColor.id === color.id" :title="color.label" @click="selectedColorId = color.id" />
          </div>
        </div>
        <div v-if="product.variants.length" class="variant-field"><label for="variant">Escolha uma opção</label><select id="variant" v-model="selected"><option v-for="variant in product.variants" :key="variant">{{ variant }}</option></select></div>
        <div class="quantity-field"><label for="quantity">Quantidade</label><div><button type="button" aria-label="Diminuir quantidade" @click="quantity = Math.max(1, quantity - 1)">−</button><input id="quantity" v-model.number="quantity" type="number" min="1" max="10"><button type="button" aria-label="Aumentar quantidade" @click="quantity = Math.min(10, quantity + 1)">＋</button></div></div>
        <button class="button button-dark detail-add" type="button" @click="addSelectedVariant">Adicionar à sacola <span>↗</span></button>
        <a class="button button-outline detail-whatsapp" :href="whatsapp" target="_blank" rel="noopener noreferrer">Falar sobre o portfólio <span>↗</span></a>
        <div class="detail-assurances"><p><span>✓</span> Variantes por cor</p><p><span>✓</span> Estoque fictício para demonstração do painel</p><p><span>✓</span> Pagamento apenas em ambiente sandbox</p></div>
      </div>
    </div>
    <section class="detail-info"><div><span class="eyebrow">DETALHES DO PRODUTO</span><h2>Feito para <em>fazer sentido.</em></h2></div><div class="spec-list"><div v-for="spec in product.specs" :key="spec.label"><b>{{ spec.label }}</b><span>{{ spec.value }}</span></div><div><b>Compatibilidade</b><span>{{ product.compatibility }}</span></div><div><b>Conteúdo da embalagem</b><span>{{ product.box }}</span></div><div><b>SKU ilustrativo</b><span>{{ product.sku }}</span></div></div></section>
    <p class="catalog-disclaimer">Este é um portfólio demonstrativo. Os pagamentos usam sandbox; nenhum valor real é cobrado e nenhuma etiqueta é emitida.</p>
  </div>
  <div v-else-if="catalog.loading" class="wrap page-wrap"><div class="empty-state"><h1>Carregando o produto…</h1></div></div>
  <div v-else-if="catalog.loaded" class="wrap page-wrap"><div class="empty-state"><h1>Produto não encontrado</h1><p>O produto pode ter sido arquivado ou removido da vitrine.</p><NuxtLink class="button button-dark" to="/produtos">Voltar ao catálogo</NuxtLink></div></div>
</template>
