import products from './data/products.json';
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@pinia/nuxt'],
  runtimeConfig: {
    public: {
      supabaseUrl: '',
      supabasePublishableKey: '',
    },
  },
  // Static Netlify output has no runtime server to apply public runtime config.
  // Inject these browser-safe Supabase values into the client bundle at build time.
  vite: {
    define: {
      __SUPABASE_URL__: JSON.stringify(process.env.NUXT_PUBLIC_SUPABASE_URL || ''),
      __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(process.env.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''),
    },
  },
  css: ['~/assets/css/main.css', '~/assets/css/panel.css'],
  app: { head: { htmlAttrs: { lang: 'pt-BR' }, title: 'Tecla Nativa | Tecnologia com espaço na rotina', meta: [{ name: 'description', content: 'Acessórios e tecnologia escolhidos para trabalhar, estudar e viver melhor em casa.' }, { name: 'theme-color', content: '#080d17' }], link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }] } },
  nitro: {
    prerender: { crawlLinks: true, routes: ['/painel', '/painel/login', '/painel/nova-senha', ...(products as {slug:string}[]).map(p => '/produtos/' + p.slug)] },
    // Avoid a false-positive Rollup warning for Nuxt's generated side-effect annotation.
    rollupConfig: {
      onwarn(warning, defaultHandler) {
        // Nuxt 4.6 emits this generated annotation in a position Rolldown flags,
        // then removes it itself. Keep other application warnings visible.
        if (warning.code === 'INVALID_ANNOTATION' && warning.message.includes('@__NO_SIDE_EFFECTS__')) return;
        // Nitro 2.13.5 contains circular imports in its own runtime. They are
        // reported by its dev Rolldown build but do not involve application code.
        if (warning.code === 'CIRCULAR_DEPENDENCY'
          && /node_modules\/(?:nitropack|@nuxt\/nitro-server)\/dist\/runtime\//.test(warning.message)) return;
        defaultHandler(warning);
      },
    },
  },
  // Run vue-tsc through the explicit verification command instead of inside every Vite build.
  typescript: { strict: true, typeCheck: false },
});
