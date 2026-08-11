/**
 * SDK v2 registration layer — the SINGLE place where tools, resources and
 * prompts are projected onto an `McpServer`.
 *
 * Design decisions of the v2 migration (fase bcb, Sessão 02):
 *
 * - Before this module there were two independent surfaces: `index.ts`
 *   derived its schemas from Zod for stdio, while `worker.ts` hand-rolled the
 *   JSON-RPC protocol and served the JSON Schemas from `TOOL_DEFINITIONS`.
 *   They had drifted apart (the HTTP contract lacked `minItems`/`maxItems`,
 *   `default`, `minimum`/`maximum` and `additionalProperties`; resources were
 *   published under different names). `baselines/README.md` records the
 *   measured divergence. Both transports now read this module.
 *
 * - The advertised JSON Schemas are the exact objects in `TOOL_DEFINITIONS`,
 *   passed through `fromJsonSchema` so `tools/list` publishes them verbatim
 *   instead of a re-derived dialect.
 *
 * - INPUT is validated, OUTPUT is not. Rationale: under SDK 1.x the
 *   stdio channel validated arguments through the Zod input schema, but the
 *   hand-rolled Worker never did — sending `{}` to `bcb_serie_valores` on the
 *   hosted endpoint produced a request for "série undefined" against the BCB
 *   API. Validating here restores the stdio guarantee and closes that hole,
 *   with one contract for both transports. The handlers never validated on
 *   their own, so there is no pedagogical Zod error to preserve. Output stays
 *   unvalidated at runtime: shapes are covered by the characterization tests,
 *   and a strict runtime check could only turn a good answer into an error.
 *
 * - SDK v2 hard rule: a tool declaring `outputSchema` MUST return
 *   `structuredContent` on every non-error result. The check runs before any
 *   validator and cannot be disabled. All 8 handlers go through
 *   `structuredResult()`, and `register.test.ts` pins it.
 */

import {
  McpServer,
  fromJsonSchema,
  type jsonSchemaValidator,
  type JsonSchemaValidator,
  type JsonSchemaValidatorResult,
  type JsonSchemaType,
  type StandardSchemaWithJSON
} from "@modelcontextprotocol/server";
// O validador do SDK para Cloudflare Workers, usado nos DOIS runtimes de
// propósito. O provider baseado em ajv compila os validadores com `new
// Function`, que o runtime da Cloudflare proíbe — no wrangler dev isso derruba
// TODA chamada ao /mcp com "Error compiling schema" + HTTP 500. Este aqui
// interpreta o schema em vez de gerar código, funciona igual no Node, e assim
// os dois transportes validam exatamente da mesma forma.
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";

import {
  TOOL_DEFINITIONS,
  RESOURCE_DEFINITIONS,
  PROMPT_DEFINITIONS,
  dispatchTool,
  CONFIG,
  type ToolResult
} from "./tools.js";

/** Accepts every value — used for output schemas only (see module docstring). */
const permissiveValidator: jsonSchemaValidator = {
  getValidator<T>(): JsonSchemaValidator<T> {
    return (input: unknown): JsonSchemaValidatorResult<T> => ({
      valid: true,
      data: input as T,
      errorMessage: undefined
    });
  }
};

const inputValidator = new CfWorkerJsonSchemaValidator();

/** Advertise a JSON Schema verbatim AND enforce it on incoming arguments. */
function validatedSchema(schema: unknown): StandardSchemaWithJSON {
  return fromJsonSchema(schema as JsonSchemaType, inputValidator);
}

/** Advertise a JSON Schema verbatim, without runtime checking. */
function passthroughSchema(schema: unknown): StandardSchemaWithJSON {
  return fromJsonSchema(schema as JsonSchemaType, permissiveValidator);
}

/**
 * Optional per-tool usage hook: `tool_call` on every invocation, `tool_error`
 * additionally when the call fails. stdio passes nothing; the Cloudflare
 * Worker passes its UsageTracker recorder. Names and counts only — never
 * arguments, never results.
 */
export type ToolUsageRecorder = (kind: "tool_call" | "tool_error", name: string) => void;

export interface RegisterOptions {
  /** Per-transport timeout/retry budget (the Worker uses a tighter one). */
  config?: { TIMEOUT_MS: number; MAX_RETRIES: number };
  record?: ToolUsageRecorder;
}

/**
 * Registers the whole surface onto a given server. Kept separate from
 * `createServer` so the Worker — which builds a fresh `McpServer` per
 * request — reuses the exact same registrations.
 */
export function registerAll(server: McpServer, options: RegisterOptions = {}): void {
  const { config = CONFIG, record } = options;

  for (const tool of TOOL_DEFINITIONS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: validatedSchema(tool.inputSchema),
        outputSchema: passthroughSchema(tool.outputSchema),
        annotations: tool.annotations
      },
      async (args: unknown): Promise<ToolResult> => {
        try {
          const result = await dispatchTool(
            tool.name,
            (args ?? {}) as Record<string, unknown>,
            config.TIMEOUT_MS,
            config.MAX_RETRIES
          );
          record?.("tool_call", tool.name);
          if (result.isError === true) record?.("tool_error", tool.name);
          return result;
        } catch (error) {
          // Handlers already trap their own failures; this is the last resort
          // so an unexpected throw never breaks the transport.
          const message = error instanceof Error ? error.message : String(error);
          record?.("tool_call", tool.name);
          record?.("tool_error", tool.name);
          return {
            content: [{ type: "text" as const, text: `Erro ao executar a tool "${tool.name}": ${message}` }],
            isError: true
          };
        }
      }
    );
  }

  for (const resource of RESOURCE_DEFINITIONS) {
    server.registerResource(
      resource.name,
      resource.uri,
      { description: resource.description, mimeType: resource.mimeType },
      async () => ({
        contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: resource.read() }]
      })
    );
  }

  for (const prompt of PROMPT_DEFINITIONS) {
    server.registerPrompt(prompt.name, { description: prompt.description }, async () => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: prompt.text } }]
    }));
  }
}

/**
 * Builds a fresh, fully registered server. No transport is connected, so it is
 * safe to call from tests and once per request on stateless HTTP transports.
 */
export function createServer(version: string, options: RegisterOptions = {}): McpServer {
  const server = new McpServer({ name: "bcb-br-mcp", version });
  registerAll(server, options);
  return server;
}
