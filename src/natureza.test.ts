/**
 * `natureza` do bloco `serie` — tempo 1: a função existe e o esquema DECLARA o
 * campo, mas nenhuma resposta o emite ainda (`EMITIR_NATUREZA = false`).
 *
 * O rótulo é o oposto do palpite da conta: `metodoVariacaoDaSerie` supõe nível
 * para série fora do catálogo porque precisa calcular alguma coisa; o rótulo
 * publicado diz `null` ("tipo não identificado"), porque afirmar "nível" sobre
 * uma série que pode ser variação foi o defeito do IPCA de 2024 (+23,81%).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import { conectarComoCliente } from "@sbissoli/mcp-surface/cliente";
import {
  ACUMULADOS_EM_12_MESES,
  ACUMULADOS_NO_ANO,
  EMITIR_NATUREZA,
  NATUREZAS_SERIE,
  SERIES_POPULARES,
  TAXAS_POR_PERIODO,
  dispatchTool,
  metodoVariacaoDaSerie,
  naturezaDaSerie,
  seriesEncadeadas
} from "./tools.js";
import { createServer } from "./register.js";

const OBS = [
  { data: "01/01/2026", valor: "0.50" },
  { data: "01/02/2026", valor: "0.60" },
  { data: "01/03/2026", valor: "0.70" }
];

function mockSgs(): void {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify(OBS), { status: 200, headers: { "content-type": "application/json" } })
  ) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("naturezaDaSerie: deriva das listas que já existem", () => {
  it("acumulados no ano e em 12 meses saem das listas citadas nas descrições", () => {
    for (const c of ACUMULADOS_NO_ANO) expect(naturezaDaSerie(c), String(c)).toBe("acumulado_no_ano");
    for (const c of ACUMULADOS_EM_12_MESES) expect(naturezaDaSerie(c), String(c)).toBe("acumulado_12_meses");
  });

  it("toda série que a conta encadeia é variação do período (inclusive as taxas por período)", () => {
    const encadeadas = seriesEncadeadas();
    expect(encadeadas).toEqual(expect.arrayContaining([433, 188, 189, ...TAXAS_POR_PERIODO]));
    for (const c of encadeadas) expect(naturezaDaSerie(c), String(c)).toBe("variacao_no_periodo");
  });

  it("as RAZÕES 29037/29038 não são acumulado: só o denominador é acumulado", () => {
    expect(naturezaDaSerie(29037)).toBe("nivel");
    expect(naturezaDaSerie(29038)).toBe("nivel");
  });

  it.each([
    [20539, "nivel"], // saldo em moeda
    [24363, "nivel"], // número-índice (IBC-Br)
    [432, "nivel"], // meta Selic, % ao ano
    [4513, "nivel"], // dívida / PIB, razão
    [1, "nivel"], // câmbio, unidade do portal
    [21619, "nivel"], // câmbio, pelo nome (série sem unidade)
    [4380, "nivel"], // PIB mensal em R$ milhões, pelo nome
    [4189, null], // "acumulada no mês anualizada": não cabe no vocabulário
    [11, null], // "Percentual ao dia": taxa ou rendimento? a unidade não decide
    [25497, null], // "Percentual ao mês" fora das taxas por período
    [7459, null], // IPA-DI sem unidade e sem "Variação mensal" no nome
    [24369, null] // desocupação: o catálogo não traz unidade
  ] as const)("série do catálogo %i → %s", (codigo, esperado) => {
    expect(naturezaDaSerie(codigo)).toBe(esperado);
  });

  it("fora do catálogo é null, nunca o palpite `nivel` que a conta usa por dentro", () => {
    expect(metodoVariacaoDaSerie(99999)).toBe("nivel");
    expect(naturezaDaSerie(99999)).toBeNull();
  });

  it("todo valor está no vocabulário fechado", () => {
    for (const s of SERIES_POPULARES) {
      const n = naturezaDaSerie(s.codigo);
      if (n !== null) expect(NATUREZAS_SERIE, String(s.codigo)).toContain(n);
    }
  });
});

describe("emissão desligada no tempo 1, esquema já aceita", () => {
  it("hoje o campo NÃO sai", async () => {
    expect(EMITIR_NATUREZA).toBe(false);
    mockSgs();
    const r = await dispatchTool("bcb_serie_valores", { codigo: 433 }, 5000, 1);
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent!.serie).not.toHaveProperty("natureza");
  });

  // As quatro saídas por onde `refSerie` chega ao fio. Esquema selado: se uma
  // delas não declarasse o campo, ligar a constante derrubaria a tool inteira.
  it.each([
    ["bcb_serie_valores", { codigo: 433 }, (sc: Record<string, unknown>) => sc.serie],
    ["bcb_serie_ultimos", { codigo: 433, quantidade: 3 }, (sc: Record<string, unknown>) => sc.serie],
    [
      "bcb_correlacao",
      { codigos: [433, 189], dataInicial: "2026-01-01", dataFinal: "2026-03-31" },
      (sc: Record<string, unknown>) => (sc.series as unknown[])[0]
    ],
    [
      "bcb_deflacionar",
      { codigo: 1207, dataInicial: "2026-02-01", dataFinal: "2026-03-31" },
      (sc: Record<string, unknown>) => sc.serie
    ]
  ] as const)("%s: o esquema LISTADO aceita todo valor do vocabulário e null, e recusa palpite", async (tool, args, alvo) => {
    mockSgs();
    const client = await conectarComoCliente(createServer("test"));
    try {
      const { tools } = await client.listTools();
      const valida = new CfWorkerJsonSchemaValidator().getValidator(
        tools.find(t => t.name === tool)!.outputSchema as never
      );
      const r = await dispatchTool(tool, args as Record<string, unknown>, 5000, 1);
      expect(r.isError, JSON.stringify(r.content)).toBeUndefined();
      const sc = r.structuredContent!;
      expect(valida(sc).valid).toBe(true);
      for (const n of [...NATUREZAS_SERIE, null]) {
        (alvo(sc) as Record<string, unknown>).natureza = n;
        expect(valida(sc).valid, `${tool} natureza=${n}`).toBe(true);
      }
      (alvo(sc) as Record<string, unknown>).natureza = "palpite";
      expect(valida(sc).valid).toBe(false);
    } finally {
      await client.close();
    }
  });
});
