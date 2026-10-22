$ErrorActionPreference = 'Stop'
$Downloads = Join-Path $env:USERPROFILE 'Downloads'
$Zip = Join-Path $Downloads 'Tecla-Nativa-Final.zip'
if (-not (Test-Path -LiteralPath $Zip)) {
    throw "Não encontrei $Zip. Baixe o ZIP final e coloque-o em Downloads."
}

$Destino = Join-Path $Downloads 'Tecla-Nativa-Final'
$Sufixo = 2
while (Test-Path -LiteralPath $Destino) {
    $Destino = Join-Path $Downloads "Tecla-Nativa-Final-$Sufixo"
    $Sufixo++
}

Expand-Archive -LiteralPath $Zip -DestinationPath $Destino
$Projeto = Join-Path $Destino 'tecla-nativa-storefront'
$Build = Join-Path $Projeto '.output\public\index.html'
if (-not (Test-Path -LiteralPath (Join-Path $Projeto 'package.json'))) {
    throw "A pasta do projeto não foi encontrada após a extração: $Projeto"
}
if (-not (Test-Path -LiteralPath $Build)) {
    throw "O build estático não veio no ZIP: $Build"
}

Set-Location -LiteralPath $Projeto
Write-Host "Projeto extraído em: $Projeto" -ForegroundColor Green
Write-Host 'Build estático validado. Para publicar uma única vez:' -ForegroundColor Cyan
Write-Host "npx --yes netlify-cli@latest deploy --prod --no-build --dir `"$((Join-Path $Projeto '.output\public'))`" --site 3a3c1461-deed-436f-a6af-e92701b16c80" -ForegroundColor Yellow
