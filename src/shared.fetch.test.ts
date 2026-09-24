/**
 * A ausência que a fonte responde DEVAGAR.
 *
 * Medido em 24/09/2026 (item `mcp:ausencia-com-200` do portfólio):
 *
 *   `/dados/ultimos/1` de 15 séries REAIS (432, 433, 11, 12, 13521, 7000, 189,
 *   188, 4390, 20539, 24363, 21619, 1178, 28763, 25239): 0,18 s a 0,41 s.
 *   `/dados/ultimos/1` de código INEXISTENTE (99999, 99999999, 999999999):
 *   `200 text/html` com a página de requisição inválida — depois de ~30,2 s.
 *
 * Os dois orçamentos do servidor (30 s no stdio, 10 s no Worker) abortavam
 * antes dos 30,2 s, então a defesa que LÊ a página HTML nunca chegava a rodar:
 * quem errava um dígito esperava duas tentativas inteiras para receber "Falha
 * após 2 tentativas: The operation was aborted" — uma mensagem que culpa a
 * origem por um erro de digitação.
 *
 * O conserto usa o mesmo raciocínio que já estava escrito em `shared.ts` para o
 * caso da página HTML: a FORMA DA URL separa "não existe" de "demorou", porque
 * `ultimos/N` pede no máximo 20 observações e não tem por que demorar.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONFIG,
  ErroSerieInexistente,
  TIMEOUT_PEDIDO_PEQUENO_MS,
  ehPedidoPequeno,
  fetchBcbApi
} from "./shared.js";

const PEQUENO = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.99999999/dados/ultimos/1?formato=json";
const GRANDE =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.99999999/dados?formato=json&dataInicial=01/01/2020&dataFinal=31/12/2020";

/**
 * Um `fetch` que NUNCA responde — é o comportamento medido da origem para
 * código inexistente dentro de qualquer orçamento nosso. Registra o prazo real
 * que cada tentativa recebeu, que é o que este arquivo precisa afirmar.
 */
function fetchQueNuncaResponde(prazos: number[]) {
  return vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
    const inicio = Date.now();
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        prazos.push(Date.now() - inicio);
        const e = new Error("The operation was aborted");
        e.name = "AbortError";
        reject(e);
      });
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ehPedidoPequeno: a forma da URL é que separa os dois casos", () => {
  it("reconhece a forma `ultimos/N` e só ela", () => {
    expect(ehPedidoPequeno(PEQUENO)).toBe(true);
    expect(ehPedidoPequeno("https://x/dados/ultimos/20?formato=json")).toBe(true);
    expect(ehPedidoPequeno(GRANDE)).toBe(false);
    expect(ehPedidoPequeno("https://x/dados?formato=json")).toBe(false);
  });
});

/** A página de 'requisição inválida': 200, `text/html`, corpo que não é JSON. */
function respostaHtml(): Response {
  return new Response("<?xml version=\"1.0\"?><!DOCTYPE html><html>requisição inválida</html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function respostaJson(): Response {
  return new Response(JSON.stringify([{ data: "01/09/2026", valor: "15.00" }]), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

/**
 * O caso que MOTIVA a repetição, e o mais importante deste arquivo.
 *
 * Medido em 24/09/2026 na série 432 (meta Selic — existe, e é das mais
 * pedidas): 3 respostas HTML de ~30 s em 9 chamadas numa janela de poucos
 * minutos e, logo depois, 20 chamadas seguidas devolvendo JSON em ≤ 0,4 s. A
 * página NÃO prova inexistência — prova que aquela tentativa não trouxe dado.
 *
 * Até 24/09/2026 a primeira página HTML virava veredito (`ErroSerieInexistente`
 * lançado sem repetir, "determinístico como um 4xx"), então bastava a origem
 * soluçar para o servidor afirmar que a meta Selic não existe.
 */
describe("a página HTML não é veredito: série que existe volta na repetição", () => {
  it("soluço da origem na 1ª tentativa e JSON na 2ª devolve o DADO, não um erro", async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? respostaHtml() : respostaJson())));

    const promessa = fetchBcbApi(PEQUENO, CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES);
    const capturado = promessa.then((d) => d, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(CONFIG.RETRY_DELAY_MS * 4);

    expect(await capturado).toEqual([{ data: "01/09/2026", valor: "15.00" }]);
    expect(n).toBe(2);
  });

  it("aborto na 1ª e JSON na 2ª também devolve o dado", async () => {
    vi.useFakeTimers();
    let n = 0;
    const prazos: number[] = [];
    const nunca = fetchQueNuncaResponde(prazos);
    vi.stubGlobal("fetch", vi.fn((url: string, init?: { signal?: AbortSignal }) =>
      ++n === 1 ? nunca(url, init) : Promise.resolve(respostaJson())
    ));

    const capturado = fetchBcbApi(PEQUENO, CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES).then(
      (d) => d,
      (e: unknown) => e
    );
    await vi.advanceTimersByTimeAsync(TIMEOUT_PEDIDO_PEQUENO_MS + CONFIG.RETRY_DELAY_MS * 4);

    expect(await capturado).toEqual([{ data: "01/09/2026", valor: "15.00" }]);
    expect(prazos[0]).toBeLessThanOrEqual(TIMEOUT_PEDIDO_PEQUENO_MS);
  });
});

describe("pedido pequeno que falha em TODAS as tentativas é série inexistente", () => {
  it("usa o orçamento curto em cada tentativa e só então afirma", async () => {
    vi.useFakeTimers();
    const prazos: number[] = [];
    vi.stubGlobal("fetch", fetchQueNuncaResponde(prazos));

    const capturado = fetchBcbApi(PEQUENO, CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(
      (TIMEOUT_PEDIDO_PEQUENO_MS + CONFIG.RETRY_DELAY_MS * 4) * CONFIG.MAX_RETRIES
    );
    const erro = (await capturado) as Error;

    expect(prazos).toHaveLength(CONFIG.MAX_RETRIES);
    for (const p of prazos) expect(p).toBeLessThanOrEqual(TIMEOUT_PEDIDO_PEQUENO_MS);
    expect(erro).toBeInstanceOf(ErroSerieInexistente);
    // A mensagem que o usuário recebia antes, e que culpava a origem:
    expect(erro.message).not.toContain("Falha após");
    expect(erro.message).not.toMatch(/^The operation was aborted/);
  });

  it("a mensagem nomeia a causa provável COM o número que a sustenta, e a alternativa", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchQueNuncaResponde([]));

    const capturado = fetchBcbApi(PEQUENO, CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(
      (TIMEOUT_PEDIDO_PEQUENO_MS + CONFIG.RETRY_DELAY_MS * 4) * CONFIG.MAX_RETRIES
    );
    const erro = (await capturado) as Error;

    expect(erro.message).toContain("INEXISTENTE");
    expect(erro.message).toContain("bcb_buscar_serie");
    // Queda de rede termina igual: afirmar inexistência sozinha trocaria um
    // erro alto por um plausível.
    expect(erro.message).toContain("indisponível");
  });

  it("o orçamento curto nunca ESTICA um prazo menor que ele", async () => {
    vi.useFakeTimers();
    const prazos: number[] = [];
    vi.stubGlobal("fetch", fetchQueNuncaResponde(prazos));

    // O Worker pede 10 s; se algum chamador pedir menos que 6 s, manda ele.
    const capturado = fetchBcbApi(PEQUENO, 2000, 2).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync((2000 + CONFIG.RETRY_DELAY_MS * 4) * 2);
    await capturado;

    expect(prazos).toHaveLength(2);
    for (const p of prazos) expect(p).toBeLessThanOrEqual(2000);
  });
});

describe("o pedido GRANDE continua com o orçamento longo", () => {
  it("janela larga em série diária pode demorar — ali timeout não é inexistência", async () => {
    vi.useFakeTimers();
    const prazos: number[] = [];
    vi.stubGlobal("fetch", fetchQueNuncaResponde(prazos));

    const capturado = fetchBcbApi(GRANDE, 30000, 2).catch((e: unknown) => e);
    // Passado o orçamento curto, a requisição grande AINDA está de pé.
    await vi.advanceTimersByTimeAsync(TIMEOUT_PEDIDO_PEQUENO_MS + 500);
    expect(prazos).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(60000);
    const erro = (await capturado) as Error;
    expect(prazos.length).toBeGreaterThan(0);
    expect(prazos[0]).toBeGreaterThan(TIMEOUT_PEDIDO_PEQUENO_MS);
    // E aqui a resposta segue sendo falha da origem, com retentativa.
    expect(erro).not.toBeInstanceOf(ErroSerieInexistente);
    expect(erro.message).toContain("Falha após");
  });
});

describe("série que existe não é afetada", () => {
  it("resposta rápida passa pelo orçamento curto sem encostar nele", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{ data: "01/09/2026", valor: "15.00" }]), {
        status: 200,
        headers: { "content-type": "application/json" }
      }))
    );
    const dados = await fetchBcbApi(PEQUENO, CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES);
    expect(dados).toEqual([{ data: "01/09/2026", valor: "15.00" }]);
  });
});
