# Fluxos da loja

A Tecla Nativa é uma demonstração de e-commerce. O checkout grava pedidos para que a operação apareça no painel. O PagBank permanece no Sandbox; o Melhor Envio usa a conta de produção apenas para cotar fretes. Nenhum pagamento real é cobrado e nenhuma etiqueta é comprada ou emitida.

## Compra demonstrativa

1. A vitrine apresenta o catálogo e os preços armazenados no banco.
2. O Melhor Envio calcula as opções de frete na API de produção. A cotação fica vinculada ao carrinho e expira; o servidor valida o valor assinado antes de criar o pedido.
3. O checkout revalida catálogo, variantes, estoque e preço no banco, registra o pedido demonstrativo e reserva as unidades em uma transação.
4. O PagBank abre um checkout em Sandbox. O site não recebe dados de cartão e o retorno do navegador, sozinho, não confirma pagamento.
5. O webhook assinado do PagBank reconcilia o estado do pagamento; eventos repetidos não duplicam baixa de estoque nem lançamentos financeiros.
6. O painel acompanha o mesmo pedido, permite avançar a operação e registrar rastreio. Não há compra ou emissão de etiqueta.

## OAuth e cotação do Melhor Envio

- A autorização começa por uma sessão administrativa e usa state aleatório de uso único.
- Os tokens OAuth são armazenados no Supabase Vault e renovados no servidor próximo do vencimento.
- A configuração de servidor MELHOR_ENVIO_BASE_URL deve ser https://melhorenvio.com.br. A função rejeita a URL Sandbox.
- O pedido de cotação não cria um envio, não compra frete e não gera cobrança.

## Operações do painel

O painel usa os dados do mesmo banco da vitrine. Inclui pedidos, catálogo, variantes, estoque demonstrativo, clientes, cupons, conteúdo, fornecedores, compras, atendimento, equipe, integrações, auditoria e exportação CSV. Alterações ficam sujeitas às permissões administrativas e às políticas do banco.

## Verificações

Com Node.js 24 e Docker Desktop:

~~~powershell
npm run check:all
npm audit --audit-level=high
npx --yes supabase@latest start
npm run test:db
npm run lint:db
~~~

Os testes do banco cobrem pedidos, idempotência, inventário e webhooks. As funções externas não são chamadas pelos testes unitários; valide a cotação real pelo checkout demonstrativo antes da publicação.

Para preparar uma nova versão da vitrine, use o procedimento em README.md. A publicação Netlify permanece uma etapa separada.
