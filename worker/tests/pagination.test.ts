/**
 * A borda HTTP do guarda de cursor — o que a suíte do pacote pai não cobre.
 *
 * O predicado (quais mensagens são recusadas) já está preso em
 * `src/pagination.test.ts` do pacote. O que se verifica AQUI é a fiação, e ela
 * tem uma ORDEM que importa: o guarda roda DEPOIS do `createMcpHandler`, porque
 * é ele quem valida `Host` e `Origin`. Um guarda colocado antes responderia
 * `-32602` a uma requisição que a checagem de segurança ia recusar com 403 —
 * recusa de protocolo passando à frente da recusa de segurança. Os testes
 * abaixo são esse par: cursor inválido com Host bom vira `-32602`; o mesmo
 * cursor com Host forjado continua sendo recusado como segurança.
 *
 * SOBRE O `Host` INJETADO. Em workerd toda requisição chega com `Host`; o
 * `Request` do Node (undici) trata `host` como cabeçalho proibido e o descarta
 * em silêncio, então o handler responde "Missing Host header" a tudo e o teste
 * mediria a ausência do cabeçalho, não o guarda. `comHost` devolve uma visão da
 * requisição com o `Host` que o runtime real teria posto — nada além disso é
 * simulado.
 */

import { describe, expect, it } from "vitest";

import worker from "../src/index.js";
import type { Env } from "../src/types.js";

/** Env sem bindings: o Worker degrada (sem uso, sem analytics, sem auth). */
const env = {} as Env;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

/** Requisição com o `Host` que workerd teria entregado. Ver o cabeçalho. */
function comHost(request: Request, host: string): Request {
  const headers = new Headers(request.headers);
  headers.set("host", host);
  return new Proxy(request, {
    get(alvo, prop) {
      if (prop === "headers") return headers;
      const valor = Reflect.get(alvo, prop, alvo);
      return typeof valor === "function" ? valor.bind(alvo) : valor;
    },
  });
}

const post = (body: unknown, host = "bcb.sidneybissoli.com") =>
  comHost(
    new Request("https://bcb.sidneybissoli.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify(body),
    }),
    host,
  );

const listaComCursor = (method: string) => ({
  jsonrpc: "2.0",
  id: 42,
  method,
  params: { cursor: "cursor-que-este-servidor-nunca-emitiu" },
});

describe("cursor de paginação inválido na borda HTTP", () => {
  it("recusa as quatro listas com -32602, em HTTP 200 e com o id preservado", async () => {
    for (const method of ["tools/list", "resources/list", "resources/templates/list", "prompts/list"]) {
      const res = await worker.fetch(post(listaComCursor(method)), env, ctx);
      // 200 com erro JSON-RPC no corpo: a falha é de protocolo, não de HTTP.
      expect(res.status, method).toBe(200);
      const corpo = (await res.json()) as { id: number; error: { code: number; message: string } };
      expect(corpo.error.code, method).toBe(-32602);
      expect(corpo.id, method).toBe(42);
      expect(corpo.error.message, method).toContain(method);
    }
  });

  it("lista SEM cursor segue o caminho normal — o guarda não se mete", async () => {
    const res = await worker.fetch(post({ jsonrpc: "2.0", id: 1, method: "tools/list" }), env, ctx);
    expect(res.status).toBe(200);
    const texto = await res.text();
    expect(texto).not.toContain("-32602");
    expect(texto).toContain("bcb_serie_valores");
  });

  it("tools/call com um campo chamado cursor não é confundido com paginação", async () => {
    const res = await worker.fetch(
      post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "bcb_series_populares", arguments: {}, cursor: "x" } }),
      env,
      ctx,
    );
    expect((await res.text())).not.toContain("-32602");
  });

  it("a recusa de SEGURANÇA continua vindo primeiro: Host forjado não vira -32602", async () => {
    const res = await worker.fetch(post(listaComCursor("tools/list"), "atacante.example"), env, ctx);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("-32602");
  });
});
