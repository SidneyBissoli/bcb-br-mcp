/**
 * BCB BR MCP Server — Cloudflare Workers Entry Point
 * HTTP endpoint for MCP JSON-RPC protocol
 *
 * Routes:
 *   GET  /health  → health check
 *   POST /mcp     → MCP JSON-RPC handler (tools/list, tools/call)
 *   OPTIONS /*    → CORS preflight
 *
 * Author: Sidney Bissoli
 * License: MIT
 */

import {
  TOOL_DEFINITIONS,
  dispatchTool,
  WORKER_CONFIG
} from "./tools.js";

interface Env {
  BCB_BASE_URL?: string;
}

const MAX_BODY_SIZE = 256 * 1024; // 256 KB

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}

function jsonRpcError(id: unknown, code: number, message: string): Response {
  return jsonResponse({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message }
  });
}

async function handleMcp(request: Request): Promise<Response> {
  // Check body size
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
    return new Response("Request body too large", { status: 413, headers: CORS_HEADERS });
  }

  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_SIZE) {
      return new Response("Request body too large", { status: 413, headers: CORS_HEADERS });
    }
    body = JSON.parse(text);
  } catch {
    return jsonRpcError(null, -32700, "Parse error: invalid JSON");
  }

  if (body.jsonrpc !== "2.0") {
    return jsonRpcError(body.id, -32600, "Invalid Request: jsonrpc must be '2.0'");
  }

  if (!body.method) {
    return jsonRpcError(body.id, -32600, "Invalid Request: method is required");
  }

  const { method, params, id } = body;

  switch (method) {
    case "initialize": {
      return jsonResponse({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {}, prompts: {} },
          serverInfo: {
            name: "bcb-br-mcp",
            version: "1.1.0"
          }
        }
      });
    }

    case "notifications/initialized": {
      // Client acknowledgment — no response needed for notifications
      return jsonResponse({ jsonrpc: "2.0", id, result: {} });
    }

    case "tools/list": {
      return jsonResponse({
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOL_DEFINITIONS
        }
      });
    }

    case "prompts/list": {
      return jsonResponse({
        jsonrpc: "2.0",
        id,
        result: {
          prompts: [
            {
              name: "indicadores_atuais",
              description: "Consulta os principais indicadores econômicos do Brasil (Selic, IPCA, Dólar, IBC-Br)"
            },
            {
              name: "panorama_economico",
              description: "Gera um panorama completo da economia brasileira com os principais indicadores"
            },
            {
              name: "comparar_inflacao",
              description: "Compara os principais índices de inflação do Brasil (IPCA, IGP-M, INPC) nos últimos 12 meses"
            }
          ]
        }
      });
    }

    case "prompts/get": {
      const promptName = params?.name as string | undefined;
      const promptMessages: Record<string, { role: string; content: { type: string; text: string } }[]> = {
        indicadores_atuais: [{ role: "user", content: { type: "text", text: "Consulte os indicadores econômicos atuais do Brasil usando a ferramenta bcb_indicadores_atuais e apresente os resultados de forma clara e organizada." } }],
        panorama_economico: [{ role: "user", content: { type: "text", text: "Faça um panorama completo da economia brasileira. Use bcb_indicadores_atuais para obter Selic, IPCA, Dólar e IBC-Br. Depois use bcb_serie_ultimos para consultar os últimos 3 valores da taxa de desemprego (código 24369) e da dívida bruta (código 4513). Apresente tudo de forma organizada com análise breve." } }],
        comparar_inflacao: [{ role: "user", content: { type: "text", text: "Compare os principais índices de inflação do Brasil nos últimos 12 meses. Use bcb_serie_ultimos com quantidade 12 para IPCA (código 433), IGP-M (código 189) e INPC (código 188). Apresente uma tabela comparativa e análise das tendências." } }]
      };

      if (!promptName || !promptMessages[promptName]) {
        return jsonRpcError(id, -32602, `Prompt not found: ${promptName}`);
      }

      return jsonResponse({
        jsonrpc: "2.0",
        id,
        result: {
          messages: promptMessages[promptName]
        }
      });
    }

    case "tools/call": {
      const toolName = params?.name as string | undefined;
      const toolArgs = (params?.arguments || {}) as Record<string, unknown>;

      if (!toolName) {
        return jsonRpcError(id, -32602, "Invalid params: 'name' is required for tools/call");
      }

      const toolDef = TOOL_DEFINITIONS.find(t => t.name === toolName);
      if (!toolDef) {
        return jsonRpcError(id, -32602, `Tool not found: ${toolName}`);
      }

      const result = await dispatchTool(
        toolName,
        toolArgs,
        WORKER_CONFIG.TIMEOUT_MS,
        WORKER_CONFIG.MAX_RETRIES
      );

      return jsonResponse({
        jsonrpc: "2.0",
        id,
        result
      });
    }

    default: {
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  }
}

export default {
  async fetch(request: Request, _env: Env, _ctx: unknown): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health check
    if (pathname === "/health" && method === "GET") {
      return jsonResponse({
        status: "ok",
        service: "bcb-br-mcp",
        version: "1.1.0",
        timestamp: new Date().toISOString()
      });
    }

    // MCP JSON-RPC endpoint (root)
    if (pathname === "/" && method === "POST") {
      return handleMcp(request);
    }

    // 404 for everything else
    return jsonResponse(
      { error: "Not Found", endpoints: ["GET /health", "POST /"] },
      404
    );
  }
};
