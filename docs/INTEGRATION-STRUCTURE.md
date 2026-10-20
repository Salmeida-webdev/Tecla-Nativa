# Estrutura de integrações — Tecla Nativa

Este documento prepara a arquitetura das integrações sem ativar cobrança, frete, webhooks ou envio de mensagens. Os conectores serão implementados e testados depois da primeira publicação e da configuração das credenciais de sandbox.

## Variáveis por ambiente

### Build da vitrine na Netlify

- `NUXT_PUBLIC_SUPABASE_URL`
- `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Esses valores são públicos e usados pelo cliente para autenticação e leitura permitida por RLS. Nunca adicionar `service_role`, tokens de gateway ou segredos de webhook a variáveis `NUXT_PUBLIC_*` nem ao repositório.

### Ambiente seguro das funções

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Credencial de API PagBank
- Segredo/chave de validação de webhook PagBank, se exigido pela configuração do gateway
- Credenciais de API Melhor Envio
- Credencial e configuração do serviço de e-mail, quando escolhido

As credenciais serão guardadas como secrets das Edge Functions ou do ambiente de servidor. `integration_configs.secret_reference` armazena apenas uma referência operacional; não receberá valores secretos.

## PagBank — fluxo previsto

1. A função `checkout-create-order` valida payload, disponibilidade, preço e quantidade no servidor.
2. A função cria o pedido e seus itens com snapshots de nome, variante, SKU, preço e imagem. O cliente não escolhe o total final.
3. A disponibilidade é reservada em operação atômica e com idempotência para impedir venda acima do estoque e pedidos duplicados.
4. A função `pagbank-create-payment` cria a tentativa de pagamento no ambiente configurado e grava somente identificadores, status e URL de checkout em `payment_attempts`.
5. `pagbank-webhook` valida a origem/assinatura conforme o contrato vigente do PagBank, registra o identificador único em `webhook_inbox` e processa cada evento idempotentemente.
6. A atualização de pagamento, pedido, reserva, movimento de estoque e `order_status_events` deve ocorrer de forma consistente. Webhook duplicado não pode duplicar baixa ou transação.

Tabelas já preparadas: `orders`, `order_items`, `payment_attempts`, `financial_transactions`, `inventory_reservations`, `inventory_levels`, `stock_movements`, `order_status_events` e `webhook_inbox`.

## Melhor Envio — fluxo previsto

1. `shipping-quote` recebe CEP de origem/destino e dimensões e pesos das variantes; consulta o provedor no servidor.
2. O valor e o serviço selecionados são salvos no pedido como snapshot antes do pagamento.
3. Após confirmação do pagamento, `melhor-envio-create-shipment` solicita a etiqueta e grava o identificador em `shipments`.
4. `melhor-envio-webhook` valida o evento, usa `webhook_inbox` para idempotência e grava mudanças de rastreamento em `shipments` e `shipment_events`.

Tabelas já preparadas: endereço em snapshot JSON no pedido, atributos logísticos da variante, `shipments`, `shipment_events`, `orders` e `webhook_inbox`.

## Configuração dependente da URL pública

Após o primeiro deploy:

1. Configurar a **Site URL** do Supabase com a URL HTTPS pública e adicionar a rota pública de recuperação de senha à lista de redirects permitidos. Preservar também `http://localhost:3000/painel/nova-senha` durante o desenvolvimento.
2. Adicionar a URL pública nas configurações de retorno do checkout e nas origens permitidas aplicáveis.
3. Criar e testar os endpoints de Edge Functions; registrar os URLs de webhook no painel de cada provedor apenas quando a validação estiver pronta.
4. Configurar secrets de sandbox, validar idempotência, estados de erro e logs sem dados pessoais ou segredos.
5. Fazer testes de ponta a ponta em sandbox e só então preparar credenciais de produção.

## Portões antes de abrir checkout real

- Substituir catálogo conceitual por produtos e preços reais aprovados.
- Definir dimensões, peso e regras de frete reais por variante.
- Fazer inventário inicial e confirmar estoque disponível.
- Ativar a loja e publicar apenas produtos revisados.
- Validar política de privacidade, termos, atendimento, cancelamento, troca e devolução.
- Confirmar os webhooks e testar eventos duplicados, atrasados e fora de ordem.

O seed atual mantém a loja em `setup`, categorias inativas, todos os produtos em rascunho e estoque zerado; o checkout real permanece bloqueado até esses portões serem atendidos.
