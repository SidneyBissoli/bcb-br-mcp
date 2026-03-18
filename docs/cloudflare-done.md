# Deploy Cloudflare Workers — Resultado Final

Data de execução: 2026-03-18

## Resultado

| Item | Status |
|---|---|
| URL do endpoint MCP | `https://bcb.sidneybissoli.workers.dev` |
| Health check | `https://bcb.sidneybissoli.workers.dev/health` |
| stdio (`npx bcb-br-mcp`) | Inalterado e funcionando |
| Cloudflare Worker name | `bcb` |
| Subdomínio da conta | `sidneybissoli.workers.dev` |

## Diferenças em relação ao planejado

| Aspecto | Planejado | Executado |
|---|---|---|
| Worker name | `bcb-br-mcp` | `bcb` (mais limpo na URL) |
| Endpoint MCP | `POST /mcp` | `POST /` (raiz, URL sem sufixo) |
| Subdomínio Cloudflare | não especificado | `sidneybissoli` (renomeado de `senado-mcp`) |
| URL final | `https://bcb-br-mcp.*.workers.dev/mcp` | `https://bcb.sidneybissoli.workers.dev` |

## Arquitetura implementada

```
src/
├── tools.ts    # Lógica compartilhada (constantes, handlers das 8 tools, dispatcher)
├── index.ts    # Entry point stdio (npm/npx) — importa de tools.ts
└── worker.ts   # Entry point Cloudflare Workers (HTTP) — importa de tools.ts
```

### Rotas do Worker

| Método | Path | Descrição |
|---|---|---|
| `GET` | `/health` | Health check (`{"status":"ok"}`) |
| `POST` | `/` | MCP JSON-RPC (tools/list, tools/call, initialize) |
| `OPTIONS` | `/*` | CORS preflight (204) |

### Tools MCP disponíveis (8)

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

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `src/tools.ts` | Lógica compartilhada extraída de index.ts |
| `src/worker.ts` | Entry point HTTP para Cloudflare Workers |
| `wrangler.toml` | Configuração do Wrangler (name=bcb, compatibility_date=2024-09-23) |

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `src/index.ts` | Refatorado para importar handlers de tools.ts (comportamento idêntico) |
| `package.json` | Adicionados scripts `dev:worker` e `deploy:worker` + wrangler como devDependency |
| `smithery.yaml` | Atualizado de stdio para HTTP (`https://bcb.sidneybissoli.workers.dev`) |

## Configuração final

### wrangler.toml

```toml
name = "bcb"
main = "src/worker.ts"
compatibility_date = "2024-09-23"

[vars]
BCB_BASE_URL = "https://api.bcb.gov.br"
```

### Constraints do Worker

- Max body size: 256 KB
- Timeout upstream BCB: 10 segundos
- Retry: 2 tentativas com backoff exponencial
- CORS: `Access-Control-Allow-Origin: *`

## Comandos úteis

```bash
# Desenvolvimento local
npm run dev:worker     # wrangler dev (http://localhost:8787)

# Deploy
npm run deploy:worker  # wrangler deploy

# Testar
curl https://bcb.sidneybissoli.workers.dev/health
curl -X POST https://bcb.sidneybissoli.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Testes realizados (todos aprovados)

| Teste | Local | Produção |
|---|---|---|
| `npm run build` (tsc) | ✅ | — |
| `GET /health` | ✅ | ✅ |
| `POST /` — tools/list | ✅ | ✅ |
| `POST /` — tools/call (bcb_indicadores_atuais) | ✅ | ✅ |
