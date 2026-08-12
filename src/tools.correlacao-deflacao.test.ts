/**
 * Comportamento das duas tools da segunda metade do D2.
 *
 * `series.test.ts` prova o motor (alinhamento de grades, encadeamento do
 * deflator); aqui se prova o que CHEGA ao cliente: a RECUSA de correlacionar
 * grades diferentes (a decisão que a medição contra a origem justificou), a
 * diferença entre correlacionar nível e correlacionar movimento, e a comparação
 * nominal × real, que é o produto de `bcb_deflacionar`.
 *
 * Rede nunca é tocada: `global.fetch` é mockado por teste.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchTool, type ToolResult } from "./tools.js";

let fetchCalls: string[] = [];

function mockFetch(rotas: Array<[string, unknown]>): void {
  global.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    fetchCalls.push(url);
    const hit = rotas.find(([m]) => url.includes(m));
    if (!hit) throw new Error(`URL não roteada no mock: ${url}`);
    return { ok: true, status: 200, statusText: "OK", json: async () => hit[1] } as unknown as Response;
  }) as unknown as typeof fetch;
}

function call(tool: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return dispatchTool(tool, args, 5000, 1);
}

function structured(result: ToolResult): Record<string, unknown> {
  expect(result.isError, `tool devolveu erro: ${result.content?.[0]?.text}`).toBeUndefined();
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

/** Observações mensais no dia 1º, do jeito que o SGS as devolve. */
function mensal(valores: number[]): Array<{ data: string; valor: string }> {
  return valores.map((v, i) => ({
    data: `01/${String(i + 1).padStart(2, "0")}/2024`,
    valor: String(v)
  }));
}

/** Observações diárias em dias corridos, a partir de uma data ISO. */
function diarias(inicioIso: string, n: number): Array<{ data: string; valor: string }> {
  const t0 = Date.parse(`${inicioIso}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(t0 + i * 86400000);
    const dia = String(d.getUTCDate()).padStart(2, "0");
    const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
    return { data: `${dia}/${mes}/${d.getUTCFullYear()}`, valor: String(i + 1) };
  });
}

beforeEach(() => {
  fetchCalls = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==================== correlação ====================

describe("bcb_correlacao — o alinhamento é o produto, não só o coeficiente", () => {
  it("séries na mesma grade: coeficiente, n e interpretação em prosa", async () => {
    mockFetch([
      ["bcdata.sgs.433/dados", mensal([1, 2, 3, 4, 5, 6])],
      ["bcdata.sgs.189/dados", mensal([2, 4, 6, 8, 10, 12])]
    ]);

    const out = structured(await call("bcb_correlacao", {
      codigos: [433, 189], dataInicial: "2024-01-01", dataFinal: "2024-06-30"
    }));

    const par = (out.pares as Array<Record<string, unknown>>)[0];
    expect(par.coeficiente).toBe(1);
    expect(par.n).toBe(6);
    expect(par.descartados).toBe(0);
    expect(par.interpretacao).toContain("positiva forte");
    expect((out.alinhamento as Record<string, unknown>).completas).toBe(6);
    expect((out.derivacao as Record<string, unknown>).derived).toBe(true);
  });

  it("RECUSA periodicidades diferentes em vez de correlacionar as datas coincidentes", async () => {
    mockFetch([
      ["bcdata.sgs.1/dados", diarias("2024-01-02", 40)],
      ["bcdata.sgs.433/dados", mensal([1, 2, 3, 4])]
    ]);

    const r = await call("bcb_correlacao", {
      codigos: [1, 433], dataInicial: "2024-01-01", dataFinal: "2024-04-30"
    });

    expect(r.isError).toBe(true);
    const texto = r.content?.[0]?.text ?? "";
    expect(texto).toMatch(/periodicidades diferentes/i);
    // O erro precisa ENSINAR a saída, não apenas recusar.
    expect(texto).toContain("frequencia");
  });

  it("a grade vem da periodicidade MEDIDA, não do rótulo do catálogo", async () => {
    // A série 11 está catalogada como "Mensal" e a origem a publica todo dia útil
    // (verificado em 11/08/2026). Decidir pela etiqueta recusaria uma correlação
    // perfeitamente válida entre duas séries diárias.
    mockFetch([
      ["bcdata.sgs.11/dados", diarias("2024-01-02", 30)],
      ["bcdata.sgs.12/dados", diarias("2024-01-02", 30)]
    ]);

    const out = structured(await call("bcb_correlacao", {
      codigos: [11, 12], dataInicial: "2024-01-01", dataFinal: "2024-01-31"
    }));

    expect((out.alinhamento as Record<string, unknown>).grade).toBe("diária");
    expect((out.pares as Array<Record<string, number>>)[0].n).toBe(30);
  });

  it("com `frequencia`, a recusa some e a grade harmonizada é declarada", async () => {
    mockFetch([
      ["bcdata.sgs.1/dados", diarias("2024-01-02", 40)],
      ["bcdata.sgs.433/dados", mensal([1, 2, 3, 4])]
    ]);

    const out = structured(await call("bcb_correlacao", {
      codigos: [1, 433], dataInicial: "2024-01-01", dataFinal: "2024-04-30",
      frequencia: "mensal", agregacao: "media"
    }));

    expect((out.alinhamento as Record<string, unknown>).grade).toBe("mensal");
    expect(out.harmonizacao).toBeDefined();
  });

  it("`base: variacao` correlaciona movimento, não nível — e perde um ponto", async () => {
    // A armadilha da tendência, em miniatura: as duas séries sobem quase no mesmo
    // ritmo (correlação de NÍVEL ~0,99, que é só a tendência comum), mas os saltos
    // se alternam — quando uma acelera, a outra desacelera. Em variação, a
    // correlação vira NEGATIVA. É por isso que `base` existe.
    mockFetch([
      ["bcdata.sgs.433/dados", mensal([100, 112, 120, 132, 140, 152])],
      ["bcdata.sgs.189/dados", mensal([100, 108, 120, 128, 140, 148])]
    ]);

    const args = { codigos: [433, 189], dataInicial: "2024-01-01", dataFinal: "2024-06-30" };
    const nivel = structured(await call("bcb_correlacao", args));
    const variacao = structured(await call("bcb_correlacao", { ...args, base: "variacao" }));

    const rNivel = (nivel.pares as Array<Record<string, number>>)[0];
    const rVar = (variacao.pares as Array<Record<string, number>>)[0];

    expect(rNivel.coeficiente).toBeGreaterThan(0.99);
    expect(rVar.coeficiente).toBeLessThan(0);
    expect(rVar.n).toBe(rNivel.n - 1); // a primeira observação não tem variação
  });

  it("`spearman` enxerga relação monótona que Pearson não enxerga", async () => {
    mockFetch([
      ["bcdata.sgs.433/dados", mensal([1, 2, 3, 4, 5, 6])],
      ["bcdata.sgs.189/dados", mensal([1, 4, 9, 16, 25, 36])]
    ]);

    const args = { codigos: [433, 189], dataInicial: "2024-01-01", dataFinal: "2024-06-30" };
    const pearson = structured(await call("bcb_correlacao", args));
    const spearman = structured(await call("bcb_correlacao", { ...args, metodo: "spearman" }));

    expect((spearman.pares as Array<Record<string, number>>)[0].coeficiente).toBe(1);
    expect((pearson.pares as Array<Record<string, number>>)[0].coeficiente).toBeLessThan(1);
  });

  it("três séries produzem os três pares, e a que falhou vai para `erros`", async () => {
    mockFetch([
      ["bcdata.sgs.433/dados", mensal([1, 2, 3, 4])],
      ["bcdata.sgs.189/dados", mensal([4, 3, 2, 1])],
      ["bcdata.sgs.188/dados", mensal([1, 3, 2, 4])],
      ["bcdata.sgs.99999/dados", []]
    ]);

    const out = structured(await call("bcb_correlacao", {
      codigos: [433, 189, 188, 99999], dataInicial: "2024-01-01", dataFinal: "2024-04-30"
    }));

    expect(out.pares).toHaveLength(3);
    expect(out.erros).toHaveLength(1);
    expect((out.erros as Array<Record<string, unknown>>)[0].codigo).toBe(99999);
  });

  it("menos de duas séries com dados é erro, não coeficiente vazio", async () => {
    mockFetch([["bcdata.sgs", []]]);

    const r = await call("bcb_correlacao", {
      codigos: [433, 189], dataInicial: "2024-01-01", dataFinal: "2024-04-30"
    });

    expect(r.isError).toBe(true);
    expect(r.content?.[0]?.text).toMatch(/ao menos duas séries/i);
  });
});

// ==================== deflação ====================

describe("bcb_deflacionar — nominal ao lado de real", () => {
  /** 12 meses de 1%: o índice acumula 12,68% no ano. */
  const ipca1pct = mensal(Array.from({ length: 12 }, () => 1));

  it("entrega valorReal em reais do último mês do índice, com a base declarada", async () => {
    mockFetch([
      ["bcdata.sgs.1619/dados", [{ data: "01/01/2024", valor: "1000" }, { data: "01/12/2024", valor: "1100" }]],
      ["bcdata.sgs.433/dados", ipca1pct]
    ]);

    const out = structured(await call("bcb_deflacionar", {
      codigo: 1619, dataInicial: "2024-01-01", dataFinal: "2024-12-31"
    }));

    expect((out.base as Record<string, unknown>).mes).toBe("12/2024");
    const dados = out.dados as Array<Record<string, number>>;
    // Janeiro carrega as 11 variações posteriores: 1000 × 1,01^11 = 1115,6683.
    expect(dados[0].valorReal).toBeCloseTo(1115.6683, 3);
    expect(dados[1].valorReal).toBe(1100); // o mês base é ele mesmo
  });

  it("o produto da tool: alta nominal que vira QUEDA real", async () => {
    mockFetch([
      ["bcdata.sgs.1619/dados", [{ data: "01/01/2024", valor: "1000" }, { data: "01/12/2024", valor: "1100" }]],
      ["bcdata.sgs.433/dados", ipca1pct]
    ]);

    const out = structured(await call("bcb_deflacionar", {
      codigo: 1619, dataInicial: "2024-01-01", dataFinal: "2024-12-31"
    }));

    const v = out.variacao as Record<string, number>;
    expect(v.nominal).toBe(10); // +10% em moeda corrente
    expect(v.real).toBeLessThan(0); // perda de poder de compra
    expect(v.real).toBeCloseTo(-1.4045, 3);
  });

  it("mês base escolhido no meio do período muda a régua, não os fatos", async () => {
    mockFetch([
      ["bcdata.sgs.1619/dados", [{ data: "01/01/2024", valor: "1000" }, { data: "01/12/2024", valor: "1100" }]],
      ["bcdata.sgs.433/dados", ipca1pct]
    ]);

    const out = structured(await call("bcb_deflacionar", {
      codigo: 1619, dataInicial: "2024-01-01", dataFinal: "2024-12-31", mesBase: "2024-01"
    }));

    expect((out.base as Record<string, unknown>).mes).toBe("01/2024");
    const dados = out.dados as Array<Record<string, number>>;
    expect(dados[0].valorReal).toBe(1000); // agora janeiro é a base
    // A variação real não depende de qual mês é a base — a régua muda, a perda não.
    expect((out.variacao as Record<string, number>).real).toBeCloseTo(-1.4045, 3);
  });

  it("índice escolhido troca a série consultada e sai declarado", async () => {
    mockFetch([
      ["bcdata.sgs.1619/dados", [{ data: "01/06/2024", valor: "1412" }]],
      ["bcdata.sgs.189/dados", ipca1pct]
    ]);

    const out = structured(await call("bcb_deflacionar", {
      codigo: 1619, dataInicial: "2024-01-01", dataFinal: "2024-12-31", indice: "igpm"
    }));

    const d = out.deflator as Record<string, unknown>;
    expect(d.indice).toBe("IGPM");
    expect(d.codigo).toBe(189);
    expect(fetchCalls.some(u => u.includes("bcdata.sgs.189"))).toBe(true);
    expect(fetchCalls.some(u => u.includes("bcdata.sgs.433"))).toBe(false);
  });

  it("índice desconhecido é recusado com a lista dos aceitos", async () => {
    mockFetch([["bcdata.sgs", []]]);

    const r = await call("bcb_deflacionar", {
      codigo: 1619, dataInicial: "2024-01-01", dataFinal: "2024-12-31", indice: "igpdi"
    });

    expect(r.isError).toBe(true);
    expect(r.content?.[0]?.text).toContain("ipca");
  });

  it("série diária é deflacionada pelo fator do MÊS de cada observação", async () => {
    mockFetch([
      ["bcdata.sgs.1/dados", diarias("2024-11-01", 3)],
      ["bcdata.sgs.433/dados", ipca1pct]
    ]);

    const out = structured(await call("bcb_deflacionar", {
      codigo: 1, dataInicial: "2024-11-01", dataFinal: "2024-11-30"
    }));

    const dados = out.dados as Array<Record<string, number>>;
    expect(dados).toHaveLength(3);
    expect(new Set(dados.map(d => d.fator)).size).toBe(1); // novembro inteiro, um fator
    expect(dados[0].fator).toBeCloseTo(1.01, 6);
  });

  it("o deflator é buscado até HOJE, não até dataFinal — a base é 'reais de hoje'", async () => {
    mockFetch([
      ["bcdata.sgs.1619/dados", [{ data: "01/06/2024", valor: "1412" }]],
      ["bcdata.sgs.433/dados", ipca1pct]
    ]);

    await call("bcb_deflacionar", { codigo: 1619, dataInicial: "2024-01-01", dataFinal: "2024-06-30" });

    const urlIndice = fetchCalls.find(u => u.includes("bcdata.sgs.433"))!;
    expect(urlIndice).not.toContain("dataFinal=30/06/2024");
  });

  it("a série nominal sem dados é erro explícito, não uma resposta vazia bem-formada", async () => {
    mockFetch([
      ["bcdata.sgs.1619/dados", []],
      ["bcdata.sgs.433/dados", ipca1pct]
    ]);

    const r = await call("bcb_deflacionar", {
      codigo: 1619, dataInicial: "2024-01-01", dataFinal: "2024-12-31"
    });

    expect(r.isError).toBe(true);
    expect(r.content?.[0]?.text).toContain("1619");
  });
});
