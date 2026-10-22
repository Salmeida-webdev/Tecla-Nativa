# Auditoria de dependências — checkpoint Supabase

Data da verificação: 21/10/2026. `npm audit --audit-level=high` encontrou zero vulnerabilidades.

## Resultado

- `npm audit --audit-level=high`: 0 vulnerabilidades altas ou críticas na árvore completa, incluindo ferramentas de build.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilidades altas ou críticas nas dependências de runtime.

## Correções transitivas

O Nuxt/Nitro trazia `braces` e `node-forge`, responsáveis por 11 ocorrências repetidas na árvore de dependências. Os dois pacotes ainda não tinham releases upstream corrigidas na verificação. O projeto inclui backports locais em `vendor/` e os instala por `overrides`:

- `braces@3.0.4-local.0`: limita o aninhamento de chaves e parênteses a 100 níveis durante o parse, bloqueando a recursão sem limite ligada ao GHSA-vfj7-8cjw-p6xm. A alteração segue o patch revisado no [PR #72](https://github.com/micromatch/braces/pull/72), commit `28d440b5dd449dbf1fe6f3506cf94ecca4d02660`.
- `node-forge@1.4.1-local.0`: valida a contagem dos elementos também na sequência ASN.1 `DigestAlgorithm`, rejeitando bytes extras usados na falsificação de assinatura ligada ao GHSA-86w9-cpqp-85rv. A alteração segue o [PR #1152](https://github.com/digitalbazaar/forge/pull/1152), commit `ceba344`.

Esses são backports mantidos neste repositório, não releases oficiais dos mantenedores. Remover `vendor/` e os `overrides` quando versões oficiais corrigidas forem publicadas, após revalidar a árvore.

## Verificação

`npm run verify:security` cobre o limite de aninhamento do `braces` e uma assinatura RSA válida com o `node-forge` atualizado. Neste checkpoint também passaram `npm run verify:catalog`, `npm run typecheck`, `npm run generate` e `npm run verify:build`.
