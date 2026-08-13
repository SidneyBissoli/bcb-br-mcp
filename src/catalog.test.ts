/**
 * Testes do índice de séries do portal (busca real, sessão de D3).
 *
 * As garantias que o decisor pediu na arbitragem 5 estão pinadas aqui, porque
 * são elas que justificam o desenho e não dá para verificá-las lendo o código:
 * cache de 24 h, renovação BLOQUEANTE na primeira busca após o vencimento, uma
 * requisição por renovação (mesmo com buscas simultâneas), zero requisição
 * quando ninguém busca, e nenhuma observação guardada — só código e slug.
 *
 * Rede nunca é tocada: global.fetch é mockado em cada teste.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CATALOGO_TTL_MS,
  CKAN_PACKAGE_LIST,
  buscarSeries,
  nomeDoSlug,
  normalizarMojibake,
  obterCatalogo,
  parsePackageList,
  _resetCatalogo,
  _seedCatalogo,
  type EntradaCatalogo
} from "./catalog.js";
import { dispatchTool, SERIES_POPULARES, type ToolResult } from "./tools.js";

const PACKAGE_LIST_FIXTURE = [
  "1-taxa-de-cambio---livre---dolar-americano-venda---diario",
  "433-indice-nacional-de-precos-ao-consumidor-amplo-ipca",
  "4390-taxa-de-juros---selic---mensal",
  "27825-serie-obscura-sem-curadoria---mensal",
  "27826-outra-serie-obscura-um-pouco-mais-longa-de-nome---mensal",
  "relatorio-de-inflacao", // dataset sem código: fora do índice
  "1-duplicata-do-mesmo-codigo" // código repetido: só o primeiro entra
];

let fetchCalls: string[] = [];

/** Mock de fetch para o CKAN: devolve corpo JSON ou um status HTTP de erro. */
function mockCkan(body: unknown | { __status: number }, atraso = 0): void {
  global.fetch = vi.fn(async (input: string | URL | Request) => {
    fetchCalls.push(String(input));
    if (atraso > 0) await new Promise(r => setTimeout(r, atraso));
    if (body && typeof body === "object" && "__status" in (body as Record<string, unknown>)) {
      return {
        ok: false,
        status: (body as { __status: number }).__status,
        statusText: "Bad Gateway",
        json: async () => ({})
      } as unknown as Response;
    }
    return { ok: true, status: 200, statusText: "OK", json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

function snapshotFalso(entradas: EntradaCatalogo[], obtidoEm: string, expiraEm: number) {
  return { entradas, obtidoEm, totalDatasets: entradas.length, expiraEm };
}

beforeEach(() => {
  fetchCalls = [];
  _resetCatalogo();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ==================== parsing ====================

describe("parsePackageList", () => {
  it("extrai código+slug, ignora dataset sem código e deduplica por código", () => {
    const { entradas, totalDatasets } = parsePackageList(PACKAGE_LIST_FIXTURE);

    expect(totalDatasets).toBe(7);
    expect(entradas.map(e => e.codigo)).toEqual([1, 433, 4390, 27825, 27826]);
    expect(entradas[0].slug).toBe("1-taxa-de-cambio---livre---dolar-americano-venda---diario");
  });

  it("é tolerante a payload que não é array e a itens não-string", () => {
    expect(parsePackageList(null)).toEqual({ entradas: [], totalDatasets: 0 });
    expect(parsePackageList([42, null, "7-serie"]).entradas).toEqual([{ codigo: 7, slug: "7-serie" }]);
  });
});

describe("nomeDoSlug", () => {
  it("trata `---` como separador de campo e `-` como espaço", () => {
    expect(nomeDoSlug("1-taxa-de-cambio---livre---dolar-americano-venda---diario")).toBe(
      "Taxa de cambio - livre - dolar americano venda - diario"
    );
  });
});

describe("normalizarMojibake", () => {
  it("conserta ISO-8859-1 servido como UTF-8 e não mexe em texto são", () => {
    expect(normalizarMojibake("CÃ¢mbio")).toBe("Câmbio");
    expect(normalizarMojibake("InflaÃ§Ã£o")).toBe("Inflação");
    expect(normalizarMojibake("Câmbio")).toBe("Câmbio");
    expect(normalizarMojibake("taxa-de-cambio")).toBe("taxa-de-cambio");
  });
});

// ==================== cache de 24 h ====================

describe("obterCatalogo (cache de 24 h, renovação bloqueante)", () => {
  it("busca uma vez e serve do cache dentro da validade", async () => {
    mockCkan({ success: true, result: PACKAGE_LIST_FIXTURE });

    const primeira = await obterCatalogo(5000, 1);
    const segunda = await obterCatalogo(5000, 1);

    expect(fetchCalls).toEqual([CKAN_PACKAGE_LIST]);
    expect(primeira.snapshot?.entradas).toHaveLength(5);
    expect(primeira.aviso).toBeUndefined();
    expect(segunda.snapshot).toBe(primeira.snapshot);
  });

  it("renova quando a validade de 24 h vence — e só então", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
    mockCkan({ success: true, result: PACKAGE_LIST_FIXTURE });

    const inicial = await obterCatalogo(5000, 1);
    expect(inicial.snapshot?.obtidoEm).toBe("2026-08-10T12:00:00.000Z");

    vi.setSystemTime(new Date(Date.now() + CATALOGO_TTL_MS - 1000));
    await obterCatalogo(5000, 1);
    expect(fetchCalls).toHaveLength(1); // ainda dentro da validade

    vi.setSystemTime(new Date(Date.now() + 2000));
    const renovado = await obterCatalogo(5000, 1);
    expect(fetchCalls).toHaveLength(2);
    expect(renovado.snapshot?.obtidoEm).not.toBe(inicial.snapshot?.obtidoEm);
  });

  it("duas buscas simultâneas após o vencimento fazem UMA requisição", async () => {
    mockCkan({ success: true, result: PACKAGE_LIST_FIXTURE }, 20);

    const [a, b] = await Promise.all([obterCatalogo(5000, 1), obterCatalogo(5000, 1)]);

    expect(fetchCalls).toHaveLength(1);
    expect(a.snapshot).toBe(b.snapshot);
  });

  it("renovação falhada com retrato anterior serve o retrato VENCIDO com aviso e data", async () => {
    _seedCatalogo(snapshotFalso([{ codigo: 99, slug: "99-serie-velha" }], "2026-08-01T00:00:00.000Z", Date.now() - 1));
    mockCkan({ __status: 502 });

    const { snapshot, aviso } = await obterCatalogo(5000, 1);

    expect(snapshot?.entradas).toEqual([{ codigo: 99, slug: "99-serie-velha" }]);
    expect(aviso).toContain("VENCIDO");
    expect(aviso).toContain("2026-08-01T00:00:00.000Z");
  });

  it("falha sem retrato anterior devolve snapshot nulo com aviso", async () => {
    mockCkan({ __status: 502 });

    const { snapshot, aviso } = await obterCatalogo(5000, 1);

    expect(snapshot).toBeNull();
    expect(aviso).toContain("indisponível");
  });

  it("rejeita payload do CKAN sem séries identificáveis em vez de cachear vazio", async () => {
    mockCkan({ success: true, result: ["relatorio-de-inflacao"] });

    const { snapshot, aviso } = await obterCatalogo(5000, 1);

    expect(snapshot).toBeNull();
    expect(aviso).toContain("nenhuma série identificável");
  });
});

// ==================== ranking ====================

describe("buscarSeries", () => {
  const entradas = parsePackageList(PACKAGE_LIST_FIXTURE).entradas;

  it("põe o catálogo curado na frente e não repete o mesmo código no índice", () => {
    const { total, series } = buscarSeries("cambio", SERIES_POPULARES, entradas, 50);

    expect(series[0].origem).toBe("curado");
    const codigosCurados = series.filter(s => s.origem === "curado").map(s => s.codigo);
    const codigosIndice = series.filter(s => s.origem === "indice").map(s => s.codigo);
    expect(codigosCurados).toContain(1); // 1 é curado, então NÃO aparece como índice
    expect(codigosIndice).not.toContain(1);
    expect(total).toBe(series.length);
  });

  it("achado do índice traz nome derivado do slug e a página do dataset", () => {
    const { series } = buscarSeries("obscura", SERIES_POPULARES, entradas, 50);

    expect(series[0]).toEqual({
      codigo: 27825,
      nome: "Serie obscura sem curadoria - mensal",
      origem: "indice",
      dataset: "https://dadosabertos.bcb.gov.br/dataset/27825-serie-obscura-sem-curadoria---mensal"
    });
    // Slug mais curto primeiro: o mais específico ganha do mais longo.
    expect(series.map(s => s.codigo)).toEqual([27825, 27826]);
  });

  it("termo numérico busca o código exato", () => {
    // A 433 é uma das 57 séries sem dataset no portal, daí `fonteNome: "medido"`:
    // o nome é herdado e o que se verificou contra a origem foi a periodicidade
    // e a ordem de grandeza. Ver `SeriePopular` e `bcb/docs/06`.
    expect(buscarSeries("433", SERIES_POPULARES, entradas, 50).series).toEqual([
      {
        codigo: 433, nome: "IPCA - Variação mensal", categoria: "Inflação",
        periodicidade: "Mensal", origem: "curado", fonteNome: "medido"
      }
    ]);
    expect(buscarSeries("27826", SERIES_POPULARES, entradas, 50).series[0].origem).toBe("indice");
    expect(buscarSeries("999999", SERIES_POPULARES, entradas, 50)).toEqual({ total: 0, series: [] });
  });

  it("vários termos são combinados com E, ignorando acentos", () => {
    const { series } = buscarSeries("IPCA serviços", SERIES_POPULARES, entradas, 50);
    expect(series.map(s => s.codigo)).toEqual([10844]);
  });

  it("`limite` corta a lista mas `total` continua sendo o total", () => {
    const { total, series } = buscarSeries("ipca", SERIES_POPULARES, entradas, 3);

    expect(series).toHaveLength(3);
    expect(total).toBeGreaterThan(3);
  });

  it("sem índice disponível, busca só na curadoria", () => {
    const { series } = buscarSeries("obscura", SERIES_POPULARES, null, 50);
    expect(series).toEqual([]);
  });
});

// ==================== a tool ====================

function structured(result: ToolResult): Record<string, unknown> {
  expect(result.isError).toBeUndefined();
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

describe("bcb_buscar_serie (busca real)", () => {
  it("devolve proveniência do índice, com data de obtenção e limite de cobertura", async () => {
    mockCkan({ success: true, result: PACKAGE_LIST_FIXTURE });

    const out = structured(await dispatchTool("bcb_buscar_serie", { termo: "obscura" }, 5000, 1));

    expect(out.termo).toBe("obscura");
    expect(out.totalEncontradas).toBe(2);
    const catalogo = out.catalogo as Record<string, unknown>;
    expect(catalogo.seriesIndexadas).toBe(5);
    expect(typeof catalogo.obtidoEm).toBe("string");
    expect(catalogo.cobertura).toContain("NÃO é o SGS inteiro");
    expect(out.avisos).toBeUndefined();
  });

  it("termo sem correspondência NÃO afirma inexistência", async () => {
    mockCkan({ success: true, result: PACKAGE_LIST_FIXTURE });

    const out = structured(await dispatchTool("bcb_buscar_serie", { termo: "zzz-inexistente" }, 5000, 1));

    expect(out.totalEncontradas).toBe(0);
    expect(out.series).toEqual([]);
    expect(out.mensagem).toContain("não é prova de inexistência");
    expect(out.sugestao).toContain("código da série");
  });

  it("portal fora do ar degrada para o catálogo curado, sinalizando em avisos", async () => {
    mockCkan({ __status: 502 });

    const out = structured(await dispatchTool("bcb_buscar_serie", { termo: "selic" }, 5000, 1));

    const catalogo = out.catalogo as Record<string, unknown>;
    expect(catalogo.origem).toBe("catálogo curado local");
    expect(catalogo.seriesIndexadas).toBe(SERIES_POPULARES.length);
    expect((out.avisos as string[])[0]).toContain("indisponível");
    expect((out.series as unknown[]).length).toBeGreaterThan(0);
  });

  it("corte por `limite` é declarado em `observacao`", async () => {
    mockCkan({ success: true, result: PACKAGE_LIST_FIXTURE });

    const out = structured(await dispatchTool("bcb_buscar_serie", { termo: "ipca", limite: 2 }, 5000, 1));

    expect((out.series as unknown[]).length).toBe(2);
    expect(out.observacao).toContain("de " + out.totalEncontradas);
  });

  it("uma segunda busca na mesma instância não toca a rede", async () => {
    mockCkan({ success: true, result: PACKAGE_LIST_FIXTURE });

    await dispatchTool("bcb_buscar_serie", { termo: "selic" }, 5000, 1);
    await dispatchTool("bcb_buscar_serie", { termo: "ipca" }, 5000, 1);

    expect(fetchCalls).toEqual([CKAN_PACKAGE_LIST]);
  });
});
