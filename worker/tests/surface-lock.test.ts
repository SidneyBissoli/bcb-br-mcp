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

import {
  CABECALHOS_MCP,
  comHost,
  conferirSecao,
  corpoDoPedido,
  ipDaSonda,
  medirSemToken,
  sondaSemToken,
} from "@sbissoli/mcp-surface";
import { describe, expect, it } from "vitest";

import { SELF_ROUTE } from "../src/analytics.js";
import worker from "../src/index.js";
import type { Env } from "../src/types.js";

// `.href`: o URL das workers-types não é o do node:url para o compilador.
const raiz = fileURLToPath(new URL("../../", import.meta.url).href);
const trava = `${raiz}surface.lock.json`;
const versao = (JSON.parse(readFileSync(`${raiz}package.json`, "utf8")) as { version: string }).version;

const HOST = "bcb.sidneybissoli.com";
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const envs: Record<string, Env> = {
  apiKeyAusente: {} as Env,
  apiKeyPresente: { API_KEY: "chave-da-sonda" } as Env,
};

// Catálogo curado: `tools/call` sem tocar a rede do BCB (a suíte é offline).
const sonda = sondaSemToken({ name: "bcb_series_populares", arguments: {} });

// Três rotas chegam ao handler MCP: `/mcp`, a rota privada do dono e o
// `POST /` legado, reescrito para `/mcp` (o README publicou a raiz por versões).
const medirBorda = () =>
  medirSemToken(Object.keys(envs), ["POST /", "POST /mcp", `POST ${SELF_ROUTE}`], sonda, (config, rota, pedido) =>
    worker.fetch(
      comHost(
        new Request(`https://${HOST}${rota.slice("POST ".length)}`, {
          method: "POST",
          headers: { ...CABECALHOS_MCP, "CF-Connecting-IP": ipDaSonda() },
          body: corpoDoPedido(pedido),
        }),
        HOST,
      ),
      envs[config]!,
      ctx,
    ),
  );

describe("surface.lock.json — quem responde sem token", () => {
  it("bate com a trava, ou a versão subiu junto", async () => {
    const m = await medirBorda();
    // Sanidade ANTES de conferir — e, no modo de escrita, antes de GRAVAR: uma
    // sonda quebrada (tudo false, ou tudo true) não pode virar trava.
    const aberta = m["apiKeyAusente"]?.["POST /mcp"];
    const fechada = m["apiKeyPresente"]?.["POST /mcp"];
    expect(aberta?.["tools/list"], "sonda quebrada: sem API_KEY, tools/list tem de responder").toBe(true);
    expect(aberta?.["tools/call"], "sonda quebrada: sem API_KEY, a tool local tem de responder").toBe(true);
    expect(fechada?.["tools/list"], "sonda quebrada: com API_KEY e sem token, tools/list não pode responder").toBe(false);
    const v = conferirSecao(trava, "semToken", m, versao);
    expect(v.ok, v.mensagem).toBe(true);
  }, 60_000);
});
