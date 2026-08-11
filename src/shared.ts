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
// A static `import "../package.json"` is avoided on purpose: it breaks tsc's rootDir
// and createRequire is unavailable in the Worker runtime (no nodejs_compat).
// The fallback is only used if no entry point injects a version; keep it = package.json.
let serverVersion = "1.5.0";

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

export interface SeriePopular {
  codigo: number;
  nome: string;
  categoria: string;
  periodicidade: string;
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

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
        return await response.json();
      } catch {
        // Medido em 11/08/2026 (`bcb/docs/04`): uma janela diária larga pode ser
        // cortada por volta de 30 s e voltar 200 com a página institucional em
        // HTML. Sem esta mensagem o usuário recebia um erro de parsing cru.
        throw new Error(
          "Resposta da API do BCB não é JSON — a origem provavelmente cortou a consulta por tempo. " +
          "Janelas longas em séries diárias fazem isso; reduza o período solicitado."
        );
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError.message.includes("não encontrada")) {
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
