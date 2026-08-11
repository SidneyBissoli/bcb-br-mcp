/**
 * Expectativas de Mercado (Focus) sob contrato consolidado.
 *
 * Desenho aprovado pelo decisor (arbitragem 3 + fronteira concreta da sessão de
 * D3): NÃO espelhar os recursos OData. Três tools em vez de treze:
 *
 * - `bcb_focus_expectativas` — as cinco expectativas de calendário (mensal,
 *   trimestral, anual, inflação em 12 e em 24 meses) numa tool só, com
 *   `horizonte` como parâmetro. Os dois horizontes rolantes não têm data de
 *   referência (o alvo é "os próximos N meses", não um mês do calendário) e têm
 *   o campo `suavizada`, que os de calendário não têm: `referencia` é obrigatória
 *   nos três de calendário e recusada nos rolantes, com erro que diz o que usar.
 * - `bcb_focus_selic` — separada porque o eixo temporal é a REUNIÃO do Copom, não
 *   o calendário. Consolidar aqui esconderia a diferença que importa.
 * - `bcb_focus_referencias` — auxiliar de descoberta. Sem ela o agente adivinha
 *   strings de referência ("2026"? "12/2026"? "4/2026"?), que é o modo mais
 *   comum de a consulta voltar vazia.
 *
 * Top 5 é SINALIZADOR (`top5: true`), não tool espelhada — e não existe para
 * toda combinação: a tabela de combinações válidas mora em `RECURSOS` e o erro
 * diz qual usar.
 *
 * `ExpectativasMercadoInstituicoes` jamais entra (desativado pelo BCB por
 * confidencialidade).
 */

import {
  EXPECTATIVAS_ODATA,
  OLINDA_MAX_LINHAS,
  consultarOData,
  hojeIso,
  montarUrlOData,
  numeroOuNulo,
  odataString,
  paraIso,
  somarDiasIso,
  textoOuNulo
} from "./olinda.js";
import { erroResult, leituraRemota, mensagemDeErro, structuredResult, type ToolDefinition, type ToolResult } from "./shared.js";

export type Horizonte = "mensal" | "trimestral" | "anual" | "inflacao_12m" | "inflacao_24m";

/** Janela de coleta padrão quando o usuário não informa datas. */
const JANELA_PADRAO_DIAS = 30;

interface RecursoFocus {
  /** Recurso OData das expectativas do consenso. */
  consenso: string;
  /** Recurso das expectativas do Top 5, quando existe para este horizonte. */
  top5: string | null;
  /** Nome do campo que carrega o alvo da expectativa. */
  campoReferencia: string | null;
  /** Formato da referência, para descrição e mensagem de erro. */
  formatoReferencia: string | null;
}

/**
 * Mapa horizonte -> recurso OData. É o ÚNICO lugar que conhece os nomes dos
 * recursos: se a fonte renomear ou passar a oferecer Top 5 onde hoje não há, a
 * correção é uma linha aqui.
 */
export const RECURSOS: Record<Horizonte, RecursoFocus> = {
  mensal: {
    consenso: "ExpectativaMercadoMensais",
    top5: "ExpectativasMercadoTop5Mensais",
    campoReferencia: "DataReferencia",
    formatoReferencia: "MM/yyyy (ex.: 09/2026)"
  },
  trimestral: {
    consenso: "ExpectativasMercadoTrimestrais",
    top5: null,
    campoReferencia: "DataReferencia",
    formatoReferencia: "T/yyyy (ex.: 3/2026)"
  },
  anual: {
    consenso: "ExpectativasMercadoAnuais",
    top5: "ExpectativasMercadoTop5Anuais",
    campoReferencia: "DataReferencia",
    formatoReferencia: "yyyy (ex.: 2027)"
  },
  inflacao_12m: {
    consenso: "ExpectativasMercadoInflacao12Meses",
    top5: null,
    campoReferencia: null,
    formatoReferencia: null
  },
  inflacao_24m: {
    consenso: "ExpectativasMercadoInflacao24Meses",
    top5: null,
    campoReferencia: null,
    formatoReferencia: null
  }
};

const HORIZONTES = Object.keys(RECURSOS) as Horizonte[];
const HORIZONTES_ROLANTES: Horizonte[] = ["inflacao_12m", "inflacao_24m"];

/** Linha normalizada: um contrato para os cinco horizontes e para o Top 5. */
export interface ExpectativaNormalizada {
  indicador: string | null;
  indicadorDetalhe: string | null;
  /** Data da coleta (campo `Data` da fonte) — o Focus é vintage por construção. */
  coletadoEm: string | null;
  /** Alvo da expectativa: data de referência, reunião do Copom, ou null nos rolantes. */
  referencia: string | null;
  media: number | null;
  mediana: number | null;
  desvioPadrao: number | null;
  minimo: number | null;
  maximo: number | null;
  respondentes: number | null;
  baseCalculo: number | null;
  /** Só nos horizontes rolantes: se a série é a suavizada. */
  suavizada?: boolean | null;
  /** Só no Top 5: tipo de cálculo publicado pela fonte. */
  tipoCalculo?: string | null;
}

/**
 * Normaliza uma linha do OData. Defensivo de propósito: os recursos não têm o
 * mesmo conjunto de campos, e o alvo aparece como `DataReferencia` (calendário)
 * ou `Reuniao` (Selic).
 */
export function normalizarExpectativa(linha: Record<string, unknown>): ExpectativaNormalizada {
  const normalizada: ExpectativaNormalizada = {
    indicador: textoOuNulo(linha.Indicador),
    indicadorDetalhe: textoOuNulo(linha.IndicadorDetalhe),
    coletadoEm: textoOuNulo(linha.Data),
    referencia: textoOuNulo(linha.DataReferencia) ?? textoOuNulo(linha.Reuniao),
    media: numeroOuNulo(linha.Media),
    mediana: numeroOuNulo(linha.Mediana),
    desvioPadrao: numeroOuNulo(linha.DesvioPadrao),
    minimo: numeroOuNulo(linha.Minimo),
    maximo: numeroOuNulo(linha.Maximo),
    respondentes: numeroOuNulo(linha.numeroRespondentes),
    baseCalculo: numeroOuNulo(linha.baseCalculo)
  };

  if (linha.Suavizada !== undefined) {
    const bruto = textoOuNulo(linha.Suavizada);
    normalizada.suavizada = bruto === null ? null : bruto.toUpperCase().startsWith("S");
  }
  if (linha.tipoCalculo !== undefined) normalizada.tipoCalculo = textoOuNulo(linha.tipoCalculo);

  return normalizada;
}

/** Ordena da coleta mais recente para a mais antiga (client-side; ver olinda.ts). */
function maisRecentePrimeiro(a: ExpectativaNormalizada, b: ExpectativaNormalizada): number {
  return (b.coletadoEm ?? "").localeCompare(a.coletadoEm ?? "") || (a.referencia ?? "").localeCompare(b.referencia ?? "");
}

interface JanelaResolvida {
  dataInicial: string;
  dataFinal: string;
  padrao: boolean;
}

function resolverJanela(dataInicial?: string, dataFinal?: string): JanelaResolvida | { erro: string } {
  const fim = dataFinal ? paraIso(dataFinal) : hojeIso();
  if (!fim) return { erro: `dataFinal inválida: "${dataFinal}". Use yyyy-MM-dd ou dd/MM/yyyy.` };

  const inicio = dataInicial ? paraIso(dataInicial) : somarDiasIso(fim, -JANELA_PADRAO_DIAS);
  if (!inicio) return { erro: `dataInicial inválida: "${dataInicial}". Use yyyy-MM-dd ou dd/MM/yyyy.` };

  if (inicio > fim) return { erro: `A janela está invertida: dataInicial (${inicio}) é posterior a dataFinal (${fim}).` };

  return { dataInicial: inicio, dataFinal: fim, padrao: !dataInicial && !dataFinal };
}

// ==================== bcb_focus_expectativas ====================

export interface ArgsExpectativas {
  indicador: string;
  horizonte: Horizonte;
  referencia?: string;
  dataInicial?: string;
  dataFinal?: string;
  top5?: boolean;
  suavizada?: boolean;
  limite?: number;
}

export async function handleFocusExpectativas(
  args: ArgsExpectativas,
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  const recurso = RECURSOS[args.horizonte];
  if (!recurso) {
    return erroResult(
      `Horizonte inválido: "${args.horizonte}". Use um destes: ${HORIZONTES.join(", ")}. ` +
        "Para expectativa de Selic por reunião do Copom, use bcb_focus_selic."
    );
  }

  const rolante = HORIZONTES_ROLANTES.includes(args.horizonte);

  // A fronteira consolidar x separar, tornada explícita no contrato: os
  // horizontes rolantes não têm alvo de calendário, e mandar `referencia` neles
  // é sinal de que o usuário quis outro horizonte.
  if (rolante && args.referencia !== undefined) {
    return erroResult(
      `O horizonte "${args.horizonte}" é rolante (os próximos ${args.horizonte === "inflacao_12m" ? 12 : 24} ` +
        "meses a partir de cada coleta) e não aceita `referencia`. Para expectativa de um mês, trimestre ou ano " +
        "específico, use horizonte mensal, trimestral ou anual com a `referencia` correspondente."
    );
  }
  if (!rolante && args.referencia === undefined) {
    return erroResult(
      `O horizonte "${args.horizonte}" exige \`referencia\` no formato ${recurso.formatoReferencia}. ` +
        "Use bcb_focus_referencias para ver as referências disponíveis para o indicador."
    );
  }
  if (!rolante && args.suavizada !== undefined) {
    return erroResult(
      "`suavizada` só existe nos horizontes rolantes (inflacao_12m, inflacao_24m), onde a fonte publica a " +
        "série suavizada e a não suavizada."
    );
  }

  if (args.top5 === true && recurso.top5 === null) {
    const comTop5 = HORIZONTES.filter(h => RECURSOS[h].top5 !== null);
    return erroResult(
      `A fonte não publica Top 5 para o horizonte "${args.horizonte}". Há Top 5 em: ${comTop5.join(", ")} ` +
        "(e na Selic, por bcb_focus_selic com top5: true)."
    );
  }

  const janela = resolverJanela(args.dataInicial, args.dataFinal);
  if ("erro" in janela) return erroResult(janela.erro);

  // Filtro por construção: sem filtro, a consulta ao Olinda não completa.
  const filtro = [
    `Indicador eq ${odataString(args.indicador)}`,
    `Data ge ${odataString(janela.dataInicial)}`,
    `Data le ${odataString(janela.dataFinal)}`
  ];
  if (args.referencia !== undefined && recurso.campoReferencia) {
    filtro.push(`${recurso.campoReferencia} eq ${odataString(args.referencia)}`);
  }
  if (args.suavizada !== undefined) filtro.push(`Suavizada eq ${odataString(args.suavizada ? "S" : "N")}`);

  const url = montarUrlOData(EXPECTATIVAS_ODATA, {
    recurso: args.top5 === true ? (recurso.top5 as string) : recurso.consenso,
    filtro,
    top: OLINDA_MAX_LINHAS
  });

  try {
    const linhas = await consultarOData(url, timeoutMs, maxRetries);
    const limite = args.limite ?? 50;
    const normalizadas = linhas.map(normalizarExpectativa).sort(maisRecentePrimeiro);
    const expectativas = normalizadas.slice(0, limite);

    const payload: Record<string, unknown> = {
      indicador: args.indicador,
      horizonte: args.horizonte,
      base: args.top5 === true ? "top5" : "consenso",
      filtro: {
        referencia: args.referencia ?? null,
        dataInicial: janela.dataInicial,
        dataFinal: janela.dataFinal,
        janelaPadrao: janela.padrao,
        suavizada: args.suavizada ?? null
      },
      // Contagem client-side: a fonte ignora `$count=true`.
      totalRegistros: normalizadas.length,
      expectativas,
      urlConsulta: url,
      consultadoEm: new Date().toISOString()
    };

    if (expectativas.length < normalizadas.length) {
      payload.observacao = `Exibindo ${expectativas.length} de ${normalizadas.length} coletas; aumente 'limite' ou estreite a janela.`;
    }
    if (normalizadas.length === 0) {
      payload.observacao =
        "Nenhuma expectativa nesta janela. Confirme o nome do indicador e a referência com " +
        "bcb_focus_referencias — a fonte é sensível ao texto exato — e lembre que a janela padrão é de " +
        `${JANELA_PADRAO_DIAS} dias.`;
    }

    return structuredResult(payload);
  } catch (error) {
    return erroResult(`Erro ao consultar expectativas do Focus: ${mensagemDeErro(error)}`);
  }
}

// ==================== bcb_focus_selic ====================

export interface ArgsSelic {
  reuniao?: string;
  dataInicial?: string;
  dataFinal?: string;
  top5?: boolean;
  limite?: number;
}

export async function handleFocusSelic(
  args: ArgsSelic,
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  const janela = resolverJanela(args.dataInicial, args.dataFinal);
  if ("erro" in janela) return erroResult(janela.erro);

  const filtro = [`Data ge ${odataString(janela.dataInicial)}`, `Data le ${odataString(janela.dataFinal)}`];
  if (args.reuniao !== undefined) filtro.push(`Reuniao eq ${odataString(args.reuniao)}`);

  const url = montarUrlOData(EXPECTATIVAS_ODATA, {
    recurso: args.top5 === true ? "ExpectativasMercadoTop5Selic" : "ExpectativasMercadoSelic",
    filtro,
    top: OLINDA_MAX_LINHAS
  });

  try {
    const linhas = await consultarOData(url, timeoutMs, maxRetries);
    const limite = args.limite ?? 50;
    const normalizadas = linhas.map(normalizarExpectativa).sort(maisRecentePrimeiro);
    const expectativas = normalizadas.slice(0, limite);

    const payload: Record<string, unknown> = {
      base: args.top5 === true ? "top5" : "consenso",
      filtro: {
        reuniao: args.reuniao ?? null,
        dataInicial: janela.dataInicial,
        dataFinal: janela.dataFinal,
        janelaPadrao: janela.padrao
      },
      totalRegistros: normalizadas.length,
      expectativas,
      urlConsulta: url,
      consultadoEm: new Date().toISOString(),
      observacaoEixo:
        "O eixo desta tool é a REUNIÃO do Copom (`referencia` no formato R1/2026), não o calendário — é por " +
        "isso que ela é separada de bcb_focus_expectativas."
    };

    if (expectativas.length < normalizadas.length) {
      payload.observacao = `Exibindo ${expectativas.length} de ${normalizadas.length} coletas; aumente 'limite' ou estreite a janela.`;
    }
    if (normalizadas.length === 0) {
      payload.observacao =
        "Nenhuma expectativa de Selic nesta janela. Reuniões usam o formato R1/2026 (1ª reunião de 2026); a " +
        `janela padrão é de ${JANELA_PADRAO_DIAS} dias.`;
    }

    return structuredResult(payload);
  } catch (error) {
    return erroResult(`Erro ao consultar expectativas de Selic: ${mensagemDeErro(error)}`);
  }
}

// ==================== bcb_focus_referencias ====================

export interface ArgsReferencias {
  indicador?: string;
  horizonte?: Horizonte;
}

export async function handleFocusReferencias(
  args: ArgsReferencias,
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  if (args.horizonte !== undefined && !RECURSOS[args.horizonte]) {
    return erroResult(`Horizonte inválido: "${args.horizonte}". Use um destes: ${HORIZONTES.join(", ")}.`);
  }

  const filtro: string[] = [];
  if (args.indicador !== undefined) filtro.push(`Indicador eq ${odataString(args.indicador)}`);

  const url = montarUrlOData(EXPECTATIVAS_ODATA, {
    recurso: "DatasReferencia",
    filtro,
    top: OLINDA_MAX_LINHAS
  });

  try {
    const linhas = await consultarOData(url, timeoutMs, maxRetries);

    const indicadores = [...new Set(linhas.map(l => textoOuNulo(l.Indicador)).filter((v): v is string => v !== null))].sort();
    const referencias = [
      ...new Set(linhas.map(l => textoOuNulo(l.DataReferencia)).filter((v): v is string => v !== null))
    ].sort();

    const horizontes = HORIZONTES.map(h => ({
      horizonte: h,
      formatoReferencia: RECURSOS[h].formatoReferencia,
      exigeReferencia: RECURSOS[h].campoReferencia !== null,
      temTop5: RECURSOS[h].top5 !== null
    }));

    return structuredResult({
      filtro: { indicador: args.indicador ?? null, horizonte: args.horizonte ?? null },
      indicadores,
      referencias,
      horizontes,
      totalRegistros: linhas.length,
      urlConsulta: url,
      consultadoEm: new Date().toISOString(),
      observacao:
        "Os nomes de indicador e as referências são sensíveis ao texto exato: copie daqui para " +
        "bcb_focus_expectativas. Expectativa de Selic por reunião do Copom fica em bcb_focus_selic."
    });
  } catch (error) {
    return erroResult(`Erro ao consultar referências do Focus: ${mensagemDeErro(error)}`);
  }
}

// ==================== SCHEMAS ====================

const ESTATISTICAS_PROPS = {
  indicador: { type: "string" as const, description: "Indicador conforme publicado pela fonte" },
  indicadorDetalhe: { type: "string" as const, description: "Detalhe do indicador, quando a fonte publica" },
  coletadoEm: { type: "string" as const, description: "Data da coleta das expectativas (yyyy-MM-dd)" },
  referencia: { type: "string" as const, description: "Alvo da expectativa (data de referência ou reunião do Copom); nulo nos horizontes rolantes" },
  media: { type: "number" as const, description: "Média das expectativas" },
  mediana: { type: "number" as const, description: "Mediana das expectativas" },
  desvioPadrao: { type: "number" as const, description: "Desvio padrão das expectativas" },
  minimo: { type: "number" as const, description: "Menor expectativa informada" },
  maximo: { type: "number" as const, description: "Maior expectativa informada" },
  respondentes: { type: "number" as const, description: "Número de instituições respondentes" },
  baseCalculo: { type: "number" as const, description: "Base de cálculo usada pela fonte" }
};

const EXPECTATIVA_ITEM_SCHEMA = {
  type: "object" as const,
  properties: {
    ...ESTATISTICAS_PROPS,
    suavizada: { type: "boolean" as const, description: "Só nos horizontes rolantes: indica a série suavizada" },
    tipoCalculo: { type: "string" as const, description: "Só no Top 5: tipo de cálculo publicado pela fonte" }
  },
  required: ["indicador", "coletadoEm", "mediana"]
};

const NOTA_FOCUS =
  "Fonte: Expectativas de Mercado (Focus) do Banco Central do Brasil, via Olinda OData. O Focus é vintage por " +
  "construção: `coletadoEm` é a data da coleta e `referencia` é o alvo da expectativa — a mesma referência " +
  "aparece em muitas coletas, e é isso que permite ver a expectativa mudar no tempo. A contagem é feita do " +
  "nosso lado porque a fonte ignora `$count`; e o filtro é obrigatório por construção porque consulta sem " +
  "filtro não completa na origem. Microdados por instituição NÃO são expostos: a fonte desativou esse recurso " +
  "por risco de quebra de confidencialidade.";

export const FOCUS_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "bcb_focus_expectativas",
    description:
      "Consulta as expectativas de mercado do boletim Focus para UM indicador, com o horizonte como parâmetro: " +
      "mensal, trimestral, anual, inflação nos próximos 12 meses e nos próximos 24 meses. Devolve média, " +
      "mediana, desvio padrão, mínimo, máximo e número de respondentes por data de coleta. " +
      "Quando usar: para expectativa de IPCA, IGP-M, PIB, câmbio e afins em um mês, trimestre ou ano " +
      "específico, ou para a inflação rolante. Quando NÃO usar: para expectativa de Selic por reunião do Copom " +
      "use bcb_focus_selic; para o valor REALIZADO (não esperado) use bcb_serie_valores. " +
      "Regras do contrato: `referencia` é obrigatória nos horizontes de calendário (mensal, trimestral, anual) " +
      "e recusada nos rolantes; `suavizada` só vale nos rolantes; `top5: true` traz as expectativas das cinco " +
      "instituições mais assertivas e existe apenas nos horizontes mensal e anual. Se não souber o texto exato " +
      "do indicador ou da referência, chame bcb_focus_referencias primeiro. " +
      "Retorna: `indicador`, `horizonte`, `base` (consenso|top5), `filtro` (referencia, dataInicial, dataFinal, " +
      "janelaPadrao, suavizada), `totalRegistros`, `expectativas` (array normalizado), `urlConsulta`, " +
      "`consultadoEm` e, quando aplicável, `observacao`. Sem datas, a janela padrão é de 30 dias. " +
      NOTA_FOCUS,
    annotations: leituraRemota("Expectativas de mercado (Focus)"),
    inputSchema: {
      type: "object" as const,
      properties: {
        indicador: {
          type: "string" as const,
          description: "Indicador exatamente como a fonte publica (ex.: 'IPCA', 'IGP-M', 'PIB Total', 'Câmbio'). Veja bcb_focus_referencias.",
          minLength: 2
        },
        horizonte: {
          type: "string" as const,
          enum: HORIZONTES,
          description: "mensal, trimestral e anual usam `referencia`; inflacao_12m e inflacao_24m são rolantes e não usam"
        },
        referencia: {
          type: "string" as const,
          description: "Alvo da expectativa: MM/yyyy (mensal), T/yyyy (trimestral) ou yyyy (anual). Obrigatória nesses três; proibida nos rolantes."
        },
        dataInicial: { type: "string" as const, description: "Início da janela de COLETA (yyyy-MM-dd ou dd/MM/yyyy). Padrão: 30 dias antes do fim." },
        dataFinal: { type: "string" as const, description: "Fim da janela de COLETA (yyyy-MM-dd ou dd/MM/yyyy). Padrão: hoje." },
        top5: { type: "boolean" as const, description: "Expectativas do Top 5 em vez do consenso (só mensal e anual)", default: false },
        suavizada: { type: "boolean" as const, description: "Só nos horizontes rolantes: série suavizada (true) ou não suavizada (false)" },
        limite: { type: "number" as const, description: "Máximo de coletas a devolver (1-500, padrão 50)", default: 50, minimum: 1, maximum: 500 }
      },
      required: ["indicador", "horizonte"]
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        indicador: { type: "string" as const },
        horizonte: { type: "string" as const, enum: HORIZONTES },
        base: { type: "string" as const, enum: ["consenso", "top5"] },
        filtro: {
          type: "object" as const,
          description: "Filtro efetivamente aplicado na origem",
          properties: {
            referencia: { type: "string" as const },
            dataInicial: { type: "string" as const },
            dataFinal: { type: "string" as const },
            janelaPadrao: { type: "boolean" as const, description: "true quando a janela de 30 dias foi assumida" },
            suavizada: { type: "boolean" as const }
          },
          required: ["dataInicial", "dataFinal", "janelaPadrao"]
        },
        totalRegistros: { type: "number" as const, description: "Coletas encontradas (contagem client-side)" },
        expectativas: { type: "array" as const, items: EXPECTATIVA_ITEM_SCHEMA },
        urlConsulta: { type: "string" as const, description: "URL OData consultada, reproduzível no navegador" },
        consultadoEm: { type: "string" as const, description: "Timestamp ISO 8601 da consulta" },
        observacao: { type: "string" as const }
      },
      required: ["indicador", "horizonte", "base", "filtro", "totalRegistros", "expectativas", "urlConsulta", "consultadoEm"]
    }
  },
  {
    name: "bcb_focus_selic",
    description:
      "Consulta as expectativas de mercado do Focus para a taxa Selic, organizadas pela REUNIÃO do Copom " +
      "(formato R1/2026 = 1ª reunião de 2026). Devolve média, mediana, desvio padrão, mínimo, máximo e número " +
      "de respondentes por data de coleta. " +
      "Quando usar: para 'o que o mercado espera da Selic na próxima reunião' ou a trajetória esperada de " +
      "juros. Quando NÃO usar: para expectativa de Selic média de um ano civil use bcb_focus_expectativas com " +
      "horizonte anual; para a Selic REALIZADA use bcb_serie_valores (códigos 432, 1178, 4390). " +
      "É separada de bcb_focus_expectativas porque o eixo temporal é a reunião do Copom, não o calendário. " +
      "Retorna: `base` (consenso|top5), `filtro`, `totalRegistros`, `expectativas` (com `referencia` = reunião), " +
      "`urlConsulta`, `consultadoEm` e `observacaoEixo`. Sem datas, a janela padrão é de 30 dias. " +
      NOTA_FOCUS,
    annotations: leituraRemota("Expectativas de Selic (Focus)"),
    inputSchema: {
      type: "object" as const,
      properties: {
        reuniao: { type: "string" as const, description: "Reunião do Copom no formato R1/2026 (opcional; sem ela, todas as reuniões da janela)" },
        dataInicial: { type: "string" as const, description: "Início da janela de COLETA (yyyy-MM-dd ou dd/MM/yyyy). Padrão: 30 dias antes do fim." },
        dataFinal: { type: "string" as const, description: "Fim da janela de COLETA (yyyy-MM-dd ou dd/MM/yyyy). Padrão: hoje." },
        top5: { type: "boolean" as const, description: "Expectativas do Top 5 em vez do consenso", default: false },
        limite: { type: "number" as const, description: "Máximo de coletas a devolver (1-500, padrão 50)", default: 50, minimum: 1, maximum: 500 }
      }
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        base: { type: "string" as const, enum: ["consenso", "top5"] },
        filtro: {
          type: "object" as const,
          properties: {
            reuniao: { type: "string" as const },
            dataInicial: { type: "string" as const },
            dataFinal: { type: "string" as const },
            janelaPadrao: { type: "boolean" as const }
          },
          required: ["dataInicial", "dataFinal", "janelaPadrao"]
        },
        totalRegistros: { type: "number" as const },
        expectativas: { type: "array" as const, items: EXPECTATIVA_ITEM_SCHEMA },
        urlConsulta: { type: "string" as const },
        consultadoEm: { type: "string" as const },
        observacaoEixo: { type: "string" as const },
        observacao: { type: "string" as const }
      },
      required: ["base", "filtro", "totalRegistros", "expectativas", "urlConsulta", "consultadoEm"]
    }
  },
  {
    name: "bcb_focus_referencias",
    description:
      "Lista os indicadores e as datas de referência que existem no Focus, para você usar o texto EXATO em " +
      "bcb_focus_expectativas. " +
      "Quando usar: antes da primeira consulta ao Focus, ou quando uma consulta volta vazia — a causa mais " +
      "comum é nome de indicador ou referência com texto diferente do publicado. Quando NÃO usar: para os " +
      "valores das expectativas em si. " +
      "Retorna: `indicadores` (lista distinta), `referencias` (lista distinta), `horizontes` (para cada " +
      "horizonte: formato da referência, se exige referência e se tem Top 5), `totalRegistros`, `urlConsulta` " +
      "e `consultadoEm`. " + NOTA_FOCUS,
    annotations: leituraRemota("Indicadores e referências do Focus"),
    inputSchema: {
      type: "object" as const,
      properties: {
        indicador: { type: "string" as const, description: "Filtrar as referências de um indicador específico (opcional)" },
        horizonte: { type: "string" as const, enum: HORIZONTES, description: "Apenas documenta o horizonte de interesse na resposta (opcional)" }
      }
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        filtro: {
          type: "object" as const,
          properties: {
            indicador: { type: "string" as const },
            horizonte: { type: "string" as const }
          }
        },
        indicadores: { type: "array" as const, items: { type: "string" as const }, description: "Indicadores publicados pela fonte" },
        referencias: { type: "array" as const, items: { type: "string" as const }, description: "Datas de referência publicadas" },
        horizontes: {
          type: "array" as const,
          description: "Regras de contrato por horizonte",
          items: {
            type: "object" as const,
            properties: {
              horizonte: { type: "string" as const, enum: HORIZONTES },
              formatoReferencia: { type: "string" as const },
              exigeReferencia: { type: "boolean" as const },
              temTop5: { type: "boolean" as const }
            },
            required: ["horizonte", "exigeReferencia", "temTop5"]
          }
        },
        totalRegistros: { type: "number" as const },
        urlConsulta: { type: "string" as const },
        consultadoEm: { type: "string" as const },
        observacao: { type: "string" as const }
      },
      required: ["indicadores", "referencias", "horizontes", "totalRegistros", "urlConsulta", "consultadoEm"]
    }
  }
];

/** Retorna null quando a tool não é deste módulo (o dispatcher central segue). */
export function dispatchFocusTool(
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> | null {
  switch (toolName) {
    case "bcb_focus_expectativas":
      return handleFocusExpectativas(args as unknown as ArgsExpectativas, timeoutMs, maxRetries);
    case "bcb_focus_selic":
      return handleFocusSelic(args as unknown as ArgsSelic, timeoutMs, maxRetries);
    case "bcb_focus_referencias":
      return handleFocusReferencias(args as unknown as ArgsReferencias, timeoutMs, maxRetries);
    default:
      return null;
  }
}
