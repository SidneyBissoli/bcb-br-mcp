/**
 * Sinal de regressão OFFLINE do eval de seleção de tool.
 *
 * Roda dentro do `npm test`: sem rede, sem modelo, sem custo. Valida as
 * fixtures contra o catálogo VIVO (montado de `TOOL_DEFINITIONS`, que é a
 * superfície publicada), então renomear ou remover uma tool quebra aqui na hora
 * — em vez de aparecer só na rodada paga, meses depois.
 */

import { describe, it, expect } from "vitest";
import { validateFixtures } from "@sbissoli/mcp-evals";
import { DEEP_RESEARCH_TOOLS } from "@sbissoli/mcp-search";
import { AREA_BY_TOOL, CATALOG } from "./catalog.js";
import { FIXTURES } from "./fixtures/queries.js";

describe("catálogo do eval (vivo, de TOOL_DEFINITIONS)", () => {
  it("captura exatamente as 17 tools publicadas (15 bcb_* + as 2 do contrato Deep Research)", () => {
    expect(CATALOG.tools).toHaveLength(17);
  });

  it("toda tool leva o prefixo bcb_ — exceto as duas que o contrato do ChatGPT nomeia", () => {
    // `search` e `fetch` são as ÚNICAS exceções admitidas: os nomes são fixados
    // pela OpenAI (contrato Deep Research). Allowlist explícita do pacote, não
    // um regex mais frouxo — uma terceira tool sem prefixo continua quebrando.
    const excecoes = new Set<string>(DEEP_RESEARCH_TOOLS);
    for (const tool of CATALOG.tools) {
      if (excecoes.has(tool.name)) continue;
      expect(tool.name).toMatch(/^bcb_/);
    }
    for (const nome of DEEP_RESEARCH_TOOLS) {
      expect(CATALOG.toolNames, `${nome} ausente do catálogo`).toContain(nome);
    }
  });

  it("a partição de áreas cobre o catálogo, sem sobra nem falta", () => {
    // Se uma tool nova entrar sem área, ela cairia em "sem-area" e o relatório
    // por cluster passaria a mentir sem avisar.
    expect(Object.keys(AREA_BY_TOOL).sort()).toEqual([...CATALOG.toolNames].sort());
    expect(CATALOG.tools.every(t => t.area !== "sem-area")).toBe(true);
  });

  it("toda tool tem descrição substantiva — é o único sinal de seleção do modelo", () => {
    for (const tool of CATALOG.tools) {
      expect(tool.description.length).toBeGreaterThan(80);
    }
  });

  it("o inputSchema do catálogo é o MESMO objeto que a superfície publica", () => {
    // O bcb serve JSON Schema verbatim; o eval tem de medir esse schema, não um
    // reconstruído. Um `type: object` com propriedades é o mínimo verificável.
    for (const tool of CATALOG.tools) {
      expect((tool.inputSchema as { type?: string }).type).toBe("object");
    }
  });
});

describe("fixtures (as duas perguntas que a fase mandou medir)", () => {
  it("são válidas contra o catálogo vivo", () => {
    expect(validateFixtures(FIXTURES, CATALOG, { minFixtures: 35, maxFixtures: 60, minAreas: 5 })).toEqual([]);
  });

  it("todo id carrega a etiqueta do cluster", () => {
    for (const f of FIXTURES) {
      expect(f.id).toMatch(/^(serie|desc|stat|focus|cambio|sobrep|ctrl|dr)-\d{2}$/);
    }
  });

  it("os oito clusters são exercitados", () => {
    const clusters = new Set(FIXTURES.map(f => f.id.split("-")[0]));
    expect([...clusters].sort()).toEqual(["cambio", "ctrl", "desc", "dr", "focus", "serie", "sobrep", "stat"]);
  });

  it("a sobreposição SGS × Focus/PTAX (arbitragem 3) tem cobertura própria", () => {
    // Sem estas fixtures a rodada paga não teria como responder a pergunta que
    // o decisor deixou explicitamente em aberto ao aprovar a convivência.
    const sobrep = FIXTURES.filter(f => f.id.startsWith("sobrep-"));
    expect(sobrep.length).toBeGreaterThanOrEqual(5);
    // A maioria admite duas tools defensáveis; as que admitem UMA são o caso em
    // que a sobreposição NÃO se aplica, e errar ali é erro de verdade.
    expect(sobrep.some(f => f.expectedTools.length === 2)).toBe(true);
    expect(sobrep.some(f => f.expectedTools.length === 1)).toBe(true);
  });

  it("a fronteira comparar × correlacao é exercitada nos dois sentidos", () => {
    const alvos = FIXTURES.flatMap(f => f.expectedTools);
    expect(alvos.filter(t => t === "bcb_comparar").length).toBeGreaterThanOrEqual(3);
    expect(alvos.filter(t => t === "bcb_correlacao").length).toBeGreaterThanOrEqual(3);
  });

  it("toda tool publicada aparece como resposta esperada de alguma fixture", () => {
    // Tool que nenhuma consulta alcança é tool que o eval não mede.
    const alvos = new Set(FIXTURES.flatMap(f => f.expectedTools));
    expect([...CATALOG.toolNames].filter(n => !alvos.has(n))).toEqual([]);
  });
});
