# Tecla Nativa — vitrine e painel (Fase 1 · front administrativo v13)

Projeto da loja Tecla Nativa: vitrine e painel administrativo com base de dados inicial no Supabase. Login do proprietário e recuperação de senha usam Supabase Auth; os dados operacionais do painel ainda são demonstrativos.

## Requisitos

- Node.js 22.22.3 ou superior, 24.15 ou superior, ou 26+
- npm

## Configurar Supabase localmente

Copie `.env.example` para `.env` antes de iniciar o servidor. A URL e a chave pública já apontam para o projeto da loja. A chave publicável pode ser usada no navegador; a segurança depende das políticas RLS. Nunca use uma chave `service_role` no front-end.

O schema e os dados iniciais estão em `supabase/migrations/` e `supabase/seed.sql`. As migrações desta entrega já foram aplicadas no projeto remoto. Consulte `docs/SUPABASE-BACKEND.md` para o estado, o bootstrap do primeiro usuário administrador e o que falta configurar.

## Executar localmente

```powershell
cd $HOME\Downloads\Tecla-Nativa-Fase-1\tecla-nativa-storefront
npm install
npm run dev
```

Acesse o endereço exibido pelo Nuxt (normalmente http://localhost:3000).

## Gerar publicação estática

```powershell
npm run generate
```

A saída estática fica em `.output/public/`. O arquivo `netlify.toml` configura o comando de geração e o diretório de publicação. O deploy exige que a conta Netlify e o domínio sejam configurados pelo responsável.

## Navegação incluída

- Início; catálogo de 50 produtos; busca, categoria e ordenação; detalhe de produto; sacola local; configurador simples de espaço; guias; sobre; ajuda.
- O botão de WhatsApp abre uma conversa com o número fornecido. A sacola monta uma mensagem para consulta, sem registrar pedido.
- O painel administrativo tem login de proprietário ligado ao Supabase Auth; catálogo, pedidos e demais operações ainda não consomem dados reais.

## Painel administrativo — prévia do front-end

Acesse `/painel` no servidor local para revisar a interface. O painel reúne 17 módulos: visão geral, pedidos, financeiro e conciliação, trocas e atendimento, compras e fornecedores, produtos, variantes/SKUs, estoque, expedição, cupons, clientes, conteúdo, análises, integrações, equipe/permissões, histórico e configurações. O login valida a associação ativa de proprietário no Supabase. Os dados e ações operacionais continuam demonstrativos; catálogo, pedidos, APIs, webhooks e integrações reais ainda precisam ser conectados.

## Imagens

O catálogo contém 50 imagens principais e duas imagens de cor para cada produto (Marfim e Azul petróleo), todas exportadas como WebP quadrados. Os seletores mudam a foto do produto, sem alterar o fundo do card. A mesma variante acompanha a sacola. As imagens são conceituais: não representam fabricante, modelo, marca, conexão ou especificação verificados.

Consulte `docs/IMAGENS-GERADAS.md` para os nomes e caminhos de todas as imagens.

Consulte `docs/SECURITY-AUDIT.md` para o resultado da auditoria de dependências; a árvore apresenta zero vulnerabilidades altas ou críticas com os backports locais revisados.

Consulte `docs/RESPONSIVIDADE-REVISAO.md` para os achados do vídeo, os ajustes para telas estreitas e os limites da validação visual.

Consulte `docs/BRIEFING-PAINEL-ADMINISTRATIVO.md` para o escopo completo e os critérios de aceite do front administrativo.
