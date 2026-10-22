# Migrações Supabase

## Estado remoto

O histórico remoto conferido em 22/10/2026 contém estas 12 versões:

| Versão | Escopo |
| --- | --- |
| 20261020192227 | Esquema inicial, RLS, funções-base e grants |
| 20261020192415 | Índices e políticas |
| 20261020203436 | Grants administrativos |
| 20261021141803 | Variantes, dimensões e estoque |
| 20261021142230 | Atualização auditada de variantes |
| 20261021204013 | Checkout transacional |
| 20261021215305 | Processamento de webhooks |
| 20261021230000 | Fluxo demonstrativo de comércio |
| 20261021233000 | Operações do painel |
| 20261021234000 | Catálogo e Storage |
| 20261021235000 | Inventário fictício e rastreio |
| 20261022115715 | OAuth do Melhor Envio com tokens no Vault |

Todas essas versões têm arquivo correspondente em supabase/migrations. O seed local usa dados sintéticos e não contém o endereço privado de origem.

## Testes e manutenção

O proprietário executou os testes pgTAP locais: 76 testes passaram em três arquivos e o lint do banco não reportou erros. Para repetir com Docker Desktop ativo:

~~~powershell
npx --yes supabase@latest start
npx --yes supabase@latest migration up --local
npx --yes supabase@latest db lint --local
npx --yes supabase@latest db test --local
~~~

- Não edite uma migração já aplicada; crie uma nova versão.
- Antes de qualquer db push, confira migration list local e remoto.
- Nunca execute db reset no banco remoto.
- Não inclua endereço real, tokens ou credenciais nos seeds ou migrations.
