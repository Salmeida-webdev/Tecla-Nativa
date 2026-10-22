# OAuth do Melhor Envio

O OAuth usa o aplicativo real do Melhor Envio. A autorização permite somente o escopo de cálculo de frete; as funções de cotação não compram envio nem emitem etiqueta.

## Configuração

- MELHOR_ENVIO_BASE_URL deve ser https://melhorenvio.com.br.
- Cadastre MELHOR_ENVIO_CLIENT_ID e MELHOR_ENVIO_CLIENT_SECRET como secrets do Supabase.
- Cadastre MELHOR_ENVIO_CONTACT_EMAIL com o e-mail de suporte da integração; ele é enviado no User-Agent obrigatório da API.
- Registre como callback a URL SUPABASE_URL/functions/v1/melhor-envio-oauth do projeto.
- O início de autorização exige uma sessão administrativa ativa e limita a origem de retorno a domínios permitidos.

Não salve a URL completa de autorização enviada em um chat: o parâmetro state é temporário e de uso único. Para conectar ou reconectar, use a ação de integração dentro do painel.

## Armazenamento e renovação

Tokens de acesso e renovação são armazenados no Vault do Supabase, nunca no navegador, em .env público ou no Git. A renovação é feita no servidor antes da expiração do token de acesso. Se o token de renovação expirar ou for revogado, conecte novamente a conta pelo painel.

## Teste

Use “Testar integração” no painel. A verificação consulta uma cotação de teste à API de produção, não cria ordem de envio e não compra etiqueta. O pedido de checkout usa a cotação assinada e validada no servidor.
