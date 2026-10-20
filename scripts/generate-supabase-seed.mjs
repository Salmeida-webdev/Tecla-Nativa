import { readFile, writeFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(new URL('../data/products.json', import.meta.url), 'utf8'));
const categories = [...new Map(catalog.map((product) => [product.category, product.categoryLabel])).entries()]
  .map(([slug, name]) => ({ slug, name }));
const catalogJson = JSON.stringify(catalog);
const categoriesJson = JSON.stringify(categories);
if (catalogJson.includes('$catalog$') || categoriesJson.includes('$categories$')) {
  throw new Error('O conteúdo contém um delimitador SQL reservado para este gerador.');
}

const sql = `-- Conteúdo inicial demonstrativo: loja em setup, catálogo como rascunho e saldo zerado.
-- Seguro para reexecução: usa chaves naturais e não sobrescreve alterações já existentes.
begin;
do $seed$
declare
  v_store_id uuid;
  v_catalog jsonb := $catalog$${catalogJson}$catalog$::jsonb;
  v_categories jsonb := $categories$${categoriesJson}$categories$::jsonb;
begin
  insert into public.stores (slug,name,status,currency)
  values ('tecla-nativa','Tecla Nativa','setup','BRL')
  on conflict (slug) do nothing;

  select id into strict v_store_id from public.stores where slug='tecla-nativa';

  insert into public.categories (store_id,name,slug,active)
  select v_store_id,item->>'name',item->>'slug',false
  from jsonb_array_elements(v_categories) as source(item)
  on conflict (store_id,slug) do nothing;

  insert into public.products (store_id,category_id,slug,sku_base,name,summary,description,primary_image_path,base_price,status,featured,specifications,compatibility,box_contents)
  select v_store_id,c.id,item->>'slug',item->>'sku',item->>'name',coalesce(item->>'summary',''),coalesce(item->>'description',''),item->>'image',(item->>'price')::numeric,'draft',coalesce((item->>'featured')::boolean,false),coalesce(item->'specs','[]'::jsonb),coalesce(item->>'compatibility',''),coalesce(item->>'box','')
  from jsonb_array_elements(v_catalog) as source(item)
  join public.categories c on c.store_id=v_store_id and c.slug=item->>'category'
  on conflict (store_id,slug) do nothing;

  insert into public.product_variants (store_id,product_id,sku,option_key,option_label,swatch_hex,image_path,active)
  select v_store_id,p.id,
    regexp_replace(item->>'sku','-ILUSTRATIVO$','','i') || '-' || upper(replace(color->>'id','-','')),
    color->>'id',color->>'label',color->>'swatch',color->>'image',true
  from jsonb_array_elements(v_catalog) as source(item)
  cross join lateral jsonb_array_elements(item->'colors') as options(color)
  join public.products p on p.store_id=v_store_id and p.slug=item->>'slug'
  on conflict (store_id,sku) do nothing;

  insert into public.product_media (store_id,product_id,variant_id,image_path,alt_text,position,is_primary)
  select v_store_id,p.id,v.id,color->>'image',p.name || ' na cor ' || (color->>'label'),(options.ordinality-1)::integer,options.ordinality=1
  from jsonb_array_elements(v_catalog) as source(item)
  cross join lateral jsonb_array_elements(item->'colors') with ordinality as options(color,ordinality)
  join public.products p on p.store_id=v_store_id and p.slug=item->>'slug'
  join public.product_variants v on v.store_id=v_store_id and v.product_id=p.id and v.option_key=color->>'id'
  on conflict (store_id,product_id,image_path,position) do nothing;

  insert into public.inventory_levels (store_id,variant_id,on_hand,reserved,reorder_point)
  select v_store_id,v.id,0,0,0 from public.product_variants v where v.store_id=v_store_id
  on conflict (variant_id) do nothing;

  insert into public.integration_configs (store_id,provider,status)
  values (v_store_id,'pagbank','not_configured'),(v_store_id,'melhor_envio','not_configured')
  on conflict (store_id,provider) do nothing;
end;
$seed$;
commit;
`;

await writeFile(new URL('../supabase/seed.sql', import.meta.url), sql);
console.log(`SQL de seed gerado: ${catalog.length} produtos, ${catalog.reduce((sum, product) => sum + product.colors.length, 0)} variantes e estoque zerado.`);
