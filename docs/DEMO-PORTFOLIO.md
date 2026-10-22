# Loja demonstrativa

A Tecla Nativa apresenta uma experiência de e-commerce para portfólio: catálogo, checkout e operações no painel.

## O que a demonstração faz

- Registra pedidos demonstrativos e os exibe no painel administrativo.
- Usa estoque e preços de exemplo para apresentar as operações.
- Consulta o Melhor Envio em produção para cotar frete.
- Mantém o PagBank no Sandbox, sem cobranças reais.
- Não compra frete, emite etiquetas ou despacha produtos.

Os dados enviados no checkout ficam associados ao pedido no Supabase. Para testar, use nome, telefone, e-mail e endereço fictícios. Não informe dados reais nem dados de cartão.

## Segurança da configuração

As credenciais do Melhor Envio e PagBank ficam apenas nos secrets server-side do Supabase. O endereço de origem da cotação é configuração privada e fica fora das migrations, seeds e repositório. Os seeds locais usam valores sintéticos.

## Desenvolvimento

Com Docker Desktop ativo:

~~~powershell
npx --yes supabase@latest start
npm run test:db
npm run lint:db
~~~

Consulte README.md para setup, validações e publicação.
