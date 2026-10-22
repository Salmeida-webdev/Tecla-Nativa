import type { Product } from '~/data/types';

/** Matches the SKU convention used by scripts/generate-supabase-seed.mjs. */
export function colorVariantSku(productSku: string, colorId: string): string {
  const baseSku = productSku.trim().replace(/-ILUSTRATIVO$/i, '');
  const option = colorId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!baseSku || !option) throw new Error('Produto ou cor sem SKU válido.');
  return `${baseSku}-${option}`;
}

export function colorIdFromVariantLabel(product: Product, label: string): string {
  const normalized = label.trim().toLocaleLowerCase('pt-BR');
  return product.colors.find((color) => {
    const colorLabel = color.label.toLocaleLowerCase('pt-BR');
    return normalized === colorLabel || normalized.startsWith(`${colorLabel} ·`);
  })?.id ?? product.colors[0]?.id ?? 'unica';
}

export function cartLineSku(product: Product, colorId?: string): string {
  const optionKey = colorId || product.colors[0]?.id || 'unica';
  return colorVariantSku(product.sku, optionKey);
}
