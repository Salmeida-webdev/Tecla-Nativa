# Backend Supabase

## Componentes

O Supabase fornece autenticação, PostgreSQL com RLS, Storage e funções server-side. O frontend usa somente credenciais publicáveis. Segredos dos provedores e a chave service_role ficam no ambiente das funções.

O histórico remoto conferido em 22/10/2026 contém 12 migrações. As sete funções publicadas cobrem autorização OAuth do Melhor Envio, cotações, webhooks, checkout PagBank Sandbox, saúde das integrações e gerenciamento da equipe.

## Limites do portfólio

- PagBank permanece em Sandbox e não realiza cobranças reais.
- Melhor Envio usa a conta de produção somente para calcular cotações.
- O fluxo não compra frete, não cria etiquetas e não despacha produtos.
- Catálogo, preços e saldo de estoque são demonstrativos.
- Dados de clientes inseridos no checkout ficam no banco; use somente dados fictícios ao demonstrar.
- O endereço de origem de frete é configuração privada da loja e não deve ser incluído no Git.

## Verificações concluídas

- O proprietário confirmou 76 testes pgTAP aprovados e lint local sem erros.
- As migrações e funções da integração estão ativas no Supabase remoto.
- Consulte MIGRACOES-SUPABASE.md para validar o histórico antes de mudanças futuras.

~~~powershell
npx --yes supabase@latest migration list --project-ref $ProjectRef
npm run test:db
npm run lint:db
~~~

Não envie migrações nem publique funções ao remoto sem revisar os arquivos locais, executar os testes e confirmar a etapa.
