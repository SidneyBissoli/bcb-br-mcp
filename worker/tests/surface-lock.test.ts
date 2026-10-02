/**
 * A metade da impressão digital que só a borda HTTP sabe medir: QUAIS MÉTODOS
 * RESPONDEM SEM CREDENCIAL. Nenhuma listagem mostra isso — o caso que o leitor
 * do dev.to achou (comentário 3g5m4) foi exatamente `tools/list` passando a
 * responder sem token sem que nada na superfície declarada mudasse.
 *
 * Mede-se nas duas configurações que o código admite — `API_KEY` ausente (a
 * de produção hoje: acesso aberto) e presente — e nas três rotas que chegam ao
 * handler MCP (`/mcp`, a rota privada do dono e o `POST /` legado). O
 * resultado vai na seção `semToken` do `surface.lock.json`, sob a mesma regra
 * da superfície declarada (`src/surface-lock.ts` do pacote pai): mudou sem
 * subir a versão = vermelho, e o deploy não roda.
 *
 * O `Host` é injetado pelo mesmo motivo de `pagination.test.ts`: o `Request`
 * do Node descarta o cabeçalho e o handler responderia "Missing Host header" a
 * tudo — a sonda mediria a ausência do cabeçalho, não a autenticação.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SONDA_SEM_TOKEN, lerCorpoJsonRpc } from "../../dist/surface.js";
import { conferirSecao } from "../../dist/surface-lock.js";
import { SELF_ROUTE } from "../src/analytics.js";
import worker from "../src/index.js";
import type { Env } from "../src/types.js";

// `.href`: o URL das workers-types não é o do node:url para o compilador.
const raiz = fileURLToPath(new URL("../../", import.meta.url).href);
const versao = (JSON.parse(readFileSync(`${raiz}package.json`, "utf8")) as { version: string }).version;

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const HOST = "bcb.sidneybissoli.com";

function comHost(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.set("host", HOST);
  return new Proxy(request, {
    get(alvo, prop) {
      if (prop === "headers") return headers;
      const valor = Reflect.get(alvo, prop, alvo);
      return typeof valor === "function" ? valor.bind(alvo) : valor;
    },
  });
}

// Um IP por requisição: a sonda faz dezenas de chamadas e o balde do rate limit
// (burst 20) responderia 429 no meio — mediria o limitador, não a autenticação.
let ip = 0;

async function responde(rota: string, env: Env, method: string, params?: unknown): Promise<boolean> {
  const req = comHost(
    new Request(`https://${HOST}${rota}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "CF-Connecting-IP": `192.0.2.${++ip % 250}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const res = await worker.fetch(req, env, ctx);
  if (res.status !== 200) return false;
  return lerCorpoJsonRpc(await res.text())?.result !== undefined;
}

async function medir(): Promise<Record<string, Record<string, Record<string, boolean>>>> {
  const configuracoes: Record<string, Env> = {
    apiKeyAusente: {} as Env,
    apiKeyPresente: { API_KEY: "chave-da-sonda" } as Env,
  };
  const saida: Record<string, Record<string, Record<string, boolean>>> = {};
  for (const [nome, env] of Object.entries(configuracoes)) {
    saida[nome] = {};
    for (const rota of ["/", "/mcp", SELF_ROUTE]) {
      const porMetodo: Record<string, boolean> = {};
      for (const { method, params } of SONDA_SEM_TOKEN) porMetodo[method] = await responde(rota, env, method, params);
      saida[nome][`POST ${rota}`] = porMetodo;
    }
  }
  return saida;
}

describe("surface.lock.json — quem responde sem token", () => {
  it("bate com a trava, ou a versão subiu junto", async () => {
    const v = conferirSecao(
      `${raiz}surface.lock.json`,
      "semToken",
      await medir(),
      versao,
      process.env.SURFACE_LOCK_ESCREVER === "1",
    );
    expect(v.ok, v.mensagem).toBe(true);
  }, 30_000);

  it("a sonda distingue as duas configurações (não mede só 200 vazio)", async () => {
    const m = await medir();
    expect(m.apiKeyAusente!["POST /mcp"]!["tools/list"]).toBe(true);
    expect(m.apiKeyAusente!["POST /mcp"]!["tools/call"]).toBe(true);
    expect(m.apiKeyPresente!["POST /mcp"]!["tools/list"]).toBe(false);
  }, 30_000);
});
