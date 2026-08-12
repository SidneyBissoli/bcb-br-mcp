/**
 * Bateria do módulo de engenharia de série (D1).
 *
 * O que estes testes pinam não é preferência de desenho: é o comportamento
 * medido da origem em `bcb/docs/04-limites-sgs-medidos.md`. O 406 dispara o
 * chunking; a janela decenal é fatiada mesmo sendo legal, porque custa 10–20 s e
 * o worker corta em 10; `ultimos/N` acima de 20 é atendido por janela de datas
 * porque a origem devolve 400 em qualquer periodicidade.
 *
 * Rede nunca é tocada: `global.fetch` é mockado por teste.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  FATIA_ANOS,
  alinharSeries,
  buscarSerieSgs,
  buscarUltimosSgs,
  chaveMes,
  construirDeflator,
  deflacionar,
  fatiarJanela,
  formatarDataSgs,
  harmonizar,
  inferirPeriodicidade,
  parseDataSgs,
  sondarPeriodicidade
} from "./series.js";

// ==================== mock ====================

let urls: string[] = [];

/** Roteia por substring da URL. Valor pode ser array (200) ou `{__status}`. */
function mock(rotas: Array<[string, unknown]>): void {
  urls = [];
  global.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const hit = rotas.find(([m]) => url.includes(m));
    if (!hit) throw new Error(`URL não roteada: ${url}`);
    const corpo = hit[1] as Record<string, unknown>;
    if (corpo && typeof corpo === "object" && "__status" in corpo) {
      return {
        ok: false,
        status: corpo.__status as number,
        statusText: "Not Acceptable",
        json: async () => ({ error: "janela" })
      } as unknown as Response;
    }
    return { ok: true, status: 200, statusText: "OK", json: async () => hit[1] } as unknown as Response;
  }) as unknown as typeof fetch;
}

/** Gera observações diárias (dias corridos) a partir de uma data ISO. */
function diarias(inicioIso: string, n: number): Array<{ data: string; valor: string }> {
  const t0 = Date.parse(`${inicioIso}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => ({
    data: formatarDataSgs(t0 + i * 86400000),
    valor: String(i)
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ==================== datas e periodicidade ====================

describe("datas do SGS", () => {
  it("faz ida e volta em dd/MM/yyyy", () => {
    const t = parseDataSgs("29/02/2024");
    expect(t).not.toBeNull();
    expect(formatarDataSgs(t as number)).toBe("29/02/2024");
  });

  it("recusa formato que não é o do SGS", () => {
    expect(parseDataSgs("2024-02-29")).toBeNull();
    expect(parseDataSgs("1/2/2024")).toBeNull();
  });
});

describe("inferirPeriodicidade", () => {
  it("diária com buracos de fim de semana continua diária", () => {
    // dias úteis: espaçamento 1,1,1,1,3 — a mediana é 1
    const obs = [
      { data: "05/08/2026" }, { data: "06/08/2026" }, { data: "07/08/2026" },
      { data: "10/08/2026" }, { data: "11/08/2026" }
    ];
    expect(inferirPeriodicidade(obs)).toBe("diaria");
  });

  it("reconhece mensal, trimestral e anual", () => {
    expect(inferirPeriodicidade([
      { data: "01/01/2026" }, { data: "01/02/2026" }, { data: "01/03/2026" }, { data: "01/04/2026" }
    ])).toBe("mensal");

    expect(inferirPeriodicidade([
      { data: "01/01/2025" }, { data: "01/04/2025" }, { data: "01/07/2025" }, { data: "01/10/2025" }
    ])).toBe("trimestral");

    expect(inferirPeriodicidade([
      { data: "01/01/2022" }, { data: "01/01/2023" }, { data: "01/01/2024" }, { data: "01/01/2025" }
    ])).toBe("anual");
  });

  it("menos de 3 observações não afirma periodicidade", () => {
    expect(inferirPeriodicidade([{ data: "01/01/2026" }, { data: "01/02/2026" }])).toBeNull();
  });

  it("um buraco grande não desloca a inferência (mediana, não média)", () => {
    // diária com um recesso de 40 dias no meio
    const obs = [
      { data: "01/06/2026" }, { data: "02/06/2026" }, { data: "03/06/2026" },
      { data: "13/07/2026" }, { data: "14/07/2026" }, { data: "15/07/2026" }
    ];
    expect(inferirPeriodicidade(obs)).toBe("diaria");
  });
});

// ==================== janelas ====================

describe("fatiarJanela", () => {
  it("janela estreita continua uma só", () => {
    expect(fatiarJanela("01/01/2024", "31/12/2024")).toEqual([{ inicio: "01/01/2024", fim: "31/12/2024" }]);
  });

  it("fatia sem sobreposição e sem buraco", () => {
    const janelas = fatiarJanela("01/01/2010", "01/01/2025");

    expect(janelas.length).toBe(Math.ceil(15 / FATIA_ANOS));
    expect(janelas[0]).toEqual({ inicio: "01/01/2010", fim: "31/12/2012" });
    expect(janelas[1].inicio).toBe("01/01/2013");
    expect(janelas[janelas.length - 1].fim).toBe("01/01/2025");

    // emenda perfeita: cada início é o dia seguinte ao fim anterior
    for (let i = 1; i < janelas.length; i++) {
      const anterior = parseDataSgs(janelas[i - 1].fim) as number;
      const atual = parseDataSgs(janelas[i].inicio) as number;
      expect(atual - anterior).toBe(86400000);
    }
  });

  it("nenhuma fatia excede o limite da origem", () => {
    for (const j of fatiarJanela("01/01/1990", "11/08/2026")) {
      const largura = ((parseDataSgs(j.fim) as number) - (parseDataSgs(j.inicio) as number)) / (365.25 * 86400000);
      expect(largura).toBeLessThanOrEqual(FATIA_ANOS);
    }
  });
});

// ==================== busca com chunking ====================

describe("buscarSerieSgs", () => {
  it("janela estreita gasta UMA requisição e não anuncia chunking", async () => {
    mock([["bcdata.sgs.433/dados", [{ data: "01/01/2020", valor: "1" }, { data: "01/02/2020", valor: "2" }]]]);

    const r = await buscarSerieSgs({ codigo: 433, dataInicial: "01/01/2020", dataFinal: "28/02/2020" }, 5000, 1);

    expect(urls.length).toBe(1);
    expect(r.requisicoes).toBe(1);
    expect(r.chunking).toBeUndefined();
    expect(r.janelaAplicada).toBeUndefined();
    expect(r.observacoes.length).toBe(2);
  });

  it("406 com as duas datas: fatia, funde e não duplica a emenda", async () => {
    // A sonda falha (série fora do alcance dela), a consulta direta leva 406, e
    // é o 406 que dispara o chunking — o caminho REATIVO.
    // Cada fatia devolve as mesmas 3 datas de propósito: prova que a fusão
    // deduplica em vez de concatenar.
    mock([
      ["dados/ultimos/20", { __status: 500 }],
      ["dataInicial=01/01/2010&dataFinal=01/01/2025", { __status: 406 }],
      ["dados?formato=json&dataInicial", diarias("2015-01-01", 3)]
    ]);

    const r = await buscarSerieSgs({ codigo: 1, dataInicial: "01/01/2010", dataFinal: "01/01/2025" }, 5000, 1);

    expect(r.chunking).toEqual({ janelas: 5, fatiaAnos: FATIA_ANOS });
    expect(r.requisicoes).toBe(7); // sonda + direta recusada + 5 fatias
    expect(r.observacoes.map(o => o.data)).toEqual(["01/01/2015", "02/01/2015", "03/01/2015"]);
  });

  it("406 sem dataInicial aplica a janela máxima da origem e diz que aplicou", async () => {
    let chamada = 0;
    urls = [];
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      chamada++;
      if (chamada === 1) {
        return { ok: false, status: 406, statusText: "Not Acceptable", json: async () => ({}) } as unknown as Response;
      }
      return { ok: true, status: 200, statusText: "OK", json: async () => diarias("2020-01-01", 3) } as unknown as Response;
    }) as unknown as typeof fetch;

    const r = await buscarSerieSgs({ codigo: 1 }, 5000, 1);

    expect(r.janelaAplicada).toBeDefined();
    expect(r.janelaAplicada?.motivo).toContain("10 anos");
    expect(r.janelaAplicada?.motivo).toContain("406");
    expect(r.janelaAplicada?.dataFinal).toBe(formatarDataSgs(Date.now()));
    // 10 anos em fatias de 3 => 4 janelas
    expect(r.chunking?.janelas).toBe(4);
  });

  it("janela larga: a sonda evita a requisição cara quando a série é diária", async () => {
    mock([
      ["dados/ultimos/20", diarias("2026-07-15", 20)],
      ["bcdata.sgs.1/dados?formato=json&dataInicial", diarias("2015-01-01", 3)]
    ]);

    const r = await buscarSerieSgs({ codigo: 1, dataInicial: "01/01/2015", dataFinal: "01/01/2024" }, 5000, 1);

    expect(urls[0]).toContain("/dados/ultimos/20");
    expect(r.chunking).toEqual({ janelas: 3, fatiaAnos: FATIA_ANOS });
    expect(r.requisicoes).toBe(4); // sonda + 3 fatias
    // a consulta direta de 9 anos NUNCA foi feita
    expect(urls.some(u => u.includes("dataInicial=01/01/2015&dataFinal=01/01/2024"))).toBe(false);
  });

  it("janela larga em série mensal segue em uma requisição só", async () => {
    mock([
      ["dados/ultimos/20", [
        { data: "01/01/2025", valor: "1" }, { data: "01/02/2025", valor: "2" },
        { data: "01/03/2025", valor: "3" }, { data: "01/04/2025", valor: "4" }
      ]],
      ["bcdata.sgs.433/dados?formato=json&dataInicial", [{ data: "01/01/1995", valor: "1" }]]
    ]);

    const r = await buscarSerieSgs({ codigo: 433, dataInicial: "01/01/1995", dataFinal: "01/01/2025" }, 5000, 1);

    expect(r.chunking).toBeUndefined();
    expect(r.requisicoes).toBe(2); // sonda + a consulta inteira
    expect(urls[1]).toContain("dataInicial=01/01/1995&dataFinal=01/01/2025");
  });

  it("erro que não é 406 sobe sem virar chunking", async () => {
    mock([["bcdata.sgs.9/dados", { __status: 500 }]]);

    await expect(buscarSerieSgs({ codigo: 9, dataInicial: "01/01/2024", dataFinal: "31/12/2024" }, 5000, 1))
      .rejects.toThrow(/500/);
  });
});

describe("sondarPeriodicidade", () => {
  it("falha na sonda devolve null em vez de derrubar a consulta", async () => {
    mock([["dados/ultimos/20", { __status: 500 }]]);
    expect(await sondarPeriodicidade(1, 5000, 1)).toBeNull();
  });
});

// ==================== ultimos/N acima do teto ====================

describe("buscarUltimosSgs", () => {
  it("até 20 usa o endpoint nativo", async () => {
    mock([["dados/ultimos/12", diarias("2026-08-01", 12)]]);

    const r = await buscarUltimosSgs(1, 12, 5000, 1);

    expect(urls[0]).toContain("/dados/ultimos/12?formato=json");
    expect(r.requisicoes).toBe(1);
    expect(r.observacoes.length).toBe(12);
  });

  it("acima de 20 contorna o teto por janela de datas e devolve N pontos", async () => {
    mock([
      ["dados/ultimos/20", diarias("2026-07-15", 20)],
      ["dados?formato=json&dataInicial", diarias("2025-01-01", 400)]
    ]);

    const r = await buscarUltimosSgs(1, 100, 5000, 1);

    // nenhuma chamada pediu mais de 20 ao endpoint /ultimos
    expect(urls.some(u => /\/ultimos\/(?!20\?)\d+/.test(u))).toBe(false);
    expect(r.observacoes.length).toBe(100);
    // são as ÚLTIMAS 100 das 400 devolvidas
    expect(r.observacoes[r.observacoes.length - 1].data).toBe(formatarDataSgs(Date.parse("2025-01-01T00:00:00Z") + 399 * 86400000));
  });
});

// ==================== harmonização ====================

describe("harmonizar", () => {
  const ipcaMensal2024 = [
    { data: "01/01/2024", valor: 0.42 }, { data: "01/02/2024", valor: 0.83 },
    { data: "01/03/2024", valor: 0.16 }, { data: "01/04/2024", valor: 0.38 },
    { data: "01/05/2024", valor: 0.46 }, { data: "01/06/2024", valor: 0.21 },
    { data: "01/07/2024", valor: 0.38 }, { data: "01/08/2024", valor: -0.02 },
    { data: "01/09/2024", valor: 0.44 }, { data: "01/10/2024", valor: 0.56 },
    { data: "01/11/2024", valor: 0.39 }, { data: "01/12/2024", valor: 0.52 }
  ];

  it("mensal para anual com composição geométrica, não soma", () => {
    const r = harmonizar(ipcaMensal2024, "anual", "acumulada", "mensal");

    expect(r.dados.length).toBe(1);
    expect(r.dados[0].data).toBe("01/01/2024");
    expect(r.dados[0].observacoes).toBe(12);
    // composto = 4,8313%; a soma simples daria 4,73 — a diferença é o ponto
    expect(r.dados[0].valor).toBeCloseTo(4.8313, 4);
    expect(ipcaMensal2024.reduce((a, o) => a + o.valor, 0)).toBeCloseTo(4.73, 2);
    expect(r.nota).toContain("Valor derivado");
    expect(r.nota).toContain("composição geométrica");
  });

  it("agrega por trimestre com a data do primeiro dia do período", () => {
    const r = harmonizar(ipcaMensal2024, "trimestral", "soma", "mensal");

    expect(r.dados.map(d => d.data)).toEqual(["01/01/2024", "01/04/2024", "01/07/2024", "01/10/2024"]);
    expect(r.dados[0].valor).toBeCloseTo(1.41, 6);
    expect(r.dados.every(d => d.observacoes === 3)).toBe(true);
  });

  it("último e média são valores diferentes, e os dois vêm rotulados", () => {
    const ultimo = harmonizar(ipcaMensal2024, "anual", "ultimo", "mensal");
    const media = harmonizar(ipcaMensal2024, "anual", "media", "mensal");

    expect(ultimo.dados[0].valor).toBe(0.52);
    expect(media.dados[0].valor).toBeCloseTo(4.73 / 12, 6);
    expect(ultimo.agregacao).toBe("ultimo");
    expect(media.nota).toContain("média aritmética");
  });

  it("desagregar é recusado com motivo, não silenciosamente aproximado", () => {
    expect(() => harmonizar([{ data: "01/01/2024", valor: 1 }], "mensal", "ultimo", "trimestral"))
      .toThrow(/desagregar/i);
  });

  it("observação sem data válida ou sem número é descartada, não vira NaN", () => {
    const r = harmonizar(
      [{ data: "01/01/2024", valor: 1 }, { data: "lixo", valor: 2 }, { data: "15/01/2024", valor: Number.NaN }],
      "mensal", "soma", "diaria"
    );

    expect(r.dados).toEqual([{ data: "01/01/2024", valor: 1, observacoes: 1 }]);
  });
});

// ==================== alinhamento de grades ====================
//
// O que estes testes pinam é a medição de 11/08/2026 contra a origem: séries de
// mesma periodicidade casam integralmente (dólar, Selic e CDI diários deram 253 de
// 253 em 2024), e cruzar periodicidades diferentes casa um punhado de datas — não
// zero, que seria evidente, mas 7 de 12 no ano. É o número 7 que torna o erro caro.

describe("alinharSeries", () => {
  it("séries de mesma grade casam integralmente", () => {
    const a = [{ data: "01/01/2024", valor: 1 }, { data: "01/02/2024", valor: 2 }];
    const b = [{ data: "01/01/2024", valor: 10 }, { data: "01/02/2024", valor: 20 }];

    const r = alinharSeries([a, b]);

    expect(r.linhas).toEqual([
      { data: "01/01/2024", valores: [1, 10] },
      { data: "01/02/2024", valores: [2, 20] }
    ]);
    expect(r.completas).toBe(2);
    expect(r.parciais).toBe(0);
  });

  it("grades diferentes: a união preserva tudo e as parciais ficam contadas", () => {
    const diaria = [
      { data: "01/01/2024", valor: 1 },
      { data: "02/01/2024", valor: 2 },
      { data: "03/01/2024", valor: 3 }
    ];
    const mensal = [{ data: "01/01/2024", valor: 100 }];

    const r = alinharSeries([diaria, mensal]);

    expect(r.linhas).toHaveLength(3);
    expect(r.completas).toBe(1); // só o dia 1º
    expect(r.parciais).toBe(2);
    expect(r.linhas[1].valores).toEqual([2, null]);
  });

  it("reproduz a medição da origem: diária × mensal casa ~7 datas de 12 no ano", () => {
    // Dias 1º de 2024 que caíram em dia útil: jan, fev, mar, abr, jul, ago, out.
    const diasUteis = ["01/01/2024", "01/02/2024", "01/03/2024", "01/04/2024",
                       "01/07/2024", "01/08/2024", "01/10/2024"];
    const diaria = diasUteis.map((data, i) => ({ data, valor: i + 1 }));
    const mensal = Array.from({ length: 12 }, (_, i) => ({
      data: `01/${String(i + 1).padStart(2, "0")}/2024`, valor: (i + 1) * 10
    }));

    const r = alinharSeries([diaria, mensal]);

    expect(r.completas).toBe(7);
    expect(r.linhas).toHaveLength(12);
  });

  it("ordena por data, não por ordem de chegada", () => {
    const r = alinharSeries([[{ data: "05/03/2024", valor: 2 }, { data: "01/01/2024", valor: 1 }]]);
    expect(r.linhas.map(l => l.data)).toEqual(["01/01/2024", "05/03/2024"]);
  });

  it("data inválida e valor não-numérico são descartados, não viram linha nula", () => {
    const r = alinharSeries([[
      { data: "01/01/2024", valor: 1 },
      { data: "lixo", valor: 2 },
      { data: "01/02/2024", valor: Number.NaN }
    ]]);

    expect(r.linhas).toEqual([{ data: "01/01/2024", valores: [1] }]);
  });
});

// ==================== deflação ====================

describe("construirDeflator / deflacionar", () => {
  /** 12 meses de 1% — índice fecha o ano em 1,01^12. */
  const umPorCento = Array.from({ length: 12 }, (_, i) => ({
    data: `01/${String(i + 1).padStart(2, "0")}/2024`, valor: 1
  }));

  it("fator do mês base é exatamente 1", () => {
    const d = construirDeflator(umPorCento);
    expect(d.mesBase).toBe("12/2024");
    expect(d.fatores.get("2024-12")).toBe(1);
  });

  it("fator de meses anteriores compõe geometricamente até a base", () => {
    const d = construirDeflator(umPorCento);
    // De jan a dez são 11 variações mensais de 1% aplicadas depois de janeiro.
    expect(d.fatores.get("2024-01")!).toBeCloseTo(1.01 ** 11, 12);
    expect(d.fatores.get("2024-11")!).toBeCloseTo(1.01, 12);
  });

  it("mês base no MEIO do período: meses posteriores recebem fator < 1", () => {
    const d = construirDeflator(umPorCento, "2024-06");
    expect(d.mesBase).toBe("06/2024");
    expect(d.fatores.get("2024-06")).toBe(1);
    expect(d.fatores.get("2024-12")!).toBeCloseTo(1 / 1.01 ** 6, 12);
    expect(d.fatores.get("2024-01")!).toBeCloseTo(1.01 ** 5, 12);
  });

  it("mês base inexistente cai no último mês, sem inventar cobertura", () => {
    const d = construirDeflator(umPorCento, "1999-01");
    expect(d.mesBase).toBe("12/2024");
  });

  it("índice vazio é erro explícito, não deflator de fator 1", () => {
    expect(() => construirDeflator([])).toThrow(/índice de preços/i);
  });

  it("todo dia do mesmo mês compartilha o fator — o índice é mensal", () => {
    const d = construirDeflator(umPorCento);
    const r = deflacionar(
      [{ data: "03/01/2024", valor: 100 }, { data: "29/01/2024", valor: 100 }],
      d
    );
    expect(r[0].fator).toBe(r[1].fator);
    expect(r[0].valorReal!).toBeCloseTo(100 * 1.01 ** 11, 10);
  });

  it("data fora da cobertura devolve null, nunca fator 1", () => {
    const d = construirDeflator(umPorCento);
    const r = deflacionar([{ data: "15/06/2023", valor: 100 }, { data: "15/03/2026", valor: 100 }], d);

    expect(r[0]).toEqual({ data: "15/06/2023", valorNominal: 100, valorReal: null, fator: null });
    expect(r[1].valorReal).toBeNull();
  });

  it("deflação de variação nula devolve o próprio valor", () => {
    const semInflacao = umPorCento.map(o => ({ ...o, valor: 0 }));
    const r = deflacionar([{ data: "01/03/2024", valor: 1518 }], construirDeflator(semInflacao));
    expect(r[0].valorReal).toBe(1518);
  });

  it("chaveMes extrai o mês da data e recusa o que não casa", () => {
    expect(chaveMes("29/02/2024")).toBe("2024-02");
    expect(chaveMes("2024-02-29")).toBeNull();
  });
});
