# Tecla Nativa

Loja demonstrativa de tecnologia para portfólio, com vitrine, checkout de demonstração e painel administrativo conectado ao Supabase.

- **Vitrine:** <https://teclanativa.netlify.app/>
- **Repositório:** <https://github.com/Salmeida-webdev/Tecla-Nativa>
- **Painel:** `/painel`
- **Catálogo:** 50 produtos, variantes de cor e imagens padronizadas.
- **Crédito no rodapé:** Desenvolvido por LMX Soluções Digitais/Segundo Almeida.

## Como funciona a demonstração

- Catálogo e estoque fictícios alimentam os fluxos do painel.
- O checkout cria pedidos demonstrativos. O PagBank opera em Sandbox e não faz cobranças reais.
- O Melhor Envio calcula cotações; a loja não compra fretes, não emite etiquetas e não despacha produtos.
- A integração de pagamento e frete não deve ser usada como operação comercial sem novo briefing, credenciais e homologação.

## Tecnologias

- Nuxt 4, Vue 3, TypeScript e geração estática.
- Supabase Auth, PostgreSQL, RLS, Storage e Edge Functions.
- PagBank Sandbox e Melhor Envio para cotações de frete.
- Netlify para servir `.output/public`.

## Requisitos e execução local

- Node.js 24.15+ (validado com Node 24.20).
- npm e Docker Desktop para os testes locais do Supabase.

No PowerShell, na pasta do projeto:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm run dev
```

Abra o endereço informado pelo Nuxt, normalmente `http://127.0.0.1:3000`.
`.env.example` contém somente URL e chave **publicável** do Supabase. Nunca use uma chave `service_role` ou segredos de provedor em variáveis `NUXT_PUBLIC_*`.

## Testes e build

```powershell
npm run check:all
npm audit --audit-level=high
```

Para testar também o schema local, com Docker Desktop ativo:

```powershell
npx --yes supabase@latest start
npm run test:db
npm run lint:db
```

O build estático é gerado em `.output/public`. `npm run check:all` verifica tipos, testes Node, catálogo, patches de segurança, webhooks, geração Nuxt e arquivos publicados.

Configure `NUXT_PUBLIC_WHATSAPP_NUMBER` no `.env` com o número de atendimento em formato internacional, apenas dígitos. O número não é armazenado no repositório; o build estático incorpora o valor definido para criar os links de atendimento.

## SEO técnico

`npm run generate` gera o sitemap com as rotas institucionais e os 50 produtos. Painel, conta, sacola e checkout ficam fora do sitemap. O mesmo script atualiza o `robots.txt`; a URL padrão é `https://teclanativa.netlify.app`. Ao ligar um domínio próprio, configure `NUXT_PUBLIC_SITE_URL` no ambiente de build e gere o site novamente.

## Publicar o build validado no Netlify

O ZIP final já inclui o conteúdo de `.output/public`. Extraia-o para Downloads e execute no PowerShell:

```powershell
$ErrorActionPreference = 'Stop'
$Downloads = Join-Path $env:USERPROFILE 'Downloads'
$Zip = Join-Path $Downloads 'Tecla-Nativa-Final.zip'
$FinalPath = Join-Path $Downloads 'Tecla-Nativa-Final'
$Suffix = 2
while (Test-Path -LiteralPath $FinalPath) {
    $FinalPath = Join-Path $Downloads "Tecla-Nativa-Final-$Suffix"
    $Suffix++
}
Expand-Archive -LiteralPath $Zip -DestinationPath $FinalPath
$ProjectPath = Join-Path $FinalPath 'tecla-nativa-storefront'
$PublicPath = Join-Path $ProjectPath '.output\public'
$SiteId = '3a3c1461-deed-436f-a6af-e92701b16c80'
if (-not (Test-Path -LiteralPath (Join-Path $PublicPath 'index.html'))) { throw "Build estático não encontrado em $PublicPath" }
Set-Location -LiteralPath $ProjectPath
npx --yes netlify-cli@latest deploy --prod --no-build --dir $PublicPath --site $SiteId
if ($LASTEXITCODE -ne 0) { throw 'O deploy falhou. Consulte a saída do Netlify CLI.' }
```

`--no-build` evita a tentativa do Netlify CLI de executar `npm run generate` dentro da pasta de entrega, que não inclui `node_modules`. Se o CLI pedir autenticação, execute `npx --yes netlify-cli@latest login` e depois repita o deploy. Considere publicado somente quando o comando confirmar sucesso e o deploy aparecer como `ready` no Netlify.

## Estrutura principal

- `pages/`, `components/`, `assets/`: vitrine, navegação e painel.
- `data/products.json`: catálogo de referência e geração do sitemap.
- `public/images/`: marca, imagens institucionais e imagens do catálogo.
- `supabase/migrations/`, `supabase/functions/`, `supabase/tests/`: banco, integrações e testes.
- `docs/`: operação demonstrativa, integrações, banco, segurança, desempenho e publicação.

## Documentação

- [Dados e modo de demonstração](docs/DEMO-PORTFOLIO.md)
- [Fluxos das integrações](docs/INTEGRATION-STRUCTURE.md)
- [Backend Supabase](docs/SUPABASE-BACKEND.md)
- [Migrações](docs/MIGRACOES-SUPABASE.md)
- [OAuth Melhor Envio](docs/MELHOR-ENVIO-OAUTH.md)
- [Webhooks](docs/WEBHOOKS.md)
- [Segurança](docs/SECURITY-AUDIT.md)
- [Imagens do catálogo](docs/IMAGENS-GERADAS.md)
