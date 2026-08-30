import { describe, expect, it, vi, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { SERVER_IDENTITY, SERVER_INSTRUCTIONS } from "../../dist/identity.js";
import { buildServer } from "../src/server.js";
import type { UsageKind } from "../src/usage-core.js";

/**
 * Superfície e instrumentação do Worker: o buildServer reutiliza o registerAll
 * do pacote pai (dist/), então aqui só se verifica que a superfície chega inteira
 * e que o hook de uso conta tool_call/tool_error. Sem rede: fetch mockado.
 */

function recorder() {
  const events: Array<{ kind: UsageKind; name?: string | undefined }> = [];
  return { events, record: (kind: UsageKind, name?: string) => events.push({ kind, name }) };
}

async function connect(server: McpServer) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "worker-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildServer (worker)", () => {
  // 8 tools do SGS + 3 do Focus + 2 de câmbio, acrescentadas na sessão de D3.
  it("expõe a superfície completa do pacote pai (15 tools, 3 resources, 3 prompts)", async () => {
    const client = await connect(buildServer());
    const { tools } = await client.listTools();
    const { resources } = await client.listResources();
    const { prompts } = await client.listPrompts();
    expect(tools).toHaveLength(15);
    expect(resources).toHaveLength(3);
    expect(prompts).toHaveLength(3);
    await client.close();
  });

  it("o handshake do Worker é o MESMO do stdio — identidade vem do pacote", async () => {
    // O Worker montava seu próprio McpServer e por isso anunciava um
    // `websiteUrl` (o repositório) diferente do que o server.json publicava
    // (a landing), e nem título nem ícones. Delegar ao `createServer` do pacote
    // é o que faz os dois transportes serem medidos como a mesma coisa.
    const client = await connect(buildServer());
    const info = client.getServerVersion() as {
      name: string;
      title?: string;
      websiteUrl?: string;
      icons?: unknown[];
    };
    expect(info.name).toBe(SERVER_IDENTITY.name);
    expect(info.title).toBe(SERVER_IDENTITY.title);
    expect(info.websiteUrl).toBe(SERVER_IDENTITY.websiteUrl);
    expect(info.icons).toEqual(SERVER_IDENTITY.icons);
    expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
    await client.close();
  });

  it("publica os mesmos identificadores de resource do canal stdio", async () => {
    // O worker artesanal publicava rótulos ("Séries Populares BCB") onde o stdio
    // publicava identificadores. Compartilhar o registro elimina a divergência.
    const client = await connect(buildServer());
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.name).sort()).toEqual([
      "categorias",
      "codigos_principais",
      "series_populares",
    ]);
    await client.close();
  });

  it("registra tool_call em chamada bem-sucedida", async () => {
    const { events, record } = recorder();
    // O comentário anterior aqui dizia que a tool era "servida do catálogo
    // local" e não tocava a rede. Não era verdade: `bcb_buscar_serie` mistura o
    // catálogo curado com o índice do portal de dados abertos, e sem dublê ela
    // busca https://dadosabertos.bcb.gov.br/api/3/action/package_list DE FATO.
    // Passa em segundos numa máquina com rede boa e estoura o timeout de 5s do
    // vitest quando o portal demora — `fetchBcbApi` tem 30s de timeout e 3
    // tentativas, então o pior caso é ~90s. Foi o que derrubou o CI no run
    // 33137210221 (28/08/2026), a única falha em doze execuções: teste que
    // depende de API de terceiro é teste que falha sozinho, e no dia do
    // release.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          result: ["11-selic", "433-ipca", "432-meta-selic"],
        }),
      ),
    );
    const client = await connect(buildServer(record));
    await client.callTool({ name: "bcb_buscar_serie", arguments: { termo: "selic" } });
    expect(events).toContainEqual({ kind: "tool_call", name: "bcb_buscar_serie" });
    expect(events.filter((e) => e.kind === "tool_error")).toHaveLength(0);
    await client.close();
  });

  it("registra tool_error quando o upstream falha", async () => {
    const { events, record } = recorder();
    // 404: não-retryável (um 5xx acionaria o backoff exponencial do fetchBcbApi)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const client = await connect(buildServer(record));
    const result = await client.callTool({ name: "bcb_serie_valores", arguments: { codigo: 433 } });
    expect(result.isError).toBe(true);
    expect(events).toContainEqual({ kind: "tool_call", name: "bcb_serie_valores" });
    expect(events).toContainEqual({ kind: "tool_error", name: "bcb_serie_valores" });
    await client.close();
  });

  it("argumento inválido é barrado antes de chegar ao upstream", async () => {
    const fetchSpy = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const client = await connect(buildServer());
    const result = await client.callTool({ name: "bcb_serie_valores", arguments: {} });
    expect(result.isError).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    await client.close();
  });
});
