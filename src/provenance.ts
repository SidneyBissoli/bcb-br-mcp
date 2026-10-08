/**
 * Bloco de proveniência (contrato do portfólio) — adaptador pt-BR sobre
 * `@sbissoli/mcp-provenance`. O modelo canônico, as projeções
 * `concise`/`detailed`, o determinismo da serialização, o fuso e o texto do
 * rodapé moram no pacote; este módulo o amarra ao servidor do BCB:
 *
 *  - um `ProvenanceContext` para o servidor inteiro (namespace
 *    `br.com.sidneybissoli.bcb`, pt-BR, horário de Brasília, modo `concise`);
 *  - o registro `FONTES_BCB` — uma entrada por procedência, não por API;
 *  - `provenienciaBcb(...)`, o construtor por chamada, que puxa do coletor
 *    aberto no `dispatchTool` (`@sbissoli/mcp-upstream`, via `shared.ts`) o
 *    instante REAL da extração e, desde a 1.15.0, o `retrieval` — a contagem
 *    real de idas, tentativas e anomalias desta chamada (diagnóstico de origem).
 *
 * ## Por que o registro NÃO é "uma entrada por API"
 *
 * O plano da fase previa multi-fonte como ARRAY por API (receita medical). A
 * medição de abertura do D4 (`bcb/docs/07`) desmentiu a premissa: **nenhuma tool
 * mistura APIs** — cada uma fala com exatamente um host — e a **licença é a
 * mesma nas três** (ODbL, reconferida em 13/08/2026), então segregar por API não
 * segregaria licença nenhuma, que é o motivo de existir do array no contrato.
 *
 * O array continua necessário, por duas fronteiras de PROCEDÊNCIA que a mesma
 * medição expôs:
 *
 *  1. **Servidor × BCB.** `bcb_series_populares` responde com ZERO requisição e
 *     `bcb_buscar_serie` mistura o catálogo curado (nosso) com o índice do
 *     portal. Anunciar as duas camadas como "extraído do BCB agora" repetiria,
 *     na proveniência, o erro que a sessão 07 corrigiu no catálogo: dar a mesma
 *     cara a coisas de procedência diferente.
 *  2. **BCB × Refinitiv.** Nas paridades não-USD da PTAX o dado vem de agência
 *     de informação e é redistribuído pelo BCB (`bcb/docs/01` §3).
 *
 * ## Canais de emissão
 *
 * `structuredContent.provenance` + `attribution` (legível pelo modelo) e espelho
 * em `_meta` sob o namespace (fora de banda, zero tokens). **O rodapé de texto
 * do contrato não se aplica aqui**, e isso é deliberado: no ibge e no medical o
 * canal de texto é Markdown, e aqui ele é o próprio payload serializado em JSON
 * (`structuredResult`) — anexar rodapé produziria um bloco de texto que não é
 * JSON válido. O bloco já vai no texto, dentro do payload.
 */

import {
  CONCISE_BLOCK_JSON_SCHEMA,
  attributionList,
  createProvenanceContext,
  renderConcise,
  type CanonicalProvenance,
  type ConciseBlock,
  type Revision
} from "@sbissoli/mcp-provenance";
import { currentCall } from "@sbissoli/mcp-upstream/als";
import {
  DISCLAIMER_PTAX,
  QUALIFICACAO_PARIDADE,
  structuredResult,
  type ToolResult
} from "./shared.js";

/**
 * Contexto único do servidor: namespace de `_meta`, idioma, fuso, modo e a
 * versão do contrato que o servidor EMITE.
 *
 * `contractVersion: "1.2"` desde a 1.18.0 (tempo 2 da 1.2): o `field_sources`
 * passa a sair no `concise` das respostas que fundem sub-fontes, e a lib cobra
 * que o `retrieved_at` do topo seja o mais antigo entre elas (`provenienciaBcb`
 * o deriva assim, por construção). A 1.3 já é ACEITA pelo schema importado
 * (tempo 1 da 1.3); ligá-la é a sessão seguinte. Quem precisar mostrar a versão
 * lê `provenanceContext.contractVersion`, nunca um literal.
 */
export const provenanceContext = createProvenanceContext({
  metaNamespace: "br.com.sidneybissoli.bcb",
  locale: "pt-BR",
  timezone: { offset: "-03:00", label: "horário de Brasília" },
  defaultMode: "concise",
  contractVersion: "1.2"
});

/** Envelope canônico v1.0 (pós-validação). */
export type Proveniencia = CanonicalProvenance;

/** Chaves de `_meta` (estáveis — consumidores de auditoria leem por elas). */
export const PROVENANCE_META_KEY = provenanceContext.metaKeys.provenance;
export const ATTRIBUTION_META_KEY = provenanceContext.metaKeys.attribution;

/** Data da última verificação verbatim da licença (`bcb/docs/07`, reconferida). */
const VERIFICADO_EM = "2026-08-13";

/**
 * Licença das três APIs do BCB — **ODbL v1.0**, com share-alike e anti-DRM.
 *
 * Não é CC0, não é CC BY, não é domínio público: 4.259 dos 4.260 datasets do
 * portal declaram `odc-odbl` (medido em 13/08/2026; em 10/08 eram 4.235 de
 * 4.236 — o portal cresceu e a proporção se manteve).
 *
 * O `url` é o CANÔNICO em HTTPS. O que o CKAN declara é
 * `http://www.opendefinition.org/licenses/odc-odbl`, que **resolve** (HTTP 200)
 * mas só sem TLS — medido, e é a resposta à pendência P3 do decisor. Citar como
 * link oficial um endereço sem TLS seria pior; o legado fica registrado no
 * `terms_url` da própria fonte.
 */
export const LICENCA_ODBL = {
  id: "ODbL-1.0",
  name: "Open Data Commons Open Database License (ODbL) v1.0 — atribuição, share-alike e anti-DRM",
  url: "https://opendatacommons.org/licenses/odbl/1-0/",
  terms_url: "https://dadosabertos.bcb.gov.br/",
  verified_at: VERIFICADO_EM
} as const;

/**
 * Licença do que o SERVIDOR mantém (o catálogo curado). O código é MIT; os
 * nomes transcritos do portal seguem sendo dados do BCB sob ODbL, e é por isso
 * que a nota diz as duas coisas em vez de escolher uma.
 */
export const LICENCA_CATALOGO_CURADO = {
  id: null,
  name:
    "Catálogo curado mantido pelo servidor (código sob MIT); os nomes transcritos do " +
    "Portal de Dados Abertos do BCB permanecem dados do BCB sob ODbL v1.0",
  url: "https://opendatacommons.org/licenses/odbl/1-0/",
  terms_url: "https://github.com/SidneyBissoli/bcb-br-mcp",
  verified_at: VERIFICADO_EM
} as const;


interface FonteBcb {
  name: string;
  agency: string | null;
  database: string | null;
  /** Endpoint-base efetivamente consultado; null quando não há extração upstream. */
  endpoint: string | null;
  license: typeof LICENCA_ODBL | typeof LICENCA_CATALOGO_CURADO;
  /** Avisos verbatim que acompanham o dado na origem. */
  notices: string[];
  /** Citação pronta. `data` = data da extração (dd/mm/aaaa, horário de Brasília). */
  citation: (data: string, detalhe?: string) => string;
  /** Prefixo de URL que identifica os acessos desta fonte no coletor. */
  prefixoUrl: string | null;
  /**
   * Situação de revisão do dado (contrato v1.3), fixa por procedência. Vai ao
   * bloco canônico sempre; no fio só sai quando o servidor emitir a 1.3.
   */
  revisao: Revision;
}

/**
 * Revisão das fontes do BCB — `current` em todas (decisão do decisor, 08/10/2026):
 * o que sai é a versão vigente no instante da extração, e a fonte pode revisá-la
 * depois. `final` exigiria prova da fonte, valor a valor, e nenhuma das APIs a dá.
 * A nota do SGS é a versão curta do que as `instructions` já dizem
 * (`identity.ts`); as demais fontes não têm texto publicado sobre revisão, e a
 * nota fica `null` em vez de inventar uma afirmação sobre elas.
 */
export const REVISAO_SGS: Revision = {
  status: "current",
  note: "O BCB revisa séries como PIB e IBC-Br, e o SGS não guarda a primeira divulgação."
};
export const REVISAO_VIGENTE: Revision = { status: "current", note: null };

/**
 * Registro de fontes — uma entrada por PROCEDÊNCIA (ver o cabeçalho).
 * A agência difere por API e foi lida do CKAN em 13/08/2026, não inferida.
 */
export const FONTES_BCB = {
  SGS: {
    name: "Banco Central do Brasil — SGS (Sistema Gerenciador de Séries Temporais)",
    agency: "Banco Central do Brasil / Departamento Econômico (Depec)",
    database: "SGS",
    endpoint: "https://api.bcb.gov.br/dados/serie",
    license: LICENCA_ODBL,
    notices: [],
    citation: (data, detalhe) =>
      `Fonte: Banco Central do Brasil — SGS${detalhe ? `, ${detalhe}` : ""}. ` +
      `Dados sob ODbL v1.0. Extraído em ${data}.`,
    prefixoUrl: "https://api.bcb.gov.br",
    revisao: REVISAO_SGS
  },
  FOCUS: {
    name: "Banco Central do Brasil — Expectativas de Mercado (Focus), via Olinda OData",
    agency: "Banco Central do Brasil / Departamento de Estatísticas (Dstat)",
    database: "Expectativas de Mercado",
    endpoint: "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata",
    license: LICENCA_ODBL,
    notices: [],
    citation: (data, detalhe) =>
      `Fonte: Banco Central do Brasil — Expectativas de Mercado (Focus)${detalhe ? `, ${detalhe}` : ""}. ` +
      `Dados sob ODbL v1.0. Extraído em ${data}.`,
    prefixoUrl: "https://olinda.bcb.gov.br/olinda/servico/Expectativas",
    revisao: REVISAO_VIGENTE
  },
  PTAX: {
    name: "Banco Central do Brasil — PTAX / Cotações e boletins de câmbio, via Olinda OData",
    agency: "Banco Central do Brasil / Departamento das Reservas Internacionais (Depin)",
    database: "PTAX",
    endpoint: "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata",
    license: LICENCA_ODBL,
    notices: [DISCLAIMER_PTAX],
    citation: (data, detalhe) =>
      `Fonte: Banco Central do Brasil — PTAX${detalhe ? `, ${detalhe}` : ""}. ` +
      `Dados sob ODbL v1.0. Extraído em ${data}.`,
    prefixoUrl: "https://olinda.bcb.gov.br/olinda/servico/PTAX",
    revisao: REVISAO_VIGENTE
  },
  PARIDADE_REFINITIV: {
    name: "Paridades não-USD do boletim do BCB — apuradas por agência de informação (Refinitiv)",
    agency: "Refinitiv (redistribuído pelo Banco Central do Brasil)",
    database: "PTAX — paridades",
    endpoint: "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata",
    license: LICENCA_ODBL,
    notices: [QUALIFICACAO_PARIDADE, DISCLAIMER_PTAX],
    citation: data =>
      "Fonte: paridade obtida junto a agência de informação (Refinitiv) e redistribuída pelo " +
      `Banco Central do Brasil no boletim de câmbio, sob ODbL v1.0. Extraído em ${data}.`,
    prefixoUrl: "https://olinda.bcb.gov.br/olinda/servico/PTAX",
    revisao: REVISAO_VIGENTE
  },
  PORTAL: {
    name: "Banco Central do Brasil — Portal de Dados Abertos (índice CKAN)",
    agency: "Banco Central do Brasil",
    database: "Portal de Dados Abertos",
    endpoint: "https://dadosabertos.bcb.gov.br/api/3/action",
    license: LICENCA_ODBL,
    notices: [],
    citation: (data, detalhe) =>
      `Fonte: Banco Central do Brasil — Portal de Dados Abertos${detalhe ? `, ${detalhe}` : ""}. ` +
      `Só metadados (código e nome), sob ODbL v1.0. Obtido em ${data}.`,
    prefixoUrl: "https://dadosabertos.bcb.gov.br",
    revisao: REVISAO_VIGENTE
  },
  CATALOGO_CURADO: {
    // Sem contagem no nome de propósito: número fixo aqui fossiliza (o "139"
    // sobreviveu à remoção das séries FGV em 23/08/2026 e mentiu na resposta).
    name: "bcb-br-mcp — catálogo curado do servidor, verificado contra a origem",
    agency: null,
    database: null,
    // Sem extração upstream: é dado mantido no próprio servidor.
    endpoint: null,
    license: LICENCA_CATALOGO_CURADO,
    notices: [
      "Cada série do catálogo foi verificada contra a origem em 13/08/2026: 82 nomes são " +
        "transcritos do dataset do BCB no Portal de Dados Abertos e 53 são herdados, com " +
        "apenas periodicidade e magnitude medidas (4 séries FGV descontinuadas saíram do " +
        "catálogo em 23/08/2026). O campo `fonteNome` diz qual é qual."
    ],
    citation: data =>
      "Fonte: bcb-br-mcp — catálogo curado do servidor, verificado série a série contra a " +
      `origem; nomes transcritos do Portal de Dados Abertos do BCB (ODbL v1.0). Consultado em ${data}.`,
    prefixoUrl: null,
    revisao: REVISAO_VIGENTE
  }
} satisfies Record<string, FonteBcb>;

export type ChaveFonte = keyof typeof FONTES_BCB;

/** "dd/mm/aaaa" de um instante em horário de Brasília, para o texto da citação. */
function dataCitacao(instante: Date): string {
  // Offset fixo -03:00: o Brasil não tem horário de verão desde 2019.
  const [ano, mes, dia] = new Date(instante.getTime() - 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .split("-");
  return `${dia}/${mes}/${ano}`;
}

export interface OpcoesProveniencia {
  /** Qual procedência respondeu. */
  fonte: ChaveFonte;
  /** URL canônica que reproduz a consulta na fonte. */
  url: string;
  /** Conjunto dentro da fonte (código da série, recurso OData, moeda). */
  dataset?: { id?: string | null; version?: string | null; name?: string | null };
  /** Competência do dado segundo a fonte; null quando a fonte não expõe. */
  dataVintage?: string | null;
  /** Detalhe interpolado na citação (ex.: "série 433 (IPCA)"). */
  detalheCitacao?: string;
  /** O servidor calculou além de filtrar/paginar/reserializar. */
  derivado?: { nota: string };
  /** Avisos adicionais desta resposta, além dos fixos da fonte. */
  avisosExtras?: string[];
  /**
   * Proveniência por campo — para as respostas que fundem vários recortes da
   * MESMA fonte numa estrutura só (`bcb_comparar`, `bcb_correlacao`,
   * `bcb_deflacionar`, `bcb_indicadores_atuais`, todas multi-série do SGS).
   *
   * Sem isto, o `source_url` teria de escolher uma série entre várias e mentir
   * por omissão sobre as outras. A projeção `concise` não mostra este campo — é
   * o piso legal —, mas ele vai no modelo canônico e no `detailed`.
   */
  fontesPorCampo?: Array<{
    fields: string[];
    source_url: string;
    dataset_id?: string | null;
    data_vintage?: string | null;
    /**
     * Quais acessos do coletor pertencem a esta sub-fonte. Padrão: URL igual a
     * `source_url`. O SGS precisa de filtro próprio: a URL canônica da série não
     * é a que foi buscada quando a janela é fatiada ou vem de `ultimos/N`.
     */
    filtro?: (url: string) => boolean;
  }>;
}

/**
 * Monta o bloco canônico de UMA fonte de UMA resposta.
 *
 * `retrieved_at` e `served_from_cache` vêm do coletor aberto no `dispatchTool`,
 * filtrados pelos acessos daquela fonte: o instante mais ANTIGO, e cache só se
 * TUDO veio de cache (`bcb/docs/07`, S1 e S4). Sem coletor aberto — chamada
 * direta em teste — degrada para o instante da chamada, nunca quebra.
 *
 * `retrieval` (contrato v1.1) é a contagem REAL de idas, tentativas e anomalias
 * da chamada, medida pelo próprio coletor (`@sbissoli/mcp-upstream`), e sai
 * `null` quando não há o que medir: fonte sem endpoint (o catálogo curado é
 * dado do servidor), resposta servida só de cache, ou coletor não aberto. Nunca
 * um `{requests: 1, attempts: 1}` inventado — `null` é "não medido", não "foi
 * limpo". O bloco é por chamada e nenhuma tool mistura APIs, então o mesmo
 * `retrieval` vale para toda fonte com endpoint da resposta.
 */
export function provenienciaBcb(opts: OpcoesProveniencia): Proveniencia {
  const fonte: FonteBcb = FONTES_BCB[opts.fonte];
  const prefixo = fonte.prefixoUrl;
  const call = currentCall();
  const daFonte = prefixo ? (url: string) => url.startsWith(prefixo) : () => false;
  const instanteDaFonte = call ? call.retrievedAt(daFonte) : new Date();

  // Cada sub-fonte com o instante e o cache DELA, lidos do coletor pelos acessos
  // que casam com o filtro (`call.fieldSource`). Sem acesso que case, o instante
  // sai `null`: a sub-fonte não foi lida nesta chamada, e "agora" seria inventar.
  // Sem coletor (chamada direta em teste) não há o que separar: herda o do bloco.
  const subFontes = opts.fontesPorCampo?.map(f => {
    const item = {
      fields: f.fields,
      source_url: f.source_url,
      dataset_id: f.dataset_id ?? null,
      data_vintage: f.data_vintage ?? null
    };
    if (!call) return { ...item, retrieved_at: instanteDaFonte.toISOString(), served_from_cache: null };
    const lida = call.fieldSource({ ...item, filter: f.filtro ?? ((url: string) => url === f.source_url) });
    return { ...item, retrieved_at: lida.retrieved_at, served_from_cache: lida.served_from_cache };
  });

  // O topo é o MAIS ANTIGO entre o bloco e todas as sub-fontes — por construção,
  // não por coincidência (contrato §3). Da 1.2 em diante a lib lança
  // `ProvenanceContractError` se o topo for mais novo que alguma sub-fonte, e
  // isso derruba a tool; um filtro de sub-fonte mais largo que o do bloco bastaria
  // para quebrar a regra se o topo não fosse este mínimo explícito.
  const retrievedAt = new Date(
    Math.min(
      instanteDaFonte.getTime(),
      ...(subFontes ?? []).flatMap(f => (f.retrieved_at ? [Date.parse(f.retrieved_at)] : []))
    )
  );
  const extracao = {
    retrievedAt,
    servedFromCache: call ? call.servedFromCache(daFonte) : null,
    retrieval: call && prefixo ? call.retrieval() : null
  };
  const data = dataCitacao(extracao.retrievedAt);

  return provenanceContext.build({
    source: {
      name: fonte.name,
      agency: fonte.agency,
      database: fonte.database,
      endpoint: fonte.endpoint
    },
    source_url: opts.url,
    ...(opts.dataset !== undefined
      ? {
          dataset: {
            id: opts.dataset.id ?? null,
            version: opts.dataset.version ?? null,
            name: opts.dataset.name ?? null
          }
        }
      : {}),
    data_vintage: opts.dataVintage ?? null,
    retrieved_at: extracao.retrievedAt,
    citation: fonte.citation(data, opts.detalheCitacao),
    license: fonte.license,
    notices: [...fonte.notices, ...(opts.avisosExtras ?? [])],
    derived: opts.derivado !== undefined,
    ...(opts.derivado !== undefined ? { derivation_note: opts.derivado.nota } : {}),
    served_from_cache: extracao.servedFromCache,
    retrieval: extracao.retrieval,
    ...(subFontes !== undefined ? { field_sources: subFontes } : {}),
    revision: fonte.revisao
  });
}

/** Nota fixa das tools que calculam (o motor mora no `@sbissoli/mcp-stats`). */
export const NOTA_DERIVACAO_ESTATISTICA =
  "Estatísticas calculadas pelo servidor a partir das observações brutas da fonte " +
  "(motor: @sbissoli/mcp-stats); os valores observados permanecem os originais do BCB.";

/** Nota das tools que ACUMULAM uma série que já é variação (IPCA, IGP-M mensais). */
export const NOTA_DERIVACAO_ENCADEAMENTO =
  "Variação acumulada por encadeamento das variações por período publicadas pela fonte " +
  "(motor: @sbissoli/mcp-stats); os valores observados permanecem os originais do BCB.";

/** Nota fixa da harmonização de frequência. */
export const NOTA_DERIVACAO_HARMONIZACAO =
  "Observações agregadas pelo servidor para a periodicidade pedida; os valores de origem " +
  "não foram alterados.";

/** Nota fixa da deflação (o SGS não publica número-índice — ver `bcb/docs/05`). */
export const NOTA_DERIVACAO_DEFLACAO =
  "Valores convertidos para moeda constante pelo servidor: o SGS não publica número-índice " +
  "de preço, então o índice é reconstruído encadeando as variações mensais da série " +
  "deflatora. Os valores nominais permanecem os originais do BCB.";

// ==================== EMISSÃO ====================

/**
 * Resultado de sucesso com os canais de proveniência.
 *
 * Aceita um bloco ou um ARRAY (multi-procedência). O formato do fio segue o
 * formato da entrada — objeto vira objeto, array vira array —, casando com o
 * `outputSchema` que a tool anuncia (`comProveniencia` × `comProvenienciaMulti`).
 */
export function resultadoComProveniencia(
  payload: Record<string, unknown>,
  proveniencia: Proveniencia | Proveniencia[]
): ToolResult {
  const blocos = Array.isArray(proveniencia) ? proveniencia : [proveniencia];
  if (blocos.length === 0) {
    throw new Error("resultadoComProveniencia exige ao menos um bloco de proveniência");
  }

  const projetados = blocos.map(b => renderConcise(b));
  const saida: ConciseBlock | ConciseBlock[] = Array.isArray(proveniencia) ? projetados : projetados[0];
  const attribution = attributionList(blocos);

  const resultado = structuredResult({ ...payload, provenance: saida, attribution });
  resultado._meta = {
    [PROVENANCE_META_KEY]: saida,
    [ATTRIBUTION_META_KEY]: attribution
  };
  return resultado;
}

// ==================== SCHEMA (JSON Schema verbatim) ====================
//
// A superfície publicada deste servidor é JSON Schema escrito à mão e servido
// verbatim (`CLAUDE.md`): nada de derivar schema de zod aqui, mesmo com o zod
// tendo voltado como dependência transitiva do pacote de proveniência.
//
// O bloco de proveniência é a EXCEÇÃO, e por um achado medido (26/09/2026):
// este módulo transcrevia a projeção `concise` à mão, com `additionalProperties:
// false` aplicado pelo `sealDeep`, e o SDK valida `structuredContent` em
// runtime — subir o pacote para um contrato com chave nova (v1.1, `retrieval`)
// sem tocar a transcrição derrubava TODA chamada de tool ("must NOT have
// additional properties"). O schema do bloco vem do pacote, que o prende à
// própria projeção por teste; a chave nova entra junto com a lib que a emite.

/** Projeção `concise` de um bloco — a forma que vai em `structuredContent`/`_meta`. */
export const PROVENANCE_BLOCK_SCHEMA = CONCISE_BLOCK_JSON_SCHEMA;

const ATTRIBUTION_SCHEMA = {
  type: "array" as const,
  description: "URLs canônicas das fontes desta resposta (lista de atribuição)",
  items: { type: "string" as const }
};

type SchemaObjeto = Record<string, unknown>;

function estender(schema: SchemaObjeto, blocoProvenance: Record<string, unknown>): SchemaObjeto {
  const properties = (schema.properties ?? {}) as Record<string, unknown>;
  const required = (schema.required ?? []) as string[];
  return {
    ...schema,
    properties: { ...properties, provenance: blocoProvenance, attribution: ATTRIBUTION_SCHEMA },
    required: [...required, "provenance", "attribution"]
  };
}

/**
 * Acrescenta o canal de proveniência ao `outputSchema` de uma tool de fonte
 * única. Os dois campos são OBRIGATÓRIOS: toda resposta de sucesso os carrega.
 */
export function comProveniencia(schema: SchemaObjeto): SchemaObjeto {
  return estender(schema, PROVENANCE_BLOCK_SCHEMA);
}

/**
 * Variante multi-procedência: um bloco por procedência que contribuiu com dado.
 * As licenças nunca se fundem — é regra do contrato.
 */
export function comProvenienciaMulti(schema: SchemaObjeto): SchemaObjeto {
  return estender(schema, {
    type: "array" as const,
    description:
      "Um bloco por procedência que contribuiu com esta resposta (bloco de proveniência do portfólio; licenças nunca se fundem)",
    items: PROVENANCE_BLOCK_SCHEMA
  });
}
