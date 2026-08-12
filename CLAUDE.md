# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An MCP server, published to npm as `bcb-br-mcp`, exposing three public APIs of
the Brazilian Central Bank as 15 tools over STDIO and Streamable HTTP: the SGS
time series (Selic, IPCA, FX, GDP and 150+ indicators), the **Focus**
market-expectations survey (Olinda OData) and **PTAX** exchange rates. Pure
TypeScript, ESM, two runtime dependencies: `@modelcontextprotocol/server` (MCP SDK
v2) and `@sbissoli/mcp-stats` (motor de estatística do portfólio). No database;
the only state is module-level — the curated series catalog and the 24-hour cache
of the Open Data Portal index (metadata only).

Two consumer channels, both in production and both protected:

- **npm** (`bcb-br-mcp`, ~500 downloads/month, 1.36k uses on Smithery) — stdio.
- **Hosted** — `https://bcb.sidneybissoli.com/mcp` (custom domain) and the
  historical `https://bcb.sidneybissoli.workers.dev`.

## Commands

```bash
npm run build          # limpa dist/ e compila com tsconfig.build.json (sem testes)
npm start              # node dist/index.js (servidor MCP em stdio)
npm test               # vitest run
npm run typecheck      # tsc --noEmit (inclui os testes — o build os exclui)
npm run smoke          # smoke contra o worker hospedado
node scripts/smoke-mcp.mjs --stdio        # o mesmo smoke sobre dist/index.js local
node scripts/dump-surface.mjs --stdio     # dump normalizado da superfície (ver baselines/)
```

O Worker (`worker/`, não publicado no npm) é uma instância do template de
hosting da Fase 0 (`mcp-br-commons/templates/cloudflare-worker`) e tem scripts
próprios, rodados de dentro de `worker/`:

```bash
cd worker && npm run dev        # wrangler dev — HTTP local em :8787
cd worker && npm run deploy     # wrangler deploy
cd worker && npm run typecheck
cd worker && npm test           # auth, rate limit, usage, status, superfície
```

O Worker **não** lista `@modelcontextprotocol/server` nas próprias deps — ele
resolve do `node_modules` do pacote pai, para haver uma única cópia do SDK.
`worker/.npmrc` fixa `legacy-peer-deps=true` porque o pacote `agents` declara
peers rígidos e o npm instalaria uma segunda cópia.

## Arquitetura

**Um registro, dois transportes.** `src/register.ts` é o ÚNICO lugar que projeta
tools/resources/prompts num `McpServer`; exporta `registerAll(server, options)` e
`createServer(version, options)`. `src/index.ts` é um wrapper fino de stdio
(`serveStdio`); `worker/src/server.ts` chama o mesmo `registerAll` por request
(`createMcpHandler`, stateless). `src/tools.ts` monta o catálogo canônico
(`TOOL_DEFINITIONS`, `RESOURCE_DEFINITIONS`, `PROMPT_DEFINITIONS`) e o
`dispatchTool`.

**Um módulo por API, primitivos num lugar só** (organização da sessão de D3, que
trouxe a segunda e a terceira API):

| Módulo | Responsabilidade |
|:--|:--|
| `src/shared.ts` | Primitivos sem dependência: fetch com timeout/retry, config, versão, tipos, `structuredResult`/`erroResult`, `sealDeep`, `ErroHttpBcb` (erro com o status preservado — é o que permite casar o 406). Não importa ninguém — é o que impede ciclo. `tools.ts` re-exporta tudo, porque worker e testes importam desses nomes de lá desde a fundação. |
| `src/series.ts` | Engenharia de série do SGS (D1): inferência de periodicidade, fatiamento de janela, busca com chunking, contorno do teto de 20, harmonização de frequências, **alinhamento de grades** e **deflator encadeado**. Concentra os limites medidos da origem. |
| `src/stats.ts` | Adaptador do `@sbissoli/mcp-stats` (D2) — distribuição, **correlação** e as convenções de arredondamento e de derivação do servidor. |
| `src/tools.ts` | Tools do SGS + montagem do catálogo canônico + `dispatchTool`. |
| `src/catalog.ts` | Índice do Portal de Dados Abertos (CKAN) para a busca real: cache de 24 h, renovação bloqueante, só metadados. |
| `src/olinda.ts` | Tradução do OData: montagem de URL, literais, datas, `consultarOData`. Concentra as pegadinhas da fonte. |
| `src/focus.ts` | Expectativas de Mercado (Focus) — 3 tools. |
| `src/cambio.ts` | PTAX — 2 tools, com disclaimer e qualificação de paridade. |

`dispatchTool` consulta `dispatchFocusTool` e `dispatchCambioTool` primeiro; cada
um devolve `null` quando a tool não é dele.

**Fronteira consolidar × separar (decisão do decisor, arbitragem 3).** Não
espelhar os ~18 recursos OData. As expectativas de calendário e as rolantes ficam
numa tool com `horizonte` como parâmetro; a Selic fica separada porque o eixo é a
reunião do Copom; Top 5 é sinalizador (`top5: true`), não tool; os quatro
recursos de cotação da PTAX viram uma tool com `moeda` + dia ou intervalo.
`RECURSOS` em `focus.ts` é o único lugar que conhece nome de recurso OData.
**`ExpectativasMercadoInstituicoes` jamais entra** — a fonte o desativou por
risco de quebra de confidencialidade dos microdados.

**Sobreposição deliberada com o SGS.** O dólar PTAX também é série SGS (1, 3695,
3697, 3698) e as medianas do Focus também (29033–29040). As duas superfícies
convivem de propósito, com referência cruzada nas descrições; a rodada paga de
eval no fim da fase mede se confunde. Não amputar códigos publicados.

Isso é recente e o motivo importa: até a fundação da fase bcb havia DUAS
superfícies independentes — o stdio derivava schemas do zod e o worker
reimplementava o JSON-RPC à mão com sua própria cópia dos schemas. Elas tinham
divergido de verdade (contrato HTTP sem `minItems`/`maxItems`, sem `default`,
sem `additionalProperties`; resources publicados com nomes diferentes;
descrições de tool 12× menores em produção). A medição está em
`baselines/README.md` — leia antes de mexer na superfície.

**Schemas:** os JSON Schemas em `TOOL_DEFINITIONS` são a superfície publicada e
vão ao ar VERBATIM (via `fromJsonSchema`). Não devolva schemas derivados de zod
ao SDK — o emissor dele reescreveria o dialeto. `sealDeep` fecha
(`additionalProperties: false`) todo nó objeto num lugar só.

**Campo que pode vir nulo tem de ser `type: ["string", "null"]` no
`outputSchema`.** As tools devolvem `null` de propósito onde a fonte não publica o
campo — nulo é a informação de que ali não há dado, e a normalização nunca omite.
Um schema que anuncie só `"string"` e sirva `null` viola a spec e faz cliente que
valida (o Inspector valida) rejeitar a resposta INTEIRA. O gate é
`src/output-contract.test.ts`; a validação de saída em runtime não pega isso, por
ser permissiva de propósito.

**Validação:** entrada é validada, saída não. O validador é o
`CfWorkerJsonSchemaValidator` — nos DOIS runtimes de propósito: o provider de
ajv compila com `new Function`, que o runtime da Cloudflare proíbe (derruba todo
`/mcp` com HTTP 500). Erros de validação voltam como resultado `isError` com
texto, não como erro de protocolo.

**Regra dura do SDK v2:** toda tool que declara `outputSchema` PRECISA devolver
`structuredContent` em todo sucesso — a checagem roda antes de qualquer
validador e não dá para desligar. Todos os handlers passam por
`structuredResult()`.

**Rota legada:** `POST /` no worker é reescrito para `/mcp`. O worker antigo
servia o JSON-RPC na raiz e é isso que o README publicou por versões; sem a
reescrita, todo cliente HTTP configurado quebraria. `GET /` segue sendo a
landing page. O contador `legacy_root_post` em `/metrics` mede quem ainda usa.

## Testes

- `src/catalog.test.ts` — o índice do portal: cache de 24 h, renovação bloqueante,
  uma requisição mesmo com buscas simultâneas, degradação quando o portal cai, e
  o ranking com a curadoria na frente.
- `src/focus.test.ts` / `src/cambio.test.ts` — pinam a FRONTEIRA aprovada, não só
  o feliz caminho: recusa de `referencia` nos horizontes rolantes, Top 5 barrado
  onde a fonte não publica, filtro sempre presente na URL, contagem client-side,
  formato MM-DD-YYYY da PTAX, disclaimer literal e qualificação da paridade.
- `src/series.test.ts` — o motor do D1: inferência de periodicidade pela mediana
  dos espaçamentos, fatiamento sem sobreposição nem buraco, fusão sem duplicata na
  emenda, caminho reativo do 406, janela aplicada em série diária sem
  `dataInicial`, contorno do teto de 20 e harmonização (inclusive a recusa de
  desagregar).
- `src/tools.series.test.ts` — o que disso CHEGA ao cliente pelas tools: o
  `chunking` anunciado, o `aviso` de periodicidade misturada em `bcb_comparar`, a
  harmonização com marca de derivação.
- `src/tools.characterization.test.ts` — baseline do comportamento das 8 tools do
  SGS, valor a valor, com `global.fetch` mockado (nunca rede). **Não relaxe estas
  asserções para fazer um refactor passar.** `bcb_variacao` e `bcb_comparar` foram
  o gate da migração ao `@sbissoli/mcp-stats` (arbitragem 4): a migração produziu
  exatamente duas diferenças, as duas explicadas no cabeçalho da seção do gate, e
  `bcb_comparar` não mudou em valor nenhum. A convenção de arredondamento agora é
  única e mora em `src/stats.ts`: observação da fonte sai verbatim, número
  calculado sai com 4 casas.
- `src/tools.correlacao-deflacao.test.ts` — as duas tools da segunda metade do
  D2: a RECUSA de cruzar grades diferentes (com o erro que ensina a saída), a
  grade decidida pela periodicidade medida e não pelo rótulo do catálogo, a
  diferença entre correlacionar nível e movimento, e a comparação nominal × real.
- `src/output-contract.test.ts` — valida o `structuredContent` de TODA tool contra
  o `outputSchema` anunciado, com o mesmo validador que o servidor usa na entrada.
  Existe porque a validação de saída em runtime é permissiva de propósito
  (`register.ts`), então nada mais pega um schema desonesto — e a spec do MCP exige
  a conformidade: cliente que valida (o Inspector valida) rejeita a resposta
  inteira. Os casos cobrem os caminhos que produzem `null`, que é onde isso
  quebra. **Ao acrescentar campo em resposta, acrescente o caso aqui.**
- `src/register.test.ts` — fidelidade registro↔wire pelo cliente v2 sobre
  transporte em memória.
- `worker/tests/` — auth, rate limit, agregação de uso, status, superfície.

## Baselines de superfície

`baselines/` guarda dumps normalizados de `tools/list` + resources + prompts.
Depois de qualquer mudança que possa mexer na superfície:

```bash
npm run build && node scripts/dump-surface.mjs --stdio > depois.json
# baseline vigente: baselines/surface-stdio-d2-correlacao.json (15 tools)
# baseline da fundação: baselines/surface-stdio-after-fundacao.json (8 tools)
```

Toda diferença precisa ser deliberada e listada no CHANGELOG.

## Convenções

- ESM com `NodeNext`: **todo import relativo leva `.js`**, mesmo em `.ts`.
- Descrições de tool e mensagens de erro em pt-BR (chegam ao usuário final);
  código e comentários acompanham o arquivo em que você está.
- Versão só em `package.json` — `index.ts` lê via `createRequire`, o worker via
  import do JSON. `server.json` é ressincronizado pelo CI no publish.
- Commits em Conventional Commits; o corpo explica o *porquê*.

## CI

- `ci.yml` — pacote (Node 20 e 22: typecheck + testes + build + dump da
  superfície) · worker (build da raiz + typecheck + testes) · npm audit.
- `deploy-worker.yml` — deploy contínuo em push para `main` nos caminhos do
  worker, com smoke de produção ao final. Existe porque o deploy manual produziu
  deriva real (npm 1.3.5 × hospedado 1.3.1 por versões).
- `publish.yml` — npm (com provenance) → MCP Registry (OIDC) → GitHub release.
  Sincroniza `server.json` a partir do `package.json`.

Secrets necessários: `NPM_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Pontos que mordem

- **A API do BCB cai, e cai inteira.** Retornos 502 em massa acontecem: durante a
  fundação atingiu os endpoints do SGS por horas; na sessão de D3 atingiu os
  TRÊS hosts ao mesmo tempo (`api`, `olinda` e `dadosabertos`) por mais de 40
  minutos, enquanto `www.bcb.gov.br` seguia em 200. O corpo do erro é a página
  institucional de "requisição inválida" atrás do Azure Front Door, então 502 com
  HTML não é sinal de bloqueio de UA — é a origem fora. O servidor degrada com
  `isError`, a busca degrada para o catálogo curado, e o smoke distingue isso de
  falha nossa.
- **O Olinda não pagina e não conta.** Sem `@odata.nextLink`, sem page size
  padrão, sem corte server-side, e `$count=true` é ignorado (contamos
  client-side). Consulta sem filtro NÃO completa — por isso as tools de Focus
  montam filtro por construção, com janela padrão em vez de janela aberta.
  `$orderby` não é usado de propósito: já recebemos tudo, ordenar do lado do
  cliente elimina uma classe de falha.
- **A PTAX recebe data em MM-DD-YYYY** nos parâmetros de função — não ISO, não
  dd/MM/yyyy. Mora em `paraDataPtax` (`olinda.ts`), num lugar só. A falha é
  SILENCIOSA: em ISO a fonte responde 200 com zero linhas, não erro. Verificado
  contra a origem.
- **O `ExpectativasMercadoTop5Selic` publica os campos em CAIXA BAIXA**
  (`indicador`, `reuniao`, `media`, `mediana`, `desvioPadrao`, `minimo`, `maximo`),
  sozinho entre os treze recursos, e é o único com `coeficienteVariacao`. Ler só as
  versões com inicial maiúscula devolve a linha inteira nula, sem erro nenhum. Por
  isso `normalizarExpectativa` lê pares de nomes.
- **`DatasReferencia` não é o índice de referências que o nome promete.** Publica
  `Indicador`, `periodo`, `DataReferencia1` e `DataReferencia2` (não existe
  `DataReferencia`), cobre 11 indicadores contra os 26 do recurso anual, não separa
  por horizonte e, para o IPCA, para em 12/2026 enquanto o mensal já carrega
  07/2028. `bcb_focus_referencias` deriva dos próprios recursos de expectativa, com
  `$select` — que o Olinda suporta e corta o payload em ~4×.
- **A fonte é irregular nos nomes dos recursos**, e não é erro de digitação:
  `ExpectativaMercadoMensais` e `ExpectativaMercadoTop5Trimestral` são singulares;
  o resto é plural. Existe Top 5 nos CINCO horizontes, não só no mensal e no anual.
- **Limite de 10 anos do SGS** vale só para séries **diárias** e o erro é **406**
  (não 400/404). A fronteira é exata ao dia e o limite é INCLUSIVO (10 anos justos
  passam), e vale sobre a janela **implícita**: sem `dataFinal` a origem assume
  hoje; sem `dataInicial`, o começo da série — e aí recusa. Tratado em
  `series.ts`, reativamente: quem afirma que a série é diária é o próprio 406.
- **Janela LEGAL também precisa ser fatiada.** Dez anos de série diária custam
  10–20 s (~4–8 ms por observação) e há corte por volta de 30 s que devolve
  **200 com HTML**. O worker tem timeout de 10 s, ou seja: uma janela que a origem
  aceita não completa no canal hospedado. Por isso a fatia é de **3 anos** (~2,6 s)
  e não de 10. Não "otimize" isso para menos requisições sem reler `bcb/docs/04`.
- **`ultimos/N` tem teto de 20 em TODA periodicidade** (não só nas diárias — a
  mensal 433 também devolve 400), embora o schema anuncie até 1000. Acima de 20,
  `series.ts` cumpre a promessa por janela de datas.
- **Não existe endpoint de metadados por série**: `bcdata.sgs.{n}/metadados`
  responde **404 `endpoint not found!`**, em todas as variantes de rota. A
  periodicidade sai da inferência pelo espaçamento das datas, e `unidade` não sai
  de lugar nenhum. Não reintroduza a chamada.
- **Cruzar grades diferentes casa 7 datas de 12, não zero.** Uma série diária e
  uma mensal casam por data nos dias 1º que caem em dia útil — medido em 2024:
  7 de 12. Zero seria evidente; sete produz um coeficiente de aparência saudável
  sobre um punhado de pontos. Por isso `bcb_correlacao` **recusa** periodicidades
  diferentes em vez de avisar como o `bcb_comparar`, e por isso `alinharSeries`
  devolve `completas` e `parciais` contados.
- **A periodicidade do catálogo curado NÃO é confiável para decidir grade.** A
  série 11 está catalogada como "Mensal" e a origem a publica todo dia útil.
  Decisão de compatibilidade de grade usa a periodicidade **medida** pelo
  espaçamento das datas; o catálogo só entra quando não há medição (menos de 3
  observações). Há mais rótulos errados no catálogo — ver a pendência registrada
  no `bcb/roadmap.md`.
- **O SGS não publica número-índice de preço**, só variação. O deflator é
  reconstruído encadeando as variações mensais — conferido contra a fonte:
  12 variações da 433 compostas batem com o acumulado em 12 meses da 13522 com
  erro máximo de 0,0052 pp (2018–2025). Não procure série de número-índice; não
  existe.
- **O que estoura o timeout de 10 s do worker é a PROFUNDIDADE da fila, não o
  número de requisições.** Com 1 requisição por série, duas séries diárias de 10
  anos levavam 10,7 s e cinco levavam 10,4 s. O orçamento de 10 simultâneas
  repartido entre as séries (`concorrenciaPorSerie`) derrubou o pior caso para
  ~8,8 s. **Meça sempre em janela nunca pedida**: a origem serve repetição de
  cache e uma janela já consultada mede 600 ms onde a fria mede 10 s.
- **Renomear o worker quebraria a URL**: ele se chama `bcb` desde a origem e é
  isso que define `bcb.sidneybissoli.workers.dev`.
- **Propagação da Cloudflare serve isolates mistos** por alguns segundos após o
  deploy; um smoke imediato pode pegar a versão antiga. Re-rodar resolve.
