/**
 * Origem do site do autor na rota pública (src/origin.ts), medida na borda
 * HTTP pelo `worker.fetch` inteiro — handler, CORS e roteamento juntos.
 *
 * Existe por duas metades que não podem divergir em silêncio:
 * - a página https://sidneybissoli.com chama `/mcp` pelo navegador (WebMCP,
 *   16/10/2026): preflight e POST precisam passar;
 * - a rota privada do dono (`/mcp/uso-proprio`) NUNCA aceita essa origem — se
 *   a lista vazar para ela, uma página aberta no navegador fala com a rota que
 *   marca o tráfego como do próprio dono.
 */

import { describe, expect, it } from "vitest";

import { SELF_ROUTE } from "../src/analytics.js";
import worker from "../src/index.js";
import { origensAceitas, SITE_HOSTNAMES } from "../src/origin.js";
import type { Env } from "../src/types.js";

const env = {} as Env;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

const SITE = "https://sidneybissoli.com";

/** Requisição com o `Host` que workerd teria entregado (ver pagination.test.ts). */
function comHost(request: Request, host = "bcb.sidneybissoli.com"): Request {
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

const preflight = (rota: string, origin: string) =>
  comHost(
    new Request(`https://bcb.sidneybissoli.com${rota}`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    }),
  );

const lista = (rota: string, origin?: string) =>
  comHost(
    new Request(`https://bcb.sidneybissoli.com${rota}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );

describe("origensAceitas", () => {
  it("rota pública: os hostnames do servidor e o do site", () => {
    const l = origensAceitas("/mcp");
    expect(l).toEqual(expect.arrayContaining(["bcb.sidneybissoli.com", "localhost", ...SITE_HOSTNAMES]));
    expect(l).not.toContain("*");
  });

  it("rota privada: defaults do handler (undefined), nunca o site", () => {
    expect(origensAceitas(SELF_ROUTE)).toBeUndefined();
  });
});

describe("Origin do site na borda", () => {
  it("preflight do site em /mcp → 2xx com CORS", async () => {
    const res = await worker.fetch(preflight("/mcp", SITE), env, ctx);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
  });

  it("POST do site em /mcp → 200 com as tools", async () => {
    const res = await worker.fetch(lista("/mcp", SITE), env, ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("bcb_indicadores_atuais");
  });

  it("o site em /mcp/uso-proprio → 403 (preflight e POST)", async () => {
    expect((await worker.fetch(preflight(SELF_ROUTE, SITE), env, ctx)).status).toBe(403);
    expect((await worker.fetch(lista(SELF_ROUTE, SITE), env, ctx)).status).toBe(403);
  });

  it("origem estrangeira em /mcp continua 403", async () => {
    expect((await worker.fetch(lista("/mcp", "https://evil.example"), env, ctx)).status).toBe(403);
    // Subdomínio inventado do site não herda a permissão do apex.
    expect((await worker.fetch(lista("/mcp", "https://x.sidneybissoli.com"), env, ctx)).status).toBe(403);
  });

  it("sem Origin (cliente MCP comum) segue 200 nas duas rotas", async () => {
    expect((await worker.fetch(lista("/mcp"), env, ctx)).status).toBe(200);
    expect((await worker.fetch(lista(SELF_ROUTE), env, ctx)).status).toBe(200);
  });
});
