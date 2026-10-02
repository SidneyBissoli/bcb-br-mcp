/**
 * Impressão digital da superfície: o que um cliente vê deste servidor, reduzido
 * a um objeto normalizado e a um sha256.
 *
 * Por que existe. A versão do `package.json` é a ÚNICA coisa que a cópia do MCP
 * Registry carrega (medido em 30/09/2026 nas 26 versões publicadas: só `name`,
 * `version`, `packages`, `remotes`), então quem compara registro com servidor
 * só pode comparar versão — e isso só vale se TODA mudança de superfície subir
 * a versão. Até aqui isso era disciplina da receita de release; nenhum teste o
 * exigia, e as `instructions` do `initialize` não eram lidas por teste nenhum.
 * O leitor que levantou o problema (dev.to, comentários 3g5m4 e 3g607) achou o
 * caso grave no servidor dele: registro dizendo 0.1.0 com 4 tools só-leitura,
 * servidor com 6, duas escrevendo pelo usuário.
 *
 * O contrato fica em `surface.lock.json`, na raiz, e tem duas seções:
 *  - `declarada`: `initialize` (instructions, capabilities, serverInfo SEM a
 *    versão) + `tools/list` + `resources/list` + `resources/templates/list` +
 *    `prompts/list`. Capturada aqui, em memória (`src/surface-lock.test.ts`).
 *  - `semToken`: quais métodos respondem sem credencial — comportamento que
 *    nenhuma listagem mostra. Só a borda HTTP do Worker sabe medir, então é
 *    `worker/tests/surface-lock.test.ts` quem a grava.
 * Cada seção guarda a versão em que foi travada; mudou e a versão do
 * `package.json` é a mesma = build vermelho, e o deploy não roda (ele roda os
 * testes antes do wrangler). Ver `scripts/surface-lock.mjs`.
 *
 * A normalização é a mesma dos três caminhos — em memória, HTTP e stdio de uma
 * versão antiga (replay) — porque os três passam por `normalizarSuperficie`.
 */

import { createHash } from "node:crypto";

import { InMemoryTransport, type McpServer } from "@modelcontextprotocol/server";

/** O protocolo pedido no `initialize` de toda captura — fixo, para o eco não variar. */
export const PROTOCOLO_DA_CAPTURA = "2025-06-18";

/** Resultados crus, como saem do JSON-RPC. Lista ausente = método não servido. */
export interface SuperficieBruta {
  initialize: Record<string, unknown> | undefined;
  tools: unknown[] | undefined;
  resources: unknown[] | undefined;
  resourceTemplates: unknown[] | undefined;
  prompts: unknown[] | undefined;
}

function ordenarChaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarChaves);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.keys(valor)
        .sort()
        .map(k => [k, ordenarChaves((valor as Record<string, unknown>)[k])]),
    );
  }
  return valor;
}

function porChave(lista: unknown[] | undefined, chave: string): unknown[] | null {
  if (!lista) return null;
  return [...lista].sort((a, b) =>
    String((a as Record<string, unknown>)[chave]).localeCompare(String((b as Record<string, unknown>)[chave])),
  );
}

/**
 * Forma canônica da superfície. A versão do servidor sai — ela muda a cada
 * release e é justamente o que se compara contra a superfície. O resto do
 * `serverInfo` (nome, título, site, ícones) fica: é declaração de identidade.
 * Arrays internos (`required`, `enum`) mantêm a ordem: ela é parte do que se
 * publica.
 */
export function normalizarSuperficie(bruta: SuperficieBruta): Record<string, unknown> {
  const init = bruta.initialize ?? {};
  const { version: _versao, ...serverInfo } = (init.serverInfo ?? {}) as Record<string, unknown>;
  return ordenarChaves({
    initialize: {
      protocolVersion: init.protocolVersion ?? null,
      capabilities: init.capabilities ?? null,
      instructions: init.instructions ?? null,
      serverInfo,
    },
    tools: porChave(bruta.tools, "name"),
    resources: porChave(bruta.resources, "uri"),
    resourceTemplates: porChave(bruta.resourceTemplates, "uriTemplate"),
    prompts: porChave(bruta.prompts, "name"),
  }) as Record<string, unknown>;
}

/** sha256 do JSON canônico (chaves ordenadas) — a impressão digital. */
export function impressaoDigital(valor: unknown): string {
  return createHash("sha256").update(JSON.stringify(ordenarChaves(valor))).digest("hex");
}

/**
 * Captura a superfície de um servidor em memória, por JSON-RPC cru — o mesmo
 * caminho de `worker/src/card.ts`. Método que o servidor não serve vira `null`
 * na forma canônica (não lista vazia): "não serve" e "serve nada" são
 * superfícies diferentes.
 */
export async function capturarSuperficie(server: McpServer): Promise<Record<string, unknown>> {
  const [cliente, lado] = InMemoryTransport.createLinkedPair();
  await server.connect(lado);

  const pendentes = new Map<number, (msg: { result?: unknown; error?: unknown }) => void>();
  cliente.onmessage = (msg: unknown) => {
    const m = msg as { id?: unknown };
    if (typeof m.id === "number" && pendentes.has(m.id)) {
      pendentes.get(m.id)!(msg as { result?: unknown; error?: unknown });
      pendentes.delete(m.id);
    }
  };
  await cliente.start();

  let proximo = 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pedir = (method: string, params?: unknown): Promise<any> =>
    new Promise(resolve => {
      const id = proximo++;
      pendentes.set(id, msg => resolve(msg.error ? undefined : msg.result));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void cliente.send({ jsonrpc: "2.0", id, method, params } as any);
    });

  const initialize = await pedir("initialize", {
    protocolVersion: PROTOCOLO_DA_CAPTURA,
    capabilities: {},
    clientInfo: { name: "surface-lock", version: "1.0.0" },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void cliente.send({ jsonrpc: "2.0", method: "notifications/initialized" } as any);

  const bruta: SuperficieBruta = {
    initialize,
    tools: (await pedir("tools/list"))?.tools,
    resources: (await pedir("resources/list"))?.resources,
    resourceTemplates: (await pedir("resources/templates/list"))?.resourceTemplates,
    prompts: (await pedir("prompts/list"))?.prompts,
  };
  await cliente.close();
  return normalizarSuperficie(bruta);
}

/**
 * As requisições da sonda `semToken`: cada método que um cliente sem credencial
 * pode tentar. "Responde" = HTTP 200 com `result` no corpo. `tools/call` vai na
 * tool que serve o catálogo curado — não toca a rede da origem, então a sonda
 * mede a borda, não o humor do BCB.
 */
export const SONDA_SEM_TOKEN: ReadonlyArray<{ method: string; params?: Record<string, unknown> }> = [
  {
    method: "initialize",
    params: {
      protocolVersion: PROTOCOLO_DA_CAPTURA,
      capabilities: {},
      clientInfo: { name: "surface-lock", version: "1.0.0" },
    },
  },
  { method: "ping" },
  { method: "tools/list" },
  { method: "resources/list" },
  { method: "resources/templates/list" },
  { method: "prompts/list" },
  { method: "tools/call", params: { name: "bcb_series_populares", arguments: {} } },
];

/** Lê o corpo de uma resposta MCP por HTTP (JSON puro ou SSE com uma mensagem). */
export function lerCorpoJsonRpc(texto: string): { result?: unknown; error?: unknown } | undefined {
  const t = texto.trim();
  try {
    if (t.startsWith("{")) return JSON.parse(t);
    const dados = t
      .split("\n")
      .filter(l => l.startsWith("data:"))
      .pop();
    return dados ? JSON.parse(dados.slice(5).trim()) : undefined;
  } catch {
    return undefined;
  }
}
