# Baselines de superfície (fundação da fase bcb — 10/08/2026)

Artefatos do gate "superfície byte-idêntica ANTES/DEPOIS" da sessão de fundação.
Gerados por `node scripts/dump-surface.mjs` (normalizado: chaves ordenadas
recursivamente, tools/resources/prompts ordenados por nome/uri, versão do
servidor omitida de propósito).

| Arquivo | Como foi capturado | O que representa |
|:--|:--|:--|
| `surface-stdio-1.3.5.json` | `--stdio` sobre `dist/index.js` do fonte atual | o que o canal npm publica hoje |
| `surface-worker-source-1.3.5.json` | `--source` (lê `TOOL_DEFINITIONS` de `dist/tools.js`) | o que o worker serviria se o fonte fosse deployado (só tools — o modo não enxerga resources/prompts, que o worker monta à mão em `worker.ts`) |
| `surface-http-prod-1.3.1.json` | `--url https://bcb.sidneybissoli.workers.dev/` | o que o endpoint hospedado serve DE FATO hoje |

## Divergências medidas na captura (as três superfícies não coincidem)

### 1. Deriva de deploy — material, não cosmética

O worker em produção está em **1.3.1** enquanto o npm está em **1.3.5**, e a
diferença não é só o número: **as descrições das 8 tools em produção têm ~100
caracteres; no fonte têm ~1.200**. O trabalho de enriquecimento de descrições
para leitura por agente (v1.3.3) **nunca chegou ao endpoint hospedado**.

| Tool | fonte (1.3.5) | produção (1.3.1) |
|:--|--:|--:|
| bcb_serie_valores | 1301 | 100 |
| bcb_variacao | 1312 | 119 |
| bcb_indicadores_atuais | 1217 | 103 |
| bcb_comparar | 1207 | 99 |
| bcb_serie_metadados | 1192 | 115 |
| bcb_serie_ultimos | 1057 | 97 |
| bcb_series_populares | 721 | 139 |
| bcb_buscar_serie | 713 | 126 |

Causa: não há CI de deploy do worker (só `publish.yml`, que publica npm e
registry). Corrigido na fundação.

### 2. Os dois transportes anunciam contratos DIFERENTES

O stdio deriva o `inputSchema` do zod (via SDK); o worker usa JSON Schema
escrito à mão em `TOOL_DEFINITIONS`. O resultado é que o cliente HTTP recebe um
contrato mais fraco:

| Tool | presente no stdio, ausente no worker |
|:--|:--|
| `bcb_serie_ultimos` | `quantidade.default` (10), `quantidade.minimum`, `quantidade.maximum` (1000), `additionalProperties` |
| `bcb_comparar` | `codigos.minItems`, `codigos.maxItems`, `additionalProperties` |
| as outras 6 | `additionalProperties` |

`outputSchema` também difere entre os dois. As `annotations` (title + hints)
são idênticas nos três — essa parte já está consistente.

Causa: duplicação de definição entre `src/index.ts` (zod) e `src/tools.ts`
(`TOOL_DEFINITIONS`), com `worker.ts` reimplementando o protocolo à mão.
É exatamente o que o **registro único** (`src/register.ts`) elimina.

## Como usar no gate

Depois de cada etapa da migração, recapturar e comparar:

```bash
npm run build
node scripts/dump-surface.mjs --stdio > /tmp/after-stdio.json
diff <(python -m json.tool baselines/surface-stdio-1.3.5.json) <(python -m json.tool /tmp/after-stdio.json)
```

Toda diferença precisa ser deliberada e constar da lista de mudanças da sessão.
A convergência dos dois transectos num contrato só (o do stdio, que é o mais
forte) É uma mudança deliberada desta fundação — não uma regressão.

## Baseline vigente: `surface-stdio-1.11.0.json` (Deep Research — 03/09/2026)

**17 tools**, 3 resources, 3 prompts. A diferença contra a superfície da
1.10.1 (HEAD antes da mudança, capturada com o mesmo `--stdio`): **duas tools
novas, `search` e `fetch`, e nada mais** — as 15 preexistentes, os resources e
os prompts ficaram byte-idênticos, conferido programaticamente, tool a tool.
A partir daqui o baseline leva a VERSÃO no nome (`surface-stdio-<versão>.json`,
e `surface-http-prod-<versão>.json` para a produção): é dele que
`scripts/smoke-mcp.mjs` deriva a contagem esperada, em vez de pinar um literal.

| Tool | O que é |
|:--|:--|
| `search` | contrato Deep Research da OpenAI: busca no acervo (catálogo curado + índice do portal) → `{ id, title, url }` |
| `fetch` | contrato Deep Research da OpenAI: `bcb_serie_metadados` como documento Markdown com a URL pública canônica |

## Baseline anterior: `surface-stdio-d2-correlacao.json` (segunda metade do D2)

**15 tools**, 3 resources, 3 prompts. A diferença contra
`surface-stdio-d1-d2.json` é a mais limpa que a fase produziu: **duas tools
novas ao fim da lista e nada mais**. Nenhuma das 13 preexistentes mudou um byte —
conferido programaticamente, tool a tool, não de olho.

| Tool | O que é |
|:--|:--|
| `bcb_correlacao` | correlação par a par de 2 a 5 séries (Pearson/Spearman, sobre nível ou variação), com o alinhamento de grades declarado |
| `bcb_deflacionar` | série nominal convertida a moeda constante por IPCA, INPC ou IGP-M, com a variação nominal ao lado da real |

## Baseline anterior: `surface-stdio-d1-d2.json` (sessão de D1+D2)

13 tools, 3 resources, 3 prompts — a contagem não mudou, e a **ordem também
não**. As diferenças contra `surface-stdio-d3-verificada.json` são cinco tools, e
todas foram deliberadas:

| Tool | O que mudou |
|:--|:--|
| `bcb_serie_valores` | entrada: `frequencia` + `agregacao`; saída: `harmonizacao`, `chunking`, `janelaAplicada`, `serie.periodicidadeInferida`, e os itens de `dados` admitem `observacoes` |
| `bcb_serie_ultimos` | entrada: descrição de `quantidade` diz o teto real da origem; saída: `chunking`, `serie.periodicidadeInferida` |
| `bcb_serie_metadados` | saída: **saíram** `unidade` e `especial` (nenhuma fonte os publica), entrou `periodicidadeInferida` |
| `bcb_variacao` | entrada: descrição de `periodos`; saída: `derivacao`, `chunking`, `janelaAplicada` |
| `bcb_comparar` | entrada: `frequencia` + `agregacao`; saída: `derivacao`, `harmonizacao`, `aviso` |

`bcb_series_populares` ficou byte-idêntica de propósito: ela lista o catálogo
curado, onde nada é inferido, então segue com o fragmento `SERIE_REF_SCHEMA`
original em vez do fragmento das tools que consultam série.
