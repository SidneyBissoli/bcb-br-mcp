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

/**
 * Linha REAL do `ExpectativasMercadoTop5Selic`, colhida da origem no mini-spike.
 * É o único dos treze recursos que publica os campos em caixa baixa, e é por isso
 * que ela está aqui: sem essa amostra, a normalização voltaria tudo nulo e nenhum
 * teste perceberia.
 */
const LINHA_TOP5_SELIC = {
  indicador: "Selic",
  Data: "2026-06-29",
  reuniao: "R5/2026",
  tipoCalculo: "C",
  media: 14.1591,
  mediana: 14.25,
  desvioPadrao: 0.1607,
  coeficienteVariacao: 1.135,
  minimo: 14,
  maximo: 14.5
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

  it("lê o Top 5 da Selic, que a fonte publica em caixa baixa", () => {
    const linha = normalizarExpectativa(LINHA_TOP5_SELIC);

    expect(linha).toMatchObject({
      indicador: "Selic",
      coletadoEm: "2026-06-29",
      referencia: "R5/2026",
      media: 14.1591,
      mediana: 14.25,
      desvioPadrao: 0.1607,
      minimo: 14,
      maximo: 14.5,
      tipoCalculo: "C",
      coeficienteVariacao: 1.135
    });
    // A fonte não publica estes dois neste recurso — nulo é o valor honesto.
    expect(linha.respondentes).toBeNull();
    expect(linha.baseCalculo).toBeNull();
  });

  it("coeficienteVariacao só aparece onde a fonte o publica", () => {
    expect(normalizarExpectativa(LINHA_SELIC).coeficienteVariacao).toBeUndefined();
    expect(normalizarExpectativa(LINHA_ANUAL).coeficienteVariacao).toBeUndefined();
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

  /**
   * Nomes lidos do documento de serviço do OData contra a origem. A irregularidade
   * de caixa/singular é da fonte, não erro nosso — e é justamente o que um teste
   * precisa impedir de "consertar" por engano.
   */
  it("Top 5 é sinalizador e existe nos CINCO horizontes, cada um no seu recurso", async () => {
    const esperado: Record<string, string> = {
      mensal: "ExpectativasMercadoTop5Mensais",
      trimestral: "ExpectativaMercadoTop5Trimestral",
      anual: "ExpectativasMercadoTop5Anuais",
      inflacao_12m: "ExpectativasMercadoTop5Inflacao12Meses",
      inflacao_24m: "ExpectativasMercadoTop5Inflacao24Meses"
    };

    for (const [horizonte, recurso] of Object.entries(esperado)) {
      expect(RECURSOS[horizonte as keyof typeof RECURSOS].top5).toBe(recurso);

      fetchCalls = [];
      mockOlinda([]);
      const rolante = RECURSOS[horizonte as keyof typeof RECURSOS].campoReferencia === null;
      const result = await call("bcb_focus_expectativas", {
        indicador: "IPCA",
        horizonte,
        top5: true,
        ...(rolante ? {} : { referencia: "2027" })
      });

      expect(result.isError).toBeUndefined();
      expect(fetchCalls[0]).toContain(`/${recurso}?`);
    }
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

  it("top5 troca o recurso e a linha em caixa baixa chega normalizada", async () => {
    mockOlinda([LINHA_TOP5_SELIC]);

    const out = structured(await call("bcb_focus_selic", { top5: true }));

    expect(fetchCalls[0]).toContain("/ExpectativasMercadoTop5Selic?");
    expect(out.base).toBe("top5");
    expect((out.expectativas as Array<Record<string, unknown>>)[0]).toMatchObject({
      referencia: "R5/2026",
      mediana: 14.25,
      coeficienteVariacao: 1.135
    });
  });
});

// ==================== bcb_focus_referencias ====================

/**
 * A tool consulta os PRÓPRIOS recursos de expectativa, um por horizonte, e não o
 * recurso `DatasReferencia` — que o mini-spike contra a origem mostrou não servir
 * ao propósito (não tem campo `DataReferencia`, cobre 11 indicadores contra 26 do
 * anual, e não separa por horizonte). O que estes testes pinam é a quebra POR
 * ESCOPO, que é o valor da tool.
 */
describe("bcb_focus_referencias", () => {
  /** Mock por recurso: cada horizonte responde uma coisa diferente, como na origem. */
  function mockPorRecurso(porRecurso: Record<string, unknown[] | Error>): void {
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      fetchCalls.push(url);
      const chave = Object.keys(porRecurso).find(r => url.includes(`/${r}?`));
      const valor = chave ? porRecurso[chave] : [];
      if (valor instanceof Error) {
        return { ok: false, status: 502, statusText: "Bad Gateway", json: async () => ({}) } as unknown as Response;
      }
      return { ok: true, status: 200, statusText: "OK", json: async () => ({ value: valor }) } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it("consulta um recurso por escopo, incluindo a Selic — nunca DatasReferencia", async () => {
    mockPorRecurso({});

    await call("bcb_focus_referencias", {});

    expect(fetchCalls).toHaveLength(6);
    for (const recurso of [
      "ExpectativaMercadoMensais",
      "ExpectativasMercadoTrimestrais",
      "ExpectativasMercadoAnuais",
      "ExpectativasMercadoInflacao12Meses",
      "ExpectativasMercadoInflacao24Meses",
      "ExpectativasMercadoSelic"
    ]) {
      expect(fetchCalls.some(u => u.includes(`/${recurso}?`))).toBe(true);
    }
    expect(fetchCalls.some(u => u.includes("DatasReferencia"))).toBe(false);
  });

  it("quebra indicadores e referências POR escopo, que é o ponto da tool", async () => {
    mockPorRecurso({
      ExpectativaMercadoMensais: [
        { Indicador: "IPCA", DataReferencia: "09/2026" },
        { Indicador: "IPCA", DataReferencia: "10/2026" },
        { Indicador: "Câmbio", DataReferencia: "09/2026" }
      ],
      ExpectativasMercadoAnuais: [
        { Indicador: "IPCA", DataReferencia: "2027" },
        { Indicador: "PIB Total", DataReferencia: "2027" }
      ],
      ExpectativasMercadoSelic: [{ Indicador: "Selic", Reuniao: "R6/2026" }]
    });

    const out = structured(await call("bcb_focus_referencias", {}));

    const escopos = out.escopos as Array<Record<string, unknown>>;
    expect(escopos).toHaveLength(6);

    const mensal = escopos.find(h => h.escopo === "mensal");
    expect(mensal).toMatchObject({
      tool: "bcb_focus_expectativas",
      exigeReferencia: true,
      temTop5: true,
      indicadores: ["Câmbio", "IPCA"],
      referencias: ["09/2026", "10/2026"],
      disponivel: true
    });

    // "PIB Total" existe no anual e NÃO no mensal — a causa de resposta vazia que
    // a tool existe para expor.
    expect((escopos.find(h => h.escopo === "anual") as Record<string, unknown>).indicadores).toEqual([
      "IPCA",
      "PIB Total"
    ]);
    expect(mensal?.indicadores).not.toContain("PIB Total");

    // A Selic entra como escopo próprio, apontando para a tool que a consome.
    expect(escopos.find(h => h.escopo === "selic")).toMatchObject({
      tool: "bcb_focus_selic",
      exigeReferencia: false,
      referencias: ["R6/2026"]
    });

    // Rolantes não têm alvo de calendário: lista vazia é o valor correto.
    expect(escopos.find(h => h.escopo === "inflacao_12m")).toMatchObject({
      exigeReferencia: false,
      temTop5: true,
      referencias: []
    });

    expect(out.indicadores).toEqual(["Câmbio", "IPCA", "PIB Total", "Selic"]);
    // União em ordem cronológica, não lexicográfica.
    expect(out.referencias).toEqual(["R6/2026", "09/2026", "10/2026", "2027"]);
    expect(out.totalRegistros).toBe(6);
  });

  it("referências saem em ordem cronológica, não lexicográfica", async () => {
    mockPorRecurso({
      ExpectativaMercadoMensais: [
        { Indicador: "IPCA", DataReferencia: "02/2027" },
        { Indicador: "IPCA", DataReferencia: "01/2028" },
        { Indicador: "IPCA", DataReferencia: "01/2027" },
        { Indicador: "IPCA", DataReferencia: "12/2026" }
      ]
    });

    const out = structured(await call("bcb_focus_referencias", { escopo: "mensal" }));

    // Lexicograficamente seria 01/2027, 01/2028, 02/2027, 12/2026 — inútil para ler.
    expect((out.escopos as Array<Record<string, unknown>>)[0].referencias).toEqual([
      "12/2026",
      "01/2027",
      "02/2027",
      "01/2028"
    ]);
  });

  it("com `escopo`, consulta só aquele recurso", async () => {
    mockPorRecurso({ ExpectativasMercadoAnuais: [{ Indicador: "IPCA", DataReferencia: "2027" }] });

    const out = structured(await call("bcb_focus_referencias", { escopo: "anual" }));

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toContain("/ExpectativasMercadoAnuais?");
    expect(out.escopos).toHaveLength(1);
  });

  it("`selic` é escopo válido e vai ao recurso de Selic", async () => {
    mockPorRecurso({ ExpectativasMercadoSelic: [{ Indicador: "Selic", Reuniao: "R6/2026" }] });

    const out = structured(await call("bcb_focus_referencias", { escopo: "selic" }));

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toContain("/ExpectativasMercadoSelic?");
    expect((out.escopos as Array<Record<string, unknown>>)[0].referencias).toEqual(["R6/2026"]);
  });

  it("filtra por indicador e usa $select para não trazer o payload inteiro", async () => {
    mockPorRecurso({ ExpectativasMercadoAnuais: [{ Indicador: "IPCA", DataReferencia: "2027" }] });

    await call("bcb_focus_referencias", { indicador: "IPCA", escopo: "anual" });

    const url = decodeURIComponent(fetchCalls[0]);
    expect(url).toContain("Indicador eq 'IPCA'");
    expect(url).toContain("$select=Indicador,DataReferencia");
    expect(url).toContain("Data ge '2026-07-26'"); // janela de descoberta: 15 dias
  });

  it("escopo que não responde não derruba os outros", async () => {
    mockPorRecurso({
      ExpectativasMercadoAnuais: [{ Indicador: "IPCA", DataReferencia: "2027" }],
      ExpectativaMercadoMensais: new Error("fora")
    });

    const out = structured(await call("bcb_focus_referencias", {}));

    const escopos = out.escopos as Array<Record<string, unknown>>;
    expect(escopos.find(h => h.escopo === "anual")?.disponivel).toBe(true);
    expect(escopos.find(h => h.escopo === "mensal")?.disponivel).toBe(false);
    expect(out.falhas).toHaveLength(1);
    expect(out.observacaoFalhas).toContain("disponivel");
  });

  it("origem inteira fora vira isError, não resposta vazia disfarçada", async () => {
    mockOlinda({ __status: 502 });

    const result = await call("bcb_focus_referencias", {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("502");
  });

  it("indicador inexistente diz o que fazer em vez de devolver listas vazias", async () => {
    mockPorRecurso({});

    const out = structured(await call("bcb_focus_referencias", { indicador: "Bitcoin" }));

    expect(out.indicadores).toEqual([]);
    expect(out.observacaoFalhas).toContain("SEM `indicador`");
  });
});
