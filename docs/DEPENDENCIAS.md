# Dependências e verificação de segurança

Verificação repetida em 21/10/2026 com o lockfile atual e Nuxt 4.6.2:

- `npm audit --audit-level=high`: zero vulnerabilidades na árvore completa, incluindo as ferramentas de build.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilidades nas dependências de produção.
- `npm run verify:security`: backports locais de `braces` e `node-forge` conferidos com verificações comportamentais.
- `npm run typecheck`, `npm run verify:catalog`, `npm run generate` e `npm run verify:build` passaram neste checkpoint.
- A saída publicada é estática em `.output/public`; as dependências Node são usadas localmente ou durante a geração do site.

O npm também pode exibir avisos de pacote depreciado ou de scripts de instalação. Eles não alteraram o resultado da auditoria; revisar separadamente se algum comando de instalação ou build falhar.
