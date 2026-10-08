/**
 * A superfície DECLARADA contra o `surface.lock.json` (@sbissoli/mcp-surface):
 * mudou sem subir a versão = vermelho, e o deploy não roda. A outra metade,
 * quem responde sem token, é medida na borda HTTP:
 * `worker/tests/surface-lock.test.ts`.
 *
 * O molde nasceu aqui (PR #49) e virou o pacote comum dos sete servidores; a
 * normalização é a mesma byte a byte, então a trava travada antes da migração
 * continua conferindo.
 *
 * Ao mudar a superfície: `npm version <nível> --no-git-tag-version` e
 * `npm run surface:lock`. A trava recusa regravar sob a versão antiga.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { capturarSuperficie, conferirMetaDoServerJson, conferirSecao, modoEscrita } from "@sbissoli/mcp-surface";
import { describe, expect, it } from "vitest";

import { createServer } from "./register.js";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const versao = (JSON.parse(readFileSync(`${raiz}package.json`, "utf8")) as { version: string }).version;

describe("surface.lock.json — superfície declarada", () => {
  it("bate com a trava, ou a versão subiu junto", async () => {
    const medido = (await capturarSuperficie(createServer(versao))) as {
      initialize: { instructions: unknown };
      tools: unknown[] | null;
    };
    // Sanidade antes de conferir — e, no modo de escrita, antes de gravar.
    expect(typeof medido.initialize.instructions, "captura quebrada: sem instructions").toBe("string");
    expect(medido.tools?.length, "captura quebrada: sem tools").toBeGreaterThan(0);
    const v = conferirSecao(`${raiz}surface.lock.json`, "declarada", medido, versao);
    expect(v.ok, v.mensagem).toBe(true);
  });

  it("a versão do servidor NÃO entra na impressão digital", async () => {
    expect(await capturarSuperficie(createServer("1.0.0"))).toEqual(await capturarSuperficie(createServer("9.9.9")));
  });

  // A impressão digital vai ao MCP Registry com a versão (_meta publisher-provided,
  // SPEC.md do pacote), para o CLIENTE conferir na primeira conexão. Sem este teste,
  // `surface:lock` regravaria a trava e o server.json seguiria publicando o sha
  // antigo: o registro mentiria justamente sob a versão nova. A chamada é a mesma
  // tool sem rede que o deploy-worker.yml usa no `mcp-surface verificar`.
  // Fora do modo de escrita: no `surface:lock` este arquivo roda ANTES do
  // `mcp-surface registro`, que é quem grava o bloco a partir da trava nova.
  it.skipIf(modoEscrita())("o server.json publica a impressão digital da trava (o que o registro mostra ao cliente)", () => {
    const v = conferirMetaDoServerJson(`${raiz}server.json`, `${raiz}surface.lock.json`, {
      chamada: { name: "bcb_series_populares", arguments: {} },
    });
    expect(v.ok, v.mensagem).toBe(true);
  });
});
