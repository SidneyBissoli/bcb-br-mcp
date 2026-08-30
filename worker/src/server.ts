/**
 * Construção do McpServer no Worker — chamado pela factory do createMcpHandler a
 * cada request (modelo stateless do MCP SDK v2).
 *
 * DELEGA AO PACOTE. Este módulo não monta mais um `McpServer` próprio: chama o
 * `createServer` de `../../dist/register.js`, o MESMO que o transporte stdio
 * usa. Enquanto havia dois construtores, havia duas identidades — o Worker
 * anunciava `websiteUrl` (apontando para o GitHub, não para a landing) e o stdio
 * não anunciava nada, e o `mcpscore` media a mesma implementação de dois jeitos.
 * Identidade, instruções e o anúncio de revisões em `server/discover` vêm agora
 * de um lugar só (src/identity.ts + src/register.ts).
 *
 * O que continua sendo do Worker: o orçamento de timeout/retries (WORKER_CONFIG,
 * mais apertado que o do stdio por causa do limite de CPU/wall-clock da
 * Cloudflare) e a instrumentação de uso (Durable Object UsageTracker), que entra
 * pelo hook `record` do próprio `registerAll` — nomes e contagens apenas, nunca
 * argumentos ou resultados.
 *
 * Requer o pacote pai compilado (`npm run build` na raiz do repo).
 */

import type { McpServer } from "@modelcontextprotocol/server";

import { createServer } from "../../dist/register.js";
import { setServerVersion, WORKER_CONFIG } from "../../dist/tools.js";
import { SERVER_CONFIG } from "./config.js";
import type { RecordUsage } from "./usage-core.js";

// User-Agent enviado à API do BCB — mesma fonte de versão do handshake.
setServerVersion(SERVER_CONFIG.version);

/** Builds a fresh MCP server with the shared tool/resource/prompt surface. */
export function buildServer(record: RecordUsage = () => {}): McpServer {
  return createServer(SERVER_CONFIG.version, {
    config: WORKER_CONFIG,
    record: (kind, name) => record(kind, name)
  });
}
