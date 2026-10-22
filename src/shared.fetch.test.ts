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
  ErroEnvelopeDeErroSgs,
  ErroHttpBcb,
  ErroSerieInexistente,
  ehEnvelopeDeErro,
  TIMEOUT_PEDIDO_PEQUENO_MS,
  WORKER_CONFIG,
  ehPedidoPequeno,
  fetchBcbApi,
  orcamentoTotalMs
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

/**
 * Envelope de erro em JSON com 200 — `{"erro":{}}` —, medido em 22/10/2026 na
 * série 190 (IGP-DI, viva) com `ultimos/1`, em 5 de 5 chamadas; `ultimos/2` e a
 * janela respondem dado; as outras 134 curadas respondem a `ultimos/1`. Até
 * então o envelope passava como JSON válido e a ferramenta dizia "Nenhum dado
 * encontrado para a série 190" — ausência falsa com HTTP 200.
 */
function respostaEnvelope(): Response {
  return new Response(JSON.stringify({ erro: {} }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("envelope de erro com 200 não é dado nem série inexistente", () => {
  it("ehEnvelopeDeErro: objeto com `erro` no topo, e só ele", () => {
    expect(ehEnvelopeDeErro('{"erro":{}}')).toBe(true);
    expect(ehEnvelopeDeErro(' {"erro":"x","detalhe":1}')).toBe(true);
    expect(ehEnvelopeDeErro("[]")).toBe(false);
    expect(ehEnvelopeDeErro('[{"data":"01/09/2026","valor":"1"}]')).toBe(false);
    expect(ehEnvelopeDeErro('{"data":"01/09/2026"}')).toBe(false);
    expect(ehEnvelopeDeErro('{"error":"ckan"}')).toBe(false);
    expect(ehEnvelopeDeErro("<html>")).toBe(false);
    expect(ehEnvelopeDeErro("")).toBe(false);
  });

  // No pedido `ultimos/N` o envelope NÃO se repete (medido determinístico; o
  // contorno N+1 de `buscarUltimosSgs` é a segunda chance): UMA tentativa, erro
  // na hora — repetir custava ~3 s por uma resposta que não muda.
  it("envelope num `ultimos/N` é ErroEnvelopeDeErroSgs na 1ª tentativa, classe fonte, nomeando o contorno — não 'inexistente'", async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { n++; return n === 1 ? respostaEnvelope() : respostaJson(); }));

    const capturado = fetchBcbApi(PEQUENO, CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES).then((d) => d, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(CONFIG.RETRY_DELAY_MS * 8);
    const erro = await capturado;

    expect(erro).toBeInstanceOf(ErroEnvelopeDeErroSgs);
    expect(erro).not.toBeInstanceOf(ErroSerieInexistente);
    expect((erro as ErroEnvelopeDeErroSgs).classe).toBe("fonte");
    expect((erro as Error).message).toContain('{"erro":{}}');
    expect((erro as Error).message).toContain("1 tentativa");
    expect((erro as Error).message).toMatch(/outra quantidade|janela|bcb_serie_valores/);
    expect(n).toBe(1);
  });

  // Na janela de datas não há contorno: o envelope repete como a página HTML.
  it("envelope na janela de datas: 1ª envelope e 2ª JSON devolve o DADO (repete)", async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? respostaEnvelope() : respostaJson())));

    const capturado = fetchBcbApi(GRANDE, CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES).then((d) => d, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(CONFIG.RETRY_DELAY_MS * 4);

    expect(await capturado).toEqual([{ data: "01/09/2026", valor: "15.00" }]);
    expect(n).toBe(2);
  });

  it("envelope na janela de datas em TODAS as tentativas é ErroEnvelopeDeErroSgs com a contagem", async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { n++; return respostaEnvelope(); }));

    const capturado = fetchBcbApi(GRANDE, CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES).then((d) => d, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(CONFIG.RETRY_DELAY_MS * 8);
    const erro = await capturado;

    expect(erro).toBeInstanceOf(ErroEnvelopeDeErroSgs);
    expect((erro as Error).message).toContain(`${n} tentativas`);
    expect(n).toBe(CONFIG.MAX_RETRIES);
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

/**
 * 1.15.0: a ida à origem passou ao fetch comum do portfólio
 * (`@sbissoli/mcp-upstream`). O pacote classifica; este módulo decide. Estes
 * testes prendem o que MUDOU de propósito (429 repete) e o que NÃO podia mudar
 * (4xx determinístico, as duas causas da página HTML, os números).
 */
describe("fetch comum (1.15.0): o que mudou e o que se preservou", () => {
  it("429 REPETE, honrando Retry-After — antes caía na regra do 4xx e não repetia", async () => {
    vi.useFakeTimers();
    let n = 0;
    const instantes: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => {
      instantes.push(Date.now());
      return ++n === 1 ? new Response("", { status: 429, headers: { "retry-after": "3" } }) : respostaJson();
    }));

    const capturado = fetchBcbApi(PEQUENO, CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES).then((d) => d, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(3000 + CONFIG.RETRY_DELAY_MS);

    expect(await capturado).toEqual([{ data: "01/09/2026", valor: "15.00" }]);
    expect(n).toBe(2);
    // Esperou o Retry-After (3 s), não só o backoff (1 s).
    expect(instantes[1] - instantes[0]).toBeGreaterThanOrEqual(3000);
  });

  it("404 e outros 4xx continuam determinísticos: UMA requisição, status preservado", async () => {
    const fetch404 = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetch404);
    const e404 = (await fetchBcbApi(GRANDE, CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES).catch((e: unknown) => e)) as ErroHttpBcb;
    expect(e404).toBeInstanceOf(ErroHttpBcb);
    expect(e404.status).toBe(404);
    expect(e404.message).toContain("Série não encontrada");
    expect(fetch404).toHaveBeenCalledTimes(1);

    // O 406 da janela decenal é o que dispara o fatiamento em `series.ts`.
    const fetch406 = vi.fn(async () => new Response("", { status: 406 }));
    vi.stubGlobal("fetch", fetch406);
    const e406 = (await fetchBcbApi(GRANDE, CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES).catch((e: unknown) => e)) as ErroHttpBcb;
    expect(e406).toBeInstanceOf(ErroHttpBcb);
    expect(e406.status).toBe(406);
    expect(fetch406).toHaveBeenCalledTimes(1);
  });

  it("5xx repete e, esgotado, a mensagem traz o status e a contagem", async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", f);

    const capturado = fetchBcbApi(GRANDE, CONFIG.TIMEOUT_MS, 2).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(CONFIG.RETRY_DELAY_MS * 4);
    const erro = (await capturado) as Error;

    expect(f).toHaveBeenCalledTimes(2);
    expect(erro.message).toContain("Falha após 2 tentativas");
    expect(erro.message).toContain("503");
  });

  describe("HTML em 200: as DUAS causas continuam separadas pela forma da URL", () => {
    it("pedido pequeno com a página em TODAS as tentativas é série inexistente", async () => {
      vi.useFakeTimers();
      const f = vi.fn(async () => respostaHtml());
      vi.stubGlobal("fetch", f);

      const capturado = fetchBcbApi(PEQUENO, CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(CONFIG.RETRY_DELAY_MS * 4);
      const erro = (await capturado) as Error;

      expect(f).toHaveBeenCalledTimes(CONFIG.MAX_RETRIES);
      expect(erro).toBeInstanceOf(ErroSerieInexistente);
      expect(erro.message).toContain("INEXISTENTE");
    });

    it("janela larga com a página em todas as tentativas é falha da origem, com as duas hipóteses", async () => {
      vi.useFakeTimers();
      const f = vi.fn(async () => respostaHtml());
      vi.stubGlobal("fetch", f);

      const capturado = fetchBcbApi(GRANDE, CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(CONFIG.RETRY_DELAY_MS * 4);
      const erro = (await capturado) as Error;

      expect(f).toHaveBeenCalledTimes(CONFIG.MAX_RETRIES);
      expect(erro).not.toBeInstanceOf(ErroSerieInexistente);
      expect(erro.message).toContain("Falha após");
      expect(erro.message).toContain("não é JSON");
      expect(erro.message).toContain("reduza o período");
    });
  });

  it("o orçamento total é o que as tentativas e as esperas somam — os números de antes", () => {
    expect(orcamentoTotalMs(CONFIG.TIMEOUT_MS, CONFIG.MAX_RETRIES)).toBe(3 * 30000 + 1000 + 2000);
    expect(orcamentoTotalMs(WORKER_CONFIG.TIMEOUT_MS, WORKER_CONFIG.MAX_RETRIES)).toBe(2 * 10000 + 1000);
  });
});
