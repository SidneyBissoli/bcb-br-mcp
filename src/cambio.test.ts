/**
 * Testes das tools de câmbio (PTAX) — sessão de D3.
 *
 * Pinado aqui: a consolidação dos quatro recursos da fonte numa tool só (dia ×
 * período, dólar × outra moeda), o formato MM-DD-YYYY dos parâmetros de data (a
 * pegadinha da API), o repasse LITERAL do disclaimer do BCB e a qualificação das
 * paridades não-dólar como dado de agência de informação — as duas últimas são
 * obrigação da base legal levantada na abertura da fase, não enfeite.
 *
 * Rede nunca é tocada: global.fetch é mockado.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DISCLAIMER_PTAX, montarUrlCotacao, normalizarCotacao } from "./cambio.js";
import { dispatchTool, type ToolResult } from "./tools.js";

let fetchCalls: string[] = [];

function mockPtax(value: unknown[] | { __status: number }): void {
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

const BOLETIM_DOLAR = {
  cotacaoCompra: 5.4321,
  cotacaoVenda: 5.4327,
  dataHoraCotacao: "2026-08-07 13:08:22.081",
  tipoBoletim: "Fechamento"
};

const BOLETIM_EURO = {
  paridadeCompra: 1.1652,
  paridadeVenda: 1.1657,
  cotacaoCompra: 6.3288,
  cotacaoVenda: 6.3301,
  dataHoraCotacao: "2026-08-07 13:08:22.081",
  tipoBoletim: "Fechamento"
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

// ==================== montagem da URL ====================

describe("montarUrlCotacao", () => {
  it("escolhe entre os quatro recursos conforme moeda e dia/período", () => {
    const dolarDia = montarUrlCotacao({ data: "2026-08-07" });
    const dolarPeriodo = montarUrlCotacao({ dataInicial: "2026-08-01", dataFinal: "2026-08-07" });
    const euroDia = montarUrlCotacao({ moeda: "EUR", data: "2026-08-07" });
    const euroPeriodo = montarUrlCotacao({ moeda: "EUR", dataInicial: "2026-08-01", dataFinal: "2026-08-07" });

    expect("url" in dolarDia && dolarDia.url).toContain("CotacaoDolarDia(dataCotacao=@dataCotacao)");
    expect("url" in dolarPeriodo && dolarPeriodo.url).toContain("CotacaoDolarPeriodo(");
    expect("url" in euroDia && euroDia.url).toContain("CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)");
    expect("url" in euroPeriodo && euroPeriodo.url).toContain("CotacaoMoedaPeriodo(");
  });

  it("data vai no formato MM-DD-YYYY que a PTAX exige (não ISO, não dd/MM/yyyy)", () => {
    const iso = montarUrlCotacao({ data: "2026-08-07" });
    const br = montarUrlCotacao({ data: "07/08/2026" });

    expect("url" in iso && iso.url).toContain("@dataCotacao='08-07-2026'");
    expect("url" in br && br.url).toContain("@dataCotacao='08-07-2026'");
  });

  it("moeda minúscula é aceita e normalizada", () => {
    const eur = montarUrlCotacao({ moeda: "eur", data: "2026-08-07" });
    expect("url" in eur && eur.url).toContain("@moeda='EUR'");
  });

  it("recusa `data` combinada com intervalo, e janela invertida", () => {
    expect(montarUrlCotacao({ data: "2026-08-07", dataFinal: "2026-08-08" })).toEqual({
      erro: "Use `data` para um dia específico OU `dataInicial`/`dataFinal` para um intervalo, não os dois."
    });
    const invertida = montarUrlCotacao({ dataInicial: "2026-08-10", dataFinal: "2026-01-01" });
    expect("erro" in invertida && invertida.erro).toContain("invertida");
  });

  it("sem data nenhuma, cobre os últimos 7 dias", () => {
    const padrao = montarUrlCotacao({});
    expect("url" in padrao && padrao.url).toContain("@dataInicial='08-03-2026'");
    expect("url" in padrao && padrao.url).toContain("@dataFinalCotacao='08-10-2026'");
    expect("janelaPadrao" in padrao && padrao.janelaPadrao).toBe(true);
  });
});

describe("normalizarCotacao", () => {
  it("só expõe paridade quando a moeda não é o dólar", () => {
    expect(normalizarCotacao(BOLETIM_DOLAR, true).paridadeCompra).toBeUndefined();
    expect(normalizarCotacao(BOLETIM_EURO, false).paridadeCompra).toBe(1.1652);
  });
});

// ==================== bcb_cambio_cotacao ====================

describe("bcb_cambio_cotacao", () => {
  it("dólar: devolve compra/venda e repassa o disclaimer LITERAL do BCB", async () => {
    mockPtax([BOLETIM_DOLAR]);

    const out = structured(await call("bcb_cambio_cotacao", { data: "2026-08-07" }));

    expect(out.moeda).toBe("USD");
    expect(out.totalRegistros).toBe(1);
    expect((out.cotacoes as Array<Record<string, unknown>>)[0]).toEqual({
      dataHora: "2026-08-07 13:08:22.081",
      cotacaoCompra: 5.4321,
      cotacaoVenda: 5.4327,
      tipoBoletim: "Fechamento"
    });
    expect(out.disclaimer).toBe(DISCLAIMER_PTAX);
    // Paridade não se aplica ao dólar: nada de campo vazio nem de qualificação.
    expect(out.qualificacaoParidade).toBeUndefined();
  });

  it("moeda não-dólar: paridade vem QUALIFICADA como dado de agência de informação", async () => {
    mockPtax([BOLETIM_EURO]);

    const out = structured(await call("bcb_cambio_cotacao", { moeda: "EUR", data: "2026-08-07" }));

    expect((out.cotacoes as Array<Record<string, unknown>>)[0].paridadeVenda).toBe(1.1657);
    expect(out.qualificacaoParidade).toContain("NÃO são apuradas pelo Banco Central");
    expect(out.qualificacaoParidade).toContain("Refinitiv");
  });

  it("ordena do boletim mais recente para o mais antigo e declara o corte", async () => {
    mockPtax([
      { ...BOLETIM_DOLAR, dataHoraCotacao: "2026-08-05 13:00:00.000" },
      { ...BOLETIM_DOLAR, dataHoraCotacao: "2026-08-07 13:00:00.000" },
      { ...BOLETIM_DOLAR, dataHoraCotacao: "2026-08-06 13:00:00.000" }
    ]);

    const out = structured(await call("bcb_cambio_cotacao", { dataInicial: "2026-08-01", dataFinal: "2026-08-07", limite: 2 }));

    expect((out.cotacoes as Array<Record<string, unknown>>).map(c => c.dataHora)).toEqual([
      "2026-08-07 13:00:00.000",
      "2026-08-06 13:00:00.000"
    ]);
    expect(out.totalRegistros).toBe(3);
    expect(out.observacao).toContain("Exibindo 2 de 3");
  });

  it("período sem cotação explica dia útil em vez de sugerir que a moeda não existe", async () => {
    mockPtax([]);

    const out = structured(await call("bcb_cambio_cotacao", { data: "2026-08-09" }));

    expect(out.totalRegistros).toBe(0);
    expect(out.observacao).toContain("dia útil");
    expect(out.observacao).toContain("bcb_cambio_moedas");
  });

  it("upstream fora do ar vira isError com texto", async () => {
    mockPtax({ __status: 502 });

    const result = await call("bcb_cambio_cotacao", { data: "2026-08-07" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("502");
  });
});

// ==================== bcb_cambio_moedas ====================

describe("bcb_cambio_moedas", () => {
  it("lista símbolo, nome e tipo, com disclaimer e qualificação", async () => {
    mockPtax([
      { simbolo: "EUR", nomeFormatado: "Euro", tipoMoeda: "B" },
      { simbolo: "USD", nomeFormatado: "Dólar dos Estados Unidos", tipoMoeda: "A" }
    ]);

    const out = structured(await call("bcb_cambio_moedas", {}));

    expect(out.totalMoedas).toBe(2);
    expect((out.moedas as Array<Record<string, unknown>>)[0]).toEqual({ simbolo: "EUR", nome: "Euro", tipo: "B" });
    expect(out.disclaimer).toBe(DISCLAIMER_PTAX);
    expect(out.qualificacaoParidade).toContain("Refinitiv");
  });

  it("filtra por símbolo ou nome, ignorando caixa", async () => {
    mockPtax([
      { simbolo: "EUR", nomeFormatado: "Euro", tipoMoeda: "B" },
      { simbolo: "GBP", nomeFormatado: "Libra Esterlina", tipoMoeda: "B" }
    ]);

    const porNome = structured(await call("bcb_cambio_moedas", { termo: "libra" }));
    expect((porNome.moedas as Array<Record<string, unknown>>).map(m => m.simbolo)).toEqual(["GBP"]);

    const porSimbolo = structured(await call("bcb_cambio_moedas", { termo: "eur" }));
    expect((porSimbolo.moedas as Array<Record<string, unknown>>).map(m => m.simbolo)).toEqual(["EUR"]);
  });
});
