/**
 * Registry <-> wire fidelity, driven through the real SDK v2 server over an
 * in-memory transport.
 *
 * What this pins:
 *  - the advertised schemas are the canonical JSON objects VERBATIM (the SDK
 *    must not re-derive them);
 *  - `tools/list`, `resources/list` and `prompts/list` are served identically
 *    by whatever transport wraps `createServer` — this is the property the
 *    duplication between index.ts and worker.ts used to break;
 *  - the SDK v2 hard rule: a tool declaring `outputSchema` returns
 *    `structuredContent` on every non-error result;
 *  - handler-level (Zod-era) pedagogical errors still surface as `isError`
 *    results, not protocol errors — the permissive validator is doing its job.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/client";

import { createServer } from "./register.js";
import { TOOL_DEFINITIONS, RESOURCE_DEFINITIONS, PROMPT_DEFINITIONS, SERIES_POPULARES } from "./tools.js";

const VERSION = "test";

async function connectedClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(VERSION);
  const client = new Client({ name: "register-test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tools/list", () => {
  it("publica todas as tools do registro com nome, descrição, título e annotations", async () => {
    const { client } = await connectedClient();
    const { tools } = await client.listTools();

    expect(tools.map(t => t.name).sort()).toEqual(TOOL_DEFINITIONS.map(t => t.name).sort());

    for (const definition of TOOL_DEFINITIONS) {
      const advertised = tools.find(t => t.name === definition.name);
      expect(advertised).toBeDefined();
      expect(advertised!.description).toBe(definition.description);
      expect(advertised!.annotations).toEqual(definition.annotations);
      // O título de exibição é promovido da annotation — se alguém escrever um
      // segundo literal aqui, os dois passam a poder divergir.
      expect(advertised!.title).toBe(definition.annotations.title);
    }
  });

  it("os JSON Schemas anunciados são os objetos canônicos VERBATIM", async () => {
    const { client } = await connectedClient();
    const { tools } = await client.listTools();

    for (const definition of TOOL_DEFINITIONS) {
      const advertised = tools.find(t => t.name === definition.name)!;
      expect(advertised.inputSchema).toEqual(definition.inputSchema);
      expect(advertised.outputSchema).toEqual(definition.outputSchema);
    }
  });

  it("todo input é selado e toda tool é read-only", async () => {
    const { client } = await connectedClient();
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect((tool.inputSchema as Record<string, unknown>).additionalProperties).toBe(false);
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.annotations?.title).toBeTruthy();
      expect(tool.name.startsWith("bcb_")).toBe(true);
      expect(tool.name.length).toBeLessThanOrEqual(64);
    }
  });
});

describe("resources/list e prompts/list", () => {
  it("publica os 3 resources sob os identificadores canônicos, com rótulo próprio", async () => {
    const { client } = await connectedClient();
    const { resources } = await client.listResources();

    expect(resources.map(r => r.uri).sort()).toEqual(RESOURCE_DEFINITIONS.map(r => r.uri).sort());
    // O nome é identificador, não rótulo — o worker antigo publicava
    // "Séries Populares BCB" aqui, divergindo do canal stdio. O rótulo humano
    // tem campo próprio (`title`), que é o que o mcpscore exige e o cliente
    // mostra: os dois convivem sem um ocupar o lugar do outro.
    expect(resources.map(r => r.name).sort()).toEqual(["categorias", "codigos_principais", "series_populares"]);
    for (const definition of RESOURCE_DEFINITIONS) {
      const advertised = resources.find(r => r.uri === definition.uri)!;
      expect(advertised.title).toBe(definition.title);
      expect(advertised.title).toBeTruthy();
    }
  });

  it("resources/read devolve o conteúdo do catálogo", async () => {
    const { client } = await connectedClient();
    const result = await client.readResource({ uri: "bcb://series/populares" });

    expect(result.contents).toHaveLength(1);
    const content = result.contents[0] as { mimeType?: string; text?: string };
    expect(content.mimeType).toBe("application/json");
    expect(JSON.parse(content.text!)).toEqual(SERIES_POPULARES);
  });

  it("publica os 3 prompts e devolve a mensagem de usuário", async () => {
    const { client } = await connectedClient();
    const { prompts } = await client.listPrompts();

    expect(prompts.map(p => p.name).sort()).toEqual(PROMPT_DEFINITIONS.map(p => p.name).sort());
    for (const definition of PROMPT_DEFINITIONS) {
      const advertised = prompts.find(p => p.name === definition.name)!;
      expect(advertised.title).toBe(definition.title);
      expect(advertised.title).toBeTruthy();
    }

    const got = await client.getPrompt({ name: "comparar_inflacao" });
    expect(got.messages[0].role).toBe("user");
    expect((got.messages[0].content as { text?: string }).text).toContain("bcb_serie_ultimos");
  });
});

describe("tools/call", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        { data: "01/01/2020", valor: "100" },
        { data: "01/02/2020", valor: "110" }
      ]
    })) as unknown as typeof fetch;
  });

  it("resposta de sucesso traz structuredContent (regra dura do SDK v2) e o espelho em texto", async () => {
    const { client } = await connectedClient();
    const result = await client.callTool({ name: "bcb_serie_valores", arguments: { codigo: 433 } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
    const text = (result.content as Array<{ type: string; text: string }>)[0];
    expect(text.type).toBe("text");
    expect(JSON.parse(text.text)).toEqual(result.structuredContent);
  });

  // `bcb_buscar_serie` era o exemplo aqui até a sessão de D3, quando passou a
  // consultar o índice do portal; `bcb_series_populares` é a tool que segue
  // 100% local, e é ela que guarda a garantia.
  it("tool sem rede não dispara fetch", async () => {
    const { client } = await connectedClient();
    const result = await client.callTool({ name: "bcb_series_populares", arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("falha do upstream vira isError com texto, não erro de protocolo", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({})
    })) as unknown as typeof fetch;

    const { client } = await connectedClient();
    const result = await client.callTool({ name: "bcb_serie_valores", arguments: { codigo: 1 } });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain("Série não encontrada");
  });

  it("argumento obrigatório ausente é barrado ANTES de chamar a API do BCB", async () => {
    const { client } = await connectedClient();

    // Regressão fechada nesta fundação: o worker artesanal aceitava `{}` e
    // saía consultando "série undefined" no BCB (verificado em produção).
    // O SDK devolve o erro como RESULTADO (isError), não como exceção de
    // protocolo — o cliente vê uma explicação, não uma falha de transporte.
    const result = await client.callTool({ name: "bcb_serie_valores", arguments: {} });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toMatch(/codigo/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("propriedade desconhecida é barrada (input selado)", async () => {
    const { client } = await connectedClient();

    const result = await client.callTool({
      name: "bcb_serie_valores",
      arguments: { codigo: 433, invalido: true }
    });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toMatch(/additional propert/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("todas as tools do registro são realmente chamáveis pelo nome anunciado", async () => {
    const { client } = await connectedClient();
    const { tools } = await client.listTools();

    for (const tool of tools) {
      const result = await client.callTool({
        name: tool.name,
        arguments: argsFor(tool.name)
      });
      // Basta não estourar no protocolo: sucesso ou isError, ambos são
      // respostas válidas — o que não pode é a tool não existir.
      expect(result).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    }
  });
});

/** Argumentos mínimos válidos por tool, para o teste de chamabilidade. */
function argsFor(name: string): Record<string, unknown> {
  switch (name) {
    case "bcb_serie_valores":
    case "bcb_serie_metadados":
    case "bcb_variacao":
      return { codigo: 433 };
    case "bcb_serie_ultimos":
      return { codigo: 433, quantidade: 2 };
    case "bcb_series_populares":
      return {};
    case "bcb_buscar_serie":
      return { termo: "selic" };
    case "bcb_indicadores_atuais":
      return {};
    case "bcb_comparar":
      return { codigos: [433, 189], dataInicial: "2020-01-01", dataFinal: "2020-02-28" };
    default:
      return {};
  }
}
