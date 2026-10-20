# Backend Supabase — Tecla Nativa

## Estado do projeto

- Projeto Supabase: `Tecla Nativa`
- Referência: `rjkyktufdzqbkcdipzic`
- Região: `sa-east-1` (São Paulo)
- PostgreSQL: 17.11
- URL: `https://rjkyktufdzqbkcdipzic.supabase.co`
- Estado verificado: ativo e saudável
- Migrações aplicadas: schema inicial, índices/políticas e correção de privilégios de escrita administrativa (`20261020203436_align_admin_write_grants`)
- RLS: habilitado em todas as tabelas do schema `public`; sem alertas de política/tabelas
- Auth: primeiro usuário associado à loja como `owner` ativo
- Verificação de 20/10/2026: 29/29 tabelas públicas com RLS, sem privilégios de escrita para `anon`; leituras e gravações administrativas compatíveis com grants e políticas

## O que foi criado

O schema cobre catálogo, produtos/variantes, mídia, estoque e reservas, clientes, pedidos, tentativas de pagamento, transações, webhooks, expedição, cupons, atendimento, fornecedores/compras, conteúdo, configurações e auditoria. A autorização da equipe é baseada em associação persistida no banco, com escopo por loja. Os dados sensíveis não são concedidos a `anon` nem a usuários comuns autenticados.

O seed criou uma loja em configuração, cinco categorias, 50 produtos em rascunho, 150 variantes e seus registros de estoque com saldo zero. Os valores do catálogo são demonstrativos. Produtos e categorias permanecem inativos, então ainda não são publicados na vitrine. O primeiro usuário de equipe tem papel de proprietário. Não há pedidos nem clientes.

As credenciais de PagBank e Melhor Envio não foram configuradas. O banco guarda referências de segredo, não tokens. Payloads brutos de webhook e dados de cartão não são armazenados.

As imagens atuais fazem parte do site estático. O Supabase Storage ainda não tem buckets; ele será criado quando o fluxo de upload/gestão de imagens do painel for implementado, com escopo de loja e regras de acesso próprias.

## Revisão e pendências de preparação

- A migration `align_admin_write_grants` completa `INSERT`/`UPDATE` que já eram previstos pelas políticas de fornecedores, ordens de compra, configurações e integrações. RLS continua limitando as linhas e funções autorizadas.
- Conferidos no banco: 50 produtos em rascunho, 150 variantes, 150 níveis de estoque, 0 variantes sem nível de estoque, 0 pedidos e 0 clientes.
- O projeto segue em `setup`; categorias estão inativas, produtos não publicados e estoque está zerado. Isso é intencional até validar produtos reais, preços, dados fiscais e saldos.
- O advisor de segurança continua com um aviso: proteção contra senhas vazadas desativada. A configuração depende do plano Supabase (Pro ou superior).
- O advisor de performance marca 63 índices como ainda não usados. A loja está recém-criada e sem carga transacional; os índices atendem às chaves estrangeiras e consultas planejadas e serão reavaliados depois de dados e tráfego reais.
- Não há Edge Functions publicadas nem buckets de Storage. Não há credenciais de gateway ou frete no banco.
- Antes da primeira publicação, configurar no provedor de hospedagem `NUXT_PUBLIC_SUPABASE_URL` e `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A publishable key é pública; a chave `service_role` nunca deve ir ao navegador.
- Depois da URL HTTPS pública, definir a **Site URL** do Supabase e permitir a URL de recuperação de senha do domínio em **Authentication → URL Configuration**. Manter também a URL local de desenvolvimento.

Novas tabelas no schema público devem declarar explicitamente os `GRANT`s de Data API junto com RLS. A Supabase está removendo a exposição automática de novas tabelas, com aplicação a projetos existentes anunciada para 30/10/2026: [changelog oficial](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

## Configuração local

1. Copie `.env.example` para `.env`.
2. Execute `npm install` e `npm run dev`.
3. A URL e a chave publicável já estão configuradas no exemplo. A chave publicável é destinada ao cliente e não substitui as políticas RLS.
4. Nunca coloque uma chave `service_role` em código de navegador ou em variável `NUXT_PUBLIC_*`.

As migrações remotas foram aplicadas por integração Supabase e estão versionadas localmente. O advisor de segurança não apontou falhas de RLS, mas agora sinaliza a proteção contra senhas vazadas desativada. A Supabase informa que esse recurso está disponível no plano Pro ou superior. O advisor de performance não apontou índices de chaves estrangeiras ausentes ou políticas redundantes; lista índices ainda não usados porque a base está recém-criada. Eles atendem às relações e consultas planejadas, então não devem ser removidos com base apenas nesse relatório inicial.

## Criar o primeiro usuário proprietário

O usuário proprietário já foi associado à loja. O login e a recuperação de senha do painel usam Supabase Auth e validam a associação ativa de proprietário antes de liberar `/painel`.

Para a recuperação de senha funcionar, inclua a origem local (por exemplo, `http://localhost:3000/**`) em **Authentication → URL Configuration → Redirect URLs**. Quando o domínio final estiver definido, inclua também a URL HTTPS do domínio. Os módulos do painel ainda mostram dados demonstrativos; catálogo e pedidos ainda não estão conectados.

Como só a equipe da loja precisa de contas, em **Authentication → Settings** localize e desligue **Allow new users to sign up**. Usuários existentes ainda podem entrar quando essa opção está desligada. A conta de proprietário já criada não é removida.

### Smoke tests executados

- Dados-base: 1 proprietário ativo, 50 produtos em rascunho, 150 variantes e 150 variantes sem saldo.
- Todas as 29 tabelas públicas estão com RLS habilitado.
- A chamada pública à tabela de produtos retornou `[]`, pois nada está publicado.
- A chamada pública a `store_memberships` foi recusada com HTTP 401, sem expor dados da equipe.
- Geração Nuxt, verificação TypeScript, catálogo, patches de dependência e `npm audit --audit-level=high` passaram.

O login real ainda precisa ser testado no navegador com a senha da conta proprietária. Não compartilhe a senha. Acesse `/painel`; sem sessão deverá ir para `/painel/login`. Depois do login, teste também **Sair do painel** e uma senha incorreta.

Para repetir o bootstrap em outro ambiente ou reassociar o proprietário:

1. No Supabase Dashboard, abra **Authentication → Users** e crie o usuário proprietário com o e-mail da pessoa responsável. Configure o método de acesso e a confirmação de e-mail conforme a política da loja.
2. No **SQL Editor**, execute a consulta abaixo substituindo `EMAIL_DO_PROPRIETARIO` pelo e-mail exato desse usuário:

```sql
insert into public.store_memberships (store_id, user_id, role, status, joined_at)
select s.id, u.id, 'owner', 'active', now()
from public.stores as s
join auth.users as u on lower(u.email) = lower('EMAIL_DO_PROPRIETARIO')
where s.slug = 'tecla-nativa'
on conflict (store_id, user_id)
do update set role = 'owner', status = 'active', joined_at = now();
```

Não compartilhe senha nem token no chat. Essa associação só deve ser feita após confirmar que o usuário Auth pertence à pessoa responsável pela loja.

## Próxima etapa de integração

O roteiro de conexão PagBank, Melhor Envio, URLs de retorno, webhooks, idempotência e secrets está em [`INTEGRATION-STRUCTURE.md`](./INTEGRATION-STRUCTURE.md). Credenciais só serão adicionadas ao ambiente seguro de funções após obter a URL pública e iniciar os testes de sandbox.
