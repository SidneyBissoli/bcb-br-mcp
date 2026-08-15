/**
 * CHARACTERIZATION TESTS — baseline of the pre-migration behaviour (v1.3.5).
 *
 * These tests exist to freeze what the 8 tools do TODAY, value by value, before
 * the foundation session migrates zod 3 -> 4, the SDK 1.x -> 2.x and the Worker
 * to the Fase 0 template. They are deliberately assertive about numbers,
 * rounding and field order-of-presence: a diff here during the migration means
 * the surface moved, which the phase forbids unless the change is deliberate
 * and listed.
 *
 * `bcb_variacao` and `bcb_comparar` carry an extra duty: they are the recorded
 * gate for arbitration 4 of the phase (migrating both to @sbissoli/mcp-stats
 * while preserving the output shape). The statistics they compute are pinned
 * here — including the rounding asymmetry between `media` (rounded to 4
 * decimals) and `maximo`/`minimo` (raw) — so the mcp-stats migration can only
 * pass if every difference is either nil or explainable.
 *
 * Network is never touched: global.fetch is mocked per test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  dispatchTool,
  SERIES_POPULARES,
  calculateVariation,
  formatDateForApi,
  normalizeString,
  type ToolResult
} from "./tools.js";
import { _resetCatalogo } from "./catalog.js";

// ==================== fetch mock ====================

type MockBody = unknown | { __status: number; __statusText?: string };

let fetchCalls: string[] = [];

/** Maps a URL substring to the JSON body (or HTTP error) the mock should answer. */
function mockFetch(routes: Array<[match: string, body: MockBody]>): void {
  global.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    fetchCalls.push(url);

    const hit = routes.find(([match]) => url.includes(match));
    if (!hit) throw new Error(`URL não roteada no mock: ${url}`);

    const body = hit[1] as Record<string, unknown>;
    if (body && typeof body === "object" && "__status" in body) {
      return {
        ok: false,
        status: body.__status as number,
        statusText: (body.__statusText as string) ?? "Error",
        json: async () => ({})
      } as unknown as Response;
    }

    return { ok: true, status: 200, statusText: "OK", json: async () => hit[1] } as unknown as Response;
  }) as unknown as typeof fetch;
}

/** Every call goes through the dispatcher with retries disabled (keeps the suite fast). */
function call(tool: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return dispatchTool(tool, args, 5000, 1);
}

/**
 * Payload SEM o canal de proveniência, para que as asserções valor a valor
 * abaixo sigam sendo o que sempre foram.
 *
 * O D4 acrescentou `provenance` e `attribution` a toda resposta de sucesso. A
 * tentação seria trocar os `toEqual` por `toMatchObject` — isso relaxaria o
 * gate inteiro, que é justamente o que o `CLAUDE.md` proíbe, e faria esta suíte
 * parar de perceber campo REMOVIDO. Em vez disso: os dois campos novos são
 * retirados aqui e verificados por conta própria (`provenienciaDe`), então cada
 * `toEqual` continua exigindo igualdade exata do resto.
 */
function structured(result: ToolResult): Record<string, unknown> {
  expect(result.isError).toBeUndefined();
  expect(result.structuredContent).toBeDefined();
  const payload = { ...(result.structuredContent as Record<string, unknown>) };

  // Presença é obrigatória: se sumir, o teste falha aqui em vez de passar calado.
  expect(payload.provenance).toBeDefined();
  expect(Array.isArray(payload.attribution)).toBe(true);
  delete payload.provenance;
  delete payload.attribution;
  return payload;
}

beforeEach(() => {
  fetchCalls = [];
  // O índice do portal é cache de módulo: sem zerar, um teste herdaria o
  // catálogo que outro buscou e a contagem de requisições mentiria.
  _resetCatalogo();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==================== pure helpers ====================

describe("helpers puros", () => {
  it("calculateVariation devolve percentual sobre o módulo do inicial", () => {
    expect(calculateVariation(100, 90)).toBe(-10);
    expect(calculateVariation(100, 120)).toBe(20);
    expect(calculateVariation(0, 50)).toBe(0); // guarda de divisão por zero
    expect(calculateVariation(-100, -50)).toBe(50); // denominador é |inicial|
  });

  it("formatDateForApi converte ISO para dd/MM/yyyy e passa dd/MM/yyyy adiante", () => {
    expect(formatDateForApi("2020-01-31")).toBe("31/01/2020");
    expect(formatDateForApi("31/01/2020")).toBe("31/01/2020");
  });

  it("normalizeString remove acentos e caixa", () => {
    expect(normalizeString("Inflação")).toBe("inflacao");
    expect(normalizeString("CÂMBIO")).toBe("cambio");
  });
});

// ==================== bcb_serie_valores ====================

describe("bcb_serie_valores", () => {
  it("monta a URL com datas convertidas e devolve a série completa", async () => {
    mockFetch([
      [
        "bcdata.sgs.433/dados",
        [
          { data: "01/01/2020", valor: "0.21" },
          { data: "01/02/2020", valor: "0.25" }
        ]
      ]
    ]);

    const out = structured(await call("bcb_serie_valores", { codigo: 433, dataInicial: "2020-01-01", dataFinal: "2020-02-28" }));

    expect(fetchCalls[0]).toBe(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/01/2020&dataFinal=28/02/2020"
    );
    expect(out).toEqual({
      serie: {
        codigo: 433,
        nome: "IPCA - Variação mensal",
        categoria: "Inflação",
        periodicidade: "Mensal"
      },
      totalRegistros: 2,
      periodoInicial: "01/01/2020",
      periodoFinal: "01/02/2020",
      dados: [
        { data: "01/01/2020", valor: 0.21 },
        { data: "01/02/2020", valor: 0.25 }
      ]
    });
  });

  it("série fora do catálogo interno recebe rótulos genéricos", async () => {
    mockFetch([["bcdata.sgs.99999/dados", [{ data: "01/01/2020", valor: "1" }]]]);

    const out = structured(await call("bcb_serie_valores", { codigo: 99999 }));

    expect(out.serie).toEqual({
      codigo: 99999,
      nome: "Série 99999",
      categoria: "Desconhecida",
      periodicidade: "Desconhecida"
    });
  });

  it("resposta vazia vira observação, não erro", async () => {
    mockFetch([["bcdata.sgs.433/dados", []]]);

    const out = structured(await call("bcb_serie_valores", { codigo: 433 }));

    expect(out.totalRegistros).toBe(0);
    expect(out.dados).toEqual([]);
    expect(out.observacao).toBe("Nenhum dado encontrado para a série 433 no período solicitado.");
    expect(out.periodoInicial).toBeUndefined();
  });

  it("404 do BCB vira isError com mensagem pedagógica", async () => {
    mockFetch([["bcdata.sgs.1/dados", { __status: 404, __statusText: "Not Found" }]]);

    const result = await call("bcb_serie_valores", { codigo: 1 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Erro ao consultar série 1: Série não encontrada ou sem dados para o período solicitado"
    );
  });
});

// ==================== bcb_serie_ultimos ====================

describe("bcb_serie_ultimos", () => {
  it("usa o endpoint /ultimos/N e devolve os valores", async () => {
    mockFetch([["bcdata.sgs.432/dados/ultimos/3", [{ data: "01/03/2020", valor: "4.25" }]]]);

    const out = structured(await call("bcb_serie_ultimos", { codigo: 432, quantidade: 3 }));

    expect(fetchCalls[0]).toBe("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/3?formato=json");
    // MUDANÇA DELIBERADA (13/08/2026): o nome da 432 não é o mesmo do baseline.
    // O catálogo curado trazia 432 e 1178 TROCADAS entre si. O portal e o dado
    // dão razão ao BCB: a 432 é a meta do Copom (constante em 14,00 entre
    // reuniões) e a 1178 é a Selic anualizada base 252 (13,90–14,15 no mesmo
    // dia). Não reverta esta asserção — ver `bcb/docs/06`.
    expect(out).toEqual({
      serie: {
        codigo: 432,
        nome: "Taxa de juros - Meta Selic definida pelo Copom",
        categoria: "Juros",
        periodicidade: "Diária"
      },
      totalRegistros: 1,
      dados: [{ data: "01/03/2020", valor: 4.25 }]
    });
  });

  it("quantidade ausente cai no default 10 (aplicado pelo dispatcher)", async () => {
    mockFetch([["dados/ultimos/10", []]]);

    await call("bcb_serie_ultimos", { codigo: 432 });

    expect(fetchCalls[0]).toContain("/dados/ultimos/10?formato=json");
  });
});

// ==================== bcb_serie_metadados ====================

// MUDANÇA DELIBERADA (sessão de D1): o baseline antigo pinava três caminhos em
// torno de `bcdata.sgs.{codigo}/metadados?formato=json`, e um deles — "usa os
// metadados da API quando disponíveis" — MOCKAVA 200 num endpoint que **não
// existe**. Medição de 11/08/2026 (`bcb/docs/04`): 404 `endpoint not found!`, nas
// três variantes de rota. A suíte estava verde sobre uma ficção, e em produção a
// tool gastava uma requisição por chamada para cair sempre no mesmo fallback.
// O que passa a ser pinado: UMA requisição (`ultimos/20`, que também serve de
// sonda de periodicidade), e a honestidade sobre a origem de cada campo.
// `unidade` e `especial` saíram do contrato porque nenhuma fonte os publica.
describe("bcb_serie_metadados", () => {
  const mensais20 = Array.from({ length: 20 }, (_, i) => ({
    data: `01/${String((i % 12) + 1).padStart(2, "0")}/${2025 + Math.floor(i / 12)}`,
    valor: String(i)
  }));

  it("não chama endpoint de metadados: uma requisição só, a dos últimos valores", async () => {
    mockFetch([["bcdata.sgs.433/dados/ultimos/20", mensais20]]);

    const out = structured(await call("bcb_serie_metadados", { codigo: 433 }));

    expect(fetchCalls).toEqual([
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/20?formato=json"
    ]);
    expect(fetchCalls.some(u => u.includes("/metadados"))).toBe(false);
    expect(out).toEqual({
      codigo: 433,
      nome: "IPCA - Variação mensal",
      periodicidade: "Mensal",
      categoria: "Inflação",
      fonte: "Banco Central do Brasil",
      ultimoValor: { data: mensais20[19].data, valor: 19 },
      urlConsulta: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json",
      urlUltimos10: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/10?formato=json",
      observacao:
        "Nome e categoria vêm do catálogo curado do servidor; a API do SGS não publica endpoint de metadados."
    });
  });

  it("série fora do catálogo ganha periodicidade inferida, marcada como inferida", async () => {
    mockFetch([["bcdata.sgs.99999/dados/ultimos/20", mensais20]]);

    const out = structured(await call("bcb_serie_metadados", { codigo: 99999 }));

    expect(out.nome).toBe("Série 99999");
    expect(out.categoria).toBe("Não categorizada");
    expect(out.periodicidade).toBe("Mensal");
    expect(out.periodicidadeInferida).toBe(true);
    expect(out.ultimoValor).toEqual({ data: mensais20[19].data, valor: 19 });
    expect(out.observacao).toContain("inferida do espaçamento");
  });

  it("série inexistente e fora do catálogo continua sendo isError", async () => {
    mockFetch([["bcdata.sgs.99999/dados/ultimos/20", []]]);

    const result = await call("bcb_serie_metadados", { codigo: 99999 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Erro ao consultar metadados da série 99999: Série não encontrada");
  });
});

// ==================== bcb_series_populares ====================

describe("bcb_series_populares", () => {
  it("sem filtro devolve objeto agrupado por categoria", async () => {
    const out = structured(await call("bcb_series_populares"));

    expect(out.totalSeries).toBe(SERIES_POPULARES.length);
    expect(Array.isArray(out.series)).toBe(false);

    const grupos = out.series as Record<string, unknown[]>;
    expect(Object.keys(grupos).length).toBe(out.categorias);
    expect(Object.values(grupos).reduce((n, g) => n + g.length, 0)).toBe(SERIES_POPULARES.length);
    expect(out.observacao).toBe("Use bcb_serie_valores ou bcb_serie_ultimos com o código para consultar os dados");
  });

  it("com filtro devolve array plano e casa por substring sem acento", async () => {
    const out = structured(await call("bcb_series_populares", { categoria: "inflacao" }));

    const series = out.series as Array<{ categoria: string }>;
    expect(Array.isArray(series)).toBe(true);
    expect(series.length).toBeGreaterThan(0);
    expect(series.every(s => normalizeString(s.categoria).includes("inflacao"))).toBe(true);
    expect(out.totalSeries).toBe(series.length);
  });

  it("nenhuma rede é tocada", async () => {
    await call("bcb_series_populares");
    expect(fetchCalls).toEqual([]);
  });
});

// ==================== bcb_buscar_serie ====================

// MUDANÇA DELIBERADA (sessão de D3, arbitragem 5): a busca deixou de ser
// puramente local. O baseline antigo — nenhuma chamada de rede, e a mensagem
// "Nenhuma série encontrada no catálogo interno" — era exatamente a lacuna que
// o D3 fecha, e está registrada no CHANGELOG. O que continua pinado aqui é o
// contrato que NÃO podia mudar: a camada curada vem primeiro, com nome e
// categoria revisados, e toda resposta carrega proveniência do índice.
// A bateria completa do índice está em `catalog.test.ts`.
describe("bcb_buscar_serie", () => {
  it("a camada curada continua vindo primeiro, com nome e categoria revisados", async () => {
    mockFetch([["action/package_list", { success: true, result: ["4390-taxa-de-juros---selic---mensal"] }]]);

    const out = structured(await call("bcb_buscar_serie", { termo: "selic" }));

    const series = out.series as Array<{ nome: string; categoria?: string; origem: string }>;
    expect(out.termo).toBe("selic");
    expect(series.length).toBeGreaterThan(0);
    expect(series[0].origem).toBe("curado");
    expect(
      series
        .filter(s => s.origem === "curado")
        .every(s => normalizeString(s.nome).includes("selic") || normalizeString(s.categoria ?? "").includes("selic"))
    ).toBe(true);
    expect(out.catalogo).toBeDefined();
  });

  it("termo sem correspondência deixou de afirmar inexistência", async () => {
    mockFetch([["action/package_list", { success: true, result: ["4390-taxa-de-juros---selic---mensal"] }]]);

    const out = structured(await call("bcb_buscar_serie", { termo: "zzz-inexistente" }));

    expect(out.totalEncontradas).toBe(0);
    expect(out.series).toEqual([]);
    expect(out.mensagem).toContain("não é prova de inexistência");
  });
});

// ==================== bcb_indicadores_atuais ====================

describe("bcb_indicadores_atuais", () => {
  it("consulta os 5 indicadores fixos e degrada por indicador", async () => {
    mockFetch([
      ["bcdata.sgs.432/dados/ultimos/1", [{ data: "01/03/2020", valor: "4.25" }]],
      ["bcdata.sgs.433/dados/ultimos/1", [{ data: "01/03/2020", valor: "0.07" }]],
      ["bcdata.sgs.13522/dados/ultimos/1", [{ data: "01/03/2020", valor: "3.30" }]],
      ["bcdata.sgs.1/dados/ultimos/1", [{ data: "01/03/2020", valor: "5.20" }]],
      ["bcdata.sgs.24364/dados/ultimos/1", []] // sem dados => erro por indicador, não da tool
    ]);

    const out = structured(await call("bcb_indicadores_atuais"));

    // MUDANÇA DELIBERADA (13/08/2026): o dólar do painel saiu da 3698 para a 1.
    // A 3698 é a PTAX MENSAL — media-se pelo dia 1º —, então um painel de
    // "indicadores atuais" mostrava 01/07 quando a série diária já trazia 12/08.
    // O rótulo da Selic também mudou: a 432 é a meta do Copom, não "a Selic".
    expect(typeof out.consultadoEm).toBe("string");
    expect(out.indicadores).toEqual([
      { indicador: "Selic - meta Copom (% a.a.)", codigo: 432, data: "01/03/2020", valor: 4.25 },
      { indicador: "IPCA mensal (%)", codigo: 433, data: "01/03/2020", valor: 0.07 },
      { indicador: "IPCA 12 meses (%)", codigo: 13522, data: "01/03/2020", valor: 3.3 },
      { indicador: "Dólar comercial - venda (diário)", codigo: 1, data: "01/03/2020", valor: 5.2 },
      { indicador: "IBC-Br (com ajuste sazonal)", codigo: 24364, erro: "Sem dados disponíveis" }
    ]);
  });
});

// ==================== bcb_variacao — GATE da arbitragem 4 ====================
//
// MIGRAÇÃO EXECUTADA (sessão de D1+D2). O motor passou a ser o
// `@sbissoli/mcp-stats`. O gate cobrou o que devia cobrar: contra o baseline
// gravado antes, a migração produziu EXATAMENTE DUAS diferenças, as duas
// previstas e explicáveis — e `bcb_comparar` não mudou em valor nenhum.
//
//  1. O bloco `derivacao` passou a existir. Era o ganho anunciado pela
//     arbitragem 4 ("ganhando de brinde a marcação derived que falta").
//  2. `estatisticas.maximo` e `.minimo` saem VERBATIM da fonte, sem
//     `toFixed(4)`. A divergência entre as duas tools (variacao arredondava os
//     extremos, comparar não) exigia escolher uma convenção; escolheu-se não
//     arredondar observação publicada pelo Banco Central, o que também alinha os
//     extremos com `valorInicial`/`valorFinal`, que nunca foram arredondados.
//     Fundamento e regra completa em `src/stats.ts`.
//
// Todo o resto segue pinado valor a valor: variação, diferença, média, amplitude,
// formatação, período e o erro de dados insuficientes.

// Sessão 10: os pins de NÍVEL saíram das séries 433/189 (IPCA/IGP-M), porque
// elas JÁ SÃO variação e agora são medidas por encadeamento — comparar a taxa de
// janeiro com a de dezembro publicava +23,81% para o IPCA de 2024 (acumulado
// real: 4,83%). A conta de nível segue pinada valor a valor, em séries de nível
// (dólar 1, dívida 4513, PIB 4382); o encadeamento ganha pins próprios abaixo.

describe("bcb_variacao (gate mcp-stats)", () => {
  it("números redondos: variação, extremos, média e amplitude", async () => {
    mockFetch([
      [
        "bcdata.sgs.1/dados",
        [
          { data: "01/01/2020", valor: "100.00" },
          { data: "01/02/2020", valor: "110.00" },
          { data: "01/03/2020", valor: "90.00" }
        ]
      ]
    ]);

    const out = structured(await call("bcb_variacao", { codigo: 1, dataInicial: "2020-01-01", dataFinal: "2020-03-31" }));

    expect(out).toEqual({
      serie: { codigo: 1, nome: "Taxa de câmbio - Livre - Dólar americano (venda) - diário", categoria: "Câmbio" },
      periodo: { dataInicial: "01/01/2020", dataFinal: "01/03/2020", totalPeriodos: 3 },
      analise: {
        metodo: "nivel",
        valorInicial: 100,
        valorFinal: 90,
        diferencaAbsoluta: -10,
        variacaoPercentual: -10,
        variacaoFormatada: "-10.00%"
      },
      estatisticas: { maximo: 110, minimo: 90, media: 100, amplitude: 20 },
      derivacao: {
        derived: true,
        motor: "@sbissoli/mcp-stats",
        nota: expect.stringContaining("calculadas por este servidor") as unknown as string
      }
    });
  });

  it("convenção de arredondamento: 4 casas em análise e estatísticas", async () => {
    mockFetch([
      [
        "bcdata.sgs.99999/dados",
        [
          { data: "01/01/2020", valor: "1.005" },
          { data: "01/02/2020", valor: "2.0075" },
          { data: "01/03/2020", valor: "3.333333" }
        ]
      ]
    ]);

    const out = structured(await call("bcb_variacao", { codigo: 99999 }));

    // A CONVENÇÃO UNIFICADA, medida: observação da fonte sai verbatim, número
    // calculado sai com 4 casas. Antes da migração, `maximo` saía 3.3333 aqui e
    // cru em `bcb_comparar`; agora as duas tools respondem igual, e a que mudou
    // foi esta. `minimo` já era exato, então não se move; média e amplitude
    // continuam idênticas ao baseline.
    expect(out.estatisticas).toEqual({
      maximo: 3.333333, // verbatim (era 3.3333 antes da migração)
      minimo: 1.005,
      media: 2.1153, // média bruta = 2.1152776666...
      amplitude: 2.3283 // (3.333333 - 1.005) = 2.328333 -> 2.3283
    });
    expect(out.analise).toEqual({
      metodo: "nivel", // fora do catálogo: nível, declarado
      valorInicial: 1.005, // valores de ponta NÃO são arredondados
      valorFinal: 3.333333,
      diferencaAbsoluta: 2.3283,
      variacaoPercentual: 231.6749, // ((3.333333-1.005)/1.005)*100 = 231.67492537...
      variacaoFormatada: "+231.67%"
    });
  });

  it("série que já é variação (IPCA 433): acumulado por encadeamento, diferença nula, metodo declarado", async () => {
    // Os 12 meses reais do IPCA de 2024. Este é o caso que a rodada paga achou:
    // a conta de nível dava +23,81%; o acumulado publicado pelo BCB (13522) é 4,83.
    mockFetch([
      [
        "bcdata.sgs.433/dados",
        [
          { data: "01/01/2024", valor: "0.42" }, { data: "01/02/2024", valor: "0.83" },
          { data: "01/03/2024", valor: "0.16" }, { data: "01/04/2024", valor: "0.38" },
          { data: "01/05/2024", valor: "0.46" }, { data: "01/06/2024", valor: "0.21" },
          { data: "01/07/2024", valor: "0.38" }, { data: "01/08/2024", valor: "-0.02" },
          { data: "01/09/2024", valor: "0.44" }, { data: "01/10/2024", valor: "0.56" },
          { data: "01/11/2024", valor: "0.39" }, { data: "01/12/2024", valor: "0.52" }
        ]
      ]
    ]);

    const out = structured(await call("bcb_variacao", { codigo: 433, dataInicial: "2024-01-01", dataFinal: "2024-12-31" }));

    expect(out.analise).toEqual({
      metodo: "encadeamento",
      valorInicial: 0.42,
      valorFinal: 0.52,
      diferencaAbsoluta: null,
      variacaoPercentual: 4.8313,
      variacaoFormatada: "+4.83%"
    });
    // Estatísticas seguem sendo das observações (as taxas mensais), não do acumulado.
    expect(out.estatisticas).toEqual({ maximo: 0.83, minimo: -0.02, media: 0.3942, amplitude: 0.85 });
    expect(out.derivacao).toEqual({
      derived: true,
      motor: "@sbissoli/mcp-stats",
      nota: expect.stringContaining("ACUMULADO no período por encadeamento") as unknown as string
    });
  });

  it("série que já é variação com queda no período (IGP-M 189, 2023): sinal certo", async () => {
    // A conta de nível dava +248% (última taxa 0,74 contra primeira −0,50); o
    // índice CAIU no ano.
    mockFetch([
      [
        "bcdata.sgs.189/dados",
        [
          { data: "01/01/2023", valor: "-0.50" }, { data: "01/02/2023", valor: "-0.06" },
          { data: "01/03/2023", valor: "0.05" }, { data: "01/04/2023", valor: "-0.95" },
          { data: "01/05/2023", valor: "-1.84" }, { data: "01/06/2023", valor: "-1.93" },
          { data: "01/07/2023", valor: "-0.72" }, { data: "01/08/2023", valor: "-0.14" },
          { data: "01/09/2023", valor: "0.37" }, { data: "01/10/2023", valor: "0.50" },
          { data: "01/11/2023", valor: "0.59" }, { data: "01/12/2023", valor: "0.74" }
        ]
      ]
    ]);

    const out = structured(await call("bcb_variacao", { codigo: 189, dataInicial: "2023-01-01", dataFinal: "2023-12-31" }));

    expect(out.analise.metodo).toBe("encadeamento");
    expect(out.analise.variacaoPercentual).toBe(-3.8643);
    expect(out.analise.variacaoFormatada).toBe("-3.86%");
  });

  it("série de acumulado móvel (IPCA 12 meses, 13522) é recusada com orientação, sem ir à rede", async () => {
    mockFetch([["bcdata.sgs.13522/dados", [{ data: "01/01/2024", valor: "4.51" }, { data: "01/12/2024", valor: "4.83" }]]]);

    const result = await call("bcb_variacao", { codigo: 13522, dataInicial: "2024-01-01", dataFinal: "2024-12-31" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("já é um acumulado em janela móvel de 12 meses");
    expect(result.content[0].text).toContain("bcb_serie_valores");
    expect(result.structuredContent).toBeUndefined();
    expect(fetchCalls).toEqual([]);
  });

  it("periodos > 1 troca o endpoint para /ultimos/N", async () => {
    mockFetch([
      [
        "dados/ultimos/6",
        [
          { data: "01/01/2020", valor: "1" },
          { data: "01/02/2020", valor: "2" }
        ]
      ]
    ]);

    await call("bcb_variacao", { codigo: 433, periodos: 6 });

    expect(fetchCalls[0]).toBe("https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/6?formato=json");
  });

  it("menos de 2 observações é isError com mensagem fixa", async () => {
    mockFetch([["bcdata.sgs.433/dados", [{ data: "01/01/2020", valor: "1" }]]]);

    const result = await call("bcb_variacao", { codigo: 433 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Dados insuficientes para calcular variação. São necessários pelo menos 2 valores."
    );
  });
});

// ==================== bcb_comparar — GATE da arbitragem 4 ====================

describe("bcb_comparar (gate mcp-stats)", () => {
  it("ranking desc por variação, com assimetria de arredondamento preservada", async () => {
    mockFetch([
      [
        "bcdata.sgs.4513/dados",
        [
          { data: "01/01/2020", valor: "100" },
          { data: "01/02/2020", valor: "90" },
          { data: "01/03/2020", valor: "95.5555" }
        ]
      ],
      [
        "bcdata.sgs.4382/dados",
        [
          { data: "01/01/2020", valor: "100" },
          { data: "01/02/2020", valor: "120" }
        ]
      ]
    ]);

    const out = structured(
      await call("bcb_comparar", { codigos: [4513, 4382], dataInicial: "2020-01-01", dataFinal: "2020-03-31" })
    );

    expect(out.periodo).toEqual({ dataInicial: "01/01/2020", dataFinal: "31/03/2020" });
    expect(out.totalSeries).toBe(2);
    expect(out.seriesComDados).toBe(2);
    expect(out.seriesComErro).toBe(0);
    expect(out.erros).toEqual([]);

    // 4382 varia +20%, 4513 varia -4.4445% => 4382 vem primeiro.
    expect(out.ranking).toEqual([
      {
        posicao: 1,
        codigo: 4382,
        nome: "PIB acumulado dos últimos 12 meses - Valores correntes (R$ milhões)",
        categoria: "Atividade Econômica",
        periodicidade: "Mensal",
        metodo: "nivel",
        totalRegistros: 2,
        valorInicial: 100,
        valorFinal: 120,
        variacaoPercentual: 20,
        variacaoFormatada: "+20.00%",
        maximo: 120,
        minimo: 100,
        media: 110
      },
      {
        posicao: 2,
        codigo: 4513,
        nome: "Dívida Líquida do Setor Público (% PIB) - Total - Setor público consolidado",
        categoria: "Fiscal",
        periodicidade: "Mensal",
        metodo: "nivel",
        totalRegistros: 3,
        valorInicial: 100,
        valorFinal: 95.5555,
        variacaoPercentual: -4.4445,
        variacaoFormatada: "-4.44%",
        // extremos crus (sem toFixed), média com 4 casas — a assimetria é o ponto
        maximo: 100,
        minimo: 90,
        media: 95.1852 // (100+90+95.5555)/3 = 95.18516666...
      }
    ]);
  });

  it("série que falha sai do ranking e vai para erros, sem derrubar a tool", async () => {
    mockFetch([
      [
        "bcdata.sgs.433/dados",
        [
          { data: "01/01/2020", valor: "100" },
          { data: "01/02/2020", valor: "110" }
        ]
      ],
      ["bcdata.sgs.189/dados", { __status: 404, __statusText: "Not Found" }]
    ]);

    const out = structured(
      await call("bcb_comparar", { codigos: [433, 189], dataInicial: "2020-01-01", dataFinal: "2020-02-28" })
    );

    expect(out.seriesComDados).toBe(1);
    expect(out.seriesComErro).toBe(1);
    expect((out.ranking as unknown[]).length).toBe(1);
    expect(out.erros).toEqual([
      {
        codigo: 189,
        nome: "IGP-M - Variação mensal",
        erro: "Série não encontrada ou sem dados para o período solicitado"
      }
    ]);
  });

  it("série sem dados no período entra em erros com motivo próprio", async () => {
    mockFetch([["bcdata.sgs.433/dados", []]]);

    const out = structured(
      await call("bcb_comparar", { codigos: [433], dataInicial: "2020-01-01", dataFinal: "2020-02-28" })
    );

    expect(out.erros).toEqual([{ codigo: 433, nome: "IPCA - Variação mensal", erro: "Sem dados no período" }]);
  });
});

// ==================== dispatcher ====================

describe("dispatchTool", () => {
  it("tool desconhecida devolve isError sem tocar a rede", async () => {
    const result = await call("bcb_inexistente");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Tool não encontrada: bcb_inexistente");
    expect(fetchCalls).toEqual([]);
  });

  it("toda resposta de sucesso carrega structuredContent E o espelho em texto", async () => {
    mockFetch([["action/package_list", { success: true, result: ["4390-taxa-de-juros---selic---mensal"] }]]);
    const result = await call("bcb_buscar_serie", { termo: "selic" });

    expect(result.structuredContent).toBeDefined();
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  });
});
