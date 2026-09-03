/**
 * `search` e `fetch` — o contrato Deep Research da OpenAI sobre o acervo do
 * servidor (ChatGPT deep research, company knowledge e os workflows de pesquisa
 * da API Responses exigem EXATAMENTE essas duas tools, com esses nomes — a
 * única exceção admitida ao prefixo `bcb_`).
 *
 * Desenho "coletor + JSON do pacote": a fábrica de `@sbissoli/mcp-search` é
 * apontada para um coletor que captura título, description e callback; as
 * duas entradas viram `ToolDefinition` como as outras 15 — com os schemas do
 * contrato em JSON Schema (`contractJsonSchemas`, derivados uma vez no pacote,
 * porque este servidor serve JSON Schema verbatim e não deriva de zod no fio;
 * `CLAUDE.md`) e o canal de proveniência acrescentado em `TOOL_DEFINITIONS`
 * como nas demais — e o `dispatchTool` as despacha por `case`. Assim o coletor
 * de extração (`retrieved_at`), o `record` e o laço do `registerAll` cobrem as
 * duas sem caso especial.
 *
 * O módulo recebe do `tools.ts` o que é dele (catálogo curado, o handler de
 * metadados e o bloco de proveniência do catálogo) em vez de importar de lá:
 * `tools.ts` monta `TOOL_DEFINITIONS` no topo do módulo, e um ciclo de import
 * o quebraria em quem importasse este arquivo primeiro.
 *
 * O acervo: as séries do SGS conhecidas pelo servidor — o catálogo curado
 * (135, revisadas à mão) e o índice do Portal de Dados Abertos (milhares,
 * `package_list`, cache de 24 h em `catalog.ts`). Id `sgs:<codigo>`. A `url`
 * é a página do dataset no portal quando a série tem uma; as séries curadas
 * sem dataset (53, `fonteNome: "medido"`) citam a consulta pública do SGS às
 * últimas 10 observações — a mesma `urlUltimos10` que `bcb_serie_metadados`
 * publica — porque não existe página humana por série no SGS (`sgspub` não tem
 * deep link) e a consulta SEM janela responde 406 nas séries diárias longas
 * (medido em 03/09/2026: 1, 11 e 12 recusam; `CLAUDE.md`, limite de 10 anos).
 */

import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import {
  DEEP_RESEARCH_TOOLS,
  contractJsonSchemas,
  createIndex,
  registerDeepResearchTools,
  type DeepResearchToolName,
  type EnvelopeExtras,
  type FetchReply,
  type IndexEntry,
  type SearchIndex,
  type SearchReply
} from "@sbissoli/mcp-search";

import { CKAN_DATASET_BASE, CKAN_PACKAGE_LIST, nomeDoSlug, obterCatalogo, type SnapshotCatalogo } from "./catalog.js";
import { provenienciaBcb, resultadoComProveniencia, type Proveniencia } from "./provenance.js";
import { BCB_SGS_BASE } from "./series.js";
import { leituraRemota, type SeriePopular, type ToolDefinition, type ToolResult } from "./shared.js";

export { DEEP_RESEARCH_TOOLS };

/** Teto de resultados do `search` (o contrato pede uma lista curta e relevante). */
export const DEEP_RESEARCH_LIMIT = 10;

const PREFIXO_SGS = "sgs:";

/** O que o adapter precisa do `tools.ts` — injetado para não fechar ciclo de import. */
export interface DeepResearchDeps {
  seriesPopulares: readonly SeriePopular[];
  /** O handler real de `bcb_serie_metadados`: o `fetch` é ele, com a proveniência dele. */
  metadados: (codigo: number, timeoutMs?: number, maxRetries?: number) => Promise<ToolResult>;
  /** Bloco de proveniência do catálogo curado — o mesmo que as outras tools emitem. */
  provCatalogoCurado: (detalhe?: string) => Proveniencia;
}

export interface DeepResearchTools {
  /** As duas definições, na forma das outras 15 (sem o canal de proveniência — `TOOL_DEFINITIONS` o acrescenta). */
  definitions: ToolDefinition[];
  /** Despacha `search`/`fetch`; `null` quando a tool não é destas. */
  dispatch: (
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
    maxRetries?: number
  ) => Promise<ToolResult> | null;
}

// ==================== ÍNDICE ====================

interface EntradaAcervo extends IndexEntry {
  codigo: number;
  origem: "curado" | "indice";
}

interface Acervo {
  /** `obtidoEm` do snapshot que o gerou — o índice é reconstruído quando o catálogo renova. */
  chave: string | null;
  porId: Map<string, EntradaAcervo>;
  indice: SearchIndex;
}

let acervo: Acervo | null = null;

/** Só para os testes. */
export function _resetDeepResearch(): void {
  acervo = null;
}

function idDe(codigo: number): string {
  return `${PREFIXO_SGS}${codigo}`;
}

/** Consulta pública do SGS que responde 200 em qualquer série — o fallback de `url`. */
function urlConsultaPublica(codigo: number): string {
  return `${BCB_SGS_BASE}.${codigo}/dados/ultimos/10?formato=json`;
}

function codigoDe(id: string): number | null {
  if (!id.startsWith(PREFIXO_SGS)) return null;
  const resto = id.slice(PREFIXO_SGS.length);
  return /^\d+$/.test(resto) ? Number(resto) : null;
}

function construirAcervo(seriesPopulares: readonly SeriePopular[], snapshot: SnapshotCatalogo | null): Acervo {
  const slugPorCodigo = new Map((snapshot?.entradas ?? []).map(e => [e.codigo, e.slug] as const));
  const entradas: EntradaAcervo[] = [];

  // Camada de destaque: o catálogo curado, com o nome bom e as palavras-chave.
  for (const s of seriesPopulares) {
    const slug = slugPorCodigo.get(s.codigo);
    entradas.push({
      id: idDe(s.codigo),
      title: s.nome,
      url: slug ? `${CKAN_DATASET_BASE}/${slug}` : urlConsultaPublica(s.codigo),
      keywords: [String(s.codigo), s.categoria, s.periodicidade, ...(s.unidade ? [s.unidade] : [])],
      codigo: s.codigo,
      origem: "curado"
    });
  }

  const curados = new Set(seriesPopulares.map(s => s.codigo));
  for (const e of snapshot?.entradas ?? []) {
    if (curados.has(e.codigo)) continue;
    entradas.push({
      id: idDe(e.codigo),
      title: nomeDoSlug(e.slug),
      url: `${CKAN_DATASET_BASE}/${e.slug}`,
      keywords: [String(e.codigo)],
      codigo: e.codigo,
      origem: "indice"
    });
  }

  return {
    chave: snapshot?.obtidoEm ?? null,
    porId: new Map(entradas.map(e => [e.id, e])),
    indice: createIndex(entradas)
  };
}

/** Bloco de proveniência do índice do portal — o mesmo de `bcb_buscar_serie`. */
function provIndicePortal(snapshot: SnapshotCatalogo): Proveniencia {
  return provenienciaBcb({
    fonte: "PORTAL",
    url: CKAN_PACKAGE_LIST,
    dataset: { id: "package_list", name: "Índice de datasets do portal", version: null },
    dataVintage: snapshot.obtidoEm,
    detalheCitacao: "índice de datasets (package_list)"
  });
}

/**
 * Projeta blocos de proveniência nos extras do envelope do pacote, pelo mesmo
 * caminho das outras tools (`resultadoComProveniencia`): `structuredContent`
 * ganha `provenance`/`attribution` e `_meta` as chaves do servidor.
 */
function extrasDe(proveniencia: Proveniencia[]): EnvelopeExtras {
  const { structuredContent, _meta } = resultadoComProveniencia({}, proveniencia);
  return { structured: structuredContent, meta: _meta as Record<string, unknown> };
}

// ==================== DOCUMENTO ====================

interface Metadados {
  codigo: number;
  nome: string;
  periodicidade: string;
  periodicidadeInferida?: boolean;
  categoria: string;
  ultimoValor?: { data: string; valor: number };
  observacao: string;
}

function renderizarDocumento(entrada: EntradaAcervo, m: Metadados, serie: SeriePopular | undefined): string {
  const linhas = [
    `# ${m.nome}`,
    "",
    `- Código no SGS (Sistema Gerenciador de Séries Temporais do Banco Central do Brasil): ${m.codigo}`,
    `- Categoria: ${m.categoria}`,
    `- Periodicidade: ${m.periodicidade}${m.periodicidadeInferida ? " (inferida do espaçamento das observações)" : ""}`,
    ...(serie?.unidade ? [`- Unidade: ${serie.unidade}`] : []),
    ...(m.ultimoValor ? [`- Último valor publicado: ${m.ultimoValor.valor} em ${m.ultimoValor.data}`] : []),
    `- Fonte: Banco Central do Brasil — SGS`,
    `- Origem no acervo: ${entrada.origem === "curado" ? "catálogo curado do servidor" : "índice do Portal de Dados Abertos do BCB"}`,
    `- ${entrada.url.startsWith(CKAN_DATASET_BASE) ? "Página do dataset" : "Consulta pública (últimas 10 observações)"}: ${entrada.url}`,
    "",
    m.observacao,
    "",
    `Para os valores da série use \`bcb_serie_valores\` (período) ou \`bcb_serie_ultimos\` (últimas observações) com \`codigo: ${m.codigo}\`.`
  ];
  return linhas.join("\n");
}

// ==================== FÁBRICA ====================

interface RegistroCapturado {
  name: string;
  config: { title?: string; description?: string };
  callback: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

export function criarDeepResearchTools(deps: DeepResearchDeps): DeepResearchTools {
  const { seriesPopulares, metadados, provCatalogoCurado } = deps;

  async function obterAcervo(timeoutMs?: number, maxRetries?: number) {
    const { snapshot, aviso } = await obterCatalogo(timeoutMs, maxRetries);
    const chave = snapshot?.obtidoEm ?? null;
    if (!acervo || acervo.chave !== chave) acervo = construirAcervo(seriesPopulares, snapshot);
    return { acervo, snapshot, aviso };
  }

  // Os handlers rodam DENTRO do `dispatchTool` (coletor de extração aberto), como
  // os das outras tools — o `retrieved_at` do índice de cache é o do fetch original.
  // O orçamento de rede é o da chamada (o Worker passa um mais curto), por isso
  // as duas funções nascem por chamada, fechadas sobre ele.
  function handlers(timeoutMs?: number, maxRetries?: number) {
    async function search(query: string): Promise<SearchReply> {
      const { acervo, snapshot } = await obterAcervo(timeoutMs, maxRetries);
      const results = acervo.indice
        .search(query, { limit: DEEP_RESEARCH_LIMIT })
        .map(({ id, title, url }) => ({ id, title, url }));

      const proveniencia: Proveniencia[] = [provCatalogoCurado(`busca por "${query}"`)];
      if (snapshot) proveniencia.unshift(provIndicePortal(snapshot));
      return { results, extras: extrasDe(proveniencia) };
    }

    async function fetch(id: string): Promise<FetchReply | null> {
      const codigo = codigoDe(id);
      if (codigo === null) return null;
      const { acervo } = await obterAcervo(timeoutMs, maxRetries);
      const entrada = acervo.porId.get(id);
      if (!entrada) return null;

      const resultado = await metadados(codigo, timeoutMs, maxRetries);
      if (resultado.isError === true || !resultado.structuredContent) {
        throw new Error(resultado.content[0]?.text ?? `metadados da série ${codigo} indisponíveis`);
      }
      const { provenance, attribution, ...dados } = resultado.structuredContent;
      const m = dados as unknown as Metadados;
      const serie = seriesPopulares.find(s => s.codigo === codigo);

      return {
        document: {
          id,
          title: m.nome,
          text: renderizarDocumento(entrada, m, serie),
          url: entrada.url,
          metadata: {
            codigo,
            categoria: m.categoria,
            periodicidade: m.periodicidade,
            origem: entrada.origem,
            ...(serie ? { fonteNome: serie.fonteNome } : {}),
            ...(serie?.unidade ? { unidade: serie.unidade } : {}),
            ...(m.ultimoValor ? { ultimoValor: m.ultimoValor } : {})
          }
        },
        extras: {
          structured: { provenance, attribution },
          meta: resultado._meta as Record<string, unknown>
        }
      };
    }

    return { search, fetch };
  }

  /**
   * Aponta a fábrica do pacote para um coletor e devolve o que ela registrou.
   * `record` fica de fora de propósito: o laço do `registerAll` já conta as duas
   * como conta as outras. `annotations` idem — a definição abaixo leva as suas.
   */
  function capturar(timeoutMs?: number, maxRetries?: number): Record<DeepResearchToolName, RegistroCapturado> {
    const capturados: RegistroCapturado[] = [];
    const coletor = {
      registerTool: (name: string, config: RegistroCapturado["config"], callback: RegistroCapturado["callback"]) => {
        capturados.push({ name, config, callback });
      }
    };
    registerDeepResearchTools(coletor as unknown as McpServer, {
      ...handlers(timeoutMs, maxRetries),
      corpus:
        "Banco Central do Brasil time series (SGS: interest rates, inflation, exchange rates, credit, " +
        "fiscal and external sector — the curated catalog plus the open data portal index)",
      richTools: "the `bcb_*` tools",
      limit: DEEP_RESEARCH_LIMIT
    });
    const porNome = {} as Record<DeepResearchToolName, RegistroCapturado>;
    for (const name of DEEP_RESEARCH_TOOLS) {
      const reg = capturados.find(c => c.name === name);
      if (!reg?.config.title || !reg.config.description) throw new Error(`a fábrica não registrou "${name}"`);
      porNome[name] = reg;
    }
    return porNome;
  }

  const json = contractJsonSchemas("pt-BR");
  const schemas: Record<DeepResearchToolName, { input: Record<string, unknown>; output: Record<string, unknown> }> = {
    search: { input: json.searchInputSchema, output: json.searchOutputSchema },
    fetch: { input: json.fetchInputSchema, output: json.fetchDocumentSchema }
  };

  const registros = capturar();
  const definitions: ToolDefinition[] = DEEP_RESEARCH_TOOLS.map(name => ({
    name,
    description: registros[name].config.description as string,
    annotations: leituraRemota(registros[name].config.title as string),
    inputSchema: schemas[name].input,
    outputSchema: schemas[name].output
  }));

  const dispatch: DeepResearchTools["dispatch"] = (toolName, args, timeoutMs, maxRetries) => {
    if (!(DEEP_RESEARCH_TOOLS as readonly string[]).includes(toolName)) return null;
    const { callback } = capturar(timeoutMs, maxRetries)[toolName as DeepResearchToolName];
    return callback(args) as Promise<ToolResult>;
  };

  return { definitions, dispatch };
}
