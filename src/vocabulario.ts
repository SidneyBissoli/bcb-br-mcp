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
 * Vale para os dois caminhos de busca, pelas duas pontas da mesma tabela:
 * `bcb_buscar_serie` expande o TERMO (OR dentro do termo, AND entre termos —
 * expandir só aumenta o recall, nunca perde casamento que já havia) e o acervo
 * de `search` (Deep Research) recebe a palavra perguntada como KEYWORD da
 * série cujo nome traz a palavra da fonte.
 *
 * Mesma receita de `src/ilostat/vocabulary.ts` (ilo 0.6.0), `src/uis/vocabulary.ts`
 * (uis 0.3.0), `src/vocabulario.ts` (ibge 5.1.0) e `src/clients/cid10-vocabulary.ts`
 * (medical 1.12.0) — cinco servidores com ela: candidata a `@sbissoli/mcp-search`.
 */

import { normalizeString } from "./shared.js";

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

const POR_PERGUNTADO: ReadonlyMap<string, readonly string[]> = new Map(VOCABULARIO.map(e => [e.perguntado, e.fonte]));

/** As frases da tabela (com espaço), da mais longa para a mais curta — casam antes da quebra em palavras. */
const FRASES: readonly string[] = VOCABULARIO.map(e => e.perguntado)
  .filter(p => p.includes(" "))
  .sort((a, b) => b.length - a.length);

/**
 * Palavras que não carregam significado no nome de uma série e, em AND,
 * excluem resultado certo ("taxa de juros" não pode morrer no "de"). Só saem
 * quando sobra algum termo — busca feita só de stopword continua valendo.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "o", "as", "os", "um", "uma", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
  "ao", "aos", "por", "para", "com", "sem", "que", "ou"
]);

/** Sem acento, caixa baixa, espaços colapsados — o `normalizeString` do servidor, mais o colapso. */
export function normalizar(texto: string): string {
  return normalizeString(texto).replace(/\s+/g, " ").trim();
}

/**
 * Forma singular de um termo já normalizado — a substring mais curta casa o
 * plural também. Só as regras do português que não fabricam caco.
 */
function singulares(termo: string): string[] {
  if (termo.length > 4 && (termo.endsWith("oes") || termo.endsWith("aes"))) return [`${termo.slice(0, -3)}ao`];
  if (termo.length > 4 && /(ais|eis|ois)$/.test(termo)) return [`${termo.slice(0, -2)}l`];
  if (termo.length > 3 && termo.endsWith("s") && !termo.endsWith("ss")) return [termo.slice(0, -1)];
  return [];
}

export interface TermoExpandido {
  readonly termo: string;
  readonly padroes: readonly string[];
  /** A tabela (não a mera flexão de plural) mudou o que se procura. */
  readonly traduzido: boolean;
}

function expandirUm(termo: string): TermoExpandido {
  const padroes = [termo, ...(POR_PERGUNTADO.get(termo) ?? []), ...singulares(termo).flatMap(s => [s, ...(POR_PERGUNTADO.get(s) ?? [])])];
  const traduzido = POR_PERGUNTADO.has(termo) || singulares(termo).some(s => POR_PERGUNTADO.has(s));
  return { termo, padroes: [...new Set(padroes)], traduzido };
}

/**
 * A busca inteira, termo a termo. Uma frase da tabela ("conta corrente",
 * "juros basicos") vira UM termo antes da quebra em palavras — senão
 * "corrente" e "basicos" entrariam no AND e matariam o resultado. O que sobra
 * é quebrado em palavras, sem stopword, cada uma expandida.
 */
export function expandirBusca(busca: string): TermoExpandido[] {
  let resto = ` ${normalizar(busca)} `;
  const saida: TermoExpandido[] = [];
  for (const frase of FRASES) {
    const agulha = ` ${frase} `;
    if (resto.includes(agulha)) {
      saida.push(expandirUm(frase));
      resto = resto.replace(agulha, " ");
    }
  }
  const palavras = resto.split(" ").filter(Boolean);
  const ficam = palavras.filter(p => !STOPWORDS.has(p));
  for (const p of ficam.length || saida.length ? ficam : palavras) saida.push(expandirUm(p));
  return saida;
}

/**
 * A frase que conta ao chamador que a palavra dele não é a do BCB — sem isto a
 * tradução é invisível e o resultado parece vir do que ele escreveu.
 */
export function notasDeVocabulario(expandidos: readonly TermoExpandido[]): string[] {
  return expandidos
    .filter(e => e.traduzido)
    .map(e => {
      const outros = e.padroes.filter(p => p !== e.termo);
      return `"${e.termo}" também foi buscado como ${outros.join(", ")} — a palavra que o BCB usa.`;
    });
}

/** Um texto (já normalizado) casa TODOS os termos expandidos? */
export function casaBusca(textoNormalizado: string, expandidos: readonly TermoExpandido[]): boolean {
  return expandidos.every(e => e.padroes.some(p => textoNormalizado.includes(p)));
}

/**
 * A ponta inversa da tabela: as palavras com que se PERGUNTA por este nome de
 * série — keywords do acervo de `search`, que ranqueia por relevância em vez
 * de casar substring.
 */
export function palavrasPerguntadas(nome: string): string[] {
  const n = normalizar(nome);
  const saida = VOCABULARIO.filter(e => e.fonte.some(f => n.includes(f))).map(e => e.perguntado);
  return [...new Set(saida)];
}
