/**
 * Primitivos compartilhados por todas as APIs do BCB que o servidor consome.
 *
 * Extraído de `tools.ts` na sessão de D3, quando o servidor deixou de falar com
 * uma API só (SGS) e passou a falar com três (SGS, Olinda/Expectativas e PTAX).
 * `tools.ts` re-exporta tudo daqui, de propósito: worker e testes importam
 * desses nomes desde a fundação, e o D3 não é hora de mexer em quem importa o
 * quê. A regra de dependência é uma só — `shared.ts` não importa nenhum módulo
 * irmão (só pacotes do portfólio), e é por isso que não há ciclo entre os
 * módulos de tool. A exceção é `call-shape.ts`, que é FOLHA (não importa nada):
 * o vocabulário de classe de erro mora lá, e os erros daqui nascem com ela.
 */

import { CLASSE_DO_ERRO, classifyThrown, type ErrorClass } from "./call-shape.js";

// ==================== CONFIG ====================

export const CONFIG = {
  TIMEOUT_MS: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000
};

/**
 * Orçamento de tempo do PEDIDO PEQUENO (`/dados/ultimos/N`, no máximo 20
 * observações). Não é ajuste fino: é o que separa "não existe" de "demorou".
 *
 * Medido em 24/09/2026, 15 séries reais (432, 433, 11, 12, 13521, 7000, 189,
 * 188, 4390, 20539, 24363, 21619, 1178, 28763, 25239): `ultimos/1` responde
 * entre **0,18 s e 0,41 s**. Código inexistente (99999, 99999999, 999999999)
 * responde `200 text/html` com a página de requisição inválida — mas depois de
 * **~30,2 s**. São duas populações separadas por ~75×.
 *
 * Consequência que este valor conserta: os dois orçamentos do servidor (30 s no
 * stdio, 10 s no Worker) ABORTAM antes dos 30,2 s, então a defesa que lê a
 * página HTML (logo abaixo, medida em 13/08/2026) nunca chegava a rodar. Quem
 * errava um dígito esperava duas tentativas inteiras para receber "Falha após 2
 * tentativas: The operation was aborted" — mensagem que culpa a origem por um
 * erro de digitação.
 *
 * 6 s dá ~15× de folga sobre a resposta real mais lenta já medida e corta a
 * espera do código errado de ~25 s para ~6 s.
 */
export const TIMEOUT_PEDIDO_PEQUENO_MS = 6000;

/** A forma de URL que pede no máximo 20 observações. */
export function ehPedidoPequeno(url: string): boolean {
  return /\/dados\/ultimos\/\d+/.test(url);
}

// Worker uses shorter timeout (Cloudflare has its own limits)
export const WORKER_CONFIG = {
  TIMEOUT_MS: 10000,
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000
};

// ==================== VERSION (single source of truth) ====================
//
// This module runs under two builds that resolve package.json differently, so the
// version is injected by each entry point instead of imported here:
//   - index.ts (Node/stdio) reads it via createRequire and calls setServerVersion()
//   - the Worker reads it via a JSON import inlined by esbuild and calls it too
// A static `import "../package.json"` is avoided on purpose: it breaks tsc's rootDir.
// (Uma versão anterior deste comentário dizia que o runtime do Worker não tem
// `nodejs_compat`; é FALSO — o flag está em `worker/wrangler.jsonc` desde a
// fundação, e o D4 mediu isso no workerd. O motivo de injetar a versão é o
// rootDir, só.)
// The fallback is only used if no entry point injects a version; keep it = package.json.
let serverVersion = "1.9.2";

export function setServerVersion(version: string): void {
  serverVersion = version;
}

export function getUserAgent(): string {
  return `bcb-br-mcp/${serverVersion}`;
}

// ==================== TYPES ====================

export interface SerieValor {
  data: string;
  valor: string;
}

export interface SerieMetadados {
  codigo: number;
  nome: string;
  unidade: string;
  periodicidade: string;
  fonte: string;
  especial: boolean;
}

/**
 * Procedência do nome de uma série curada — de onde ele veio, não o quanto
 * confiamos nele.
 *
 * Existe porque a verificação de 13/08/2026 mostrou que "o catálogo diz" não é
 * afirmação de mesma força para todas as séries: 82 das 169 têm dataset no
 * Portal de Dados Abertos e podem ser transcritas do BCB, e as outras 87 não
 * têm — nem por lá, nem pela fachada SOAP legada, nem por endpoint de metadados,
 * que não existe. Para essas, o único árbitro é o próprio dado, que confirma
 * magnitude e periodicidade mas não nomeia. Anunciar as duas coisas com a mesma
 * cara foi o que deixou 21 séries trocadas passarem despercebidas por versões.
 */
export type ProcedenciaNome =
  /** Título transcrito do dataset do BCB no Portal de Dados Abertos. */
  | "portal"
  /** Sem dataset no portal; nome herdado, com magnitude e periodicidade medidas. */
  | "medido";

export interface SeriePopular {
  codigo: number;
  nome: string;
  categoria: string;
  periodicidade: string;
  /** De onde veio o `nome` — ver `ProcedenciaNome`. */
  fonteNome: ProcedenciaNome;
  /** Unidade publicada pelo portal; ausente quando não há dataset. */
  unidade?: string;
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

// ==================== TEXTOS VERBATIM DA ORIGEM ====================
//
// Moram aqui, e não em `cambio.ts`, porque desde o D4 têm DOIS consumidores: as
// tools de câmbio (que os publicam no payload) e o registro de fontes da
// proveniência (que os publica como `notices` do bloco). Duas cópias do mesmo
// texto verbatim é como uma delas envelhece sem ninguém notar.

/**
 * Disclaimer de responsabilidade do BCB sobre a PTAX, repassado VERBATIM ao
 * usuário final — é o único texto tipo-ToS que o BCB publica (`bcb/docs/01` §3).
 */
export const DISCLAIMER_PTAX =
  "O Banco Central não assume qualquer responsabilidade pela não simultaneidade ou falta das informações " +
  "prestadas, assim como por eventuais erros de paridades das moedas. Não assume, também, responsabilidade " +
  "por qualquer perda ou dano oriundo de tais interrupções, atrasos, falhas ou imperfeições, bem como pelo " +
  "uso inadequado das informações.";

/** Procedência de terceiro dentro do dado da PTAX (`bcb/docs/01` §3). */
export const QUALIFICACAO_PARIDADE =
  "As paridades das moedas contra o dólar americano NÃO são apuradas pelo Banco Central: são obtidas junto a " +
  "agências de informação (Refinitiv) e redistribuídas pelo BCB. Trate-as como dado de terceiro qualificado, " +
  "não como dado do BCB.";

// ==================== OUTPUT HELPERS ====================

/**
 * Builds a ToolResult that satisfies an MCP tool's outputSchema:
 * the same payload is exposed as machine-readable structuredContent and,
 * for backward compatibility, serialized into a TextContent block.
 */
export function structuredResult(payload: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload
  };
}

/**
 * Falha de tool: `isError` com texto em pt-BR, nunca erro de protocolo.
 *
 * `classe`, quando dada, viaja numa chave-símbolo não enumerável
 * (`CLASSE_DO_ERRO`): a telemetria a lê, o fio não a vê. Sem ela, a telemetria
 * classifica pela frase, como sempre fez.
 */
export function erroResult(texto: string, classe?: ErrorClass): ToolResult {
  const r: ToolResult = { content: [{ type: "text" as const, text: texto }], isError: true };
  if (classe !== undefined) Object.defineProperty(r, CLASSE_DO_ERRO, { value: classe, enumerable: false });
  return r;
}

/**
 * Falha de tool a partir da exceção que o handler capturou: o texto é o de
 * sempre (`prefixo: mensagem`), e a classe sai do TIPO da exceção, não da frase.
 * É o que todo `catch` de handler usa — achatar a exceção em texto antes daqui
 * foi o que jogou o timeout da origem em `outro` (ver `CLASSE_DO_ERRO`).
 */
export function erroDeExcecao(prefixo: string, error: unknown): ToolResult {
  return erroResult(`${prefixo}: ${mensagemDeErro(error)}`, classifyThrown(error));
}

export function mensagemDeErro(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ==================== UTILITY FUNCTIONS ====================

export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, ""); // marcas de combinação — equivalente a [̀-ͯ] sem escape literal
}

export function formatDateForApi(dateStr: string): string {
  if (dateStr.includes("-")) {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Erro HTTP da origem com o status PRESERVADO.
 *
 * Existe porque o D1 precisa casar um status específico: o SGS recusa janela
 * maior que 10 anos em série diária com **406**, e essa é a informação que
 * dispara o chunking. Antes disto o status só existia dentro do texto da
 * mensagem, e casar por substring de mensagem é frágil. As mensagens seguem
 * idênticas — só o objeto de erro ficou mais informativo.
 */
export class ErroHttpBcb extends Error {
  readonly status: number;
  /** 404 é a fonte dizendo que não existe; qualquer outro status é a fonte recusando ou falhando. */
  readonly classe: ErrorClass;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = "ErroHttpBcb";
    this.status = status;
    this.classe = status === 404 ? "nao_encontrado" : "fonte";
  }
}

/**
 * Falha da origem que já sabe a própria classe — é o `UpstreamError` traduzido
 * para pt-BR sem perder o `kind`. Ver `CLASSE_DO_ERRO` em call-shape.ts.
 */
export class ErroDaOrigem extends Error {
  readonly classe: ErrorClass;

  constructor(mensagem: string, classe: ErrorClass) {
    super(mensagem);
    this.name = "ErroDaOrigem";
    this.classe = classe;
  }
}

/**
 * Série que a origem não reconhece.
 *
 * O SGS não responde 404 a código inexistente: responde **200 com a página
 * institucional de "requisição inválida"** — medido em 13/08/2026, um código
 * inventado (999999999) e os códigos 14, 13523, 21860 e 13690 produzem
 * exatamente a mesma resposta. Ter um tipo próprio é o que permite não repetir
 * a consulta: como um 4xx, isto é determinístico.
 */
export class ErroSerieInexistente extends Error {
  /**
   * `nao_encontrado`, e não pela frase: a mensagem diz "requisição inválida"
   * (a página que a origem devolve), e o regex a lia como `contrato` — classe
   * que o painel EXCLUI da taxa de erro. A queda da origem num `ultimos/N`
   * sumia da saúde junto. Após todas as tentativas, o fato medido é "a fonte
   * não trouxe essa série", que é a definição de `nao_encontrado`.
   */
  readonly classe: ErrorClass = "nao_encontrado";

  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroSerieInexistente";
  }
}

// ==================== REDE E COLETOR DE EXTRAÇÃO ====================
//
// Desde a 1.15.0 a ida à origem é do `@sbissoli/mcp-upstream`, o fetch comum do
// portfólio: retry com backoff e `Retry-After`, timeout por tentativa, orçamento
// total por ida e a CONTAGEM que alimenta o bloco `retrieval` do contrato de
// proveniência v1.1 — quantas idas, quantas tentativas, quais anomalias. O
// pacote classifica; este módulo DECIDE. O que era daqui continua daqui:
//
//  - os números: 3 tentativas/30 s no stdio, 2/10 s no Worker, 6 s por
//    tentativa no pedido pequeno (`TIMEOUT_PEDIDO_PEQUENO_MS`), backoff 1 s,
//    2 s — sem jitter, e é o que os testes com relógio falso contam;
//  - a leitura da página HTML em 200, que tem DUAS causas (série inexistente ×
//    consulta cortada por tempo) e se resolve por REPETIÇÃO, nunca na primeira
//    (medição de 24/09/2026 na 432 — ver `traduzirErroDaOrigem`);
//  - 404 e 4xx determinísticos, sem repetição (o 406 da janela decenal tem de
//    voltar rápido, com o status, para o `series.ts` fatiar);
//  - as mensagens em pt-BR que chegam ao usuário.
//
// O que MUDOU com o pacote: 429 passou a repetir honrando `Retry-After` (antes
// caía na regra do 4xx e não repetia), e toda tentativa — superada ou final —
// fica contada e sai no bloco de proveniência.
//
// O coletor por chamada segue isolado por `AsyncLocalStorage` — os três fatos
// de `bcb/docs/07` que o exigiam não mudaram: uma chamada faz de 0 a 6
// requisições (o instante publicado é o mais ANTIGO), o cache de 24 h do
// portal responde sem tocar a origem (registra o instante ORIGINAL), e o
// isolate hospedado atende requisições concorrentes (variável de módulo
// vazaria a proveniência de um usuário na resposta de outro). Só que agora o
// coletor é o `UpstreamCall` do pacote: `dispatchTool` o abre com `withCall`, e
// `fetchBcbApi`, o cache do catálogo e `provenienciaBcb` o leem por
// `currentCall()`. Fora de um despacho — teste, chamada direta — cada ida ganha
// um coletor descartável e a proveniência degrada para o instante da chamada,
// nunca quebra.

import {
  createUpstream,
  defaultRetryOn,
  UpstreamError,
  type RetryContext,
  type Upstream,
  type UpstreamCall
} from "@sbissoli/mcp-upstream";
import { currentCall } from "@sbissoli/mcp-upstream/als";

/** Backoff do bcb: 1 s, 2 s, 4 s..., sem jitter (os testes contam o relógio). */
export const BACKOFF_BCB = { baseMs: CONFIG.RETRY_DELAY_MS, maxMs: 8000, jitterMs: 0 } as const;

/**
 * Orçamento TOTAL de uma ida: as N tentativas inteiras mais as esperas entre
 * elas. É o que o código anterior gastava no pior caso — o pacote exige um teto
 * explícito, e o teto honesto é o que já valia (93 s no stdio, 21 s no Worker).
 */
export function orcamentoTotalMs(timeoutMs: number, tentativas: number): number {
  let esperas = 0;
  for (let r = 0; r < tentativas - 1; r++) {
    esperas += Math.min(BACKOFF_BCB.baseMs * 2 ** r, BACKOFF_BCB.maxMs);
  }
  return tentativas * timeoutMs + esperas;
}

/**
 * A política de rede de UMA chamada de tool. `dispatchTool` abre uma por
 * despacho com os números do transporte (`CONFIG` × `WORKER_CONFIG`).
 * `maxRetries` é o TOTAL de tentativas (nome histórico do servidor), não os
 * retries além da primeira — a tradução para o pacote é feita aqui, uma vez.
 */
export function upstreamBcb(
  timeoutMs: number = CONFIG.TIMEOUT_MS,
  maxRetries: number = CONFIG.MAX_RETRIES
): Upstream {
  const tentativas = Math.max(1, maxRetries);
  return createUpstream({
    userAgent: getUserAgent(),
    timeoutMs,
    retries: tentativas - 1,
    budgetMs: orcamentoTotalMs(timeoutMs, tentativas),
    backoff: BACKOFF_BCB,
    honorRetryAfter: true,
    retryOn: ctx => registrarTentativaFalha(ctx, tentativas),
    // Ligação TARDIA ao `fetch` global: os testes o dublam depois de o módulo
    // carregar, e a guarda sem rede do worker também.
    fetchImpl: (input, init) => globalThis.fetch(input, init)
  });
}

/** A política de repetição é a padrão do pacote; aqui só entra o log que já existia. */
function registrarTentativaFalha(ctx: RetryContext, tentativas: number): boolean {
  const repete = defaultRetryOn(ctx);
  if (repete && ctx.attempt < tentativas) {
    console.error(`Tentativa ${ctx.attempt}/${tentativas} falhou (${ctx.kind}). Repetindo...`);
  }
  return repete;
}

const MENSAGEM_404 = "Série não encontrada ou sem dados para o período solicitado";

/**
 * Ponto ÚNICO de rede do servidor.
 *
 * Dentro de um despacho, a ida vai pelo coletor da chamada (`currentCall()`),
 * com a política do transporte; fora, por um coletor descartável com a política
 * pedida. `timeoutMs` é honrado nos dois casos, requisição a requisição —
 * é assim que o pedido pequeno recebe 6 s dentro de um despacho de 30 s.
 */
export async function fetchBcbApi(
  url: string,
  timeoutMs: number = CONFIG.TIMEOUT_MS,
  maxRetries: number = CONFIG.MAX_RETRIES
): Promise<unknown> {
  // O pedido pequeno nunca precisa de 10 s, muito menos de 30: a resposta real
  // mais lenta já medida levou 0,41 s. Encurtar o orçamento AQUI é o que faz a
  // inexistência aparecer como inexistência em vez de como falha da origem.
  const pequeno = ehPedidoPequeno(url);
  const orcamentoMs = pequeno ? Math.min(timeoutMs, TIMEOUT_PEDIDO_PEQUENO_MS) : timeoutMs;
  const call: UpstreamCall = currentCall() ?? upstreamBcb(timeoutMs, maxRetries).call();

  try {
    return await call.json(url, { headers: { Accept: "application/json" }, timeoutMs: orcamentoMs });
  } catch (erro) {
    throw traduzirErroDaOrigem(erro, pequeno, orcamentoMs);
  }
}

/**
 * Do erro do pacote (classe + contagem) ao erro do servidor (tipo + mensagem).
 *
 * A página institucional em HTML com status 200 tem DUAS causas, e mandar o
 * usuário para a errada custa caro:
 *
 * (a) série inexistente. Medido em 13/08/2026: um código certamente inválido
 *     (999999999) devolve exatamente a mesma página que os códigos 14 e 13523 —
 *     a origem não usa 404 para isso — e leva ~30 s para devolvê-la (24/09/2026).
 * (b) consulta cortada por tempo, por volta de 30 s numa janela diária larga
 *     (`bcb/docs/04`).
 *
 * `ultimos/N` nunca é caso (b): pede no máximo 20 observações. Então a forma da
 * URL separa os dois sem uma requisição a mais.
 *
 * (c) DESCOBERTO em 24/09/2026, e derruba o "determinístico" que estava escrito
 *     aqui: a origem responde essa MESMA página a uma série que EXISTE. Medido
 *     na 432 (meta Selic): 3 páginas HTML em 9 chamadas numa janela de poucos
 *     minutos e, logo depois, 20 chamadas seguidas devolvendo JSON em ≤ 0,4 s.
 *     A página não prova inexistência — prova que ESTA tentativa não trouxe
 *     dado. Tratá-la como veredito fazia o servidor dizer que a meta Selic não
 *     existe sempre que a origem soluçasse.
 *
 * Por isso a suspeita de inexistência é RESOLVIDA POR REPETIÇÃO: o pacote
 * repete `malformed_body` e `timeout` como qualquer transitório, e só quando
 * TODAS as tentativas de um pedido pequeno falham é que isto vira afirmação —
 * e ainda assim nomeia a alternativa, porque queda de rede e indisponibilidade
 * da origem terminam igual. Dizer "não existe" de um código certo seria trocar
 * erro alto por plausível.
 */
function traduzirErroDaOrigem(erro: unknown, pequeno: boolean, orcamentoMs: number): Error {
  if (!(erro instanceof UpstreamError)) {
    return erro instanceof Error ? erro : new Error(String(erro));
  }

  // 404 de verdade continua determinístico.
  if (erro.kind === "not_found") {
    return new ErroHttpBcb(404, MENSAGEM_404);
  }

  // Erro de cliente (4xx) é determinístico: repetir só gasta tempo e
  // requisição. O 406 da janela decenal é o caso que importa — quem chama
  // precisa dele de volta rápido para fatiar a janela e tentar de novo.
  if (erro.kind === "http_4xx") {
    return new ErroHttpBcb(erro.status ?? 400, `Erro na API do BCB: ${erro.status}`);
  }

  // SUSPEITA de inexistência, no pedido pequeno: ou a origem devolveu a página
  // de 'requisição inválida', ou não devolveu nada dentro do orçamento curto.
  // As duas são a mesma coisa vista de dois lados — a origem leva ~30 s para
  // negar um código que não existe, e o orçamento de 6 s corta esse silêncio
  // antes de a página chegar. Código inexistente falha em todas as tentativas;
  // série boa volta na seguinte, em décimos de segundo.
  if (pequeno && (erro.kind === "timeout" || erro.kind === "malformed_body")) {
    return new ErroSerieInexistente(
      `A API do BCB não trouxe dado em ${contarTentativas(erro.attempts)} de um pedido de poucas ` +
        `observações (orçamento de ${Math.round(orcamentoMs / 1000)}s cada). Série que existe ` +
        "responde em menos de 0,5 s; é a série INEXISTENTE que fica ~30 s sem resposta antes de " +
        "devolver a página de 'requisição inválida' (a origem não usa 404). Confira o código com " +
        "`bcb_buscar_serie`. Se o código estiver certo, a origem está indisponível — repita em " +
        "instantes."
    );
  }

  // A classe sai do `kind`, não da frase de `descreverFalha`. O corpo que não é
  // JSON tem as duas leituras que a mensagem nomeia; fica em `nao_encontrado`,
  // como a frase já o classificava.
  return new ErroDaOrigem(
    `Falha após ${contarTentativas(erro.attempts)}: ${descreverFalha(erro, orcamentoMs)}`,
    erro.kind === "malformed_body" ? "nao_encontrado" : "fonte"
  );
}

function contarTentativas(n: number): string {
  return `${n} ${n === 1 ? "tentativa" : "tentativas"}`;
}

/** A última falha, em pt-BR, com o número que a sustenta quando há um. */
function descreverFalha(erro: UpstreamError, orcamentoMs: number): string {
  switch (erro.kind) {
    case "timeout":
      return `a origem não respondeu dentro do prazo de ${Math.round(orcamentoMs / 1000)}s`;
    case "network": {
      const causa = erro.cause instanceof Error ? ` (${erro.cause.message})` : "";
      return `falha de rede ao alcançar a origem${causa}`;
    }
    case "rate_limited": {
      const espera = erro.retryAfterMs !== undefined ? `, Retry-After de ${Math.ceil(erro.retryAfterMs / 1000)}s` : "";
      return `a origem limitou a taxa de requisições (HTTP 429${espera})`;
    }
    case "http_5xx":
      return `Erro na API do BCB: ${erro.status}`;
    case "malformed_body":
      return (
        "Resposta da API do BCB não é JSON — ou a série não existe, ou a origem cortou a " +
        "consulta por tempo (janelas longas em séries diárias fazem isso). " +
        "Confira o código da série e, se ele estiver certo, reduza o período solicitado."
      );
    default:
      return erro.message;
  }
}

export function calculateVariation(valorInicial: number, valorFinal: number): number {
  if (valorInicial === 0) return 0;
  return ((valorFinal - valorInicial) / Math.abs(valorInicial)) * 100;
}

// ==================== SCHEMA ====================

/**
 * Seals every object node of a JSON Schema (`additionalProperties: false`),
 * recursively. Zod sealed objects by construction, so the stdio channel always
 * advertised sealed schemas; doing it here in one place keeps that guarantee
 * after the SDK v2 migration and extends it to the HTTP channel, which never
 * had it.
 */
export function sealDeep<T>(schema: T): T {
  if (Array.isArray(schema)) return schema.map(sealDeep) as unknown as T;
  if (schema === null || typeof schema !== "object") return schema;

  const node = schema as Record<string, unknown>;
  const sealedEntries = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, sealDeep(v)]));

  return (node.type === "object" && node.properties !== undefined
    ? { ...sealedEntries, additionalProperties: false }
    : sealedEntries) as unknown as T;
}

/** Definição canônica de uma tool, igual para os dois transportes. */
export interface ToolDefinition {
  name: string;
  description: string;
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

/** Anotações padrão do portfólio: toda tool aqui é leitura de API pública. */
export function leituraRemota(title: string): ToolDefinition["annotations"] {
  return { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
}
