# Revisão de responsividade — Tecla Nativa

## Evidência e escopo

- Vídeo fornecido em 20/10/2026, gravado em viewport de aproximadamente 258 × 786 px.
- Fluxos vistos: início, catálogo, páginas de produto, guias e sacola.
- A revisão priorizou reflow de texto e ações, proporção das imagens, controles de variantes, cabeçalho e composição da sacola em telas estreitas.

## Achados corrigidos

- Cards do catálogo comprimiam nome, resumo, variantes e botão ao lado de uma imagem quadrada. Em telas móveis, a imagem agora usa um quadro horizontal com `object-fit: contain`; nome e resumo podem ocupar a largura disponível sem truncamento.
- Imagens de detalhe têm proporção móvel limitada, mantendo o produto inteiro dentro do quadro.
- Títulos, botões e breadcrumb podem quebrar linha; a sacola reorganiza imagem, nome, preço e quantidade em telas estreitas.
- Cabeçalho, hero, formulário do catálogo e seção ilustrada têm ajustes adicionais abaixo de 390 e 330 px.
- Alvos dos seletores de cor foram ampliados para 32 px (40 px na página de produto), preservando os pontos visuais e o foco de teclado.
- Revisão das capturas móveis de 20/10: o quadro da imagem da hero agora mantém proporção horizontal 1.5:1 (1.42:1 em aparelhos muito estreitos), com a imagem preenchendo o quadro sem esticar nem ultrapassar a altura da seção. A foto original também é 1.5:1, então não perde conteúdo no breakpoint móvel.
- A faixa de benefícios sob a hero agora se organiza em três linhas legíveis em telas estreitas, com espaçamento e divisores; os números viram marcadores visuais decorativos somente no mobile.
- O painel administrativo tem breakpoint próprio: sidebar lateral vira menu recolhível em telas estreitas; cartões refluem para duas e uma coluna; tabelas mantêm rolagem no próprio contêiner, e detalhes de pedido/modais passam a ocupar a largura disponível.

## Warning do build

O build emitia `INVALID_ANNOTATION` para `@__NO_SIDE_EFFECTS__` em um módulo gerado pelo Nuxt 4.6.2. O Rollup removia a anotação por conta própria. A configuração filtra somente esse aviso conhecido. O modo dev também relatava 9 ciclos circulares inteiramente no runtime de `nitropack`/`@nuxt/nitro-server`; o filtro da configuração limita-se a esses arquivos de dependência, deixando outros avisos passar. A checagem de tipos é executada separadamente com `vue-tsc --noEmit -p .nuxt/tsconfig.json`.

O npm deste ambiente de validação também imprime `Unknown env config "http-proxy"` porque a variável de proxy foi herdada do ambiente do executor; não é um aviso do app nem do build. Removê-la só para o comando elimina esse aviso. O `listen EPERM` do worker local observado depois de `Ready` é uma limitação de socket do ambiente de execução; não ocorre durante `npm run generate`.

## Validação executada

- `npm run generate`: concluído, 120 rotas estáticas geradas sem avisos de build do Nitro.
- `npm run dev`: compilação do cliente, servidor e Nitro sem os 9 avisos de ciclo do runtime. A sandbox bloqueia o socket do worker depois de mostrar `Ready`.
- `vue-tsc --noEmit -p .nuxt/tsconfig.json`: sem erros.
- `npm audit --audit-level=high --offline`: 0 vulnerabilidades.
- `npm run verify:security`, `npm run verify:catalog` e `npm run verify:build`: aprovados.
- Front do painel: `vue-tsc` sem erros e rotas estáticas `/painel/` e `/painel/login/` geradas; referências de imagens da lista de pedidos conferidas contra o catálogo.

## Limite da avaliação

A inspeção visual cobre o vídeo fornecido e a leitura do código/estilos. Não havia navegador Chromium ou Firefox acessível neste ambiente para executar uma matriz de screenshots em vários tamanhos; a tentativa de abrir o servidor do workspace no navegador remoto também foi recusada por isolamento de rede. Portanto não se declara aprovação visual automatizada de todos os breakpoints. A revisão visual do painel fica pendente da sua abertura e aprovação.
