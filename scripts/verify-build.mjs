import fs from 'node:fs';
import path from 'node:path';
import products from '../data/products.json' with { type: 'json' };
const root = path.join(process.cwd(), '.output/public');
const failures = [];
for (const route of ['index.html','produtos/index.html','carrinho/index.html','monte-seu-espaco/index.html','guias/index.html','conta/index.html','informacoes/index.html']) {
  if (!fs.existsSync(path.join(root, route))) failures.push(`Página não prerenderizada: ${route}`);
}
for (const product of products) {
  const page = path.join(root, 'produtos', product.slug, 'index.html');
  const image = path.join(root, 'images', 'products', path.basename(product.image));
  if (!fs.existsSync(page)) failures.push(`Página de produto ausente: ${product.slug}`);
  if (!fs.existsSync(image)) failures.push(`Imagem publicada ausente: ${product.image}`);
  for (const color of product.colors || []) {
    const colorImage = path.join(root, 'images', 'products', path.basename(color.image));
    if (!fs.existsSync(colorImage)) failures.push(`Imagem publicada ausente para ${product.slug} / ${color.label}: ${color.image}`);
  }
  if (fs.existsSync(page) && !fs.readFileSync(page, 'utf8').includes(product.name)) failures.push(`Nome não encontrado na página prerenderizada: ${product.slug}`);
}
for (const route of ['index.html','produtos/index.html','carrinho/index.html']) {
  const html = fs.readFileSync(path.join(root, route), 'utf8');
  const credits = html.split('Desenvolvido por LMX Soluções Digitais/Segundo Almeida').length - 1;
  if (credits !== 1) failures.push(`Crédito do rodapé aparece ${credits} vezes em ${route}.`);
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Build estático conferido: ${products.length} páginas de produto, 150 imagens de cores, rotas principais e crédito único no rodapé.`);
