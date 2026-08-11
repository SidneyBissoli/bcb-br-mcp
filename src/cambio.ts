/**
 * PTAX — cotações de câmbio e lista de moedas.
 *
 * Desenho aprovado (fronteira concreta da sessão de D3): os quatro recursos de
 * cotação da fonte (dólar-dia, dólar-período, moeda-dia, moeda-período) viram
 * UMA tool, `bcb_cambio_cotacao`, com `moeda` (padrão USD) e data única ou
 * intervalo. Mais `bcb_cambio_moedas` para a lista de moedas, porque descobrir o
 * símbolo é pergunta própria.
 *
 * Duas obrigações legais do `bcb/docs/01` nascem implementadas aqui, não no D4:
 *
 * 1. **O disclaimer do BCB é repassado literalmente** em toda resposta de
 *    cotação — é o único texto tipo-ToS que a fonte publica.
 * 2. **Paridades de moedas não-dólar são QUALIFICADAS**: elas não são dado do
 *    BCB, vêm de agência de informação (Refinitiv) e são redistribuídas pelo BCB.
 *    Anunciá-las como dado do BCB sem qualificar seria incorreto.
 *
 * Pegadinha da API que mora em `olinda.ts`: os parâmetros de data da PTAX são
 * **MM-DD-YYYY**, não ISO nem dd/MM/yyyy.
 */

import {
  PTAX_ODATA,
  consultarOData,
  hojeIso,
  montarUrlOData,
  numeroOuNulo,
  paraDataPtax,
  paraIso,
  somarDiasIso,
  textoOuNulo
} from "./olinda.js";
import { erroResult, leituraRemota, mensagemDeErro, structuredResult, type ToolDefinition, type ToolResult } from "./shared.js";

/** Janela padrão quando não se informa data nenhuma: cobre feriados e fins de semana. */
const JANELA_PADRAO_DIAS = 7;

/** Repassado literalmente, como o `docs/01` exige. */
export const DISCLAIMER_PTAX =
  "O Banco Central não assume qualquer responsabilidade pela não simultaneidade ou falta das informações " +
  "prestadas, assim como por eventuais erros de paridades das moedas. Não assume, também, responsabilidade " +
  "por qualquer perda ou dano oriundo de tais interrupções, atrasos, falhas ou imperfeições, bem como pelo " +
  "uso inadequado das informações.";

export const QUALIFICACAO_PARIDADE =
  "As paridades das moedas contra o dólar americano NÃO são apuradas pelo Banco Central: são obtidas junto a " +
  "agências de informação (Refinitiv) e redistribuídas pelo BCB. Trate-as como dado de terceiro qualificado, " +
  "não como dado do BCB.";

export interface CotacaoNormalizada {
  /** Data e hora da cotação como a fonte publica. */
  dataHora: string | null;
  cotacaoCompra: number | null;
  cotacaoVenda: number | null;
  /** Só para moedas não-dólar: paridade contra o USD (origem: agência de informação). */
  paridadeCompra?: number | null;
  paridadeVenda?: number | null;
  /** Nulo em USD: verificado contra a origem, os recursos de dólar não publicam este campo. */
  tipoBoletim: string | null;
}

export function normalizarCotacao(linha: Record<string, unknown>, dolar: boolean): CotacaoNormalizada {
  const normalizada: CotacaoNormalizada = {
    dataHora: textoOuNulo(linha.dataHoraCotacao),
    cotacaoCompra: numeroOuNulo(linha.cotacaoCompra),
    cotacaoVenda: numeroOuNulo(linha.cotacaoVenda),
    tipoBoletim: textoOuNulo(linha.tipoBoletim)
  };

  if (!dolar) {
    normalizada.paridadeCompra = numeroOuNulo(linha.paridadeCompra);
    normalizada.paridadeVenda = numeroOuNulo(linha.paridadeVenda);
  }

  return normalizada;
}

interface UrlCotacao {
  url: string;
  dolar: boolean;
  dataInicial: string;
  dataFinal: string;
  janelaPadrao: boolean;
}

/**
 * Monta a URL da cotação escolhendo entre os quatro recursos da fonte. É o único
 * lugar que sabe que existem quatro: para fora há uma tool só.
 */
export function montarUrlCotacao(args: {
  moeda?: string;
  data?: string;
  dataInicial?: string;
  dataFinal?: string;
}): UrlCotacao | { erro: string } {
  const moeda = (args.moeda ?? "USD").toUpperCase();
  const dolar = moeda === "USD";

  let inicio: string | null;
  let fim: string | null;
  let janelaPadrao = false;

  if (args.data !== undefined) {
    if (args.dataInicial !== undefined || args.dataFinal !== undefined) {
      return { erro: "Use `data` para um dia específico OU `dataInicial`/`dataFinal` para um intervalo, não os dois." };
    }
    inicio = paraIso(args.data);
    if (!inicio) return { erro: `data inválida: "${args.data}". Use yyyy-MM-dd ou dd/MM/yyyy.` };
    fim = inicio;
  } else {
    fim = args.dataFinal ? paraIso(args.dataFinal) : hojeIso();
    if (!fim) return { erro: `dataFinal inválida: "${args.dataFinal}". Use yyyy-MM-dd ou dd/MM/yyyy.` };
    inicio = args.dataInicial ? paraIso(args.dataInicial) : somarDiasIso(fim, -JANELA_PADRAO_DIAS);
    if (!inicio) return { erro: `dataInicial inválida: "${args.dataInicial}". Use yyyy-MM-dd ou dd/MM/yyyy.` };
    janelaPadrao = args.dataInicial === undefined && args.dataFinal === undefined;
  }

  if (inicio > fim) {
    return { erro: `A janela está invertida: dataInicial (${inicio}) é posterior a dataFinal (${fim}).` };
  }

  const diaUnico = inicio === fim && args.data !== undefined;
  const pInicio = paraDataPtax(inicio);
  const pFim = paraDataPtax(fim);

  // Recursos parametrizados do OData: os argumentos vão como @parâmetros.
  const recurso = diaUnico
    ? dolar
      ? `CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${pInicio}'`
      : `CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda='${moeda}'&@dataCotacao='${pInicio}'`
    : dolar
      ? `CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${pInicio}'&@dataFinalCotacao='${pFim}'`
      : `CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='${moeda}'&@dataInicial='${pInicio}'&@dataFinalCotacao='${pFim}'`;

  // O recurso já carrega query string, então o formato entra com `&`.
  const url = `${PTAX_ODATA}/${recurso}&$format=json`;

  return { url, dolar, dataInicial: inicio, dataFinal: fim, janelaPadrao };
}

export interface ArgsCotacao {
  moeda?: string;
  data?: string;
  dataInicial?: string;
  dataFinal?: string;
  limite?: number;
}

export async function handleCambioCotacao(
  args: ArgsCotacao,
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  const montada = montarUrlCotacao(args);
  if ("erro" in montada) return erroResult(montada.erro);

  try {
    const linhas = await consultarOData(montada.url, timeoutMs, maxRetries);
    const limite = args.limite ?? 100;
    const todas = linhas
      .map(l => normalizarCotacao(l, montada.dolar))
      .sort((a, b) => (b.dataHora ?? "").localeCompare(a.dataHora ?? ""));
    const cotacoes = todas.slice(0, limite);

    const payload: Record<string, unknown> = {
      moeda: (args.moeda ?? "USD").toUpperCase(),
      periodo: {
        dataInicial: montada.dataInicial,
        dataFinal: montada.dataFinal,
        janelaPadrao: montada.janelaPadrao
      },
      totalRegistros: todas.length,
      cotacoes,
      disclaimer: DISCLAIMER_PTAX,
      urlConsulta: montada.url,
      consultadoEm: new Date().toISOString()
    };

    if (!montada.dolar) payload.qualificacaoParidade = QUALIFICACAO_PARIDADE;

    if (cotacoes.length < todas.length) {
      payload.observacao = `Exibindo ${cotacoes.length} de ${todas.length} boletins; aumente 'limite' ou estreite o período.`;
    }
    if (todas.length === 0) {
      payload.observacao =
        "Nenhuma cotação no período. A PTAX só existe em dia útil com fechamento de câmbio — fim de semana, " +
        "feriado e o próprio dia antes do fechamento voltam vazios. Confirme também o símbolo da moeda com " +
        "bcb_cambio_moedas.";
    }

    return structuredResult(payload);
  } catch (error) {
    return erroResult(`Erro ao consultar cotação de câmbio: ${mensagemDeErro(error)}`);
  }
}

export interface ArgsMoedas {
  termo?: string;
}

export async function handleCambioMoedas(
  args: ArgsMoedas,
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  const url = montarUrlOData(PTAX_ODATA, { recurso: "Moedas" });

  try {
    const linhas = await consultarOData(url, timeoutMs, maxRetries);

    let moedas = linhas.map(l => ({
      simbolo: textoOuNulo(l.simbolo),
      nome: textoOuNulo(l.nomeFormatado),
      tipo: textoOuNulo(l.tipoMoeda)
    }));

    if (args.termo !== undefined) {
      const termo = args.termo.toUpperCase();
      moedas = moedas.filter(m => (m.simbolo ?? "").includes(termo) || (m.nome ?? "").toUpperCase().includes(termo));
    }

    return structuredResult({
      termo: args.termo ?? null,
      totalMoedas: moedas.length,
      moedas,
      disclaimer: DISCLAIMER_PTAX,
      qualificacaoParidade: QUALIFICACAO_PARIDADE,
      urlConsulta: url,
      consultadoEm: new Date().toISOString(),
      observacao: "Use o `simbolo` em bcb_cambio_cotacao. O dólar americano (USD) é o padrão da tool de cotação."
    });
  } catch (error) {
    return erroResult(`Erro ao listar moedas: ${mensagemDeErro(error)}`);
  }
}

// ==================== SCHEMAS ====================

const NOTA_PTAX =
  "Fonte: PTAX / Cotações e boletins de câmbio do Banco Central do Brasil, via Olinda OData. A resposta repassa " +
  "literalmente o disclaimer de responsabilidade do BCB, em `disclaimer`. Cotações existem só em dia útil com " +
  "fechamento de câmbio.";

export const CAMBIO_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "bcb_cambio_cotacao",
    description:
      "Consulta a cotação PTAX de uma moeda contra o real, em um dia específico ou num intervalo de datas. " +
      "Padrão: dólar americano (USD). Devolve compra, venda, data/hora e tipo de boletim; para moedas " +
      "não-dólar devolve também a paridade contra o USD, com a origem qualificada. " +
      "Quando usar: para a cotação oficial de fechamento de um dia ou a série de um período curto. " +
      "Quando NÃO usar: para a série histórica longa do dólar como série temporal do SGS use bcb_serie_valores " +
      "(códigos 1 = livre venda, 3698 = PTAX venda, 3697 = PTAX compra, 3695 = PTAX média) — esta tool é a " +
      "fonte primária do boletim, com compra e venda no mesmo registro; para descobrir o símbolo da moeda use " +
      "bcb_cambio_moedas. " +
      "Retorna: `moeda`, `periodo` (dataInicial, dataFinal, janelaPadrao), `totalRegistros`, `cotacoes`, " +
      "`disclaimer`, `qualificacaoParidade` (só para moedas não-dólar), `urlConsulta`, `consultadoEm` e, quando " +
      "aplicável, `observacao`. Sem datas, cobre os últimos 7 dias (para atravessar fim de semana e feriado). " +
      NOTA_PTAX +
      " As paridades de moedas não-dólar vêm de agência de informação (Refinitiv), redistribuídas pelo BCB — não " +
      "são apuradas pelo Banco Central.",
    annotations: leituraRemota("Cotação de câmbio (PTAX)"),
    inputSchema: {
      type: "object" as const,
      properties: {
        moeda: { type: "string" as const, description: "Símbolo da moeda (ex.: USD, EUR, GBP, JPY). Padrão: USD.", default: "USD" },
        data: { type: "string" as const, description: "Dia específico (yyyy-MM-dd ou dd/MM/yyyy). Não combine com dataInicial/dataFinal." },
        dataInicial: { type: "string" as const, description: "Início do intervalo (yyyy-MM-dd ou dd/MM/yyyy). Padrão: 7 dias antes do fim." },
        dataFinal: { type: "string" as const, description: "Fim do intervalo (yyyy-MM-dd ou dd/MM/yyyy). Padrão: hoje." },
        limite: { type: "number" as const, description: "Máximo de boletins a devolver (1-1000, padrão 100)", default: 100, minimum: 1, maximum: 1000 }
      }
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        moeda: { type: "string" as const },
        periodo: {
          type: "object" as const,
          properties: {
            dataInicial: { type: "string" as const },
            dataFinal: { type: "string" as const },
            janelaPadrao: { type: "boolean" as const, description: "true quando a janela de 7 dias foi assumida" }
          },
          required: ["dataInicial", "dataFinal", "janelaPadrao"]
        },
        totalRegistros: { type: "number" as const },
        cotacoes: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              dataHora: { type: ["string", "null"] as const, description: "Data e hora da cotação" },
              cotacaoCompra: { type: ["number", "null"] as const },
              cotacaoVenda: { type: ["number", "null"] as const },
              paridadeCompra: { type: ["number", "null"] as const, description: "Paridade de compra contra o USD (moedas não-dólar; origem: agência de informação)" },
              paridadeVenda: { type: ["number", "null"] as const, description: "Paridade de venda contra o USD (moedas não-dólar; origem: agência de informação)" },
              tipoBoletim: { type: ["string", "null"] as const, description: "Tipo de boletim (ex.: Fechamento, Abertura, Intermediário). Nulo em USD: a fonte não publica este campo nos recursos de dólar, só nos de moeda." }
            },
            required: ["dataHora"]
          }
        },
        disclaimer: { type: "string" as const, description: "Disclaimer de responsabilidade do BCB, repassado literalmente" },
        qualificacaoParidade: { type: "string" as const, description: "Qualificação da origem das paridades não-dólar" },
        urlConsulta: { type: "string" as const },
        consultadoEm: { type: "string" as const },
        observacao: { type: "string" as const }
      },
      required: ["moeda", "periodo", "totalRegistros", "cotacoes", "disclaimer", "urlConsulta", "consultadoEm"]
    }
  },
  {
    name: "bcb_cambio_moedas",
    description:
      "Lista as moedas com cotação publicada pelo Banco Central, com símbolo, nome e tipo, e aceita um termo " +
      "para filtrar. " +
      "Quando usar: para descobrir o símbolo correto antes de chamar bcb_cambio_cotacao (é a causa mais comum " +
      "de cotação vazia). Quando NÃO usar: para valores de cotação. " +
      "Retorna: `termo`, `totalMoedas`, `moedas` (simbolo, nome, tipo), `disclaimer`, `qualificacaoParidade`, " +
      "`urlConsulta` e `consultadoEm`. " + NOTA_PTAX,
    annotations: leituraRemota("Moedas com cotação no BCB"),
    inputSchema: {
      type: "object" as const,
      properties: {
        termo: { type: "string" as const, description: "Filtro por símbolo ou nome (ex.: 'EUR', 'libra'). Opcional." }
      }
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        termo: { type: ["string", "null"] as const, description: "Termo aplicado no filtro; nulo quando não foi informado" },
        totalMoedas: { type: "number" as const },
        moedas: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              simbolo: { type: ["string", "null"] as const, description: "Símbolo a usar em bcb_cambio_cotacao" },
              nome: { type: ["string", "null"] as const },
              tipo: { type: ["string", "null"] as const, description: "Tipo da moeda conforme a fonte (A ou B)" }
            },
            required: ["simbolo"]
          }
        },
        disclaimer: { type: "string" as const },
        qualificacaoParidade: { type: "string" as const },
        urlConsulta: { type: "string" as const },
        consultadoEm: { type: "string" as const },
        observacao: { type: "string" as const }
      },
      required: ["totalMoedas", "moedas", "disclaimer", "urlConsulta", "consultadoEm"]
    }
  }
];

/** Retorna null quando a tool não é deste módulo (o dispatcher central segue). */
export function dispatchCambioTool(
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> | null {
  switch (toolName) {
    case "bcb_cambio_cotacao":
      return handleCambioCotacao(args as unknown as ArgsCotacao, timeoutMs, maxRetries);
    case "bcb_cambio_moedas":
      return handleCambioMoedas(args as unknown as ArgsMoedas, timeoutMs, maxRetries);
    default:
      return null;
  }
}
