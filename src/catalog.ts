/**
 * Índice de séries do Portal de Dados Abertos do BCB (CKAN) — busca real.
 *
 * Desenho fechado pelo decisor na fase bcb (arbitragem 5), e as restrições
 * importam mais que o código:
 *
 * - Fonte é `package_list` do CKAN: UMA requisição (~310 KB) devolve o nome de
 *   todos os datasets do portal, e 3.555 deles são nomeados pelo próprio código
 *   da série (`{codigo}-{slug}`) — ~24× a cobertura do catálogo curado local.
 *   Nada de raspar o localizador JSP do SGS.
 * - O catálogo é servido de cache com validade de 24 h e a renovação é
 *   BLOQUEANTE: quem faz a primeira busca depois do vencimento paga o ~0,8 s.
 *   Sem tarefa agendada e sem seed manual — se ninguém buscar, a origem não
 *   recebe requisição nenhuma. Descartado de propósito o
 *   stale-while-revalidate: com tráfego baixo ele entregaria retrato de semanas
 *   ao primeiro usuário para poupar 0,8 s de um único usuário por dia.
 * - O cache guarda **só metadados** (código e slug), NUNCA observações. É por
 *   isso que ele não é a "base derivada" que a arbitragem 2 evitou: o servidor
 *   segue sendo *Produced Work* sob a ODbL, e valores de série continuam
 *   buscados ao vivo a cada pergunta.
 * - `Disallow: /api/` + `Crawl-Delay: 10` no robots do portal do catálogo é o
 *   motivo de existir cache: ≤1 requisição por dia por instância, não uma por
 *   chamada.
 *
 * O cache é módulo-level, ou seja, por processo (stdio) e por isolate
 * (Cloudflare). Isolate reciclado = catálogo buscado de novo; com o tráfego
 * atual isso mantém a ordem de grandeza prometida (unidades de requisição por
 * dia), e é a única forma de cache que não introduz armazenamento persistente.
 */

// Só primitivos: a curadoria de séries entra por parâmetro (e não por import de
// `tools.ts`) para a busca ser testável sem estado global e para não haver ciclo
// entre os módulos de tool.
import {
  fetchBcbApi,
  normalizeString,
  registrarAcesso,
  type ProcedenciaNome,
  type SeriePopular
} from "./shared.js";

export const CKAN_PACKAGE_LIST = "https://dadosabertos.bcb.gov.br/api/3/action/package_list";
export const CKAN_DATASET_BASE = "https://dadosabertos.bcb.gov.br/dataset";

/** Validade do catálogo em cache: 24 h (decisão do decisor). */
export const CATALOGO_TTL_MS = 24 * 60 * 60 * 1000;

/** Uma entrada do índice: código da série + slug do dataset. Só metadados. */
export interface EntradaCatalogo {
  codigo: number;
  slug: string;
}

export interface SnapshotCatalogo {
  entradas: EntradaCatalogo[];
  /** ISO 8601 do momento em que o índice foi obtido da origem. */
  obtidoEm: string;
  /** Total de datasets devolvidos pelo portal (inclui os sem código). */
  totalDatasets: number;
  expiraEm: number;
}

export interface ResultadoCatalogo {
  snapshot: SnapshotCatalogo | null;
  /** Preenchido quando o índice servido não é o ideal (vencido, ou ausente). */
  aviso?: string;
}

let cache: SnapshotCatalogo | null = null;
/** Renovação em voo: duas buscas simultâneas após o vencimento fazem 1 fetch. */
let renovacaoEmVoo: Promise<SnapshotCatalogo> | null = null;

/** Só para os testes: zera o cache do módulo. */
export function _resetCatalogo(): void {
  cache = null;
  renovacaoEmVoo = null;
}

/** Só para os testes: injeta um snapshot como se tivesse vindo da origem. */
export function _seedCatalogo(snapshot: SnapshotCatalogo): void {
  cache = snapshot;
}

/**
 * Conserta mojibake de ISO-8859-1 servido como UTF-8 ("CÃ¢mbio" -> "Câmbio").
 * Os slugs do `package_list` são ASCII, então isto é defesa para os campos de
 * texto do CKAN que já apareceram corrompidos na verificação de abertura.
 */
export function normalizarMojibake(texto: string): string {
  if (!/[ÃÂ][-¿]/.test(texto)) return texto;
  try {
    const bytes = Uint8Array.from(Array.from(texto, c => c.charCodeAt(0) & 0xff));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return texto;
  }
}

/**
 * Nome legível a partir do slug do dataset. O `package_list` devolve slug, não
 * título: `---` é separador de campos e `-` separa palavras, e os acentos foram
 * perdidos na origem — daí o nome reconstruído ser aproximado de propósito. Para
 * as séries do catálogo curado o nome bom (com acento) prevalece; para as
 * demais, quem quiser o nome oficial usa `bcb_serie_metadados`.
 */
export function nomeDoSlug(slug: string): string {
  const texto = normalizarMojibake(slug)
    .replace(/^\d+-/, "") // o código já é campo próprio
    .split(/-{2,}/) // `---` separa campos; um `-` só separa palavras
    .map(parte => parte.replace(/-/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" - ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** `1-taxa-de-cambio---livre---dolar-americano-venda---diario` -> {1, slug}. */
export function parsePackageList(nomes: unknown): { entradas: EntradaCatalogo[]; totalDatasets: number } {
  if (!Array.isArray(nomes)) return { entradas: [], totalDatasets: 0 };

  const entradas: EntradaCatalogo[] = [];
  const vistos = new Set<number>();

  for (const bruto of nomes) {
    if (typeof bruto !== "string") continue;
    const match = /^(\d+)-(.+)$/.exec(bruto);
    if (!match) continue;
    const codigo = Number(match[1]);
    if (!Number.isSafeInteger(codigo) || vistos.has(codigo)) continue;
    vistos.add(codigo);
    entradas.push({ codigo, slug: bruto });
  }

  entradas.sort((a, b) => a.codigo - b.codigo);
  return { entradas, totalDatasets: nomes.length };
}

async function renovar(timeoutMs?: number, maxRetries?: number): Promise<SnapshotCatalogo> {
  const resposta = (await fetchBcbApi(CKAN_PACKAGE_LIST, timeoutMs, maxRetries)) as {
    success?: boolean;
    result?: unknown;
  };

  if (!resposta || resposta.success === false || !Array.isArray(resposta.result)) {
    throw new Error("Resposta inesperada do portal de dados abertos (package_list)");
  }

  const { entradas, totalDatasets } = parsePackageList(resposta.result);
  if (entradas.length === 0) throw new Error("Índice do portal veio sem nenhuma série identificável por código");

  const agora = Date.now();
  return {
    entradas,
    obtidoEm: new Date(agora).toISOString(),
    totalDatasets,
    expiraEm: agora + CATALOGO_TTL_MS
  };
}

/**
 * Devolve o índice do portal, renovando de forma bloqueante quando vencido.
 *
 * Degradação: se a renovação falhar e houver retrato anterior, ele é servido
 * COM aviso e com a data de obtenção visível — a API do BCB cai de verdade
 * (ocorreu durante esta fase), e nesse caso é melhor um índice velho declarado
 * do que busca nenhuma. Sem retrato anterior, devolve `snapshot: null` e quem
 * chamou cai no catálogo curado.
 */
export async function obterCatalogo(timeoutMs?: number, maxRetries?: number): Promise<ResultadoCatalogo> {
  if (cache && Date.now() < cache.expiraEm) {
    // Acerto de cache: a extração aconteceu quando o índice foi obtido, podendo
    // ser de até 24 h atrás — e é essa a data juridicamente relevante. Sem este
    // registro o bloco de proveniência afirmaria uma extração que não houve
    // (medido em `bcb/docs/07`: a 2ª busca responde com ZERO requisição).
    registrarAcesso(CKAN_PACKAGE_LIST, new Date(cache.obtidoEm), true);
    return { snapshot: cache };
  }

  if (!renovacaoEmVoo) {
    renovacaoEmVoo = renovar(timeoutMs, maxRetries)
      .then(snapshot => {
        cache = snapshot;
        return snapshot;
      })
      .finally(() => {
        renovacaoEmVoo = null;
      });
  }

  try {
    return { snapshot: await renovacaoEmVoo };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    if (cache) {
      // Retrato VENCIDO servido por degradação — a extração segue sendo a do
      // fetch original, e agora ela é ainda mais antiga que 24 h.
      registrarAcesso(CKAN_PACKAGE_LIST, new Date(cache.obtidoEm), true);
      return {
        snapshot: cache,
        aviso:
          `Índice do portal servido de cache VENCIDO (obtido em ${cache.obtidoEm}) — ` +
          `a renovação falhou: ${motivo}`
      };
    }
    return {
      snapshot: null,
      aviso: `Índice do portal indisponível (${motivo}); a busca usou apenas o catálogo curado local.`
    };
  }
}

// ==================== BUSCA ====================

export type OrigemSerie = "curado" | "indice";

export interface SerieEncontrada {
  codigo: number;
  nome: string;
  categoria?: string;
  periodicidade?: string;
  /** `curado` = catálogo local verificado contra a origem; `indice` = portal. */
  origem: OrigemSerie;
  /**
   * Só nos achados do catálogo curado: se o nome foi transcrito do dataset do
   * BCB (`portal`) ou herdado, com apenas periodicidade e magnitude medidas
   * (`medido`). Ver `SeriePopular` — a distinção é publicada de propósito.
   */
  fonteNome?: ProcedenciaNome;
  /** Página do dataset no portal (só para achados do índice). */
  dataset?: string;
}

function comoEncontrada(serie: SeriePopular): SerieEncontrada {
  return {
    codigo: serie.codigo,
    nome: serie.nome,
    categoria: serie.categoria,
    periodicidade: serie.periodicidade,
    origem: "curado",
    fonteNome: serie.fonteNome
  };
}

function comoEncontradaDoIndice(entrada: EntradaCatalogo): SerieEncontrada {
  return {
    codigo: entrada.codigo,
    nome: nomeDoSlug(entrada.slug),
    origem: "indice",
    dataset: `${CKAN_DATASET_BASE}/${entrada.slug}`
  };
}

/**
 * Ranqueia os achados. O catálogo curado é a CAMADA DE DESTAQUE: quando uma
 * série está nele, ela vem primeiro e com o nome bom, porque foi revisada à
 * mão; o índice do portal entra depois, ordenado do slug mais curto (mais
 * específico) para o mais longo, com desempate estável pelo código.
 */
export function buscarSeries(
  termo: string,
  curadoria: SeriePopular[],
  entradas: EntradaCatalogo[] | null,
  limite: number
): { total: number; series: SerieEncontrada[] } {
  const termoNorm = normalizeString(termo).trim();
  const tokens = termoNorm.split(/\s+/).filter(Boolean);

  // Busca por código: "433" deve achar a série 433, não as que contêm "433".
  if (/^\d+$/.test(termoNorm)) {
    const codigo = Number(termoNorm);
    const curada = curadoria.find(s => s.codigo === codigo);
    if (curada) return { total: 1, series: [comoEncontrada(curada)] };
    const doIndice = entradas?.find(e => e.codigo === codigo);
    if (doIndice) return { total: 1, series: [comoEncontradaDoIndice(doIndice)] };
    return { total: 0, series: [] };
  }

  const casaTodosTokens = (texto: string) => tokens.every(t => texto.includes(t));

  const curadas = curadoria.filter(
    s => casaTodosTokens(normalizeString(s.nome)) || casaTodosTokens(normalizeString(s.categoria))
  );
  const codigosCurados = new Set(curadas.map(s => s.codigo));

  const doIndice = (entradas ?? [])
    .filter(e => !codigosCurados.has(e.codigo) && casaTodosTokens(normalizeString(e.slug)))
    .sort((a, b) => a.slug.length - b.slug.length || a.codigo - b.codigo);

  const total = curadas.length + doIndice.length;
  const series = [...curadas.map(comoEncontrada), ...doIndice.map(comoEncontradaDoIndice)].slice(0, limite);

  return { total, series };
}
