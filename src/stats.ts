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

import { computeStats } from "@sbissoli/mcp-stats";

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
