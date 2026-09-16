/**
 * O vocabulário da PERGUNTA contra o vocabulário da FONTE.
 *
 * `bcb_buscar_serie` casa os termos do usuário, em AND e sem acento, contra o
 * nome e a categoria do catálogo curado (135 séries) e contra o slug do
 * dataset no Portal de Dados Abertos (3.579 séries identificadas por código).
 * Quem pergunta com a palavra de todo dia não recebe um resultado ruim:
 * recebe ZERO, sem dizer por quê. Medido nas duas camadas em 2026-09-16
 * (curado / índice):
 *
 *   perguntado                  n         o BCB escreve                   n
 *   deficit, superavit          0 / 0     resultado primario           1 / 26
 *                                         resultado nominal            0 / 22
 *   calote                      0 / 0     inadimplencia               6 / 484
 *   juros basicos               0 / 0     selic                         5 / 7
 *   desemprego                  0 / 0     desocupacao                   1 / 0
 *   arrecadacao                 0 / 0     receita                       2 / 8
 *   gasto                       0 / 0     despesa                       0 / 8
 *   investimento estrangeiro    0 / 0     investimento direto          1 / 12
 *   conta corrente              0 / 0     transacoes correntes          1 / 5
 *
 * O acento já era tratado (`normalizeString`); o que faltava era a palavra.
 * "meta de inflacao" (0 / 0) não entra: a série da meta não está nem no
 * catálogo curado nem no índice do portal (o slug de "meta" é a meta Selic).
 * "emprestimo" (0 / 45) também não: o portal já responde por ele, e mapear
 * para "credito" (30 / 2.216) afogaria os 45 achados certos em 2 mil.
 * Regra desta tabela: só entra par MEDIDO — a palavra perguntada ausente (ou
 * quase) das duas camadas e a palavra da fonte presente. Nada de sinônimo
 * plausível sem contagem; termo que o BCB não publica por esse nome fica de
 * fora, porque inventar apelido para série inexistente é prometer o que a
 * fonte não tem. Medido e deixado de fora em 2026-09-16: salario minimo
 * (0 / 0), bolsa/ibovespa (0 / 0 — não é do BCB), pix (0 / 0 no índice por
 * código), bitcoin, juro real, commodities/ic-br (0 / 0).
 *
 * A MECÂNICA (frases da tabela antes da quebra em palavras, stopwords do
 * pt-BR fora do AND, singular sem caco, OR das grafias do BCB, a nota dita e
 * a ponta inversa para o acervo de `search`) mora em `@sbissoli/mcp-search`
 * desde a 0.5.0 — cinco servidores a carregavam em cópia; aqui fica só a
 * tabela. Os nomes exportados são os de sempre (em português), para quem
 * chama não mudar.
 */

import { createVocabulary, type ExpandedTerm } from "@sbissoli/mcp-search";

export interface EntradaVocabulario {
  /** Como o usuário escreve — normalizado (sem acento, minúsculo); pode ser frase. */
  readonly perguntado: string;
  /** Como o BCB escreve — substrings normalizadas, podendo ser frase. */
  readonly fonte: readonly string[];
}

export const VOCABULARIO: readonly EntradaVocabulario[] = [
  { perguntado: "deficit", fonte: ["resultado primario", "resultado nominal"] },
  { perguntado: "superavit", fonte: ["resultado primario", "resultado nominal"] },
  { perguntado: "calote", fonte: ["inadimplencia"] },
  { perguntado: "juros basicos", fonte: ["selic"] },
  { perguntado: "juro basico", fonte: ["selic"] },
  { perguntado: "desemprego", fonte: ["desocupacao"] },
  { perguntado: "arrecadacao", fonte: ["receita"] },
  { perguntado: "gasto", fonte: ["despesa"] },
  { perguntado: "investimento estrangeiro", fonte: ["investimento direto", "investimentos diretos"] },
  { perguntado: "conta corrente", fonte: ["transacoes correntes"] }
];

const vocabulario = createVocabulary({
  entries: VOCABULARIO.map(e => ({ asked: e.perguntado, source: e.fonte })),
  locale: "pt-BR",
  sourceName: "o BCB"
});

export interface TermoExpandido {
  readonly termo: string;
  readonly padroes: readonly string[];
  /** A tabela (não a mera flexão de plural) mudou o que se procura. */
  readonly traduzido: boolean;
}

const emPortugues = (e: ExpandedTerm): TermoExpandido => ({ termo: e.term, padroes: e.patterns, traduzido: e.translated });
const emIngles = (e: TermoExpandido): ExpandedTerm => ({ term: e.termo, patterns: e.padroes, translated: e.traduzido });

/** Sem acento, caixa baixa, espaços colapsados — o mesmo funil do ranking. */
export const normalizar = vocabulario.normalize;
/** A busca inteira, termo a termo (frases da tabela viram UM termo antes da quebra). */
export function expandirBusca(busca: string): TermoExpandido[] {
  return vocabulario.expandQuery(busca).map(emPortugues);
}
/** A frase que conta ao chamador que a palavra dele não é a do BCB. */
export function notasDeVocabulario(expandidos: readonly TermoExpandido[]): string[] {
  return vocabulario.vocabularyNotes(expandidos.map(emIngles));
}
/** Um texto (já normalizado) casa TODOS os termos expandidos? */
export function casaBusca(textoNormalizado: string, expandidos: readonly TermoExpandido[]): boolean {
  return vocabulario.matchesQuery(textoNormalizado, expandidos.map(emIngles));
}
/** A ponta inversa: as palavras com que se PERGUNTA por este nome — keywords do acervo de `search`. */
export const palavrasPerguntadas = vocabulario.askedWordsFor;
