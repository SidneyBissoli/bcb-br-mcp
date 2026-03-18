# Plano de Deploy — Cloudflare Workers

## Diagnóstico (Fase 0)

### Tools MCP implementadas (8 tools)

| Tool | Descrição |
|------|-----------|
| `bcb_serie_valores` | Consulta valores de uma série por código e período |
| `bcb_serie_ultimos` | Obtém os últimos N valores de uma série |
| `bcb_serie_metadados` | Retorna metadados de uma série |
| `bcb_series_populares` | Lista 150+ séries agrupadas por categoria |
| `bcb_buscar_serie` | Busca séries por nome (accent-insensitive) |
| `bcb_indicadores_atuais` | Valores recentes: Selic, IPCA, Dólar, IBC-Br |
| `bcb_variacao` | Calcula variação percentual entre períodos |
| `bcb_comparar` | Compara 2-5 séries no mesmo período |

### Chamadas à API do BCB

- **URL base:** `https://api.bcb.gov.br/dados/serie/bcdata.sgs`
- **Padrão:** `{base}.{codigo}/dados?formato=json&dataInicial=...&dataFinal=...`
- **Fetch com timeout** (30s) via `AbortController` + **retry** (3 tentativas, backoff exponencial)
- Usa `fetch` global (compatível com Workers)

### Dependências npm

| Dependência | Compatível com Workers? |
|---|---|
| `@modelcontextprotocol/sdk` | Parcial — `StdioServerTransport` depende de Node.js `process.stdin/stdout`. Lógica do `McpServer` e schemas podem funcionar, mas para o worker criaremos um handler JSON-RPC manual. |
| `zod` | **Sim** — puro JavaScript |
| `@types/node` (dev) | N/A — apenas tipagem |
| `tsx` (dev) | N/A — apenas desenvolvimento |
| `typescript` (dev) | N/A — apenas build |

**APIs Node.js usadas:** Apenas `process.stdin/stdout` (via `StdioServerTransport`) e `console.error`. O `fetch` é global e funciona em Workers.

### Formato de saída

Todas as tools retornam `{ content: [{ type: "text", text: JSON.stringify(...) }] }`.

### Entry point HTTP existente

Não existe. Apenas stdio via `StdioServerTransport`.

### smithery.yaml

Tipo `stdio` com `npx -y bcb-br-mcp`. Correto para npm; será atualizado após deploy.

---

## Plano de Ação

### Arquivos a serem CRIADOS

1. **`src/tools.ts`** — Lógica compartilhada extraída de `src/index.ts`: constantes, catálogo de séries, funções utilitárias (`normalizeString`, `formatDateForApi`, `sleep`, `fetchWithTimeout`, `fetchBcbApi`, `parseBcbDate`, `calculateVariation`), interfaces, e handlers de cada tool.
2. **`src/worker.ts`** — Entry point Cloudflare Workers: fetch handler, CORS, roteamento (`GET /health`, `POST /mcp`, `OPTIONS /*`), handler JSON-RPC manual que chama os handlers das tools.
3. **`wrangler.toml`** — Configuração do Wrangler (`name`, `main`, `compatibility_date`, `vars`).

### Arquivos a serem MODIFICADOS

1. **`src/index.ts`** — Refatorar para importar lógica de `src/tools.ts` em vez de definir tudo inline. O comportamento stdio permanece idêntico.
2. **`package.json`** — Adicionar scripts `dev:worker` e `deploy:worker` + dependência `wrangler` (dev).

### Arquivos MANTIDOS sem alteração

- `README.md`
- `smithery.yaml` (atualizado apenas após deploy, Fase 8)
- `data/`
- `LICENSE`
- `.gitignore`
- Todos os demais

### Estratégia de compartilhamento de código

Extrair a lógica de `src/index.ts` para `src/tools.ts`:
- Constantes: `BCB_API_BASE`, `CONFIG`, `SERIES_POPULARES`
- Interfaces: `SerieValor`, `SerieMetadados`
- Funções utilitárias: `normalizeString`, `formatDateForApi`, `sleep`, `fetchWithTimeout`, `fetchBcbApi`, `parseBcbDate`, `calculateVariation`
- Handlers das 8 tools exportados como funções independentes
- Definições de tools (nome, descrição, schema zod) exportadas como array/objeto

`src/index.ts` importa de `src/tools.ts` e registra no `McpServer` via `StdioServerTransport`.
`src/worker.ts` importa de `src/tools.ts` e expõe via HTTP com handler JSON-RPC.

### Constraints do Worker

- Max body size: 256 KB (rejeitar com 413)
- Timeout upstream BCB: 10 segundos via `AbortController`
- CORS: `Access-Control-Allow-Origin: *` em todas as respostas
- Preflight `OPTIONS`: status 204 com headers CORS
- Sem módulos Node.js (`fs`, `path`, `http`, etc.)
- Apenas ESM (`import`/`export`)

### Fases de execução

1. **Fase 1** — Criar `src/tools.ts` com lógica extraída
2. **Fase 2** — Refatorar `src/index.ts` para importar de `src/tools.ts`
3. **Fase 3** — Criar `src/worker.ts` com handler HTTP + JSON-RPC
4. **Fase 4** — Criar `wrangler.toml`
5. **Fase 5** — Atualizar `package.json` (scripts + wrangler dev dep)
6. **Fase 6** — Build e testes locais (`npm run build` + `wrangler dev`)
7. **Fase 7** — Deploy (`wrangler deploy`)
8. **Fase 8** — Atualizar `smithery.yaml` com URL real
9. **Fase 9** — Commit e push
