import fs from 'node:fs';
import path from 'node:path';
import products from '../data/products.json' with { type: 'json' };

const root = path.join(process.cwd(), '.output/public');
const siteUrl = (process.env.NUXT_PUBLIC_SITE_URL || 'https://teclanativa.netlify.app').replace(/\/+$/, '');
const failures = [];

for (const route of ['index.html','produtos/index.html','carrinho/index.html','monte-seu-espaco/index.html','guias/index.html','sobre/index.html','ajuda/index.html','informacoes/index.html']) {
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

const sitemapPath = path.join(root, 'sitemap.xml');
const robotsPath = path.join(root, 'robots.txt');
if (!fs.existsSync(sitemapPath)) {
  failures.push('sitemap.xml não foi publicado.');
} else {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  const publicPaths = ['/', '/produtos/', '/sobre/', '/ajuda/', '/informacoes/', '/guias/', '/monte-seu-espaco/'];
  for (const route of publicPaths) {
    if (!locations.includes(`${siteUrl}${route}`)) failures.push(`URL pública ausente do sitemap: ${route}`);
  }
  for (const product of products) {
    if (!locations.includes(`${siteUrl}/produtos/${product.slug}/`)) failures.push(`Produto ausente do sitemap: ${product.slug}`);
  }
  if (locations.length !== publicPaths.length + products.length) failures.push(`Sitemap deve conter ${publicPaths.length + products.length} URLs públicas, mas contém ${locations.length}.`);
  if (locations.some(url => /\/(painel|checkout|conta|carrinho)(\/|$)/.test(new URL(url).pathname))) failures.push('Rota administrativa ou transacional incluída no sitemap.');
}
if (!fs.existsSync(robotsPath) || !fs.readFileSync(robotsPath, 'utf8').includes(`${siteUrl}/sitemap.xml`)) {
  failures.push('robots.txt não aponta para o sitemap público deste domínio.');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Build estático conferido: ${products.length} páginas de produto, 150 imagens de catálogo, ${products.length + 7} URLs no sitemap, rotas principais e crédito único no rodapé.`);
