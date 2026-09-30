/**
 * A classe do erro sai do TIPO da falha, não da frase.
 *
 * Medido em 28/09/2026: 5 de 7 erros de uso do `bcb_serie_valores` em 28 dias
 * caíram em `outro`, e os Workers Logs mostraram que 8 de 8 eram o timeout da
 * origem — "Falha após 2 tentativas: a origem não respondeu dentro do prazo de
 * 10s". A definição de `fonte` diz "timeout"; a frase não dizia, e o tipo
 * (`UpstreamError.kind`) morria antes de o hook de telemetria vê-lo. Rodando o
 * classificador do `dist/` da 1.15.1: timeout, rede, 429 e 4xx ≠ 404 davam
 * `outro`, e a série inexistente dava `contrato` — classe que o painel EXCLUI
 * da taxa de erro.
 *
 * Por isso o teste atravessa o caminho INTEIRO — rede dublada, handler, `catch`,
 * hook `record` — em vez de chamar `classifyError` numa frase: a frase certa
 * nunca foi o problema, a perda do tipo no meio do caminho é que era.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "./register.js";
import type { FormaDaChamada } from "./register.js";

/** Prazo curto, para o timeout não custar os 10 s do Worker em cada caso. */
const CONFIG_TESTE = { TIMEOUT_MS: 150, MAX_RETRIES: 2, RETRY_DELAY_MS: 1000 };

async function chamar(tool: string, args: Record<string, unknown>) {
  const erros: FormaDaChamada[] = [];
  const server = createServer("test", {
    config: CONFIG_TESTE,
    record: (kind, _name, forma) => {
      if (kind === "tool_error" && forma) erros.push(forma);
    }
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "classe-do-erro", version: "1.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
  const result = await client.callTool({ name: tool, arguments: args });
  return { result, erros };
}

const JANELA = { codigo: 432, dataInicial: "2025-01-01", dataFinal: "2025-03-31" };

function fetchQueNuncaResponde() {
  return vi.fn((_url: string, init?: { signal?: AbortSignal }) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const e = new Error("The operation was aborted");
        e.name = "AbortError";
        reject(e);
      });
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("falha da origem é `fonte`, qualquer que seja a frase", () => {
  it("timeout em todas as tentativas — o caso medido na produção", async () => {
    vi.stubGlobal("fetch", fetchQueNuncaResponde());
    const { result, erros } = await chamar("bcb_serie_valores", JANELA);

    expect(result.isError).toBe(true);
    // A frase continua a mesma que o usuário já recebia: nada muda no fio.
    expect(JSON.stringify(result.content)).toContain("a origem não respondeu dentro do prazo");
    expect(erros.map(e => e.classe)).toEqual(["fonte"]);
  });

  it("falha de rede (o `fetch` rejeita com TypeError, que NÃO é bug nosso aqui)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const { erros } = await chamar("bcb_serie_valores", JANELA);
    expect(erros.map(e => e.classe)).toEqual(["fonte"]);
  });

  it("429 esgotado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    const { erros } = await chamar("bcb_serie_valores", JANELA);
    expect(erros.map(e => e.classe)).toEqual(["fonte"]);
  });

  it("5xx esgotado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const { erros } = await chamar("bcb_serie_valores", JANELA);
    expect(erros.map(e => e.classe)).toEqual(["fonte"]);
  });

  it("4xx que não é 404 nem o 406 do fatiamento", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 400 })));
    const { erros } = await chamar("bcb_serie_valores", JANELA);
    expect(erros.map(e => e.classe)).toEqual(["fonte"]);
  });

  it("a mesma regra vale fora do SGS (Focus, pelo Olinda)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const { erros } = await chamar("bcb_focus_selic", {});
    expect(erros.map(e => e.classe)).toEqual(["fonte"]);
  });
});

describe("ausência respondida é `nao_encontrado`, nunca `contrato`", () => {
  it("404 da origem", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const { erros } = await chamar("bcb_serie_valores", JANELA);
    expect(erros.map(e => e.classe)).toEqual(["nao_encontrado"]);
  });

  it("série inexistente no `ultimos/N` — a frase diz 'requisição inválida' e o regex a lia como contrato", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("<html><body>requisição inválida</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" }
      })
    ));
    const { result, erros } = await chamar("bcb_serie_ultimos", { codigo: 99999999, quantidade: 1 });
    expect(JSON.stringify(result.content)).toContain("INEXISTENTE");
    expect(erros.map(e => e.classe)).toEqual(["nao_encontrado"]);
  });
});

describe("a classe viaja FORA do fio", () => {
  it("o resultado serializado não ganha chave nenhuma", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const { result } = await chamar("bcb_serie_valores", JANELA);
    expect(Object.keys(result).sort()).toEqual(["content", "isError"]);
  });
});
