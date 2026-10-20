# Dependências e verificação de segurança

Verificação realizada em 20/10/2026, após migrar a geração estática para Nuxt 4.6.2:

- `npm audit --omit=dev`: 0 vulnerabilidades nas dependências de produção.
- `npm audit`: 11 ocorrências altas no conjunto de desenvolvimento/build. As ocorrências são transitivas da cadeia Nuxt/Nitro/Vite; os advisories incluem `braces` (até 3.0.3) e `node-forge` (até 1.4.0), além dos pacotes que os incorporam.
- A versão instalada é Nuxt 4.6.2. `npm audit fix` sem `--force` não encontrou atualizações compatíveis. A sugestão forçada do npm aponta Nuxt 4.1.3, uma troca para uma versão anterior; não foi aplicada.
- As páginas entregues são estáticas em `.output/public`; nenhuma dependência Node é executada no site publicado. As ferramentas Nuxt são usadas localmente ou no processo de build.

O audit completo, portanto, ainda não está limpo. Reavaliar quando os mantenedores publicarem versões corrigidas para a cadeia de build, antes de ampliar o sistema com painel ou back-end. Não usar credenciais ou dados reais neste ambiente de desenvolvimento.
