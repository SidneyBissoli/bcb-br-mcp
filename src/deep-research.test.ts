/**
 * O adapter do contrato Deep Research (`deep-research.ts`): o que é DELE, e
 * não dos gates gerais (provenance, output-contract, register): a forma do
 * id, a `url` por origem (dataset do portal × consulta pública do SGS), o
 * acervo reconstruído quando o índice renova, `fetch` de id fora do acervo, e
 * o documento renderizado a partir de `bcb_serie_metadados`.
 *
 * A rede nunca é tocada: `global.fetch` é mockado por teste.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchTool, TOOL_DEFINITIONS, type ToolResult } from "./tools.js";
import { _resetCatalogo, _seedCatalogo, CATALOGO_TTL_MS, CKAN_DATASET_BASE } from "./catalog.js";
import { _resetDeepResearch, DEEP_RESEARCH_LIMIT } from "./deep-research.js";

const OBS = [
  { data: "01/01/2026", valor: "0.50" },
  { data: "01/02/2026", valor: "0.60" }
];

function mockFetch(routes: Array<[match: string, body: unknown]>): void {
  global.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const hit = routes.find(([match]) => url.includes(match));
    if (!hit) throw new Error(`URL não roteada no mock: ${url}`);
    return { ok: true, status: 200, statusText: "OK", json: async () => hit[1] } as unknown as Response;
  }) as unknown as typeof fetch;
}

function seed(slugs: string[], obtidoEm = new Date().toISOString()): void {
  _seedCatalogo({
    entradas: slugs.map(slug => ({ codigo: Number(slug.split("-")[0]), slug })),
    obtidoEm,
    totalDatasets: slugs.length,
    expiraEm: Date.now() + CATALOGO_TTL_MS
  });
}

const call = (tool: string, args: Record<string, unknown>): Promise<ToolResult> => dispatchTool(tool, args, 5000, 1);
const objeto = (r: ToolResult) => r.structuredContent as Record<string, unknown>;

beforeEach(() => {
  _resetCatalogo();
  _resetDeepResearch();
});

afterEach(() => {
  vi.restoreAllMocks();
  _resetCatalogo();
  _resetDeepResearch();
});

describe("definições", () => {
  it("as duas entram em TOOL_DEFINITIONS como as outras: título, description em inglês, schemas JSON selados com proveniência multi", () => {
    for (const nome of ["search", "fetch"]) {
      const def = TOOL_DEFINITIONS.find(t => t.name === nome)!;
      expect(def.annotations.title).toMatch(/Deep Research/);
      expect(def.annotations.readOnlyHint).toBe(true);
      expect(def.description).toMatch(/OpenAI Deep Research contract/);
      expect(def.description).toMatch(/`bcb_\*` tools/);
      expect((def.inputSchema as Record<string, unknown>).additionalProperties).toBe(false);
      const out = def.outputSchema as { properties: Record<string, { type?: string }>; required: string[] };
      expect(out.properties.provenance.type).toBe("array");
      expect(out.required).toEqual(expect.arrayContaining(["provenance", "attribution"]));
    }
  });
});

describe("search", () => {
  it("o id é sgs:<código>; a url é a página do dataset quando há, senão a consulta pública do SGS", async () => {
    // 433 (IPCA) é curada SEM dataset no portal; 1 (dólar) é curada COM dataset.
    seed(["1-taxa-de-cambio---livre---dolar-americano-venda---diario"]);
    mockFetch([]);

    const ipca = objeto(await call("search", { query: "ipca variacao mensal" })).results as Array<{ id: string; url: string }>;
    expect(ipca[0].id).toBe("sgs:433");
    expect(ipca[0].url).toBe("https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/10?formato=json");

    const dolar = objeto(await call("search", { query: "dolar venda diario" })).results as Array<{ id: string; url: string }>;
    expect(dolar[0].id).toBe("sgs:1");
    expect(dolar[0].url).toBe(`${CKAN_DATASET_BASE}/1-taxa-de-cambio---livre---dolar-americano-venda---diario`);
  });

  it("série só do índice do portal entra com o nome derivado do slug e a página do dataset", async () => {
    seed(["99999-insuficiencia-de-direcionamento---credito-rural"]);
    mockFetch([]);
    const r = objeto(await call("search", { query: "insuficiencia direcionamento" })).results;
    expect(r).toEqual([
      {
        id: "sgs:99999",
        title: "Insuficiencia de direcionamento - credito rural",
        url: `${CKAN_DATASET_BASE}/99999-insuficiencia-de-direcionamento---credito-rural`
      }
    ]);
  });

  it("corta em DEEP_RESEARCH_LIMIT e o texto é o JSON do objeto do contrato, sem rodapé", async () => {
    seed([]);
    mockFetch([]);
    const r = await call("search", { query: "taxa" });
    const results = objeto(r).results as unknown[];
    expect(results.length).toBeLessThanOrEqual(DEEP_RESEARCH_LIMIT);
    expect(results.length).toBeGreaterThan(0);
    expect(r.content).toHaveLength(1);
    expect(JSON.parse(r.content[0].text)).toEqual({ results });
  });

  it("consulta sem casamento devolve results vazio, com proveniência", async () => {
    seed([]);
    mockFetch([]);
    const o = objeto(await call("search", { query: "zzzznaoexiste" }));
    expect(o.results).toEqual([]);
    expect(Array.isArray(o.provenance)).toBe(true);
  });

  it("reconstrói o acervo quando o índice do portal renova", async () => {
    seed(["77777-serie-antiga"], new Date(Date.now() - 1000).toISOString());
    mockFetch([]);
    expect((objeto(await call("search", { query: "antiga" })).results as unknown[]).length).toBe(1);

    _resetCatalogo();
    seed(["88888-serie-nova"]);
    expect((objeto(await call("search", { query: "antiga" })).results as unknown[]).length).toBe(0);
    expect((objeto(await call("search", { query: "nova" })).results as unknown[]).length).toBe(1);
  });
});

describe("fetch", () => {
  it("id fora do acervo ou malformado é erro de tool sem tocar a rede", async () => {
    seed([]);
    mockFetch([]);
    for (const id of ["sgs:0", "sgs:abc", "mun:3106200", "x"]) {
      const r = await call("fetch", { id });
      expect(r.isError, id).toBe(true);
      expect(r.content[0].text).toMatch(/não encontrado/);
    }
  });

  it("renderiza o documento a partir de bcb_serie_metadados e devolve a proveniência dele", async () => {
    seed([]);
    mockFetch([["bcdata.sgs.433", OBS]]);
    const r = await call("fetch", { id: "sgs:433" });
    const o = objeto(r);
    expect(o.id).toBe("sgs:433");
    expect(o.title).toBe("IPCA - Variação mensal");
    expect(o.url).toBe("https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/10?formato=json");
    expect(o.text).toContain("# IPCA - Variação mensal");
    expect(o.text).toContain("Categoria: Inflação");
    expect(o.text).toContain("Último valor publicado: 0.6 em 01/02/2026");
    expect(o.text).toContain("`bcb_serie_ultimos`");
    expect(o.metadata).toMatchObject({ codigo: 433, origem: "curado", fonteNome: "medido", periodicidade: "Mensal" });
    // A proveniência é a de `bcb_serie_metadados`: SGS + catálogo curado.
    const fontes = (o.provenance as Array<{ source: string }>).map(b => b.source);
    expect(fontes.some(f => /SGS/.test(f))).toBe(true);
    expect(fontes.some(f => /cat[áa]logo/i.test(f))).toBe(true);
    expect(JSON.parse(r.content[0].text)).toEqual({ id: o.id, title: o.title, text: o.text, url: o.url, metadata: o.metadata });
  });

  it("falha da origem em série do acervo vira erro de tool, não documento vazio", async () => {
    seed(["99999-serie-do-portal"]);
    global.fetch = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const r = await call("fetch", { id: "sgs:99999" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Falha em `fetch`/);
  });
});
