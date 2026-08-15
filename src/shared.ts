/**
 * Primitivos compartilhados por todas as APIs do BCB que o servidor consome.
 *
 * Extraído de `tools.ts` na sessão de D3, quando o servidor deixou de falar com
 * uma API só (SGS) e passou a falar com três (SGS, Olinda/Expectativas e PTAX).
 * `tools.ts` re-exporta tudo daqui, de propósito: worker e testes importam
 * desses nomes desde a fundação, e o D3 não é hora de mexer em quem importa o
 * quê. A regra de dependência é uma só — `shared.ts` não importa ninguém, e é
 * por isso que não há ciclo entre os módulos de tool.
 */

// ==================== CONFIG ====================

export const CONFIG = {
  TIMEOUT_MS: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000
};

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
let serverVersion = "1.9.0";

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

/** Falha de tool: `isError` com texto em pt-BR, nunca erro de protocolo. */
export function erroResult(texto: string): ToolResult {
  return { content: [{ type: "text" as const, text: texto }], isError: true };
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

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = "ErroHttpBcb";
    this.status = status;
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
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroSerieInexistente";
  }
}

// ==================== COLETOR DE EXTRAÇÃO (D4) ====================
//
// O bloco de proveniência precisa publicar o instante REAL da extração na
// origem, e três fatos medidos em 13/08/2026 (`bcb/docs/07`) definem esta forma:
//
//  1. Uma chamada faz de 0 a 6 requisições — não existe "o" instante. A regra
//     adotada é o instante mais ANTIGO entre os acessos que alimentaram a
//     resposta (precedente medical).
//  2. Há cache: o índice do portal vale 24 h e responde SEM tocar a origem
//     (medido: 2ª busca em 3 ms, zero requisições). Carimbar `new Date()` ali
//     afirmaria uma extração que não aconteceu — com erro de até um dia, no
//     campo de peso legal. Por isso o cache registra o instante ORIGINAL.
//  3. Variável de módulo estaria errada no hospedado: o isolate atende
//     requisições concorrentes e a proveniência de um usuário vazaria na
//     resposta de outro. `AsyncLocalStorage` isola por despacho — medido no
//     workerd, com a mesma `compatibility_date` e os mesmos flags do worker:
//     sobrevive a `await`, sobrevive a `Promise.all` e não contamina.

import { AsyncLocalStorage } from "node:async_hooks";

/** Um acesso a dado da origem dentro de uma chamada de tool. */
export interface AcessoOrigem {
  url: string;
  /** Instante da extração na origem — de cache, é o instante do fetch ORIGINAL. */
  instante: Date;
  deCache: boolean;
}

const coletor = new AsyncLocalStorage<AcessoOrigem[]>();

/**
 * Abre um coletor para uma chamada. Fora dele, `registrarAcesso` é no-op e a
 * proveniência degrada para o instante da chamada — nunca quebra.
 */
export function comColetorDeExtracao<T>(fn: () => Promise<T>): Promise<T> {
  return coletor.run([], fn);
}

/** Registra um acesso a dado da origem. Chamado no ponto de rede e no cache. */
export function registrarAcesso(url: string, instante: Date, deCache = false): void {
  coletor.getStore()?.push({ url, instante, deCache });
}

/** Só para os testes: o que foi registrado na chamada corrente. */
export function acessosRegistrados(): AcessoOrigem[] {
  return [...(coletor.getStore() ?? [])];
}

export interface ExtracaoAgregada {
  /** Instante mais antigo entre os acessos; a hora da chamada se não houve nenhum. */
  retrievedAt: Date;
  /** `true` só se TODO acesso veio de cache; `null` quando não houve acesso à origem. */
  servedFromCache: boolean | null;
  /** Quantos acessos alimentaram a resposta (0 = respondida só com dado do servidor). */
  acessos: number;
}

/**
 * Agrega os acessos da chamada corrente. `filtro` restringe a uma fonte quando
 * a resposta mistura procedências (ex.: portal × catálogo curado).
 */
export function extracaoDaChamada(filtro?: (url: string) => boolean): ExtracaoAgregada {
  const todos = coletor.getStore() ?? [];
  const acessos = filtro ? todos.filter(a => filtro(a.url)) : todos;

  if (acessos.length === 0) {
    return { retrievedAt: new Date(), servedFromCache: null, acessos: 0 };
  }

  const maisAntigo = acessos.reduce((a, b) => (a.instante <= b.instante ? a : b));
  return {
    retrievedAt: maisAntigo.instante,
    servedFromCache: acessos.every(a => a.deCache),
    acessos: acessos.length
  };
}

export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": getUserAgent()
      }
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchBcbApi(
  url: string,
  timeoutMs: number = CONFIG.TIMEOUT_MS,
  maxRetries: number = CONFIG.MAX_RETRIES
): Promise<unknown> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, timeoutMs);

      if (!response.ok) {
        if (response.status === 404) {
          throw new ErroHttpBcb(404, `Série não encontrada ou sem dados para o período solicitado`);
        }
        throw new ErroHttpBcb(response.status, `Erro na API do BCB: ${response.status} ${response.statusText}`);
      }

      try {
        const dados = await response.json();
        // Instante da extração para o bloco de proveniência (D4). Registrado só
        // no sucesso: uma tentativa que falhou não extraiu dado nenhum.
        registrarAcesso(url, new Date(), false);
        return dados;
      } catch {
        // 200 com a página institucional em HTML tem DUAS causas, e mandar o
        // usuário para a errada custa caro:
        //
        // (a) série inexistente. Medido em 13/08/2026: um código certamente
        //     inválido (999999999) devolve exatamente a mesma página que os
        //     códigos 14 e 13523 — a origem não usa 404 para isso.
        // (b) consulta cortada por tempo, por volta de 30 s numa janela diária
        //     larga (`bcb/docs/04`).
        //
        // `ultimos/N` nunca é caso (b): pede no máximo 20 observações. Então a
        // forma da URL separa os dois sem uma requisição a mais.
        const pediuPoucasObservacoes = /\/dados\/ultimos\/\d+/.test(url);
        if (pediuPoucasObservacoes) {
          // Determinístico como um 4xx: o código não existe e não vai passar a
          // existir na tentativa seguinte. Repetir aqui gastava as retentativas
          // inteiras, com backoff, para chegar à mesma resposta.
          throw new ErroSerieInexistente(
            "A API do BCB respondeu com a página de 'requisição inválida' a um pedido pequeno — " +
            "é assim que ela indica série INEXISTENTE (não usa 404). Confira o código da série."
          );
        }
        throw new Error(
          "Resposta da API do BCB não é JSON — ou a série não existe, ou a origem cortou a " +
          "consulta por tempo (janelas longas em séries diárias fazem isso). " +
          "Confira o código da série e, se ele estiver certo, reduza o período solicitado."
        );
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError instanceof ErroSerieInexistente || lastError.message.includes("não encontrada")) {
        throw lastError;
      }

      // Erro de cliente (4xx) é determinístico: repetir só gasta tempo e
      // requisição. O 406 da janela decenal é o caso que importa — quem chama
      // precisa dele de volta rápido para fatiar a janela e tentar de novo.
      if (lastError instanceof ErroHttpBcb && lastError.status >= 400 && lastError.status < 500) {
        throw lastError;
      }

      const isTimeout = lastError.name === "AbortError" ||
        lastError.message.includes("aborted") ||
        lastError.message.includes("timeout");

      if (attempt < maxRetries) {
        const delayMs = CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        const reason = isTimeout ? "timeout" : "erro";
        console.error(`Tentativa ${attempt}/${maxRetries} falhou (${reason}). Aguardando ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }
  }

  throw new Error(`Falha após ${maxRetries} tentativas: ${lastError?.message || "Erro desconhecido"}`);
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
