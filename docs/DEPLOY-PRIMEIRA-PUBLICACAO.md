# Primeira publicação

O projeto Netlify já foi criado para a loja:

- Projeto: `tecla-nativa-storefront`
- ID: `117ff263-be72-4ef2-b85b-59943eb80fa1`
- Painel: https://app.netlify.com/projects/tecla-nativa-storefront

Para deploy conectado ao GitHub, o preset `netlify-static` do Nuxt grava os arquivos em `dist`; o `netlify.toml` aponta para essa pasta. O comando manual do script abaixo gera/publica `.output/public` localmente.

O endereço `tecla-nativa-storefront.netlify.app` só ficará público depois do primeiro deploy. O conector Netlify desta sessão consegue criar o projeto e configurar variáveis, mas não oferece a operação de envio dos arquivos; por isso, o script abaixo faz o deploy com o CLI oficial da Netlify.

## No Windows PowerShell

Extraia o ZIP, abra o PowerShell na pasta do projeto e rode:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
Set-Location "$env:USERPROFILE\Downloads\Tecla-Nativa-Fase-1\tecla-nativa-storefront"
.\PUBLICAR-PRIMEIRA-VEZ.ps1
```

Se o nome da pasta extraída tiver um sufixo, ajuste somente o caminho de `Set-Location`. O script instala dependências, gera a versão estática, abre o login oficial da Netlify, registra as variáveis públicas do Supabase no contexto de produção e publica `.output/public`. Ele imprime a URL pública ao terminar.

Requisitos: Node.js 20 LTS ou superior, conexão à internet e acesso à conta Netlify que contém o projeto. O endereço público aparece no resultado do deploy; domínio próprio pode ser associado depois pelo painel Netlify.

## Verificação posterior

Abra a URL exibida e confira a vitrine, `/painel/login` e o login do administrador. A loja continua em preparação: os produtos seed estão em rascunho e estoque zerado, e PagBank/Melhor Envio continuam desativados até a configuração das credenciais e callbacks com o domínio público.
