/**
 * Contrato de saída: `structuredContent` obedece ao `outputSchema` anunciado.
 *
 * Por que este arquivo existe. O SDK v2 exige `structuredContent` em todo
 * sucesso de tool com `outputSchema`, mas NÃO valida o conteúdo contra o schema —
 * a validação de saída é deliberadamente permissiva aqui (ver `register.ts`), para
 * que uma esquisitice da fonte não derrube a tool inteira. Só que a spec do MCP diz
 * que o `structuredContent` tem de obedecer ao schema, e cliente que valida —
 * o MCP Inspector valida — rejeita a resposta inteira quando não obedece.
 *
 * O buraco é específico e fácil de reabrir: as tools devolvem `null` de propósito
 * onde a fonte não publica o campo (nulo é a informação de que ali não há dado),
 * e um schema que anuncie `type: "string"` não admite `null`. Foi assim que as
 * cinco tools de D3 nasceram com nove violações, todas invisíveis para os testes
 * comuns e para os gates do SDK.
 *
 * Este teste usa o MESMO validador que o servidor aplica na entrada
 * (`CfWorkerJsonSchemaValidator`, o que roda nos dois runtimes) e cobre de
 * propósito os caminhos que produzem nulo: parâmetro opcional ausente, recurso
 * que não publica um campo, e resposta vazia. Rede nunca é tocada.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import { TOOL_DEFINITIONS, dispatchTool } from "./tools.js";

const validador = new CfWorkerJsonSchemaValidator();

/** Payloads por URL, imitando o formato de cada uma das três APIs. */
function mockFontes(): void {
  global.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, status: 200, statusText: "OK", json: async () => body }) as unknown as Response;

    // Portal de Dados Abertos (CKAN) — índice da busca.
    if (url.includes("dadosabertos.bcb.gov.br")) {
      return json({ success: true, result: ["433-ipca-variacao-mensal", "432-taxa-selic"] });
    }

    // PTAX.
    if (url.includes("/PTAX/")) {
      if (url.includes("/Moedas")) {
        return json({ value: [{ simbolo: "EUR", nomeFormatado: "Euro", tipoMoeda: "B" }] });
      }
      // Dólar não publica `tipoBoletim`; moeda publica, com paridade.
      const dolar = url.includes("CotacaoDolar");
      return json({
        value: [
          dolar
            ? { cotacaoCompra: 5.0902, cotacaoVenda: 5.0908, dataHoraCotacao: "2026-08-07 13:04:19.455752" }
            : {
                paridadeCompra: 1.1572,
                paridadeVenda: 1.1573,
                cotacaoCompra: 5.8882,
                cotacaoVenda: 5.8894,
                dataHoraCotacao: "2026-08-07 10:05:09.952521",
                tipoBoletim: "Abertura"
              }
        ]
      });
    }

    // Expectativas (Focus).
    if (url.includes("/Expectativas/")) {
      if (url.includes("Top5Selic")) {
        // O único recurso em caixa baixa, e sem numeroRespondentes/baseCalculo.
        return json({
          value: [
            {
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
            }
          ]
        });
      }
      if (url.includes("MercadoSelic")) {
        return json({
          value: [
            {
              Indicador: "Selic",
              Data: "2026-08-07",
              Reuniao: "R6/2026",
              Media: 10.4,
              Mediana: 10.5,
              DesvioPadrao: 0.15,
              Minimo: 10,
              Maximo: 10.75,
              numeroRespondentes: 72,
              baseCalculo: 0
            }
          ]
        });
      }
      if (url.includes("Inflacao12Meses") || url.includes("Inflacao24Meses")) {
        return json({
          value: [
            {
              Indicador: "IPCA",
              Data: "2026-06-29",
              Suavizada: "N",
              Media: 4.2176,
              Mediana: 4.19,
              DesvioPadrao: 0.4402,
              Minimo: 2.612,
              Maximo: 5.3857,
              numeroRespondentes: 129,
              baseCalculo: 0
            }
          ]
        });
      }
      // Calendário (mensal, trimestral, anual e seus Top 5).
      return json({
        value: [
          {
            Indicador: "IPCA",
            IndicadorDetalhe: null,
            Data: "2026-08-07",
            DataReferencia: "2027",
            Media: 4.243,
            Mediana: 4.2227,
            DesvioPadrao: 0.4124,
            Minimo: 3.17,
            Maximo: 6,
            ...(url.includes("Top5") ? { tipoCalculo: "C" } : { numeroRespondentes: 149, baseCalculo: 0 })
          }
        ]
      });
    }

    // SGS.
    if (url.includes("bcdata.sgs")) {
      return json([
        { data: "01/01/2026", valor: "0.54" },
        { data: "01/02/2026", valor: "0.31" }
      ]);
    }

    return json([]);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Um caso por caminho que produz nulo. O rótulo diz o que o caso existe para
 * cobrir, porque "chamou e não quebrou" não é o ponto.
 */
const CASOS: Array<[string, string, Record<string, unknown>]> = [
  ["bcb_serie_valores", "SGS com intervalo", { codigo: 433, dataInicial: "01/01/2026", dataFinal: "01/06/2026" }],
  ["bcb_serie_ultimos", "SGS últimos N", { codigo: 432, quantidade: 3 }],
  ["bcb_serie_metadados", "metadados do catálogo", { codigo: 433 }],
  ["bcb_series_populares", "catálogo local", {}],
  ["bcb_buscar_serie", "busca com achados", { termo: "ipca" }],
  ["bcb_buscar_serie", "busca sem achado", { termo: "zzzznaoexiste" }],
  ["bcb_indicadores_atuais", "painel agregado", {}],
  ["bcb_variacao", "estatística artesanal", { codigo: 433, dataInicial: "01/01/2026", dataFinal: "01/06/2026" }],
  ["bcb_comparar", "duas séries", { codigos: [433, 189], dataInicial: "01/01/2026", dataFinal: "01/06/2026" }],
  ["bcb_focus_expectativas", "calendário com referência", { indicador: "IPCA", horizonte: "anual", referencia: "2027" }],
  ["bcb_focus_expectativas", "Top 5 (sem respondentes na fonte)", { indicador: "IPCA", horizonte: "anual", referencia: "2027", top5: true }],
  ["bcb_focus_expectativas", "rolante (filtro.referencia nula)", { indicador: "IPCA", horizonte: "inflacao_12m" }],
  ["bcb_focus_selic", "sem reunião (filtro.reuniao nula)", { limite: 3 }],
  ["bcb_focus_selic", "Top 5 em caixa baixa", { top5: true, limite: 3 }],
  ["bcb_focus_referencias", "todos os escopos (filtro nulo)", {}],
  ["bcb_focus_referencias", "escopo único", { escopo: "selic" }],
  ["bcb_cambio_cotacao", "USD (fonte não publica tipoBoletim)", { data: "2026-08-07" }],
  ["bcb_cambio_cotacao", "moeda com paridade", { moeda: "EUR", dataInicial: "2026-08-03", dataFinal: "2026-08-10" }],
  ["bcb_cambio_moedas", "sem termo (termo nulo)", {}]
];

describe("structuredContent obedece ao outputSchema anunciado", () => {
  it.each(CASOS)("%s — %s", async (nome, _caminho, args) => {
    mockFontes();

    const definicao = TOOL_DEFINITIONS.find(t => t.name === nome);
    expect(definicao?.outputSchema, `tool ${nome} sem outputSchema`).toBeDefined();

    const resultado = await dispatchTool(nome, args, 5000, 1);
    expect(resultado.isError, `${nome} devolveu erro: ${resultado.content?.[0]?.text}`).toBeUndefined();
    expect(resultado.structuredContent).toBeDefined();

    const validar = validador.getValidator(definicao!.outputSchema as never);
    const veredicto = validar(resultado.structuredContent);

    expect(veredicto.valid, `${nome}: ${veredicto.errorMessage}`).toBe(true);
  });

  it("toda tool declara outputSchema — a regra dura do SDK v2 vale para as 13", () => {
    for (const definicao of TOOL_DEFINITIONS) {
      expect(definicao.outputSchema, `${definicao.name} sem outputSchema`).toBeDefined();
    }
    expect(TOOL_DEFINITIONS).toHaveLength(13);
  });
});
