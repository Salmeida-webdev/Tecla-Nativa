# Publicação da Tecla Nativa

## Estado observado

- Vitrine pública: https://teclanativa.netlify.app/
- O deploy publicado consultado em 22/10/2026 está pronto.
- A tentativa seguinte terminou em erro porque o CLI iniciou uma compilação dentro de uma pasta sem dependências instaladas. Ela não substituiu a versão publicada.
- O ZIP final precisa incluir .output/public. Para subir essa pasta já compilada, o comando exige --no-build.

## Procedimento único

1. Baixe Tecla-Nativa-Final.zip e coloque-o em Downloads.
2. Extraia-o para uma pasta nova; o projeto fica em tecla-nativa-storefront dentro dela.
3. Abra PowerShell nessa pasta do projeto e confirme que .output/public/index.html existe.
4. Execute:

~~~powershell
$ErrorActionPreference = 'Stop'
$PublicPath = Join-Path (Get-Location) '.output\public'
$SiteId = '3a3c1461-deed-436f-a6af-e92701b16c80'
if (-not (Test-Path -LiteralPath (Join-Path $PublicPath 'index.html'))) {
    throw "Build não encontrado em $PublicPath. Extraia o ZIP final completo."
}
npx --yes netlify-cli@latest deploy --prod --no-build --dir $PublicPath --site $SiteId
if ($LASTEXITCODE -ne 0) { throw 'O deploy falhou; não considere a versão publicada.' }
Write-Host 'O Netlify CLI confirmou o envio. Confira o estado ready no painel.' -ForegroundColor Green
~~~

Se o CLI pedir login, execute npx --yes netlify-cli@latest login e repita o comando acima. Só considere a versão publicada quando o Netlify mostrar estado ready.

## Validação depois da publicação

- Abra a vitrine em desktop e celular.
- Teste uma cotação real de frete sem prosseguir para compra de etiqueta.
- Faça uma compra demonstrativa com dados fictícios e confirme o pedido no painel.
- Confirme o webhook do PagBank Sandbox sem realizar cobrança real.
- Confira sitemap.xml, robots.txt, páginas de produto e rodapé.

Não execute deploy em cada ajuste. Gere e valide o pacote completo e publique uma vez.
