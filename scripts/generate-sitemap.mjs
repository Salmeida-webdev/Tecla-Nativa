import fs from 'node:fs';
import path from 'node:path';
import products from '../data/products.json' with { type: 'json' };

const rawSiteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'https://teclanativa.netlify.app';
const parsedSiteUrl = new URL(rawSiteUrl);
if (parsedSiteUrl.protocol !== 'https:' || parsedSiteUrl.pathname !== '/' || parsedSiteUrl.search || parsedSiteUrl.hash) {
  throw new Error('NUXT_PUBLIC_SITE_URL deve ser a origem HTTPS do site, sem caminho, query ou fragmento.');
}
const siteUrl = parsedSiteUrl.origin;
const publicRoutes = ['/', '/produtos/', '/sobre/', '/ajuda/', '/informacoes/', '/guias/', '/monte-seu-espaco/'];
const locations = [
  ...publicRoutes.map(route => `${siteUrl}${route}`),
  ...products.map(product => `${siteUrl}/produtos/${product.slug}/`),
];
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...locations.map(location => `  <url><loc>${location}</loc></url>`),
  '</urlset>',
  '',
].join('\n');
const publicDir = path.join(process.cwd(), 'public');
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), xml);
fs.writeFileSync(path.join(publicDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
console.log(`Sitemap gerado: ${locations.length} URLs públicas em public/sitemap.xml.`);
