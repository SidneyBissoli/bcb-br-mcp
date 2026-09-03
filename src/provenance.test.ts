/**
 * Gate do canal de proveniência (D4).
 *
 * Existe pelo mesmo motivo do `output-contract.test.ts`: nada mais pega o que
 * ele pega. O SDK só exige que `structuredContent` exista, e o
 * `output-contract` prova que o payload casa com o schema anunciado — mas um
 * bloco de proveniência pode casar com o schema e ainda assim estar MENTINDO,
 * que é a única falha que importa aqui.
 *
 * O caso mais caro é o `retrieved_at` servido de cache: a resposta é
 * bem-formada, o schema aceita, e a data afirmada é de um dia atrás. Foi a
 * medição de abertura da sessão (`bcb/docs/07`) que mostrou que isso acontece de
 * verdade — a segunda busca responde em milissegundos SEM tocar a origem.
 *
 * A rede nunca é tocada: `global.fetch` é mockado por teste.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchTool, TOOL_DEFINITIONS, type ToolResult } from "./tools.js";
import { _resetCatalogo, _seedCatalogo, CATALOGO_TTL_MS } from "./catalog.js";
import { _resetDeepResearch } from "./deep-research.js";
import { FONTES_BCB, LICENCA_ODBL } from "./provenance.js";
import { DISCLAIMER_PTAX, QUALIFICACAO_PARIDADE } from "./shared.js";

// ==================== fixtures ====================

const OBS_MENSAL = [
  { data: "01/01/2026", valor: "0.50" },
  { data: "01/02/2026", valor: "0.60" },
  { data: "01/03/2026", valor: "0.70" }
];

const COTACAO = {
  value: [
    {
      dataHoraCotacao: "2026-08-12 13:09:02.148",
      cotacaoCompra: 5.4,
      cotacaoVenda: 5.41,
      paridadeCompra: 1.16,
      paridadeVenda: 1.17,
      tipoBoletim: "Fechamento"
    }
  ]
};

function mockFetch(routes: Array<[match: string, body: unknown]>): void {
  global.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const hit = routes.find(([match]) => url.includes(match));
    if (!hit) throw new Error(`URL não roteada no mock: ${url}`);
    return { ok: true, status: 200, statusText: "OK", json: async () => hit[1] } as unknown as Response;
  }) as unknown as typeof fetch;
}

function call(tool: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return dispatchTool(tool, args, 5000, 1);
}

function payload(r: ToolResult): Record<string, unknown> {
  expect(r.isError).toBeUndefined();
  return r.structuredContent as Record<string, unknown>;
}

/** Primeiro bloco, seja a tool de fonte única ou multi-procedência. */
function bloco(r: ToolResult): Record<string, unknown> {
  const p = payload(r).provenance;
  return (Array.isArray(p) ? p[0] : p) as Record<string, unknown>;
}

function blocos(r: ToolResult): Array<Record<string, unknown>> {
  const p = payload(r).provenance;
  return (Array.isArray(p) ? p : [p]) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  _resetCatalogo();
  _resetDeepResearch();
});

afterEach(() => {
  vi.restoreAllMocks();
  _resetCatalogo();
  _resetDeepResearch();
});

// ==================== fiação ====================

describe("fiação: toda tool de sucesso carrega o canal", () => {
  // O elenco cobre as 17 tools. Se uma tool nova entrar sem caso aqui, a
  // asserção de cobertura no fim deste bloco falha — é o que impede que a
  // proveniência dependa de alguém lembrar.
  const CASOS: Array<{ tool: string; args: Record<string, unknown>; rotas: Array<[string, unknown]> }> = [
    { tool: "bcb_series_populares", args: {}, rotas: [] },
    { tool: "bcb_serie_valores", args: { codigo: 433 }, rotas: [["bcdata.sgs.433", OBS_MENSAL]] },
    { tool: "bcb_serie_ultimos", args: { codigo: 433, quantidade: 3 }, rotas: [["bcdata.sgs.433", OBS_MENSAL]] },
    { tool: "bcb_serie_metadados", args: { codigo: 433 }, rotas: [["bcdata.sgs.433", OBS_MENSAL]] },
    {
      tool: "bcb_buscar_serie",
      args: { termo: "ipca" },
      rotas: [["package_list", { success: true, result: ["433-ipca-variacao-mensal"] }]]
    },
    { tool: "bcb_indicadores_atuais", args: {}, rotas: [["bcdata.sgs.", OBS_MENSAL.slice(0, 1)]] },
    {
      tool: "bcb_variacao",
      args: { codigo: 433, dataInicial: "2026-01-01", dataFinal: "2026-03-31" },
      rotas: [["bcdata.sgs.433", OBS_MENSAL]]
    },
    {
      tool: "bcb_comparar",
      args: { codigos: [433, 189], dataInicial: "2026-01-01", dataFinal: "2026-03-31" },
      rotas: [["bcdata.sgs.", OBS_MENSAL]]
    },
    {
      tool: "bcb_correlacao",
      args: { codigos: [433, 189], dataInicial: "2026-01-01", dataFinal: "2026-03-31" },
      rotas: [["bcdata.sgs.", OBS_MENSAL]]
    },
    {
      tool: "bcb_deflacionar",
      args: { codigo: 433, dataInicial: "2026-01-01", dataFinal: "2026-03-31" },
      rotas: [["bcdata.sgs.", OBS_MENSAL]]
    },
    {
      tool: "bcb_focus_expectativas",
      args: { horizonte: "anual", indicador: "IPCA", referencia: "2027" },
      rotas: [["ExpectativasMercadoAnuais", { value: [{ Indicador: "IPCA", Data: "2026-08-12", DataReferencia: "2027", Mediana: 4.2 }] }]]
    },
    {
      tool: "bcb_focus_selic",
      args: {},
      rotas: [["ExpectativasMercadoSelic", { value: [{ Indicador: "Selic", Data: "2026-08-12", Reuniao: "R6/2026", Mediana: 10.5 }] }]]
    },
    {
      tool: "bcb_focus_referencias",
      args: { escopo: "anual" },
      rotas: [["Expectativas", { value: [{ Indicador: "IPCA", DataReferencia: "2027" }] }]]
    },
    { tool: "bcb_cambio_cotacao", args: { moeda: "USD" }, rotas: [["CotacaoDolar", COTACAO]] },
    {
      tool: "bcb_cambio_moedas",
      args: {},
      rotas: [["Moedas", { value: [{ simbolo: "EUR", nomeFormatado: "Euro", tipoMoeda: "B" }] }]]
    },
    // Contrato Deep Research: `search` herda as duas procedências de
    // `bcb_buscar_serie`; `fetch` as de `bcb_serie_metadados`.
    {
      tool: "search",
      args: { query: "ipca" },
      rotas: [["package_list", { success: true, result: ["433-ipca-variacao-mensal"] }]]
    },
    {
      tool: "fetch",
      args: { id: "sgs:433" },
      rotas: [
        ["package_list", { success: true, result: ["433-ipca-variacao-mensal"] }],
        ["bcdata.sgs.433", OBS_MENSAL]
      ]
    }
  ];

  it("cobre TODA tool publicada — nenhuma fica de fora por esquecimento", () => {
    const cobertas = new Set(CASOS.map(c => c.tool));
    const publicadas = TOOL_DEFINITIONS.map(t => t.name);
    expect([...publicadas].filter(n => !cobertas.has(n))).toEqual([]);
  });

  for (const caso of CASOS) {
    it(`${caso.tool} devolve provenance + attribution`, async () => {
      mockFetch(caso.rotas);
      const r = await call(caso.tool, caso.args);
      const p = payload(r);

      expect(p.provenance).toBeDefined();
      expect(Array.isArray(p.attribution)).toBe(true);
      expect((p.attribution as string[]).length).toBeGreaterThan(0);

      for (const b of blocos(r)) {
        expect(typeof b.source).toBe("string");
        expect(typeof b.source_url).toBe("string");
        expect(typeof b.citation).toBe("string");
        expect(typeof b.retrieved_at).toBe("string");
        // Piso legal do contrato: licença nunca sai vazia.
        expect(b.license).toBeTruthy();
      }

      // Espelho em `_meta`: mesmo conteúdo, fora de banda.
      const meta = r._meta as Record<string, unknown>;
      expect(meta["br.com.sidneybissoli.bcb/provenance"]).toEqual(p.provenance);
      expect(meta["br.com.sidneybissoli.bcb/attribution"]).toEqual(p.attribution);
    });
  }
});

// ==================== o instante da extração ====================

describe("retrieved_at é o instante REAL da extração", () => {
  it("usa o instante do fetch, não o do fim do processamento", async () => {
    mockFetch([["bcdata.sgs.433", OBS_MENSAL]]);
    const antes = Date.now();
    const r = await call("bcb_serie_valores", { codigo: 433 });
    const depois = Date.now();

    const t = new Date(bloco(r).retrieved_at as string).getTime();
    expect(t).toBeGreaterThanOrEqual(antes - 1000);
    expect(t).toBeLessThanOrEqual(depois + 1000);
  });

  it("resposta servida do cache do índice mantém o instante do fetch ORIGINAL", async () => {
    // ESTE é o caso que o D4 existe para não errar. O índice do portal vale 24 h
    // e responde sem tocar a origem; carimbar o "agora" afirmaria uma extração
    // que não aconteceu, com erro de até um dia no campo de peso legal.
    const ontem = new Date(Date.now() - 20 * 60 * 60 * 1000);
    _seedCatalogo({
      entradas: [{ codigo: 433, slug: "433-ipca-variacao-mensal" }],
      obtidoEm: ontem.toISOString(),
      totalDatasets: 1,
      expiraEm: Date.now() + CATALOGO_TTL_MS
    });
    // Sem rota: se tocar a rede, o mock estoura — é parte da asserção.
    mockFetch([]);

    const r = await call("bcb_buscar_serie", { termo: "ipca" });
    const doPortal = blocos(r).find(b => String(b.source).includes("Portal"));

    expect(doPortal).toBeDefined();
    // Segundo, não milissegundo: a serialização do contrato é determinística e
    // trunca no segundo. O que importa é o DIA, e ele é o de ontem.
    expect(Math.floor(new Date(doPortal!.retrieved_at as string).getTime() / 1000)).toBe(
      Math.floor(ontem.getTime() / 1000)
    );
  });

  it("`search` servido do cache do índice também mantém o instante do fetch ORIGINAL", async () => {
    // A busca do contrato Deep Research passa pelo mesmo índice de 24 h; o
    // bloco do portal tem de contar a mesma verdade que o de `bcb_buscar_serie`.
    const ontem = new Date(Date.now() - 20 * 60 * 60 * 1000);
    _seedCatalogo({
      entradas: [{ codigo: 433, slug: "433-ipca-variacao-mensal" }],
      obtidoEm: ontem.toISOString(),
      totalDatasets: 1,
      expiraEm: Date.now() + CATALOGO_TTL_MS
    });
    mockFetch([]);

    const r = await call("search", { query: "ipca" });
    const doPortal = blocos(r).find(b => String(b.source).includes("Portal"));

    expect(doPortal).toBeDefined();
    expect(Math.floor(new Date(doPortal!.retrieved_at as string).getTime() / 1000)).toBe(
      Math.floor(ontem.getTime() / 1000)
    );
  });

  it("chamadas concorrentes não contaminam o instante uma da outra", async () => {
    // Motivo de o coletor ser AsyncLocalStorage e não variável de módulo: no
    // hospedado, um isolate atende requisições sobrepostas.
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const lenta = url.includes("bcdata.sgs.1/");
      await new Promise(r => setTimeout(r, lenta ? 60 : 1));
      return { ok: true, status: 200, statusText: "OK", json: async () => OBS_MENSAL } as unknown as Response;
    }) as unknown as typeof fetch;

    const [lenta, rapida] = await Promise.all([
      call("bcb_serie_valores", { codigo: 1 }),
      call("bcb_serie_valores", { codigo: 433 })
    ]);

    // Cada bloco aponta para a PRÓPRIA série, não para a da outra chamada.
    expect(bloco(lenta).source_url).toContain("bcdata.sgs.1/");
    expect(bloco(rapida).source_url).toContain("bcdata.sgs.433/");
    // A rápida terminou antes; se houvesse vazamento, ela herdaria o instante da lenta.
    expect(new Date(bloco(rapida).retrieved_at as string).getTime()).toBeLessThanOrEqual(
      new Date(bloco(lenta).retrieved_at as string).getTime()
    );
  });
});

// ==================== procedências ====================

describe("multi-procedência: um bloco por procedência, licenças nunca fundidas", () => {
  it("bcb_cambio_cotacao em USD tem UMA procedência", async () => {
    mockFetch([["CotacaoDolar", COTACAO]]);
    const r = await call("bcb_cambio_cotacao", { moeda: "USD" });
    expect(blocos(r)).toHaveLength(1);
    expect(blocos(r)[0].source).toContain("PTAX");
  });

  it("bcb_cambio_cotacao em moeda não-USD acrescenta o bloco da agência de informação", async () => {
    // A paridade não é apurada pelo BCB (docs/01 §3): anunciá-la como dado do
    // BCB sem qualificar seria incorreto.
    mockFetch([["CotacaoMoeda", COTACAO]]);
    const r = await call("bcb_cambio_cotacao", { moeda: "EUR" });

    const fontes = blocos(r).map(b => String(b.source));
    expect(fontes).toHaveLength(2);
    expect(fontes.some(f => f.includes("Refinitiv"))).toBe(true);
  });

  it("bcb_series_populares não afirma extração no BCB: a fonte é o catálogo do servidor", async () => {
    mockFetch([]); // zero requisição — se tocar a rede, estoura
    const r = await call("bcb_series_populares", {});
    expect(String(bloco(r).source)).toContain("catálogo curado");
  });

  it("bcb_serie_metadados separa o que veio do SGS agora do que veio do catálogo", async () => {
    mockFetch([["bcdata.sgs.433", OBS_MENSAL]]);
    const r = await call("bcb_serie_metadados", { codigo: 433 });
    const fontes = blocos(r).map(b => String(b.source));
    expect(fontes.some(f => f.includes("SGS"))).toBe(true);
    expect(fontes.some(f => f.includes("catálogo curado"))).toBe(true);
  });
});

// ==================== licença e avisos ====================

describe("obrigações da ODbL e da PTAX", () => {
  it("as três APIs do BCB declaram ODbL v1.0 com URL canônico em HTTPS", () => {
    for (const chave of ["SGS", "FOCUS", "PTAX"] as const) {
      expect(FONTES_BCB[chave].license).toBe(LICENCA_ODBL);
    }
    expect(LICENCA_ODBL.id).toBe("ODbL-1.0");
    // Medido em 13/08/2026: o URL que o CKAN declara resolve, mas só sem TLS.
    expect(LICENCA_ODBL.url).toMatch(/^https:\/\/opendatacommons\.org\//);
  });

  it("o disclaimer da PTAX vai no bloco, verbatim", () => {
    expect(FONTES_BCB.PTAX.notices).toContain(DISCLAIMER_PTAX);
  });

  it("o bloco da paridade qualifica a origem de terceiro", () => {
    expect(FONTES_BCB.PARIDADE_REFINITIV.notices).toContain(QUALIFICACAO_PARIDADE);
  });
});

// ==================== derivação ====================

describe("derived marca o que o servidor calculou", () => {
  it("bcb_variacao sai como derivada, com a nota dizendo o quê", async () => {
    mockFetch([["bcdata.sgs.433", OBS_MENSAL]]);
    const r = await call("bcb_variacao", { codigo: 433, dataInicial: "2026-01-01", dataFinal: "2026-03-31" });
    // A projeção `concise` é o piso legal e não mostra `derived`; o dado está no
    // payload (`derivacao`) e o bloco canônico carrega a nota.
    expect(payload(r).derivacao).toBeDefined();
    expect(bloco(r).citation).toContain("série 433");
  });

  it("bcb_serie_valores sem harmonizar NÃO é derivada", async () => {
    mockFetch([["bcdata.sgs.433", OBS_MENSAL]]);
    const r = await call("bcb_serie_valores", { codigo: 433 });
    expect(payload(r).harmonizacao).toBeUndefined();
  });
});

// ==================== competência ====================

describe("data_vintage sai de dado já em mãos, sem requisição a mais", () => {
  it("no SGS, é o intervalo coberto pelas observações", async () => {
    mockFetch([["bcdata.sgs.433", OBS_MENSAL]]);
    const r = await call("bcb_serie_valores", { codigo: 433 });
    expect(bloco(r).data_vintage).toBe("01/01/2026–01/03/2026");
  });

  it("no Focus, é a data da COLETA — a fonte é vintage por construção", async () => {
    mockFetch([
      ["ExpectativasMercadoAnuais", { value: [{ Indicador: "IPCA", Data: "2026-08-12", DataReferencia: "2027", Mediana: 4.2 }] }]
    ]);
    const r = await call("bcb_focus_expectativas", { horizonte: "anual", indicador: "IPCA", referencia: "2027" });
    expect(bloco(r).data_vintage).toBe("2026-08-12");
  });
});
