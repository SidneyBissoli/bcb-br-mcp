/**
 * Estatística das tools quantitativas, servida pelo `@sbissoli/mcp-stats`
 * (componente da Fase 0 do portfólio — a matemática NÃO se reimplementa aqui).
 *
 * Por que existe (arbitragem 4 da fase): `bcb_variacao` e `bcb_comparar` eram a
 * estatística deste servidor, e cada uma tinha a sua. O decisor decidiu migrar as
 * duas para o motor comum **preservando o formato de saída** — troca o motor por
 * dentro, mesmos nomes de campo por fora —, com gate registrado em
 * `tools.characterization.test.ts` antes da migração: só passa se cada diferença
 * for nenhuma ou explicável.
 *
 * **A convenção de arredondamento unificada, que é a diferença explicável.**
 * Antes da migração as duas tools divergiam entre si: `bcb_variacao` arredondava
 * os extremos com `toFixed(4)`, `bcb_comparar` devolvia `Math.max`/`Math.min`
 * crus. A regra escolhida, agora única:
 *
 * - **Observação da fonte sai verbatim.** `maximo` e `minimo` são valores que o
 *   Banco Central publicou; arredondá-los inventaria um dado que não existe.
 *   (Era o que `bcb_variacao` fazia: 0,043739 saía 0,0437.) Isso também alinha
 *   os extremos com `valorInicial`/`valorFinal`, que nunca foram arredondados.
 * - **Número calculado por nós sai com 4 casas.** Média, amplitude, variação
 *   percentual e diferença absoluta são derivados; 4 casas é a precisão que as
 *   duas tools já usavam para eles.
 *
 * O efeito prático é que `bcb_comparar` não muda em nada e `bcb_variacao` passa a
 * devolver extremos verbatim — a única diferença de valor da migração inteira.
 */

import { computeCorrelation, computeStats, type CorrelationMethod } from "@sbissoli/mcp-stats";

/** Casas decimais de todo número que este servidor calcula. */
export const CASAS_DERIVADAS = 4;

/** Arredonda um valor DERIVADO. Não use em valor vindo da fonte. */
export function arredondarDerivado(valor: number): number {
  return Number(valor.toFixed(CASAS_DERIVADAS));
}

export interface EstatisticasSerie {
  /** Verbatim da fonte. */
  maximo: number;
  /** Verbatim da fonte. */
  minimo: number;
  /** Derivado, 4 casas. */
  media: number;
  /** Derivado, 4 casas. */
  amplitude: number;
  /** Observações consideradas. */
  n: number;
}

/**
 * Distribuição dos valores de uma série, pelo motor comum.
 *
 * `computeStats` recebe função de acesso (não nome de campo) porque o valor
 * canônico costuma precisar de parsing — aqui os valores já chegam numéricos.
 */
export function estatisticasDaSerie(valores: number[]): EstatisticasSerie {
  const e = computeStats(valores, v => v);

  return {
    maximo: e.max,
    minimo: e.min,
    media: arredondarDerivado(e.mean),
    amplitude: arredondarDerivado(e.max - e.min),
    n: e.n
  };
}

// ==================== VARIAÇÃO POR ENCADEAMENTO ====================

/**
 * Como `bcb_variacao` e `bcb_comparar` devem medir a variação de uma série.
 *
 * - `nivel`: `(último − primeiro) / primeiro`. É a conta certa para série de
 *   NÍVEL (dólar, Selic meta, dívida, produção) — o que a tool sempre fez.
 * - `encadeamento`: a série JÁ É uma variação percentual por período (IPCA, IGP-M,
 *   INPC mensais). Comparar a taxa de janeiro com a de dezembro não significa
 *   nada; o que se acumulou no período é `Π(1 + vᵢ/100) − 1`.
 * - `acumulado`: a série já é um acumulado em janela móvel (IPCA em 12 meses,
 *   série 13522). Nem nível nem encadeamento se aplicam — o valor do último mês
 *   É a resposta, e a tool recusa em vez de inventar.
 *
 * Existe porque a rodada paga de eval de 14/08/2026 achou, de raspão, um defeito
 * de correção vivo em produção: `bcb_variacao` publicava +23,81% para o IPCA de
 * 2024, quando o acumulado é 4,83%, e +252,38% para o IGP-M de 2023, quando o
 * índice CAIU 3,18%. A decisão de FORMA (encadear onde se pode afirmar que a série
 * é variação; recusar o acumulado móvel; declarar nível no resto) é do decisor,
 * sessão 10.
 */
export type MetodoVariacao = "nivel" | "encadeamento" | "acumulado";

/**
 * Acumula variações percentuais por período: `(Π(1 + vᵢ/100) − 1) × 100`.
 *
 * É a MESMA reconstrução do índice que `construirDeflator` faz em `series.ts`,
 * conferida contra a série 13522 em 11/08/2026 (erro máximo 0,0052 pp em 85
 * janelas). Devolve o valor cru; quem publica arredonda com `arredondarDerivado`.
 */
export function variacaoAcumulada(variacoesPct: number[]): number {
  let fator = 1;
  for (const v of variacoesPct) fator *= 1 + v / 100;
  return (fator - 1) * 100;
}

// ==================== CORRELAÇÃO ====================

export type MetodoCorrelacao = CorrelationMethod;
export type BaseCorrelacao = "nivel" | "variacao";

export interface CorrelacaoEntreSeries {
  /** `null` quando indefinido: menos de 2 pares completos, ou série constante. */
  coeficiente: number | null;
  /** Pares completos usados. */
  n: number;
  /** Pares descartados por falta de observação em uma das pontas. */
  descartados: number;
  /** Leitura em prosa da força e do sentido; `null` quando não há coeficiente. */
  interpretacao: string | null;
  /** Presente somente quando `coeficiente` é `null`. */
  motivo?: string;
}

const MOTIVO_INDEFINIDO: Record<string, string> = {
  "insufficient-pairs":
    "Menos de duas datas em que as duas séries publicam valor: não há dispersão para correlacionar.",
  "constant-series":
    "Ao menos uma das séries é constante no período (variância zero), e a correlação com uma constante é indefinida — não é zero."
};

/**
 * Faixas de leitura do coeficiente. Existem para que o rótulo seja SEMPRE o mesmo:
 * sem ele, quem lê a resposta escolhe o próprio limiar e chama 0,45 de "forte" numa
 * frase e de "fraca" na seguinte. Os cortes em 0,3 e 0,7 são a convenção mais comum
 * em ciências sociais aplicadas e vão declarados na nota de derivação.
 */
function interpretar(r: number): string {
  if (Math.abs(r) < 0.1) {
    return "Correlação praticamente nula: as duas séries não se moveram juntas no período.";
  }
  const forca = Math.abs(r) < 0.3 ? "fraca" : Math.abs(r) < 0.7 ? "moderada" : "forte";
  const sentido = r > 0 ? "positiva" : "negativa";
  const glosa = r > 0
    ? "as duas séries tenderam a subir e descer juntas"
    : "quando uma subiu, a outra tendeu a descer";
  return `Correlação ${sentido} ${forca}: ${glosa}.`;
}

/**
 * Correlação entre duas séries JÁ ALINHADAS na mesma grade, pelo motor comum.
 *
 * O alinhamento não acontece aqui de propósito — mora em `series.ts`, que é quem
 * conhece as grades do SGS. Aqui só se escolhe o método e se traduz o resultado para
 * a superfície pt-BR do servidor.
 */
export function correlacaoEntreSeries(
  pares: Array<{ a: number | null; b: number | null }>,
  metodo: MetodoCorrelacao
): CorrelacaoEntreSeries {
  const c = computeCorrelation(pares, p => p.a ?? NaN, p => p.b ?? NaN, { method: metodo });

  if (c.coefficient === null) {
    return {
      coeficiente: null,
      n: c.n,
      descartados: c.dropped,
      interpretacao: null,
      motivo: MOTIVO_INDEFINIDO[c.reason ?? ""] ?? "Coeficiente indefinido."
    };
  }

  return {
    coeficiente: arredondarDerivado(c.coefficient),
    n: c.n,
    descartados: c.dropped,
    interpretacao: interpretar(c.coefficient)
  };
}

/** Variação percentual ponto a ponto, para correlacionar movimento em vez de nível. */
export function emVariacoes(
  pares: Array<{ a: number | null; b: number | null }>
): Array<{ a: number | null; b: number | null }> {
  const saida: Array<{ a: number | null; b: number | null }> = [];
  for (let i = 1; i < pares.length; i++) {
    const varOf = (ant: number | null, atual: number | null): number | null =>
      ant === null || atual === null || ant === 0 ? null : ((atual - ant) / Math.abs(ant)) * 100;
    saida.push({ a: varOf(pares[i - 1].a, pares[i].a), b: varOf(pares[i - 1].b, pares[i].b) });
  }
  return saida;
}

/**
 * Bloco de derivação anexado às respostas que carregam número calculado.
 *
 * Existe porque a marcação `derived` faltava (a arbitragem 4 a previu como ganho
 * da migração) e porque o D4 vai consumir isto na proveniência: quem lê a
 * resposta precisa saber quais números são do Banco Central e quais são nossos.
 */
export const DERIVACAO_ESTATISTICA = {
  derived: true,
  motor: "@sbissoli/mcp-stats",
  nota:
    "Variação e estatísticas são calculadas por este servidor a partir das observações publicadas pelo " +
    "Banco Central, não são divulgadas por ele. Convenções: média aritmética simples das observações do " +
    "período; `maximo` e `minimo` são observações da fonte, devolvidas sem arredondamento; números " +
    "derivados (média, amplitude, variação, diferença) são arredondados em 4 casas decimais."
} as const;

/**
 * Derivação da variação por ENCADEAMENTO. Substitui a nota estatística quando a
 * série é ela própria uma variação: o leitor precisa saber que `variacaoPercentual`
 * é o acumulado composto do período, e não a comparação entre dois pontos.
 */
export const DERIVACAO_ENCADEAMENTO = {
  derived: true,
  motor: "@sbissoli/mcp-stats",
  nota:
    "Esta série já é uma variação percentual por período, então `variacaoPercentual` é o ACUMULADO no " +
    "período por encadeamento — (Π(1 + vᵢ/100) − 1) × 100 sobre todas as observações — e não a comparação " +
    "entre o primeiro e o último valor, que aqui não teria significado. `valorInicial` e `valorFinal` " +
    "seguem sendo as variações do primeiro e do último período; `diferencaAbsoluta` não se aplica e vem " +
    "nula. Estatísticas calculadas pelo servidor a partir das observações publicadas pelo Banco Central: " +
    "média aritmética simples; `maximo` e `minimo` verbatim da fonte; derivados em 4 casas decimais."
} as const;

/**
 * Derivação da correlação. Carrega os dois avisos que a tool precisa fazer sozinha,
 * porque o leitor não vai fazê-los: correlação não é causalidade, e correlação entre
 * NÍVEIS de duas séries com tendência é alta por construção (as duas crescem com o
 * tempo), o que é a armadilha mais comum de toda a estatística econômica aplicada.
 */
export const DERIVACAO_CORRELACAO = {
  derived: true,
  motor: "@sbissoli/mcp-stats",
  nota:
    "O coeficiente é calculado por este servidor a partir das observações publicadas pelo Banco Central; " +
    "o BCB não divulga correlações. Convenções: Pearson mede relação LINEAR entre os valores, Spearman " +
    "mede relação MONÓTONA entre os postos (com posto médio nos empates, adequado a séries que ficam " +
    "paradas, como taxa de juros entre reuniões do Copom); só entram datas em que as duas séries " +
    "publicam, e o descarte é declarado em `descartados`; coeficiente arredondado em 4 casas. " +
    "Leitura dos rótulos: |r| < 0,1 praticamente nula, < 0,3 fraca, < 0,7 moderada, >= 0,7 forte. " +
    "DUAS RESSALVAS: correlação não estabelece causalidade; e correlação entre NÍVEIS de séries que têm " +
    "tendência (preço, índice, estoque) costuma ser alta só porque ambas crescem com o tempo — use " +
    "`base: \"variacao\"` para correlacionar os movimentos em vez dos níveis."
} as const;

/**
 * Derivação da deflação. Diz de onde vem o índice, porque a resposta seria
 * incompreensível sem isso: o número real não existe em lugar nenhum na fonte — ele
 * nasce de um índice que o servidor reconstrói por encadeamento.
 */
export const DERIVACAO_DEFLACAO = {
  derived: true,
  motor: "bcb-br-mcp",
  nota:
    "Os valores reais são calculados por este servidor; o Banco Central publica apenas a série nominal e a " +
    "variação do índice de preços. Como o SGS não divulga número-índice, o índice é RECONSTRUÍDO pela " +
    "composição geométrica das variações mensais publicadas — reconstrução conferida contra a própria " +
    "fonte: 12 variações da série 433 compostas reproduzem o acumulado em 12 meses da série 13522 com " +
    "diferença máxima de 0,0052 ponto percentual (2018–2025), resíduo do arredondamento em 2 casas com " +
    "que o BCB publica a variação. Cada observação é deflacionada pelo fator do mês em que cai; " +
    "observação fora da cobertura do índice recebe `valorReal: null` em vez de valor inventado."
} as const;
