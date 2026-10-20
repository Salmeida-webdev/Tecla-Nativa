# Briefing do front administrativo — Tecla Nativa

## Objetivo desta etapa

Construir uma interface administrativa avançada, navegável e responsiva para a loja Tecla Nativa. Este marco entrega somente o front-end para revisão visual e funcional. Os dados apresentados são demonstrativos e as alterações locais não persistem entre sessões. Autenticação, autorização no servidor, banco, integrações, envio de notificações e gravações reais ficam para a etapa de backend, depois da aprovação deste front.

## Referências reaproveitadas

O escopo combina os recursos operacionais demonstrados nos projetos **Ponto de Torra** e **Fio de Varanda**:

- Produtos, categorias, imagens, variantes e estoque por SKU.
- Entrada, saída e ajuste de estoque com motivo, responsável, data e vínculo ao pedido quando aplicável.
- Lista e detalhe completo de pedidos com snapshot dos itens adquiridos: nome, variante, SKU, quantidade, preço unitário e total da linha.
- Separação e expedição com endereço de destino, serviço, transportadora e código de rastreio.
- Cupons, dados de cliente e histórico de atividades administrativas.

## Direção da interface

- Continuidade da linguagem tech aprovada para a vitrine: fundo azul-noite, superfícies grafite, ciano, azul e violeta como cores semânticas; Inter e Sora.
- Painel denso, com hierarquia clara, tabelas legíveis, ações agrupadas e feedback visível.
- Navegação lateral por domínios de trabalho, que vira menu móvel em telas estreitas.
- Contraste, foco de teclado, rótulos associados aos campos, estados acessíveis e respeito à preferência de movimento reduzido.
- Dados de demonstração marcados no próprio painel para não confundir valores ilustrativos com vendas reais.

## Mapa de navegação

0. **Acesso administrativo:** tela de login, mostrar/ocultar senha, estado de erro e acesso de demonstração. Recuperação de senha aparece como fluxo de interface, sem enviar e-mail nesta etapa.
1. **Visão geral:** receita de pagamentos aprovados, pedidos, ticket médio, ações pendentes, pedidos por etapa, alertas de estoque e atividade recente. Métricas reais deverão excluir cancelamentos e pagamentos não confirmados.
2. **Pedidos:** busca por número, cliente, e-mail e telefone; filtros por pagamento, preparação, envio e período; detalhe com snapshot do pedido, contato, endereço, pagamento, frete, observações e timeline; controles de etapa e rastreio.
3. **Financeiro e conciliação:** cobranças, taxas estimadas, valores líquidos, previsão de repasse, estornos e divergências. Dados reais dependem de extratos e identificadores do provedor.
4. **Trocas e atendimento:** fila de casos ligada a pedidos, tipo e motivo da solicitação, prazo/SLA, estado e próximos passos de pós-venda.
5. **Compras e fornecedores:** ordens de compra, fornecedor, itens, quantidades, custos, prazos e conferência de recebimento; dados atuais são fictícios.
6. **Produtos:** lista dos 50 produtos-base atuais; busca, categoria, publicação, SKU, preço, imagens, variantes, estoque, destaque e ações de catálogo. O cadastro posterior deve incluir especificações, compatibilidade, conteúdo da embalagem, peso, dimensões e prévia da vitrine.
7. **Variantes e SKUs:** uma linha por cor/opção com imagem própria, SKU derivado, preço, estoque, peso e dimensões. SKU e logística precisam de validação e persistência no backend.
8. **Estoque:** disponibilidade e estoque mínimo por SKU/variante; fila de reposição; entrada, saída e ajuste com justificativa; histórico imutável por responsável e horário. Não permitir saldo negativo.
9. **Expedição:** fila por estado, destinatário, itens, transportadora/serviço, prazo e rastreio. A etiqueta somente deverá ser solicitada depois do pagamento aprovado e conferência dos dados logísticos.
10. **Cupons e ofertas:** percentual, valor fixo ou frete; período, quantidade de uso, limite por cliente, pedido mínimo e elegibilidade por categoria/produto. O valor deve ser recalculado no servidor.
11. **Clientes:** busca e consulta de histórico, pedidos e contato; exibir somente dados necessários ao papel da pessoa; prever solicitações de titular e controles de retenção no backend.
12. **Conteúdo da loja:** banners, destaques, ordem de categorias, faixa de benefícios, guias/artigos, texto alternativo e prévia por viewport.
13. **Análises e relatórios:** receita líquida, pedidos pagos, ticket médio, conversão, categorias e produtos; definição explícita de cada indicador e fonte necessária. Sem inventar resultado comercial.
14. **Integrações:** Supabase, PagBank/PagSeguro, Melhor Envio, e-mail, analytics e Netlify. Mostrar requisitos e estado de conexão sem declarar credenciais ou homologações inexistentes.
15. **Equipe e permissões:** proprietário, administrador, catálogo, expedição e atendimento. A interface é informativa; o controle efetivo depende de autorização na API e RLS.
16. **Histórico de atividade:** ação, responsável, registro, data/hora, origem e valores anterior/novo. Eventos de pagamento e movimentação precisam ser idempotentes e rastreáveis.
17. **Configurações:** dados comerciais, origem de envio, peso/dimensões, notificações, privacidade, retenção e preferências.

## Regras importantes de produto

- Pedido preserva snapshot dos itens no momento da compra; atualizar produto ou preço não altera pedidos antigos.
- Estado do pedido, pagamento e envio são campos separados; transições inválidas serão bloqueadas no backend.
- Estoque, valores e preço do pedido não são confiáveis quando vindos somente do navegador.
- Pagamento é confirmado por webhook validado, nunca somente pela página de retorno.
- Tokens e chaves dos provedores ficam no servidor; não aparecem no front nem em logs.
- Exportação, cancelamento, reembolso, mudança de papel e dados pessoais exigem confirmação, permissão e registro de auditoria.
- Rastreio e etiqueta devem permanecer associados ao pedido e ao serviço escolhido.

## Critérios de aceite do front

- `/painel` abre sem a navegação/rodapé públicos da vitrine e tem título `noindex`.
- `/painel/login` apresenta acesso e recuperação visual sem tentar autenticar ou enviar e-mail.
- Todos os 17 módulos abrem pelo menu e têm composição própria, com busca/filtros onde necessário.
- Detalhe do pedido mostra todos os itens, variantes, preços, cliente, endereço, pagamento, frete e timeline.
- Ações demonstrativas têm feedback e não alegam persistência, pagamento, etiqueta ou envio real.
- Busca, filtros, seleção do menu, drawer de pedido e formulários de demonstração funcionam no navegador.
- O layout reflowa sem corte em celular, tablet e desktop; tabelas têm rolagem horizontal dentro da própria seção.
- Foco, rótulos, nomes acessíveis, estados e redução de movimento são contemplados.
- Build, geração estática e checagem de tipos passam antes de solicitar aprovação.

## Fora deste marco

Autenticação e recuperação de senha; policies/RLS; criação e edição persistente de produtos; armazenamento de imagens; leitura/escrita de pedidos reais; webhook de pagamento; cobrança PagBank; cálculo/compra de frete; etiqueta e rastreio real; e-mail; exportação real; permissões na API; auditoria persistida; relatórios de dados reais.
