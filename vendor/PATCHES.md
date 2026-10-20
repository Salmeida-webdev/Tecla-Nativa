# Backports de segurança locais

- `braces` 3.0.4-local.0: guarda a profundidade de chaves e parênteses no parser (máximo 100). Baseado no commit `28d440b5dd449dbf1fe6f3506cf94ecca4d02660` do [PR #72](https://github.com/micromatch/braces/pull/72).
- `node-forge` 1.4.1-local.0: confere os elementos da sequência ASN.1 DigestAlgorithm durante a verificação RSA PKCS#1 v1.5. Baseado no commit `ceba344` do [PR #1152](https://github.com/digitalbazaar/forge/pull/1152).

Esses backports são aplicados por `overrides` em `package.json`. Remova os pacotes locais e use versões upstream corrigidas quando forem publicadas e testadas. Os arquivos de licença upstream estão junto de cada pacote.
