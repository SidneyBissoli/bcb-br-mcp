/**
 * Testes das tools de Expectativas de Mercado (Focus) — sessão de D3.
 *
 * O que está pinado aqui é a FRONTEIRA aprovada pelo decisor, porque é ela que
 * o desenho existe para sustentar: consolidação por `horizonte`, recusa de
 * `referencia` nos horizontes rolantes, Top 5 como sinalizador com combinação
 * inválida barrada, Selic separada pelo eixo de reunião do Copom, filtro sempre
 * presente na URL (a origem não completa consulta sem filtro) e contagem
 * client-side (a origem ignora `$count`).
 *
 * Rede nunca é tocada: global.fetch é mockado.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RECURSOS, normalizarExpectativa } from "./focus.js";
import { dispatchTool, type ToolResult } from "./tools.js";

let fetchCalls: string[] = [];

function mockOlinda(value: unknown[] | { __status: number }): void {
  global.fetch = vi.fn(async (input: string | URL | Request) => {
    fetchCalls.push(String(input));
    if (value && typeof value === "object" && "__status" in value) {
      return {
        ok: false,
        status: (value as { __status: number }).__status,
        statusText: "Bad Gateway",
        json: async () => ({})
      } as unknown as Response;
    }
    return { ok: true, status: 200, statusText: "OK", json: async () => ({ value }) } as unknown as Response;
  }) as unknown as typeof fetch;
}

function call(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  return dispatchTool(tool, args, 5000, 1);
}

function structured(result: ToolResult): Record<string, unknown> {
  expect(result.isError).toBeUndefined();
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

const LINHA_ANUAL = {
  Indicador: "IPCA",
  IndicadorDetalhe: null,
  Data: "2026-08-07",
  DataReferencia: "2027",
  Media: 3.51,
  Mediana: 3.5,
  DesvioPadrao: 0.23,
  Minimo: 3.0,
  Maximo: 4.2,
  numeroRespondentes: 98,
  baseCalculo: 0
};

const LINHA_ROLANTE = {
  Indicador: "IPCA",
  Data: "2026-08-07",
  Suavizada: "S",
  Media: 3.9,
  Mediana: 3.88,
  DesvioPadrao: 0.2,
  Minimo: 3.4,
  Maximo: 4.5,
  numeroRespondentes: 90,
  baseCalculo: 1
};

const LINHA_SELIC = {
  Indicador: "Selic",
  Data: "2026-08-07",
  Reuniao: "R6/2026",
  Media: 10.4,
  Mediana: 10.5,
  DesvioPadrao: 0.15,
  Minimo: 10.0,
  Maximo: 10.75,
  numeroRespondentes: 72,
  baseCalculo: 0
};

beforeEach(() => {
  fetchCalls = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ==================== normalização ====================

describe("normalizarExpectativa", () => {
  it("unifica DataReferencia e Reuniao no mesmo campo `referencia`", () => {
    expect(normalizarExpectativa(LINHA_ANUAL).referencia).toBe("2027");
    expect(normalizarExpectativa(LINHA_SELIC).referencia).toBe("R6/2026");
  });

  it("traduz Suavizada S/N para booleano e só quando a fonte manda o campo", () => {
    expect(normalizarExpectativa(LINHA_ROLANTE).suavizada).toBe(true);
    expect(normalizarExpectativa({ ...LINHA_ROLANTE, Suavizada: "N" }).suavizada).toBe(false);
    expect(normalizarExpectativa(LINHA_ANUAL).suavizada).toBeUndefined();
  });

  it("números que venham como texto não voltam NaN", () => {
    const linha = normalizarExpectativa({ ...LINHA_ANUAL, Mediana: "3,5", Media: "" });
    expect(linha.mediana).toBe(3.5);
    expect(linha.media).toBeNull();
  });
});

// ==================== bcb_focus_expectativas ====================

describe("bcb_focus_expectativas", () => {
  it("consolida por horizonte: cada um vai ao seu recurso OData", async () => {
    for (const [horizonte, recurso] of Object.entries(RECURSOS)) {
      fetchCalls = [];
      mockOlinda([]);
      const rolante = recurso.campoReferencia === null;
      await call("bcb_focus_expectativas", {
        indicador: "IPCA",
        horizonte,
        ...(rolante ? {} : { referencia: "2027" })
      });
      expect(fetchCalls[0]).toContain(`/${recurso.consenso}?`);
    }
  });

  it("monta filtro por construção — indicador E janela, sempre", async () => {
    mockOlinda([LINHA_ANUAL]);

    const out = structured(
      await call("bcb_focus_expectativas", { indicador: "IPCA", horizonte: "anual", referencia: "2027" })
    );

    const url = decodeURIComponent(fetchCalls[0]);
    expect(url).toContain("$filter=Indicador eq 'IPCA'");
    expect(url).toContain("Data ge '2026-07-11'"); // janela padrão de 30 dias
    expect(url).toContain("Data le '2026-08-10'");
    expect(url).toContain("DataReferencia eq '2027'");
    expect((out.filtro as Record<string, unknown>).janelaPadrao).toBe(true);
  });

  it("contagem é client-side e a linha vem normalizada", async () => {
    mockOlinda([LINHA_ANUAL, { ...LINHA_ANUAL, Data: "2026-08-08", Mediana: 3.45 }]);

    const out = structured(
      await call("bcb_focus_expectativas", { indicador: "IPCA", horizonte: "anual", referencia: "2027" })
    );

    expect(out.totalRegistros).toBe(2);
    const expectativas = out.expectativas as Array<Record<string, unknown>>;
    // Coleta mais recente primeiro.
    expect(expectativas.map(e => e.coletadoEm)).toEqual(["2026-08-08", "2026-08-07"]);
    expect(expectativas[1]).toMatchObject({
      indicador: "IPCA",
      referencia: "2027",
      mediana: 3.5,
      respondentes: 98
    });
    expect(out.base).toBe("consenso");
  });

  it("horizonte de calendário SEM referencia é barrado antes da rede", async () => {
    mockOlinda([]);

    const result = await call("bcb_focus_expectativas", { indicador: "IPCA", horizonte: "anual" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("exige `referencia`");
    expect(result.content[0].text).toContain("bcb_focus_referencias");
    expect(fetchCalls).toEqual([]);
  });

  it("horizonte rolante COM referencia é barrado, apontando o horizonte certo", async () => {
    mockOlinda([]);

    const result = await call("bcb_focus_expectativas", {
      indicador: "IPCA",
      horizonte: "inflacao_12m",
      referencia: "2027"
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("é rolante");
    expect(fetchCalls).toEqual([]);
  });

  it("`suavizada` só existe nos rolantes, e virá no filtro como S/N", async () => {
    mockOlinda([]);
    const barrado = await call("bcb_focus_expectativas", {
      indicador: "IPCA",
      horizonte: "anual",
      referencia: "2027",
      suavizada: true
    });
    expect(barrado.isError).toBe(true);
    expect(fetchCalls).toEqual([]);

    mockOlinda([LINHA_ROLANTE]);
    await call("bcb_focus_expectativas", { indicador: "IPCA", horizonte: "inflacao_12m", suavizada: true });
    expect(decodeURIComponent(fetchCalls[0])).toContain("Suavizada eq 'S'");
  });

  it("Top 5 é sinalizador: troca o recurso onde existe e é barrado onde não existe", async () => {
    mockOlinda([LINHA_ANUAL]);
    await call("bcb_focus_expectativas", { indicador: "IPCA", horizonte: "anual", referencia: "2027", top5: true });
    expect(fetchCalls[0]).toContain("/ExpectativasMercadoTop5Anuais?");

    fetchCalls = [];
    const barrado = await call("bcb_focus_expectativas", {
      indicador: "IPCA",
      horizonte: "trimestral",
      referencia: "3/2026",
      top5: true
    });
    expect(barrado.isError).toBe(true);
    expect(barrado.content[0].text).toContain("não publica Top 5");
    expect(fetchCalls).toEqual([]);
  });

  it("resposta vazia orienta em vez de afirmar que o dado não existe", async () => {
    mockOlinda([]);

    const out = structured(
      await call("bcb_focus_expectativas", { indicador: "IPCA", horizonte: "anual", referencia: "2099" })
    );

    expect(out.totalRegistros).toBe(0);
    expect(out.observacao).toContain("bcb_focus_referencias");
  });

  it("janela invertida e horizonte inválido falham com mensagem própria", async () => {
    mockOlinda([]);

    const invertida = await call("bcb_focus_expectativas", {
      indicador: "IPCA",
      horizonte: "anual",
      referencia: "2027",
      dataInicial: "2026-08-10",
      dataFinal: "2026-01-01"
    });
    expect(invertida.content[0].text).toContain("invertida");

    const horizonte = await call("bcb_focus_expectativas", { indicador: "IPCA", horizonte: "decenal" });
    expect(horizonte.content[0].text).toContain("Horizonte inválido");
    expect(fetchCalls).toEqual([]);
  });

  it("upstream fora do ar vira isError com texto, não exceção", async () => {
    mockOlinda({ __status: 502 });

    const result = await call("bcb_focus_expectativas", { indicador: "IPCA", horizonte: "anual", referencia: "2027" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("502");
  });
});

// ==================== bcb_focus_selic ====================

describe("bcb_focus_selic", () => {
  it("usa o recurso de Selic e filtra por reunião quando informada", async () => {
    mockOlinda([LINHA_SELIC]);

    const out = structured(await call("bcb_focus_selic", { reuniao: "R6/2026" }));

    const url = decodeURIComponent(fetchCalls[0]);
    expect(url).toContain("/ExpectativasMercadoSelic?");
    expect(url).toContain("Reuniao eq 'R6/2026'");
    expect((out.expectativas as Array<Record<string, unknown>>)[0].referencia).toBe("R6/2026");
    expect(out.observacaoEixo).toContain("REUNIÃO do Copom");
  });

  it("sem reunião, filtra só pela janela (que nunca fica em aberto)", async () => {
    mockOlinda([LINHA_SELIC]);

    await call("bcb_focus_selic", {});

    const url = decodeURIComponent(fetchCalls[0]);
    expect(url).toContain("Data ge '2026-07-11'");
    expect(url).not.toContain("Reuniao eq");
  });

  it("top5 troca o recurso", async () => {
    mockOlinda([LINHA_SELIC]);
    await call("bcb_focus_selic", { top5: true });
    expect(fetchCalls[0]).toContain("/ExpectativasMercadoTop5Selic?");
  });
});

// ==================== bcb_focus_referencias ====================

describe("bcb_focus_referencias", () => {
  it("devolve indicadores e referências distintos, mais as regras por horizonte", async () => {
    mockOlinda([
      { Indicador: "IPCA", DataReferencia: "2027" },
      { Indicador: "IPCA", DataReferencia: "2026" },
      { Indicador: "PIB Total", DataReferencia: "2027" },
      { Indicador: "IPCA", DataReferencia: "2027" }
    ]);

    const out = structured(await call("bcb_focus_referencias", {}));

    expect(out.indicadores).toEqual(["IPCA", "PIB Total"]);
    expect(out.referencias).toEqual(["2026", "2027"]);
    const horizontes = out.horizontes as Array<Record<string, unknown>>;
    expect(horizontes).toHaveLength(5);
    expect(horizontes.find(h => h.horizonte === "anual")).toEqual({
      horizonte: "anual",
      formatoReferencia: "yyyy (ex.: 2027)",
      exigeReferencia: true,
      temTop5: true
    });
    expect(horizontes.find(h => h.horizonte === "inflacao_12m")).toMatchObject({ exigeReferencia: false, temTop5: false });
  });

  it("filtra por indicador quando pedido", async () => {
    mockOlinda([{ Indicador: "IPCA", DataReferencia: "2027" }]);

    await call("bcb_focus_referencias", { indicador: "IPCA" });

    expect(decodeURIComponent(fetchCalls[0])).toContain("Indicador eq 'IPCA'");
  });
});
