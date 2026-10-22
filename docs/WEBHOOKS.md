# Webhooks

Os webhooks sincronizam eventos dos provedores com o pedido demonstrativo. As funções Supabase estão ativas; cada provedor também precisa apontar seu cadastro de aplicativo para a URL HTTPS correspondente.

## Endpoints

Substitua SUPABASE_URL pela URL pública do projeto:

| Provedor | Caminho | Validação |
| --- | --- | --- |
| Melhor Envio | /functions/v1/melhor-envio-webhook | HMAC-SHA-256 no corpo original |
| PagBank Sandbox | /functions/v1/pagbank-webhook | Assinatura ECDSA/SHA-256 no corpo original |

Os endpoints aceitam chamadas sem JWT porque os provedores externos não enviam sessão Supabase. A assinatura do provedor é obrigatória. Eventos repetidos são deduplicados. Dados de cartão e payloads brutos não são armazenados.

## Melhor Envio

Cadastre o caminho da função webhook nas configurações do aplicativo de produção do Melhor Envio. Use o segredo do mesmo aplicativo no secret MELHOR_ENVIO_CLIENT_SECRET do Supabase. O código trata eventos de expedição e rastreio, mas esta demonstração não cria etiquetas. Sem etiquetas reais, não haverá eventos de expedição para testar.

As cotações usam outro fluxo OAuth. A conta de produção é autorizada no painel, os tokens ficam no Vault e a renovação ocorre no servidor.

## PagBank

O checkout usa PagBank Sandbox. A URL de notificação é enviada na criação do checkout. A função aceita somente o endpoint Sandbox e valida o valor, moeda e identificadores antes de marcar um pedido como pago.

## Segredos server-side

Configure apenas no Supabase:

- MELHOR_ENVIO_BASE_URL com https://melhorenvio.com.br
- MELHOR_ENVIO_CLIENT_ID
- MELHOR_ENVIO_CLIENT_SECRET
- PAGBANK_API_BASE_URL com https://sandbox.api.pagseguro.com
- PAGBANK_ACCESS_TOKEN
- SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY usados pelas Edge Functions

Nunca coloque o client secret, tokens OAuth, service_role ou token PagBank em variáveis NUXT_PUBLIC_ ou no repositório.

## Testes locais

~~~powershell
npm run verify:webhooks
npm run test:db
npm run lint:db
~~~

Os testes verificam assinatura sobre o corpo original, rejeição de payload alterado, deduplicação e transições do pedido. Não emitem etiquetas nem iniciam cobranças.
