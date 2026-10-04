/**
 * O server card (`/.well-known/mcp/server-card.json`) não pode divergir do que
 * o `/mcp` serve nem do que a trava guarda.
 *
 * POR QUE ESTE ARQUIVO EXISTE. Até 04/10/2026 o card era montado por um
 * `worker/src/card.ts` copiado entre os servidores, com `name`/`version` soltos
 * na raiz — fora da forma documentada pela Smithery, que exige
 * `serverInfo: { name, version }`. Um card errado não quebra nada: o scanner o
 * aceita, grava o que leu e só o relê na próxima varredura. Agora o card sai do
 * gerador comum (`@sbissoli/mcp-surface/card`), e este teste prova a volta: o
 * card normalizado tem o MESMO sha256 da seção `declarada` do
 * `surface.lock.json`. Nada aqui pina literal — versão, sha e autenticação vêm
 * do `package.json` e da trava ([[verificacao-deriva-da-fonte]]).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { impressaoDigital, normalizarSuperficie } from "@sbissoli/mcp-surface";
import { superficieDoCard } from "@sbissoli/mcp-surface/card";
import { beforeAll, describe, expect, it } from "vitest";

import worker from "../src/index.js";
import type { Env } from "../src/types.js";

// `.href`: o URL das workers-types não é o do node:url para o compilador.
const raiz = fileURLToPath(new URL("../../", import.meta.url).href);
const versao = (JSON.parse(readFileSync(`${raiz}package.json`, "utf8")) as { version: string }).version;
const trava = JSON.parse(readFileSync(`${raiz}surface.lock.json`, "utf8")) as {
  declarada?: { sha256?: string };
  semToken?: { conteudo?: Record<string, Record<string, Record<string, boolean>>> };
};

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

describe("GET /.well-known/mcp/server-card.json", () => {
  let res: Response;
  let card: Record<string, unknown>;

  beforeAll(async () => {
    res = await worker.fetch(
      new Request("https://bcb.sidneybissoli.com/.well-known/mcp/server-card.json"),
      {} as Env,
      ctx,
    );
    card = (await res.clone().json()) as Record<string, unknown>;
  });

  it("responde 200 em JSON, com serverInfo na forma da Smithery e a versão do package.json", () => {
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const serverInfo = card["serverInfo"] as { name?: unknown; version?: unknown };
    expect(typeof serverInfo.name).toBe("string");
    expect(serverInfo.name).not.toBe("");
    expect(serverInfo.version).toBe(versao);
  });

  it("normalizado, tem o mesmo sha256 da seção `declarada` do surface.lock.json", () => {
    expect(trava.declarada?.sha256, "trava sem declarada.sha256").toBeTypeOf("string");
    expect(impressaoDigital(normalizarSuperficie(superficieDoCard(card)))).toBe(trava.declarada!.sha256);
  });

  it("declara `authentication` medido pela trava: acesso aberto em produção", () => {
    const toolsListSemToken = trava.semToken?.conteudo?.["apiKeyAusente"]?.["POST /mcp"]?.["tools/list"];
    expect(toolsListSemToken, "trava sem a medição de tools/list sem token").toBeTypeOf("boolean");
    const authentication = card["authentication"] as { required?: unknown };
    expect(authentication.required).toBe(!toolsListSemToken);
    // Hoje a produção roda sem API_KEY: o card não pode anunciar credencial.
    expect(authentication.required).toBe(false);
  });
});
