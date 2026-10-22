$ErrorActionPreference = 'Stop'

# Este script valida o build local e só publica se a pessoa digitar PUBLICAR.
# Nunca coloque service_role, token PagBank ou segredo Melhor Envio no .env da vitrine.
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot
$SiteId = '3a3c1461-deed-436f-a6af-e92701b16c80'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js não foi encontrado. Instale Node.js 24 LTS e abra um novo PowerShell.'
}

$PublicConfig = @{}
foreach ($Candidate in @((Join-Path $ProjectRoot '.env'), (Join-Path $ProjectRoot '.env.example'))) {
    if (Test-Path -LiteralPath $Candidate) {
        Get-Content -LiteralPath $Candidate | ForEach-Object {
            if ($_ -match '^\s*(NUXT_PUBLIC_SUPABASE_URL|NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)\s*=\s*(.*?)\s*$') {
                $Value = $Matches[2].Trim('"').Trim("'")
                if ($Value) { $PublicConfig[$Matches[1]] = $Value }
            }
        }
        if ($PublicConfig.ContainsKey('NUXT_PUBLIC_SUPABASE_URL') -and $PublicConfig.ContainsKey('NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) { break }
    }
}

if (-not $PublicConfig['NUXT_PUBLIC_SUPABASE_URL'] -or -not $PublicConfig['NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
    throw 'Configure NUXT_PUBLIC_SUPABASE_URL e NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env ou .env.example.'
}
$env:NUXT_PUBLIC_SUPABASE_URL = $PublicConfig['NUXT_PUBLIC_SUPABASE_URL']
$env:NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $PublicConfig['NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
$SupabaseUrl = $PublicConfig['NUXT_PUBLIC_SUPABASE_URL']
$SupabasePublishableKey = $PublicConfig['NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']

Write-Host 'Validando dependências, tipos, catálogo e build estático...' -ForegroundColor Cyan
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci falhou.' }
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'A verificação TypeScript falhou.' }
npm run verify:catalog
if ($LASTEXITCODE -ne 0) { throw 'A validação do catálogo falhou.' }
npm run verify:security
if ($LASTEXITCODE -ne 0) { throw 'A validação dos patches de segurança falhou.' }
npm run generate
if ($LASTEXITCODE -ne 0) { throw 'A geração estática falhou.' }
npm run verify:build
if ($LASTEXITCODE -ne 0) { throw 'A validação do build falhou.' }
npm audit --audit-level=high
if ($LASTEXITCODE -ne 0) { throw 'A auditoria de dependências encontrou vulnerabilidades altas ou críticas.' }

Write-Host 'Build pronto. Nenhum deploy foi iniciado.' -ForegroundColor Green
$Confirmation = Read-Host 'Para autorizar agora a publicação de produção no Netlify, digite PUBLICAR; para apenas encerrar, pressione Enter'
if ($Confirmation -cne 'PUBLICAR') {
    Write-Host 'Encerrado sem publicar. O build validado está em .output/public.' -ForegroundColor Yellow
    exit 0
}

Write-Host 'Confirme a conta Netlify no navegador, se solicitado.' -ForegroundColor Cyan
npx --yes netlify-cli@latest login
if ($LASTEXITCODE -ne 0) { throw 'A autenticação na Netlify falhou.' }
npx --yes netlify-cli@latest link --id $SiteId
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível vincular o projeto Netlify correto.' }
npx --yes netlify-cli@latest env:set NUXT_PUBLIC_SUPABASE_URL $SupabaseUrl --context production --scope builds
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível configurar a URL pública do Supabase.' }
npx --yes netlify-cli@latest env:set NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY $SupabasePublishableKey --context production --scope builds
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível configurar a chave publicável do Supabase.' }
npx --yes netlify-cli@latest deploy --prod --no-build --dir .output/public --site $SiteId
if ($LASTEXITCODE -ne 0) { throw 'O deploy de produção falhou.' }

Write-Host 'Deploy concluído.' -ForegroundColor Green
