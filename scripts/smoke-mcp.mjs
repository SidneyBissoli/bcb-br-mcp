#!/usr/bin/env node
/**
 * Smoke test end-to-end contra os DOIS transportes.
 *
 * Uso:
 *   node scripts/smoke-mcp.mjs                 # worker hospedado (produção)
 *   node scripts/smoke-mcp.mjs --url <url>     # outro endpoint (ex.: wrangler dev)
 *   node scripts/smoke-mcp.mjs --stdio         # dist/index.js local (exige npm run build)
 *
 * Verifica: handshake, superfície completa (13 tools / 3 resources / 3 prompts),
 * a busca com índice do portal, uma tool que vai ao SGS, as cinco tools de D3
 * (Focus e PTAX) contra a origem, leitura de resource, e a validação de entrada
 * (argumento obrigatório ausente tem de ser barrado ANTES de chamar o BCB —
 * regressão fechada na fundação).
 *
 * As asserções das tools de D3 pinam o que o mini-spike verificou contra a
 * origem, e não só "respondeu 200": nome de recurso por horizonte, os campos em
 * caixa baixa do Top 5 da Selic, a quebra por horizonte das referências e o
 * formato MM-DD-YYYY das datas da PTAX. Indisponibilidade do BCB vira AVISO.
 */

import { spawn } from "node:child_process";

const DEFAULT_URL = "https://bcb.sidneybissoli.com/mcp";

const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
const useStdio = args.includes("--stdio");
const endpoint = urlIndex >= 0 ? args[urlIndex + 1] : DEFAULT_URL;

let failures = 0;
let warnings = 0;
function check(label, ok, detail = "") {
  const mark = ok ? "OK  " : "FALHA";
  if (!ok) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Indisponibilidade do BCB não é falha DESTE servidor — o smoke existe para
 * verificar o nosso lado. Uma resposta de erro que cite 5xx/timeout do upstream
 * vira AVISO (o caminho de degradação funcionou); qualquer outra coisa é falha.
 */
function checkUpstream(label, result, detail = "") {
  const texto = result?.content?.[0]?.text ?? "";
  const upstreamDown = result?.isError === true && /50\d|timeout|Falha após/i.test(texto);
  if (upstreamDown) {
    warnings++;
    console.log(`  [AVISO] ${label} — API do BCB indisponível agora: ${texto.slice(0, 90)}`);
    return;
  }
  check(label, !result?.isError, detail);
}

// ==================== transports ====================

function stdioClient() {
  const child = spawn(process.execPath, ["dist/index.js"], { stdio: ["pipe", "pipe", "inherit"] });
  let buffer = "";
  const pending = new Map();

  child.stdout.on("data", chunk => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const resolve = pending.get(msg.id);
        if (resolve) {
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch {
        /* linha não-JSON */
      }
    }
  });

  let id = 1;
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: msgId, method, params })}\n`);
      setTimeout(() => {
        if (pending.delete(msgId)) reject(new Error(`timeout em ${method}`));
      }, 30000);
    });

  const notify = method => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  return { rpc, notify, close: () => child.kill() };
}

function httpClient(url) {
  let id = 1;
  let sessionId;

  const rpc = async (method, params) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {})
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params })
    });
    const header = res.headers.get("mcp-session-id");
    if (header) sessionId = header;

    const text = await res.text();
    if (text.includes("\ndata:") || text.startsWith("event:")) {
      const line = text
        .split("\n")
        .filter(l => l.startsWith("data:"))
        .pop();
      return JSON.parse(line.slice(5).trim());
    }
    return JSON.parse(text);
  };

  const notify = async method => {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {})
      },
      body: JSON.stringify({ jsonrpc: "2.0", method })
    });
  };

  return { rpc, notify, close: () => {} };
}

// ==================== smoke ====================

const client = useStdio ? stdioClient() : httpClient(endpoint);
console.log(`\nSmoke: ${useStdio ? "STDIO (dist/index.js)" : endpoint}\n`);

try {
  const init = await client.rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-mcp", version: "1.0.0" }
  });
  check("initialize", !!init.result?.serverInfo, `${init.result?.serverInfo?.name} ${init.result?.serverInfo?.version}`);
  await client.notify("notifications/initialized");

  const tools = (await client.rpc("tools/list")).result?.tools ?? [];
  check("tools/list = 13", tools.length === 13, `${tools.length} tools`);
  check(
    "todas com prefixo bcb_, title e outputSchema",
    tools.every(t => t.name.startsWith("bcb_") && t.annotations?.title && t.outputSchema)
  );
  const nomes = tools.map(t => t.name);
  const novas = [
    "bcb_focus_expectativas",
    "bcb_focus_selic",
    "bcb_focus_referencias",
    "bcb_cambio_cotacao",
    "bcb_cambio_moedas"
  ];
  check("as 5 tools de Focus e câmbio estão publicadas", novas.every(n => nomes.includes(n)));

  const resources = (await client.rpc("resources/list")).result?.resources ?? [];
  check("resources/list = 3", resources.length === 3, resources.map(r => r.name).join(", "));

  const prompts = (await client.rpc("prompts/list")).result?.prompts ?? [];
  check("prompts/list = 3", prompts.length === 3, prompts.map(p => p.name).join(", "));

  // Busca: curadoria em destaque + índice do portal, e nunca afirmar inexistência.
  const busca = await client.rpc("tools/call", { name: "bcb_buscar_serie", arguments: { termo: "selic" } });
  const buscaOut = busca.result?.structuredContent;
  check(
    "bcb_buscar_serie devolve structuredContent",
    !busca.result?.isError && buscaOut?.totalEncontradas > 0,
    `${buscaOut?.totalEncontradas} séries`
  );
  check(
    "  → declara a cobertura do índice em vez de afirmar inexistência",
    (buscaOut?.catalogo?.cobertura ?? "").includes("NÃO é o SGS inteiro"),
    `${buscaOut?.catalogo?.seriesIndexadas ?? 0} séries indexadas`
  );

  // Tool que vai de fato à API do BCB.
  const selic = await client.rpc("tools/call", {
    name: "bcb_serie_ultimos",
    arguments: { codigo: 432, quantidade: 3 }
  });
  const dados = selic.result?.structuredContent?.dados ?? [];
  checkUpstream(
    "bcb_serie_ultimos consulta o SGS ao vivo",
    selic.result,
    `${dados.length} obs; última = ${dados.at(-1)?.data} ${dados.at(-1)?.valor}`
  );

  const call = (name, args) => client.rpc("tools/call", { name, arguments: args });

  // ---------- D1: os limites do SGS, contra a origem ----------
  //
  // Estes checks só valem se a origem participar: o 406 da janela decenal e o 400
  // do teto de 20 são a razão de existir do chunking, e nenhum mock prova que a
  // fatia funciona de verdade. Ver `bcb/docs/04-limites-sgs-medidos.md`.

  // Janela de 15 anos em série DIÁRIA (dólar): sem chunking, isto é 406.
  const longa = await call("bcb_serie_valores", {
    codigo: 1, dataInicial: "2010-01-01", dataFinal: "2024-12-31"
  });
  const longaOut = longa.result?.structuredContent;
  checkUpstream(
    "bcb_serie_valores atravessa 15 anos de série diária (a origem recusa >10 em uma janela)",
    longa.result,
    `${longaOut?.totalRegistros} obs em ${longaOut?.chunking?.janelas} janelas`
  );
  if (!longa.result?.isError) {
    check("  → a resposta declara o chunking", longaOut?.chunking?.janelas >= 5);
    check(
      "  → o período cobre a janela pedida de ponta a ponta",
      longaOut?.periodoInicial?.endsWith("/2010") && longaOut?.periodoFinal?.endsWith("/2024"),
      `${longaOut?.periodoInicial} a ${longaOut?.periodoFinal}`
    );
    // Emenda sem duplicata: nenhuma data repetida entre fatias.
    const datas = (longaOut?.dados ?? []).map(d => d.data);
    check("  → as fatias foram fundidas sem data repetida", new Set(datas).size === datas.length);
    check("  → ~250 observações por ano de série diária", datas.length > 3000 && datas.length < 4200, `${datas.length} obs`);
  }

  // Teto de 20 do endpoint nativo: 60 pontos só sai por janela de datas.
  const acima = await call("bcb_serie_ultimos", { codigo: 433, quantidade: 60 });
  const acimaOut = acima.result?.structuredContent;
  checkUpstream(
    "bcb_serie_ultimos entrega 60 pontos (a origem limita o endpoint nativo a 20)",
    acima.result,
    `${acimaOut?.totalRegistros} obs; última = ${acimaOut?.dados?.at(-1)?.data}`
  );
  if (!acima.result?.isError) {
    check("  → devolveu os 60 pedidos", acimaOut?.totalRegistros === 60);
    check("  → em ordem crescente de data", (() => {
      const anos = (acimaOut?.dados ?? []).map(d => Number(d.data.slice(6)));
      return anos.every((a, i) => i === 0 || a >= anos[i - 1]);
    })());
  }

  // Periodicidade inferida onde a fonte não publica metadados (endpoint 404).
  const meta = await call("bcb_serie_metadados", { codigo: 24369 });
  const metaOut = meta.result?.structuredContent;
  checkUpstream("bcb_serie_metadados sem endpoint de metadados na origem", meta.result, `${metaOut?.periodicidade}`);
  if (!meta.result?.isError) {
    check("  → traz o último valor e uma periodicidade", !!metaOut?.ultimoValor && !!metaOut?.periodicidade);
  }

  // Harmonização: IPCA mensal composto em ano fechado, marcado como derivado.
  const harm = await call("bcb_serie_valores", {
    codigo: 433, dataInicial: "2024-01-01", dataFinal: "2024-12-31",
    frequencia: "anual", agregacao: "acumulada"
  });
  const harmOut = harm.result?.structuredContent;
  checkUpstream("bcb_serie_valores harmoniza IPCA mensal em anual", harm.result, `${harmOut?.dados?.[0]?.valor}% em 2024`);
  if (!harm.result?.isError) {
    check("  → um ponto, agregando 12 observações", harmOut?.dados?.length === 1 && harmOut?.dados?.[0]?.observacoes === 12);
    check("  → marcado como derivado, com nota", harmOut?.harmonizacao?.derived === true && !!harmOut?.harmonizacao?.nota);
    // IPCA de 2024 fechou em 4,83% — a composição tem de chegar perto disso, e a
    // soma simples (4,73) não chegaria.
    check(
      "  → composição geométrica, não soma simples",
      Math.abs((harmOut?.dados?.[0]?.valor ?? 0) - 4.83) < 0.05,
      `${harmOut?.dados?.[0]?.valor}`
    );
  }

  // Periodicidade misturada: o aviso existe para não deixar o modelo comparar
  // uma série diária com uma mensal como se fossem a mesma grade.
  const misto = await call("bcb_comparar", {
    codigos: [1, 433], dataInicial: "2024-01-01", dataFinal: "2024-12-31"
  });
  const mistoOut = misto.result?.structuredContent;
  checkUpstream("bcb_comparar avisa sobre periodicidades diferentes", misto.result, `${mistoOut?.seriesComDados} séries`);
  if (!misto.result?.isError) {
    check("  → aviso presente com as duas periodicidades", (mistoOut?.aviso ?? "").includes("periodicidades diferentes"));
    check("  → estatística marcada como derivada", mistoOut?.derivacao?.derived === true);
  }

  // ---------- as 5 tools de D3, contra a origem ----------

  // Focus consolidado: o horizonte escolhe o recurso, e a URL da consulta prova qual.
  const anual = await call("bcb_focus_expectativas", { indicador: "IPCA", horizonte: "anual", referencia: "2027" });
  const anualOut = anual.result?.structuredContent;
  checkUpstream("bcb_focus_expectativas (anual)", anual.result, `${anualOut?.totalRegistros} coletas`);
  if (!anual.result?.isError) {
    check(
      "  → foi ao recurso anual, com filtro por construção",
      anualOut?.urlConsulta?.includes("/ExpectativasMercadoAnuais?") && anualOut?.urlConsulta?.includes("$filter=")
    );
    check("  → devolve mediana, não só eco do pedido", typeof anualOut?.expectativas?.[0]?.mediana === "number");
  }

  // Fronteira do contrato: rolante recusa `referencia`, e isso não pode ir à rede.
  const rolante = await call("bcb_focus_expectativas", { indicador: "IPCA", horizonte: "inflacao_12m", referencia: "2027" });
  check(
    "bcb_focus_expectativas barra `referencia` em horizonte rolante",
    rolante.result?.isError === true && /rolante/i.test(rolante.result?.content?.[0]?.text ?? "")
  );

  // Top 5 da Selic: o recurso que publica os campos em caixa baixa. Se a
  // normalização regredir, `mediana` volta nula e este check pega.
  const top5 = await call("bcb_focus_selic", { top5: true, limite: 3 });
  const top5Out = top5.result?.structuredContent;
  checkUpstream("bcb_focus_selic (top5)", top5.result, `${top5Out?.totalRegistros} coletas`);
  if (!top5.result?.isError) {
    check(
      "  → campos em caixa baixa do Top 5 chegam normalizados",
      typeof top5Out?.expectativas?.[0]?.mediana === "number" &&
        /^R\d+\/\d{4}$/.test(top5Out?.expectativas?.[0]?.referencia ?? "")
    );
  }

  // Referências: o valor da tool é a quebra POR horizonte.
  const refs = await call("bcb_focus_referencias", { escopo: "anual" });
  const refsOut = refs.result?.structuredContent;
  checkUpstream("bcb_focus_referencias (anual)", refs.result, `${refsOut?.escopos?.[0]?.indicadores?.length} indicadores`);
  if (!refs.result?.isError) {
    check(
      "  → traz indicadores e referências do horizonte pedido",
      refsOut?.escopos?.[0]?.indicadores?.length > 0 && refsOut?.escopos?.[0]?.referencias?.length > 0
    );
  }

  // PTAX: o dia único usa MM-DD-YYYY. Em ISO a fonte devolve 200 com zero linhas,
  // então o check é a URL trazer a data invertida E vir cotação.
  const ptax = await call("bcb_cambio_cotacao", { moeda: "EUR", dataInicial: "2026-08-03", dataFinal: "2026-08-10" });
  const ptaxOut = ptax.result?.structuredContent;
  checkUpstream("bcb_cambio_cotacao (EUR, intervalo)", ptax.result, `${ptaxOut?.totalRegistros} boletins`);
  if (!ptax.result?.isError) {
    check("  → datas na URL em MM-DD-YYYY", ptaxOut?.urlConsulta?.includes("'08-03-2026'"));
    check("  → disclaimer do BCB repassado literalmente", (ptaxOut?.disclaimer ?? "").includes("não assume qualquer responsabilidade"));
    check("  → paridade não-USD qualificada como dado de terceiro", (ptaxOut?.qualificacaoParidade ?? "").includes("Refinitiv"));
    check("  → cotação com compra e venda", typeof ptaxOut?.cotacoes?.[0]?.cotacaoVenda === "number");
  }

  const moedas = await call("bcb_cambio_moedas", {});
  const moedasOut = moedas.result?.structuredContent;
  checkUpstream("bcb_cambio_moedas", moedas.result, `${moedasOut?.totalMoedas} moedas`);
  if (!moedas.result?.isError) {
    check("  → símbolos utilizáveis em bcb_cambio_cotacao", (moedasOut?.moedas ?? []).some(m => m.simbolo === "EUR"));
  }

  // Leitura de resource.
  const leitura = await client.rpc("resources/read", { uri: "bcb://series/principais" });
  check("resources/read bcb://series/principais", !!leitura.result?.contents?.[0]?.text);

  // Validação de entrada — a regressão que a fundação fechou.
  const invalido = await client.rpc("tools/call", { name: "bcb_serie_valores", arguments: {} });
  const texto = invalido.result?.content?.[0]?.text ?? "";
  check(
    "argumento obrigatório ausente é barrado (não vira consulta a 'série undefined')",
    invalido.result?.isError === true && !texto.includes("undefined"),
    texto.slice(0, 80)
  );
} catch (error) {
  failures++;
  console.log(`  [ERRO] ${error instanceof Error ? error.message : String(error)}`);
} finally {
  client.close();
}

const resumo = warnings > 0 ? ` (${warnings} aviso(s) de upstream)` : "";
console.log(failures === 0 ? `\nSmoke OK${resumo}\n` : `\nSmoke com ${failures} falha(s)${resumo}\n`);
process.exit(failures === 0 ? 0 : 1);
