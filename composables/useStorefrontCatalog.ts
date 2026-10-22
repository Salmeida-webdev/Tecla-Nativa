import fallbackProducts from '~/data/products.json';
import type { Product } from '~/data/types';

export interface StorefrontCategory { name: string; slug: string; text: string }
export interface StorefrontContent { id: string; key: string; title: string; content: Record<string, unknown> }

const CATEGORY_COPY: Record<string, string> = {
  perifericos: 'Conforto e controle para o seu espaço.',
  'audio-video': 'Reuniões com mais clareza e presença.',
  conectividade: 'Conexões pensadas para acompanhar você.',
  'casa-inteligente': 'Pequenas automações, rotina mais leve.',
  'energia-kits': 'Energia e conjuntos para começar bem.',
};

export function useStorefrontCatalog() {
  const products = useState<Product[]>('storefront-products', () => fallbackProducts as Product[]);
  const categories = useState<StorefrontCategory[]>('storefront-categories', () => [
    { name: 'Periféricos & ergonomia', slug: 'perifericos', text: CATEGORY_COPY.perifericos! },
    { name: 'Áudio & vídeo', slug: 'audio-video', text: CATEGORY_COPY['audio-video']! },
    { name: 'Conectividade', slug: 'conectividade', text: CATEGORY_COPY.conectividade! },
    { name: 'Casa inteligente', slug: 'casa-inteligente', text: CATEGORY_COPY['casa-inteligente']! },
    { name: 'Energia & kits', slug: 'energia-kits', text: CATEGORY_COPY['energia-kits']! },
  ]);
  const content = useState<Record<string, StorefrontContent>>('storefront-content', () => ({}));
  const loaded = useState<boolean>('storefront-database-loaded', () => false);
  const loading = ref(false);
  const error = ref('');

  async function refresh(force = false) {
    if (loaded.value && !force) return;
    const { $supabase } = useNuxtApp();
    if (!$supabase) return;
    loading.value = true;
    error.value = '';
    try {
      const { data: store, error: storeError } = await $supabase.from('stores').select('id').eq('slug', 'tecla-nativa').eq('status', 'active').maybeSingle();
      if (storeError) throw storeError;
      if (!store) { loaded.value = true; products.value = []; return; }
      const [productResult, categoryResult, variantResult, contentResult] = await Promise.all([
        $supabase.from('products').select('id,slug,sku_base,name,summary,description,primary_image_path,base_price,featured,category_id').eq('store_id', store.id).eq('status', 'published').order('featured', { ascending: false }).order('name'),
        $supabase.from('categories').select('id,name,slug').eq('store_id', store.id).eq('active', true).order('position'),
        $supabase.from('product_variants').select('product_id,sku,option_key,option_label,swatch_hex,image_path,price_override').eq('store_id', store.id).eq('active', true).order('created_at'),
        $supabase.from('content_sections').select('id,section_key,title,content').eq('store_id', store.id).eq('status', 'published').order('position'),
      ]);
      if (productResult.error) throw productResult.error;
      if (categoryResult.error) throw categoryResult.error;
      if (variantResult.error) throw variantResult.error;
      if (contentResult.error) throw contentResult.error;

      const fallbackBySlug = new Map((fallbackProducts as Product[]).map((product) => [product.slug, product]));
      const categoryById = new Map((categoryResult.data ?? []).map((category) => [category.id, category]));
      const variantsByProduct = new Map<string, typeof variantResult.data>();
      for (const variant of variantResult.data ?? []) {
        const rows = variantsByProduct.get(variant.product_id) ?? [];
        rows.push(variant);
        variantsByProduct.set(variant.product_id, rows);
      }
      products.value = (productResult.data ?? []).map((row) => {
        const fallback = fallbackBySlug.get(row.slug);
        const category = row.category_id ? categoryById.get(row.category_id) : undefined;
        const colors = (variantsByProduct.get(row.id) ?? []).map((variant) => ({
          id: variant.option_key,
          label: variant.option_label,
          swatch: variant.swatch_hex || '#697586',
          image: variant.image_path || row.primary_image_path || fallback?.image || '/images/product-placeholder.svg',
        }));
        const image = row.primary_image_path || colors[0]?.image || fallback?.image || '/images/product-placeholder.svg';
        return {
          id: row.sku_base,
          slug: row.slug,
          name: row.name,
          category: category?.slug || fallback?.category || 'outros',
          categoryLabel: category?.name || fallback?.categoryLabel || 'Outros',
          summary: row.summary || fallback?.summary || '',
          description: row.description || fallback?.description || '',
          price: Number(row.base_price),
          priceLabel: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(row.base_price)),
          image,
          sku: row.sku_base,
          badge: fallback?.badge,
          colors,
          variants: colors.map((color) => color.label),
          specs: fallback?.specs ?? [{ label: 'Categoria', value: category?.name || 'Tecnologia e acessórios' }, { label: 'SKU', value: row.sku_base }],
          compatibility: fallback?.compatibility || 'Confirme o modelo e os padrões compatíveis antes de uma compra real.',
          box: fallback?.box || 'Conteúdo demonstrativo; confirme a embalagem do produto real.',
          featured: row.featured,
        } satisfies Product;
      });
      categories.value = (categoryResult.data ?? []).map((category) => ({ name: category.name, slug: category.slug, text: CATEGORY_COPY[category.slug] || 'Explore itens selecionados para sua rotina.' }));
      content.value = Object.fromEntries((contentResult.data ?? []).map((row) => [row.section_key, { id: row.id, key: row.section_key, title: row.title, content: row.content as Record<string, unknown> }]));
      loaded.value = true;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Não foi possível atualizar a vitrine.';
    } finally {
      loading.value = false;
    }
  }

  return { products, categories, content, loaded, loading, error, refresh };
}
