import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { cartLineSku, colorIdFromVariantLabel, colorVariantSku } from './catalog.ts';

const products = JSON.parse(await readFile(new URL('../data/products.json', import.meta.url), 'utf8'));

test('SKU generated from each catalog color matches the Supabase seed convention', () => {
  const keyboard = products.find((product) => product.id === 'TN-001');
  assert.equal(colorVariantSku(keyboard.sku, 'grafite'), 'TN-001-GRAFITE');
  assert.equal(colorVariantSku(keyboard.sku, 'azul-petroleo'), 'TN-001-AZULPETROLEO');
  assert.equal(cartLineSku(keyboard, 'marfim'), 'TN-001-MARFIM');
});

test('legacy cart labels keep the correct color key when the cart is hydrated', () => {
  const keyboard = products.find((product) => product.id === 'TN-001');
  assert.equal(colorIdFromVariantLabel(keyboard, 'Azul petróleo · Padrão'), 'azul-petroleo');
  assert.equal(colorIdFromVariantLabel(keyboard, 'Marfim'), 'marfim');
});

