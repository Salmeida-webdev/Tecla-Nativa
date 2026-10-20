$ErrorActionPreference = 'Stop'
$Downloads = Join-Path $env:USERPROFILE 'Downloads'
$Zip = Join-Path $Downloads 'Tecla-Nativa-Backend-Auth-v4.zip'
if (-not (Test-Path -LiteralPath $Zip)) {
    throw "Não encontrei $Zip. Baixe o ZIP e coloque-o na pasta Downloads."
}
$Destino = Join-Path $Downloads 'Tecla-Nativa-Backend-Auth-v4'
$Sufixo = 2
while (Test-Path -LiteralPath $Destino) {
    $Destino = Join-Path $Downloads "Tecla-Nativa-Backend-Auth-v4-$Sufixo"
    $Sufixo++
}
Expand-Archive -LiteralPath $Zip -DestinationPath $Destino
$Projeto = Join-Path $Destino 'tecla-nativa-storefront'
if (-not (Test-Path -LiteralPath (Join-Path $Projeto 'package.json'))) {
    throw "A pasta do projeto não foi encontrada após a extração: $Projeto"
}
Set-Location -LiteralPath $Projeto
Write-Host "Projeto extraído em: $Projeto" -ForegroundColor Green
Write-Host "Próximos comandos: npm install; npm run dev" -ForegroundColor Cyan
