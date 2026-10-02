/**
 * A superfície DECLARADA contra o `surface.lock.json`. Ver `src/surface.ts` e
 * `src/surface-lock.ts`. A outra metade, quem responde sem token, é medida na
 * borda HTTP: `worker/tests/surface-lock.test.ts`.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createServer } from "./register.js";
import { capturarSuperficie } from "./surface.js";
import { conferirSecao } from "./surface-lock.js";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const versao = (JSON.parse(readFileSync(`${raiz}package.json`, "utf8")) as { version: string }).version;

describe("surface.lock.json — superfície declarada", () => {
  it("bate com a trava, ou a versão subiu junto", async () => {
    const medido = await capturarSuperficie(createServer(versao));
    const v = conferirSecao(
      `${raiz}surface.lock.json`,
      "declarada",
      medido,
      versao,
      process.env.SURFACE_LOCK_ESCREVER === "1",
    );
    expect(v.ok, v.mensagem).toBe(true);
  });

  it("a captura lê o que nenhum teste lia: instructions e capabilities", async () => {
    const medido = (await capturarSuperficie(createServer(versao))) as {
      initialize: { instructions: unknown; capabilities: Record<string, unknown> };
      tools: unknown[];
    };
    expect(typeof medido.initialize.instructions).toBe("string");
    expect(Object.keys(medido.initialize.capabilities)).toEqual(expect.arrayContaining(["tools", "resources", "prompts"]));
    expect(medido.tools.length).toBeGreaterThan(0);
  });

  it("a versão do servidor NÃO entra na impressão digital", async () => {
    const a = await capturarSuperficie(createServer("1.0.0"));
    const b = await capturarSuperficie(createServer("9.9.9"));
    expect(a).toEqual(b);
  });
});

describe("a regra da trava", () => {
  const trava = () => join(mkdtempSync(join(tmpdir(), "surface-lock-")), "surface.lock.json");

  it("superfície nova sob a MESMA versão: falha, inclusive no modo de escrita", () => {
    const f = trava();
    expect(conferirSecao(f, "declarada", { tools: ["a"] }, "1.0.0", true).ok).toBe(true);
    for (const escrever of [false, true]) {
      const v = conferirSecao(f, "declarada", { tools: ["a", "b"] }, "1.0.0", escrever);
      expect(v.ok).toBe(false);
      expect(v.mensagem).toContain("MUDOU e a versão continua 1.0.0");
    }
    expect(conferirSecao(f, "declarada", { tools: ["a"] }, "1.0.0", false).ok).toBe(true);
  });

  it("superfície nova com versão nova: falha até regravar, e regravada passa", () => {
    const f = trava();
    conferirSecao(f, "declarada", { tools: ["a"] }, "1.0.0", true);
    expect(conferirSecao(f, "declarada", { tools: ["a", "b"] }, "1.1.0", false).mensagem).toContain("npm run surface:lock");
    expect(conferirSecao(f, "declarada", { tools: ["a", "b"] }, "1.1.0", true).ok).toBe(true);
    expect(conferirSecao(f, "declarada", { tools: ["a", "b"] }, "1.1.0", false).ok).toBe(true);
  });

  it("versão nova sem mudança de superfície não exige nada", () => {
    const f = trava();
    conferirSecao(f, "declarada", { tools: ["a"] }, "1.0.0", true);
    expect(conferirSecao(f, "declarada", { tools: ["a"] }, "2.0.0", false).ok).toBe(true);
  });

  it("as duas seções convivem sem uma apagar a outra", () => {
    const f = trava();
    conferirSecao(f, "declarada", { tools: ["a"] }, "1.0.0", true);
    conferirSecao(f, "semToken", { ping: true }, "1.0.0", true);
    const gravado = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
    expect(Object.keys(gravado)).toEqual(["$comentario", "declarada", "semToken"]);
  });

  it("edição à mão do conteúdo é recusada", () => {
    const f = trava();
    conferirSecao(f, "declarada", { tools: ["a"] }, "1.0.0", true);
    const gravado = JSON.parse(readFileSync(f, "utf8")) as { declarada: { conteudo: unknown } };
    gravado.declarada.conteudo = { tools: ["a", "b"] };
    writeFileSync(f, JSON.stringify(gravado));
    const v = conferirSecao(f, "declarada", { tools: ["a", "b"] }, "1.0.0", true);
    expect(v.ok).toBe(false);
    expect(v.mensagem).toContain("editada à mão");
  });
});
