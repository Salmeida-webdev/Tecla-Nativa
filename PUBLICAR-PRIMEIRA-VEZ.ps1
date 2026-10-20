$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot

$SiteId = '117ff263-be72-4ef2-b85b-59943eb80fa1'
$EnvExample = Join-Path $ProjectRoot '.env.example'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js não foi encontrado. Instale Node.js 20 LTS ou superior e abra um novo PowerShell.'
}
if (-not (Test-Path -LiteralPath $EnvExample)) {
    throw "Não encontrei $EnvExample. Extraia o projeto completo antes de executar este script."
}

# Lê apenas as variáveis públicas que o build Nuxt precisa. Nenhum segredo de servidor está neste arquivo.
Get-Content -LiteralPath $EnvExample | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
    }
}

if (-not $env:NUXT_PUBLIC_SUPABASE_URL -or -not $env:NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw 'As variáveis públicas do Supabase estão ausentes em .env.example.'
}

$env:NETLIFY_SITE_ID = $SiteId

Write-Host 'Instalando dependências e gerando o site estático...' -ForegroundColor Cyan
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci falhou.' }
npm run generate
if ($LASTEXITCODE -ne 0) { throw 'A geração do site falhou.' }

Write-Host 'Autentique a conta Netlify quando o navegador abrir.' -ForegroundColor Cyan
npx --yes netlify-cli@latest login
if ($LASTEXITCODE -ne 0) { throw 'A autenticação na Netlify falhou.' }

npx --yes netlify-cli@latest env:set NUXT_PUBLIC_SUPABASE_URL $env:NUXT_PUBLIC_SUPABASE_URL --context production --scope builds
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível configurar a URL pública do Supabase na Netlify.' }
npx --yes netlify-cli@latest env:set NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY $env:NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --context production --scope builds
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível configurar a chave pública do Supabase na Netlify.' }

Write-Host 'Publicando em produção...' -ForegroundColor Cyan
npx --yes netlify-cli@latest deploy --prod --dir .output/public --site $SiteId
if ($LASTEXITCODE -ne 0) { throw 'O deploy de produção falhou.' }

Write-Host 'Deploy concluído. A Netlify exibirá a URL pública acima.' -ForegroundColor Green
