/**
 * Construção do McpServer — chamado pela factory do createMcpHandler a cada request
 * (modelo stateless do MCP SDK v2).
 *
 * As registrations de tools/resources/prompts são reutilizadas VERBATIM do pacote
 * npm via `registerAll` (../../dist/register.js), então o transporte HTTP e o STDIO
 * expõem exatamente a mesma superfície. Antes da fundação da fase bcb isso não era
 * verdade: o worker reimplementava o JSON-RPC à mão e mantinha sua própria cópia
 * dos schemas, que havia derivado do canal stdio (ver baselines/README.md).
 *
 * A instrumentação de uso (Durable Object UsageTracker) entra pelo hook `record` do
 * próprio `registerAll` — nomes e contagens apenas, nunca argumentos ou resultados.
 *
 * Requer o pacote pai compilado (`npm run build` na raiz do repo).
 */

import { McpServer } from "@modelcontextprotocol/server";

import { registerAll } from "../../dist/register.js";
import { setServerVersion, WORKER_CONFIG } from "../../dist/tools.js";
import { SERVER_CONFIG } from "./config.js";
import type { RecordUsage } from "./usage-core.js";

// User-Agent enviado à API do BCB — mesma fonte de versão do handshake.
setServerVersion(SERVER_CONFIG.version);

/** Builds a fresh MCP server with the shared tool/resource/prompt surface. */
export function buildServer(record: RecordUsage = () => {}): McpServer {
  const server = new McpServer({
    name: SERVER_CONFIG.name,
    version: SERVER_CONFIG.version,
    websiteUrl: SERVER_CONFIG.websiteUrl
  });
  // WORKER_CONFIG aperta timeout/retries em relação ao stdio: o Worker tem
  // orçamento de CPU/wall-clock próprio da Cloudflare.
  registerAll(server, { config: WORKER_CONFIG, record: (kind, name) => record(kind, name) });
  return server;
}
