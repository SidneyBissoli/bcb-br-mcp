/**
 * Comportamento das tools do SGS sob as regras do D1.
 *
 * `series.test.ts` prova o motor (inferência, janelas, fusão, harmonização);
 * aqui se prova o que CHEGA ao cliente pelas tools: o chunking anunciado na
 * resposta, o teto de 20 contornado sem o usuário saber, a harmonização com
 * marca de derivação, e o aviso de periodicidade misturada no `bcb_comparar` —
 * que é a armadilha silenciosa dessa tool.
 *
 * O baseline pré-D1 continua em `tools.characterization.test.ts`; nada aqui
 * substitui aquilo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchTool, type ToolResult } from "./tools.js";
import { _resetCatalogo } from "./catalog.js";

let fetchCalls: string[] = [];

function mockFetch(rotas: Array<[string, unknown]>): void {
  global.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    fetchCalls.push(url);
    const hit = rotas.find(([m]) => url.includes(m));
    if (!hit) throw new Error(`URL não roteada no mock: ${url}`);
    const corpo = hit[1] as Record<string, unknown>;
    if (corpo && typeof corpo === "object" && "__status" in corpo) {
      return {
        ok: false,
        status: corpo.__status as number,
        statusText: "Not Acceptable",
        json: async () => ({})
      } as unknown as Response;
    }
    return { ok: true, status: 200, statusText: "OK", json: async () => hit[1] } as unknown as Response;
  }) as unknown as typeof fetch;
}

function call(tool: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return dispatchTool(tool, args, 5000, 1);
}

function structured(result: ToolResult): Record<string, unknown> {
  expect(result.isError).toBeUndefined();
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
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
  _resetCatalogo();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==================== chunking ====================

describe("bcb_serie_valores — limite de 10 anos da origem", () => {
  it("406 numa janela larga vira consulta fatiada, e a resposta diz que fatiou", async () => {
    mockFetch([
      ["dados/ultimos/20", { __status: 500 }], // sonda indisponível: força o caminho reativo
      ["dataInicial=01/01/2005&dataFinal=01/01/2025", { __status: 406 }],
      ["dados?formato=json&dataInicial", diarias("2005-01-03", 4)]
    ]);

    const out = structured(await call("bcb_serie_valores", {
      codigo: 1, dataInicial: "2005-01-01", dataFinal: "2025-01-01"
    }));

    expect(out.chunking).toEqual({ janelas: 7, fatiaAnos: 3 });
    expect(out.totalRegistros).toBe(4);
    expect((out.serie as Record<string, unknown>).codigo).toBe(1);
  });

  it("janela sem dataInicial em série diária: aplica janela e explica o motivo", async () => {
    // ordem importa: as fatias também batem em `dados?formato=json`, então a
    // rota das fatias (com dataInicial) vem antes da recusa da janela aberta
    mockFetch([
      ["dados/ultimos/20", { __status: 500 }],
      ["dataInicial", diarias("2016-08-11", 3)],
      ["bcdata.sgs.1/dados?formato=json", { __status: 406 }]
    ]);

    const out = structured(await call("bcb_serie_valores", { codigo: 1 }));

    const janela = out.janelaAplicada as Record<string, string>;
    expect(janela).toBeDefined();
    expect(janela.motivo).toContain("406");
    expect(janela.motivo).toContain("Informe dataInicial");
    expect(out.totalRegistros).toBe(3);
  });

  it("consulta estreita não paga nada a mais e não anuncia chunking", async () => {
    mockFetch([["bcdata.sgs.433/dados", [
      { data: "01/01/2020", valor: "0.21" }, { data: "01/02/2020", valor: "0.25" }
    ]]]);

    const out = structured(await call("bcb_serie_valores", {
      codigo: 433, dataInicial: "2020-01-01", dataFinal: "2020-02-28"
    }));

    expect(fetchCalls.length).toBe(1);
    expect(out.chunking).toBeUndefined();
    expect(out.janelaAplicada).toBeUndefined();
  });
});

// ==================== teto de 20 ====================

describe("bcb_serie_ultimos — teto de 20 da origem", () => {
  it("quantidade acima de 20 é atendida sem pedir mais de 20 ao endpoint nativo", async () => {
    mockFetch([
      ["dados/ultimos/20", diarias("2026-07-15", 20)],
      ["dados?formato=json&dataInicial", diarias("2026-01-01", 200)]
    ]);

    const out = structured(await call("bcb_serie_ultimos", { codigo: 1, quantidade: 50 }));

    expect(fetchCalls.every(u => !/\/ultimos\/(?!20\?)\d+/.test(u))).toBe(true);
    expect(out.totalRegistros).toBe(50);
    expect((out.dados as unknown[]).length).toBe(50);
  });

  it("até 20 segue no endpoint nativo, sem sonda nem janela", async () => {
    mockFetch([["dados/ultimos/12", diarias("2026-08-01", 12)]]);

    const out = structured(await call("bcb_serie_ultimos", { codigo: 1, quantidade: 12 }));

    expect(fetchCalls).toEqual([
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/12?formato=json"
    ]);
    expect(out.totalRegistros).toBe(12);
  });
});

describe("bcb_variacao — periodos acima de 20", () => {
  it("periodos = 40 deixa de falhar contra a origem", async () => {
    mockFetch([
      ["dados/ultimos/20", diarias("2026-07-15", 20)],
      ["dados?formato=json&dataInicial", diarias("2026-01-01", 200)]
    ]);

    const out = structured(await call("bcb_variacao", { codigo: 1, periodos: 40 }));

    expect((out.periodo as Record<string, number>).totalPeriodos).toBe(40);
    expect(fetchCalls.every(u => !/\/ultimos\/(?!20\?)\d+/.test(u))).toBe(true);
  });
});

// ==================== harmonização ====================

describe("bcb_serie_valores — harmonização de frequências", () => {
  const ipca2024 = [
    ["01/01/2024", "0.42"], ["01/02/2024", "0.83"], ["01/03/2024", "0.16"],
    ["01/04/2024", "0.38"], ["01/05/2024", "0.46"], ["01/06/2024", "0.21"],
    ["01/07/2024", "0.38"], ["01/08/2024", "-0.02"], ["01/09/2024", "0.44"],
    ["01/10/2024", "0.56"], ["01/11/2024", "0.39"], ["01/12/2024", "0.52"]
  ].map(([data, valor]) => ({ data, valor }));

  it("mensal para anual com acumulada devolve o composto, marcado como derivado", async () => {
    mockFetch([["bcdata.sgs.433/dados", ipca2024]]);

    const out = structured(await call("bcb_serie_valores", {
      codigo: 433, dataInicial: "2024-01-01", dataFinal: "2024-12-31",
      frequencia: "anual", agregacao: "acumulada"
    }));

    const dados = out.dados as Array<{ data: string; valor: number; observacoes: number }>;
    expect(dados.length).toBe(1);
    expect(dados[0].valor).toBeCloseTo(4.8313, 4);
    expect(dados[0].observacoes).toBe(12);

    const h = out.harmonizacao as Record<string, unknown>;
    expect(h.derived).toBe(true);
    expect(h.frequencia).toBe("anual");
    expect(h.agregacao).toBe("acumulada");
    expect(h.observacoesOriginais).toBe(12);
    expect(String(h.nota)).toContain("não do Banco Central");
    expect(out.totalRegistros).toBe(1);
  });

  it("sem frequencia a resposta segue exatamente como antes", async () => {
    mockFetch([["bcdata.sgs.433/dados", ipca2024]]);

    const out = structured(await call("bcb_serie_valores", { codigo: 433 }));

    expect(out.harmonizacao).toBeUndefined();
    expect(out.totalRegistros).toBe(12);
    expect((out.dados as Array<Record<string, unknown>>)[0]).toEqual({ data: "01/01/2024", valor: 0.42 });
  });

  it("pedir frequência mais fina que a da série é recusado com motivo", async () => {
    mockFetch([["bcdata.sgs.4380/dados", [
      { data: "01/01/2024", valor: "1" }, { data: "01/04/2024", valor: "2" },
      { data: "01/07/2024", valor: "3" }, { data: "01/10/2024", valor: "4" }
    ]]]);

    const result = await call("bcb_serie_valores", { codigo: 4380, frequencia: "mensal" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("desagregar");
  });
});

// ==================== periodicidade misturada ====================

describe("bcb_comparar — periodicidades diferentes", () => {
  const dolarDiario = diarias("2024-01-02", 10);
  const ipcaMensal = [
    { data: "01/01/2024", valor: "0.42" }, { data: "01/02/2024", valor: "0.83" },
    { data: "01/03/2024", valor: "0.16" }, { data: "01/04/2024", valor: "0.38" }
  ];

  it("avisa que os números não são comparáveis quando as grades diferem", async () => {
    mockFetch([
      ["bcdata.sgs.1/dados", dolarDiario],
      ["bcdata.sgs.433/dados", ipcaMensal]
    ]);

    const out = structured(await call("bcb_comparar", {
      codigos: [1, 433], dataInicial: "2024-01-01", dataFinal: "2024-04-30"
    }));

    expect(String(out.aviso)).toContain("periodicidades diferentes");
    expect(String(out.aviso)).toContain("frequencia");
    expect(out.harmonizacao).toBeUndefined();
  });

  it("mesma periodicidade não gera aviso", async () => {
    mockFetch([
      ["bcdata.sgs.433/dados", ipcaMensal],
      ["bcdata.sgs.189/dados", ipcaMensal]
    ]);

    const out = structured(await call("bcb_comparar", {
      codigos: [433, 189], dataInicial: "2024-01-01", dataFinal: "2024-04-30"
    }));

    expect(out.aviso).toBeUndefined();
  });

  it("com frequencia, harmoniza as duas na mesma grade e troca o aviso pela nota", async () => {
    mockFetch([
      ["bcdata.sgs.1/dados", dolarDiario],
      ["bcdata.sgs.433/dados", ipcaMensal]
    ]);

    const out = structured(await call("bcb_comparar", {
      codigos: [1, 433], dataInicial: "2024-01-01", dataFinal: "2024-04-30",
      frequencia: "trimestral", agregacao: "media"
    }));

    expect(out.aviso).toBeUndefined();
    const h = out.harmonizacao as Record<string, unknown>;
    expect(h.derived).toBe(true);
    expect(h.frequencia).toBe("trimestral");
    expect(h.agregacao).toBe("media");

    // o dólar diário de janeiro colapsa num ponto; o IPCA vira dois trimestres
    const ranking = out.ranking as Array<{ codigo: number; totalRegistros: number }>;
    expect(ranking.find(r => r.codigo === 1)?.totalRegistros).toBe(1);
    expect(ranking.find(r => r.codigo === 433)?.totalRegistros).toBe(2);
  });
});
