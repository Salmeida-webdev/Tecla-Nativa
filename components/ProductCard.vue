<script setup lang="ts">
import type { Product } from '~/data/types';

const props = defineProps<{ product: Product }>();
const cart = useCartStore();
const selectedColor = ref(props.product.colors[0]!);
const defaultOption = props.product.variants[0];

function addSelectedColor() {
  const option = defaultOption ? ` · ${defaultOption}` : '';
  cart.add(props.product, `${selectedColor.value.label}${option}`, 1, selectedColor.value.image);
}
</script>

<template>
  <article class="product-card">
    <NuxtLink :to="'/produtos/' + product.slug" class="product-image-link">
      <img :src="selectedColor.image" :alt="`${product.name} — ${selectedColor.label}`" width="640" height="640" loading="lazy" />
      <span v-if="product.badge" class="product-badge">{{ product.badge }}</span>
      <span class="image-arrow" aria-hidden="true">↗</span>
    </NuxtLink>
    <div class="product-copy">
      <span class="product-category">{{ product.categoryLabel }}</span>
      <NuxtLink :to="'/produtos/' + product.slug" class="product-name">{{ product.name }}</NuxtLink>
      <p>{{ product.summary }}</p>
      <div class="product-price-row">
        <span class="product-price">{{ product.priceLabel }}</span>
        <span v-if="product.variants.length" class="product-variant">{{ product.variants.length }} opções</span>
      </div>
      <div class="product-color-picker" role="group" :aria-label="`Cores de ${product.name}`">
        <button
          v-for="color in product.colors"
          :key="color.id"
          type="button"
          class="color-swatch"
          :class="{ 'is-selected': selectedColor.id === color.id }"
          :style="{ '--swatch-color': color.swatch }"
          :aria-label="`Selecionar cor ${color.label}`"
          :aria-pressed="selectedColor.id === color.id"
          :title="color.label"
          @click="selectedColor = color"
        />
        <span class="color-name">{{ selectedColor.label }}</span>
      </div>
      <button class="add-button" type="button" @click="addSelectedColor">Adicionar à sacola <span aria-hidden="true">＋</span></button>
    </div>
  </article>
</template>
