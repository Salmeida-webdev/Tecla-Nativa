import { defineStore } from 'pinia';
import type { Product } from '~/data/types';

export interface CartLine { product: Product; quantity: number; variant: string; image?: string }

export const useCartStore = defineStore('cart', () => {
  const lines = ref<CartLine[]>([]);
  const hydrated = ref(false);
  const count = computed(() => lines.value.reduce((sum: number, line: CartLine) => sum + line.quantity, 0));
  const total = computed(() => lines.value.reduce((sum: number, line: CartLine) => sum + line.product.price * line.quantity, 0));

  if (import.meta.client && !hydrated.value) {
    onMounted(() => {
      if (hydrated.value) return;
      try { lines.value = JSON.parse(localStorage.getItem('tecla-cart') || '[]') as CartLine[]; }
      catch { lines.value = []; }
      hydrated.value = true;
    });
    watch(lines, (value: CartLine[]) => {
      if (hydrated.value) localStorage.setItem('tecla-cart', JSON.stringify(value));
    }, { deep: true });
  }

  function add(product: Product, variant = product.variants[0] || 'Padrão', quantity = 1, image = product.image) {
    const existing = lines.value.find((line: CartLine) => line.product.id === product.id && line.variant === variant);
    if (existing) existing.quantity = Math.min(existing.quantity + quantity, 10);
    else lines.value.push({ product, quantity: Math.max(1, Math.min(10, quantity)), variant, image });
  }
  function remove(id: string, variant: string) {
    lines.value = lines.value.filter((line: CartLine) => !(line.product.id === id && line.variant === variant));
  }
  function setQuantity(id: string, variant: string, quantity: number) {
    const line = lines.value.find((item: CartLine) => item.product.id === id && item.variant === variant);
    if (line) line.quantity = Math.max(1, Math.min(10, quantity));
  }
  function clear() { lines.value = []; }
  return { lines, count, total, add, remove, setQuantity, clear };
});
