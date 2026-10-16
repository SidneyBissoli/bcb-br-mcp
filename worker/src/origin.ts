/**
 * Quais Origins a rota pública `/mcp` aceita — a defesa contra DNS rebinding.
 *
 * Só cliente de NAVEGADOR manda `Origin`; cliente MCP comum não manda nenhum e
 * segue aceito. Sem `allowedOriginHostnames`, o `createMcpHandler` do `agents`
 * aceita só localhost (e o próprio host em *.workers.dev): uma página em
 * https://sidneybissoli.com recebia 403 no preflight e no POST (medido em
 * 16/10/2026).
 *
 * Abre UMA origem a mais: o site do autor, que registra ferramentas WebMCP
 * para agentes que rodam no navegador do visitante e chama este servidor por
 * JSON-RPC direto (decisão de 16/10/2026 — o bcb é a demonstração; os outros
 * seis servidores só se houver uso medido). Molde: `src/origin.ts` do
 * ilo-mcp-server.
 *
 * A rota privada do dono (`/mcp/uso-proprio`) NÃO entra: ela fica exatamente
 * como antes (defaults do handler), para uma página — qualquer página, mesmo a
 * do site — nunca falar com ela de dentro do navegador.
 */

import { SERVER_CONFIG } from "./config.js";

/** Hostnames das páginas que podem chamar a rota pública pelo navegador. */
export const SITE_HOSTNAMES = ["sidneybissoli.com"] as const;

/**
 * Lista para o `allowedOriginHostnames` do handler, por rota. `undefined` =
 * os defaults do handler, que é o comportamento de antes desta mudança.
 */
export function origensAceitas(rota: string): string[] | undefined {
  if (rota !== SERVER_CONFIG.mcpRoute) return undefined;
  // Os hostnames do próprio servidor entram porque a lista SUBSTITUI os
  // defaults do handler — sem eles, localhost (wrangler dev) deixaria de valer.
  return [...SERVER_CONFIG.extraAllowedHostnames, ...SITE_HOSTNAMES];
}
