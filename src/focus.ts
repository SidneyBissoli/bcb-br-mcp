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
import { erroResult, leituraRemota, mensagemDeErro, type ToolDefinition, type ToolResult } from "./shared.js";
import {
  provenienciaBcb,
  resultadoComProveniencia,
  type Proveniencia
} from "./provenance.js";

export type Horizonte = "mensal" | "trimestral" | "anual" | "inflacao_12m" | "inflacao_24m";

/**
 * Bloco de proveniência de uma consulta ao Focus.
 *
 * A competência sai do campo `Data` das próprias coletas — **o Focus é vintage
 * por construção**, e é a única das três APIs em que a fonte publica a data em
 * que a expectativa foi coletada. Zero requisição a mais.
 */
function provFocus(opts: {
  url: string;
  recurso: string;
  detalhe: string;
  coletas: Array<{ coletadoEm: string | null }>;
}): Proveniencia {
  const datas = opts.coletas.map(c => c.coletadoEm).filter((d): d is string => d !== null).sort();
  const vintage =
    datas.length === 0 ? null : datas[0] === datas[datas.length - 1] ? datas[0] : `${datas[0]}–${datas[datas.length - 1]}`;

  return provenienciaBcb({
    fonte: "FOCUS",
    url: opts.url,
    dataset: { id: opts.recurso, name: "Expectativas de Mercado (Focus)", version: null },
    dataVintage: vintage,
    detalheCitacao: opts.detalhe
  });
}

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
 * recursos: se a fonte renomear ou deixar de oferecer Top 5 em algum horizonte, a
 * correção é uma linha aqui.
 *
 * Os nomes foram lidos do documento de serviço do OData contra a origem, não
 * supostos. Repare na irregularidade da fonte, que é real e não erro de digitação:
 * o mensal é `ExpectativaMercadoMensais` (singular) e o Top 5 trimestral é
 * `ExpectativaMercadoTop5Trimestral` (singular nas duas pontas), enquanto todo o
 * resto é plural.
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
    top5: "ExpectativaMercadoTop5Trimestral",
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
    top5: "ExpectativasMercadoTop5Inflacao12Meses",
    campoReferencia: null,
    formatoReferencia: null
  },
  inflacao_24m: {
    consenso: "ExpectativasMercadoInflacao24Meses",
    top5: "ExpectativasMercadoTop5Inflacao24Meses",
    campoReferencia: null,
    formatoReferencia: null
  }
};

/** Recurso de Selic, fora do mapa de horizontes porque o eixo é a reunião do Copom. */
export const RECURSO_SELIC = { consenso: "ExpectativasMercadoSelic", top5: "ExpectativasMercadoTop5Selic" } as const;

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
  /** Só no Top 5 da Selic: único recurso da fonte que publica este campo. */
  coeficienteVariacao?: number | null;
}

/**
 * Lê o primeiro nome presente. Existe porque a fonte NÃO é uniforme na caixa dos
 * campos: `ExpectativasMercadoTop5Selic` publica `indicador`, `reuniao`, `media`,
 * `mediana`, `desvioPadrao`, `minimo` e `maximo` em caixa baixa, enquanto todos os
 * outros doze recursos usam inicial maiúscula. Verificado contra a origem.
 */
function primeiroCampo(linha: Record<string, unknown>, ...nomes: string[]): unknown {
  for (const nome of nomes) if (linha[nome] !== undefined) return linha[nome];
  return undefined;
}

/**
 * Normaliza uma linha do OData. Defensivo de propósito: os recursos não têm o
 * mesmo conjunto de campos, o alvo aparece como `DataReferencia` (calendário) ou
 * `Reuniao` (Selic), e a caixa dos nomes varia entre recursos.
 */
export function normalizarExpectativa(linha: Record<string, unknown>): ExpectativaNormalizada {
  const normalizada: ExpectativaNormalizada = {
    indicador: textoOuNulo(primeiroCampo(linha, "Indicador", "indicador")),
    indicadorDetalhe: textoOuNulo(primeiroCampo(linha, "IndicadorDetalhe", "indicadorDetalhe")),
    coletadoEm: textoOuNulo(primeiroCampo(linha, "Data", "data")),
    referencia:
      textoOuNulo(primeiroCampo(linha, "DataReferencia", "dataReferencia")) ??
      textoOuNulo(primeiroCampo(linha, "Reuniao", "reuniao")),
    media: numeroOuNulo(primeiroCampo(linha, "Media", "media")),
    mediana: numeroOuNulo(primeiroCampo(linha, "Mediana", "mediana")),
    desvioPadrao: numeroOuNulo(primeiroCampo(linha, "DesvioPadrao", "desvioPadrao")),
    minimo: numeroOuNulo(primeiroCampo(linha, "Minimo", "minimo")),
    maximo: numeroOuNulo(primeiroCampo(linha, "Maximo", "maximo")),
    respondentes: numeroOuNulo(primeiroCampo(linha, "numeroRespondentes", "NumeroRespondentes")),
    baseCalculo: numeroOuNulo(primeiroCampo(linha, "baseCalculo", "BaseCalculo"))
  };

  const suavizada = primeiroCampo(linha, "Suavizada", "suavizada");
  if (suavizada !== undefined) {
    const bruto = textoOuNulo(suavizada);
    normalizada.suavizada = bruto === null ? null : bruto.toUpperCase().startsWith("S");
  }

  const tipoCalculo = primeiroCampo(linha, "tipoCalculo", "TipoCalculo");
  if (tipoCalculo !== undefined) normalizada.tipoCalculo = textoOuNulo(tipoCalculo);

  const coeficiente = primeiroCampo(linha, "coeficienteVariacao", "CoeficienteVariacao");
  if (coeficiente !== undefined) normalizada.coeficienteVariacao = numeroOuNulo(coeficiente);

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

    return resultadoComProveniencia(
      payload,
      provFocus({
        url,
        recurso: args.top5 === true ? (recurso.top5 as string) : recurso.consenso,
        detalhe: `${args.indicador}, horizonte ${args.horizonte}`,
        coletas: normalizadas
      })
    );
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
    recurso: args.top5 === true ? RECURSO_SELIC.top5 : RECURSO_SELIC.consenso,
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

    return resultadoComProveniencia(
      payload,
      provFocus({
        url,
        recurso: args.top5 === true ? RECURSO_SELIC.top5 : RECURSO_SELIC.consenso,
        detalhe: "Selic, eixo reunião do Copom",
        coletas: normalizadas
      })
    );
  } catch (error) {
    return erroResult(`Erro ao consultar expectativas de Selic: ${mensagemDeErro(error)}`);
  }
}

// ==================== bcb_focus_referencias ====================

/** Escopos de descoberta: os cinco horizontes mais a Selic, que é tool própria. */
export type EscopoReferencias = Horizonte | "selic";

const ESCOPOS: EscopoReferencias[] = [...HORIZONTES, "selic"];

/** Janela de coleta da descoberta. O Focus é coletado em todo dia útil, então
 * quinze dias sempre contêm coletas — e a lista de referências muda devagar. */
const JANELA_REFERENCIAS_DIAS = 15;

interface PlanoEscopo {
  escopo: EscopoReferencias;
  tool: string;
  recurso: string;
  campoReferencia: string | null;
  formatoReferencia: string | null;
  temTop5: boolean;
}

function planoDoEscopo(escopo: EscopoReferencias): PlanoEscopo {
  if (escopo === "selic") {
    return {
      escopo,
      tool: "bcb_focus_selic",
      recurso: RECURSO_SELIC.consenso,
      campoReferencia: "Reuniao",
      formatoReferencia: "RN/yyyy (ex.: R1/2027 = 1ª reunião do Copom de 2027)",
      temTop5: true
    };
  }
  const recurso = RECURSOS[escopo];
  return {
    escopo,
    tool: "bcb_focus_expectativas",
    recurso: recurso.consenso,
    campoReferencia: recurso.campoReferencia,
    formatoReferencia: recurso.formatoReferencia,
    temTop5: recurso.top5 !== null
  };
}

/**
 * Ordena referências em ordem CRONOLÓGICA, não lexicográfica. Sem isso o mensal
 * sai "01/2027, 01/2028, 02/2027", que é ruído para quem lê a lista. Os quatro
 * formatos da fonte reduzem ao mesmo par (ano, posição dentro do ano):
 * `MM/yyyy`, `T/yyyy`, `RN/yyyy` e `yyyy`.
 */
function chaveCronologica(referencia: string): [number, number] {
  const composta = /^R?(\d{1,2})\/(\d{4})$/.exec(referencia);
  if (composta) return [Number(composta[2]), Number(composta[1])];
  if (/^\d{4}$/.test(referencia)) return [Number(referencia), 0];
  return [Number.MAX_SAFE_INTEGER, 0];
}

function ordenarReferencias(referencias: string[]): string[] {
  return [...referencias].sort((a, b) => {
    const [anoA, posA] = chaveCronologica(a);
    const [anoB, posB] = chaveCronologica(b);
    return anoA - anoB || posA - posB || a.localeCompare(b);
  });
}

export interface ArgsReferencias {
  indicador?: string;
  escopo?: EscopoReferencias;
}

/**
 * Descobre os textos EXATOS de indicador e de referência, por escopo.
 *
 * O parâmetro chama-se `escopo`, e não `horizonte`, de propósito: os cinco
 * horizontes de `bcb_focus_expectativas` mais a Selic — cujo eixo é a reunião do
 * Copom, não o calendário — não formam um conjunto de horizontes. Esta tool cobre
 * tudo o que o Focus publica, e cada bloco diz em `tool` quem o consome.
 *
 * O desenho consulta os próprios recursos de expectativa — e não o recurso
 * `DatasReferencia`, que o nome sugere e que foi descartado com o spike contra a
 * origem: ele publica `Indicador`, `periodo`, `DataReferencia1` e
 * `DataReferencia2` (não existe `DataReferencia`), cobre 11 indicadores contra os
 * 26 do recurso anual, não separa por escopo e, para o IPCA, para em 12/2026
 * enquanto as expectativas mensais já carregam referência 07/2028. É um calendário
 * de datas de referência, não um índice das referências consultáveis.
 *
 * A quebra POR ESCOPO é o ponto: o conjunto de indicadores varia muito entre eles
 * (9 no mensal contra 26 no anual), e pedir um indicador no horizonte errado —
 * "PIB Total" no mensal, por exemplo — é justamente o modo mais comum de a
 * consulta voltar vazia sem explicação.
 */
export async function handleFocusReferencias(
  args: ArgsReferencias,
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  if (args.escopo !== undefined && !ESCOPOS.includes(args.escopo)) {
    return erroResult(`Escopo inválido: "${args.escopo}". Use um destes: ${ESCOPOS.join(", ")}.`);
  }

  const escopos = args.escopo !== undefined ? [args.escopo] : ESCOPOS;
  const dataFinal = hojeIso();
  const dataInicial = somarDiasIso(dataFinal, -JANELA_REFERENCIAS_DIAS);

  const consultas = escopos.map(escopo => {
    const plano = planoDoEscopo(escopo);
    // Filtro por construção, como em toda tool desta camada; `$select` corta o
    // payload em ~4x (medido), porque aqui só interessam dois campos.
    const filtro = [`Data ge ${odataString(dataInicial)}`, `Data le ${odataString(dataFinal)}`];
    if (args.indicador !== undefined) filtro.push(`Indicador eq ${odataString(args.indicador)}`);

    const url = montarUrlOData(EXPECTATIVAS_ODATA, {
      recurso: plano.recurso,
      select: plano.campoReferencia ? ["Indicador", plano.campoReferencia] : ["Indicador"],
      filtro,
      top: OLINDA_MAX_LINHAS
    });
    return { plano, url };
  });

  const respostas = await Promise.allSettled(
    consultas.map(c => consultarOData(c.url, timeoutMs, maxRetries))
  );

  const indicadoresUniao = new Set<string>();
  const referenciasUniao = new Set<string>();
  const falhas: Array<{ escopo: string; erro: string }> = [];
  let totalRegistros = 0;

  const blocos = consultas.map(({ plano, url }, i) => {
    const resposta = respostas[i];
    const linhas = resposta.status === "fulfilled" ? resposta.value : [];
    if (resposta.status === "rejected") {
      falhas.push({ escopo: plano.escopo, erro: mensagemDeErro(resposta.reason) });
    }

    const indicadores = [
      ...new Set(linhas.map(l => textoOuNulo(l.Indicador ?? l.indicador)).filter((v): v is string => v !== null))
    ].sort();
    const referencias = plano.campoReferencia
      ? ordenarReferencias([
          ...new Set(
            linhas
              .map(l => textoOuNulo(l[plano.campoReferencia as string] ?? l[(plano.campoReferencia as string).toLowerCase()]))
              .filter((v): v is string => v !== null)
          )
        ])
      : [];

    indicadores.forEach(v => indicadoresUniao.add(v));
    referencias.forEach(v => referenciasUniao.add(v));
    totalRegistros += linhas.length;

    return {
      escopo: plano.escopo,
      tool: plano.tool,
      formatoReferencia: plano.formatoReferencia,
      exigeReferencia: plano.campoReferencia !== null && plano.escopo !== "selic",
      temTop5: plano.temTop5,
      indicadores,
      referencias,
      urlConsulta: url,
      disponivel: resposta.status === "fulfilled"
    };
  });

  // Só é erro se NADA respondeu: com a origem instável, meia resposta ainda é útil.
  if (falhas.length === escopos.length) {
    return erroResult(`Erro ao consultar referências do Focus: ${falhas[0].erro}`);
  }

  const payload: Record<string, unknown> = {
    filtro: { indicador: args.indicador ?? null, escopo: args.escopo ?? null },
    janela: { dataInicial, dataFinal },
    indicadores: [...indicadoresUniao].sort(),
    referencias: ordenarReferencias([...referenciasUniao]),
    escopos: blocos,
    totalRegistros,
    consultadoEm: new Date().toISOString(),
    observacao:
      "Os nomes de indicador e as referências são sensíveis ao texto EXATO: copie daqui para " +
      "bcb_focus_expectativas (ou para bcb_focus_selic, no caso das reuniões do Copom) — o campo `tool` de cada " +
      "escopo diz qual. Repare que o conjunto de indicadores muda por escopo: pedir um indicador no horizonte " +
      "em que a fonte não o publica é a causa mais comum de resposta vazia. As listas refletem as coletas dos " +
      `últimos ${JANELA_REFERENCIAS_DIAS} dias.`
  };

  if (falhas.length > 0) {
    payload.falhas = falhas;
    payload.observacaoFalhas =
      `${falhas.length} de ${escopos.length} escopos não responderam nesta consulta; os demais estão completos. ` +
      "Escopos com `disponivel: false` têm listas vazias por indisponibilidade, não por ausência de dado.";
  }
  if (args.indicador !== undefined && indicadoresUniao.size === 0 && falhas.length === 0) {
    payload.observacaoFalhas =
      `Nenhum escopo publica o indicador "${args.indicador}" nos últimos ${JANELA_REFERENCIAS_DIAS} dias. ` +
      "Chame esta tool SEM `indicador` para ver a lista de nomes publicados por escopo.";
  }

  return resultadoComProveniencia(
    payload,
    provenienciaBcb({
      fonte: "FOCUS",
      // Vários recursos numa resposta só: o `source_url` é o endpoint-base e cada
      // escopo entra com a própria URL em `field_sources`.
      url: EXPECTATIVAS_ODATA,
      dataset: {
        id: consultas.map(c => c.plano.recurso).join(", "),
        name: "descoberta de indicadores e referências",
        version: null
      },
      dataVintage: `${dataInicial}–${dataFinal}`,
      detalheCitacao: "referências publicadas por escopo",
      fontesPorCampo: consultas.map(({ plano, url }) => ({
        fields: [`escopos[escopo=${plano.escopo}]`],
        source_url: url,
        dataset_id: plano.recurso
      }))
    })
  );
}

// ==================== SCHEMAS ====================

/**
 * Todo campo aqui é anulável de propósito, e o schema precisa dizer isso: os
 * treze recursos da fonte não publicam o mesmo conjunto de campos (o Top 5 não
 * traz `numeroRespondentes` nem `baseCalculo`, os rolantes não têm referência), e
 * a normalização devolve `null` em vez de omitir — nulo é a informação de que a
 * fonte não publica aquilo ali. Anunciar `type: "string"` e servir `null` quebra
 * cliente que valida `structuredContent` contra o `outputSchema`, como a spec
 * manda e como o Inspector faz.
 */
const ESTATISTICAS_PROPS = {
  indicador: { type: ["string", "null"] as const, description: "Indicador conforme publicado pela fonte" },
  indicadorDetalhe: { type: ["string", "null"] as const, description: "Detalhe do indicador, quando a fonte publica" },
  coletadoEm: { type: ["string", "null"] as const, description: "Data da coleta das expectativas (yyyy-MM-dd)" },
  referencia: { type: ["string", "null"] as const, description: "Alvo da expectativa (data de referência ou reunião do Copom); nulo nos horizontes rolantes" },
  media: { type: ["number", "null"] as const, description: "Média das expectativas" },
  mediana: { type: ["number", "null"] as const, description: "Mediana das expectativas" },
  desvioPadrao: { type: ["number", "null"] as const, description: "Desvio padrão das expectativas" },
  minimo: { type: ["number", "null"] as const, description: "Menor expectativa informada" },
  maximo: { type: ["number", "null"] as const, description: "Maior expectativa informada" },
  respondentes: { type: ["number", "null"] as const, description: "Número de instituições respondentes; nulo no Top 5, que a fonte não acompanha deste campo" },
  baseCalculo: { type: ["number", "null"] as const, description: "Base de cálculo usada pela fonte; nulo no Top 5" }
};

const EXPECTATIVA_ITEM_SCHEMA = {
  type: "object" as const,
  properties: {
    ...ESTATISTICAS_PROPS,
    suavizada: { type: ["boolean", "null"] as const, description: "Só nos horizontes rolantes: indica a série suavizada" },
    tipoCalculo: { type: ["string", "null"] as const, description: "Só no Top 5: tipo de cálculo publicado pela fonte" },
    coeficienteVariacao: { type: ["number", "null"] as const, description: "Só no Top 5 da Selic: único recurso da fonte que publica este campo" }
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
      "instituições mais assertivas e existe nos cinco horizontes. Se não souber o texto exato do indicador ou " +
      "da referência, chame bcb_focus_referencias primeiro — o conjunto de indicadores MUDA por horizonte, e " +
      "pedir um indicador no horizonte em que a fonte não o publica é a causa mais comum de resposta vazia. " +
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
        top5: { type: "boolean" as const, description: "Expectativas do Top 5 (as cinco instituições mais assertivas) em vez do consenso; existe nos cinco horizontes", default: false },
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
          description: "Filtro efetivamente aplicado na origem; nulo onde o parâmetro não foi informado",
          properties: {
            referencia: { type: ["string", "null"] as const },
            dataInicial: { type: "string" as const },
            dataFinal: { type: "string" as const },
            janelaPadrao: { type: "boolean" as const, description: "true quando a janela de 30 dias foi assumida" },
            suavizada: { type: ["boolean", "null"] as const }
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
          description: "Filtro efetivamente aplicado; `reuniao` é nula quando não foi informada",
          properties: {
            reuniao: { type: ["string", "null"] as const },
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
      "Lista, POR ESCOPO, os indicadores e as referências que o Focus efetivamente publica, para você usar o " +
      "texto EXATO em bcb_focus_expectativas e em bcb_focus_selic. Escopo = os cinco horizontes de " +
      "bcb_focus_expectativas mais 'selic', que não é horizonte: o eixo dela é a reunião do Copom, e quem a " +
      "consome é bcb_focus_selic. Cada bloco diz em `tool` quem o consome. " +
      "Quando usar: antes da primeira consulta ao Focus, ou quando uma consulta volta vazia — a causa mais " +
      "comum não é o dado faltar, é o indicador não existir NAQUELE escopo (a fonte publica 9 indicadores no " +
      "mensal e 26 no anual: 'PIB Total', por exemplo, não existe no mensal) ou a referência estar num formato " +
      "diferente do publicado. Quando NÃO usar: para os valores das expectativas em si. " +
      "Sem `escopo`, consulta os seis e devolve tudo; com `escopo`, consulta só aquele. " +
      "Retorna: `escopos` (para cada um: `tool` que o consome, `formatoReferencia`, `exigeReferencia`, " +
      "`temTop5`, `indicadores`, `referencias`, `urlConsulta` e `disponivel`), mais `indicadores` e " +
      "`referencias` como união de todos, `janela`, `totalRegistros` e `consultadoEm`. Se algum escopo não " +
      "responder, os demais voltam mesmo assim, com `falhas` preenchido. " + NOTA_FOCUS,
    annotations: leituraRemota("Indicadores e referências do Focus"),
    inputSchema: {
      type: "object" as const,
      properties: {
        indicador: { type: "string" as const, description: "Filtrar por um indicador específico, para ver em quais escopos ele existe (opcional)" },
        escopo: {
          type: "string" as const,
          enum: ESCOPOS,
          description: "Restringe a descoberta a um escopo (opcional). 'selic' descobre as reuniões do Copom para bcb_focus_selic; os demais são os horizontes de bcb_focus_expectativas."
        }
      }
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        filtro: {
          type: "object" as const,
          description: "Filtro pedido; nulo onde o parâmetro não foi informado",
          properties: {
            indicador: { type: ["string", "null"] as const },
            escopo: { type: ["string", "null"] as const, description: `Um de: ${ESCOPOS.join(", ")}; nulo quando a consulta cobriu todos` }
          }
        },
        janela: {
          type: "object" as const,
          description: "Janela de coleta observada para montar as listas",
          properties: {
            dataInicial: { type: "string" as const },
            dataFinal: { type: "string" as const }
          },
          required: ["dataInicial", "dataFinal"]
        },
        indicadores: { type: "array" as const, items: { type: "string" as const }, description: "União dos indicadores de todos os escopos consultados" },
        referencias: { type: "array" as const, items: { type: "string" as const }, description: "União das referências de todos os escopos consultados" },
        escopos: {
          type: "array" as const,
          description: "Um bloco por escopo: regras do contrato mais o que a fonte publica nele",
          items: {
            type: "object" as const,
            properties: {
              escopo: { type: "string" as const, enum: ESCOPOS },
              tool: { type: "string" as const, description: "Tool que consome este escopo" },
              formatoReferencia: { type: ["string", "null"] as const, description: "Formato da referência; nulo nos horizontes rolantes, que não têm alvo de calendário" },
              exigeReferencia: { type: "boolean" as const, description: "true nos horizontes de calendário, onde `referencia` é obrigatória" },
              temTop5: { type: "boolean" as const },
              indicadores: { type: "array" as const, items: { type: "string" as const }, description: "Indicadores publicados NESTE escopo" },
              referencias: { type: "array" as const, items: { type: "string" as const }, description: "Referências publicadas NESTE escopo; vazio nos rolantes, que não têm alvo de calendário" },
              urlConsulta: { type: "string" as const },
              disponivel: { type: "boolean" as const, description: "false quando a origem não respondeu por este escopo — listas vazias por indisponibilidade, não por ausência de dado" }
            },
            required: ["escopo", "tool", "exigeReferencia", "temTop5", "indicadores", "referencias", "urlConsulta", "disponivel"]
          }
        },
        totalRegistros: { type: "number" as const },
        falhas: {
          type: "array" as const,
          description: "Escopos que não responderam nesta consulta",
          items: {
            type: "object" as const,
            properties: {
              escopo: { type: "string" as const },
              erro: { type: "string" as const }
            },
            required: ["escopo", "erro"]
          }
        },
        consultadoEm: { type: "string" as const },
        observacao: { type: "string" as const },
        observacaoFalhas: { type: "string" as const }
      },
      required: ["indicadores", "referencias", "escopos", "janela", "totalRegistros", "consultadoEm"]
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
