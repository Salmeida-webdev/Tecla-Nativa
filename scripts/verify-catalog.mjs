import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const products = JSON.parse(fs.readFileSync(path.join(root, 'data/products.json'), 'utf8'));
const failures = [];
if (products.length !== 50) failures.push(`Esperados 50 produtos-base; encontrados ${products.length}.`);
const ids = new Set(); const slugs = new Set(); const skus = new Set(); const categories = new Map();
for (const product of products) {
  for (const [field, set] of [['id', ids], ['slug', slugs], ['sku', skus]]) {
    if (!product[field] || set.has(product[field])) failures.push(`${field} vazio ou duplicado: ${product[field]}`);
    set.add(product[field]);
  }
  categories.set(product.category, (categories.get(product.category) || 0) + 1);
  const imagePath = path.join(root, 'public', product.image.replace(/^\//, ''));
  if (!fs.existsSync(imagePath)) failures.push(`Imagem ausente: ${product.image}`);
  if (product.colors?.length !== 3) failures.push(`Esperadas três cores por produto: ${product.slug}`);
  for (const color of product.colors || []) {
    const colorPath = path.join(root, 'public', color.image.replace(/^\//, ''));
    if (!fs.existsSync(colorPath)) failures.push(`Imagem da cor ${color.label} ausente: ${color.image}`);
    if (!color.id || !color.label || !color.swatch) failures.push(`Dados de cor incompletos: ${product.slug}`);
  }
  if (!product.name || !product.summary || !product.specs?.length) failures.push(`Dados obrigatórios ausentes: ${product.slug}`);
}
if (categories.size !== 5 || [...categories.values()].some(count => count !== 10)) failures.push(`Distribuição de categorias inesperada: ${JSON.stringify(Object.fromEntries(categories))}`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Catálogo válido: ${products.length} produtos, ${categories.size} categorias, 3 cores com imagens e identificadores únicos conferidos.`);
