#!/usr/bin/env node
/**
 * Smoke test end-to-end contra os DOIS transportes.
 *
 * Uso:
 *   node scripts/smoke-mcp.mjs                 # worker hospedado (produção)
 *   node scripts/smoke-mcp.mjs --url <url>     # outro endpoint (ex.: wrangler dev)
 *   node scripts/smoke-mcp.mjs --stdio         # dist/index.js local (exige npm run build)
 *
 * Verifica: handshake, superfície completa (8 tools / 3 resources / 3 prompts),
 * uma tool servida do catálogo local, uma tool que vai à API do BCB, leitura de
 * resource, e a validação de entrada (argumento obrigatório ausente tem de ser
 * barrado ANTES de chamar o BCB — regressão fechada na fundação).
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
  check("tools/list = 8", tools.length === 8, `${tools.length} tools`);
  check(
    "todas com prefixo bcb_, title e outputSchema",
    tools.every(t => t.name.startsWith("bcb_") && t.annotations?.title && t.outputSchema)
  );

  const resources = (await client.rpc("resources/list")).result?.resources ?? [];
  check("resources/list = 3", resources.length === 3, resources.map(r => r.name).join(", "));

  const prompts = (await client.rpc("prompts/list")).result?.prompts ?? [];
  check("prompts/list = 3", prompts.length === 3, prompts.map(p => p.name).join(", "));

  // Tool offline (catálogo local).
  const busca = await client.rpc("tools/call", { name: "bcb_buscar_serie", arguments: { termo: "selic" } });
  check(
    "bcb_buscar_serie devolve structuredContent",
    !busca.result?.isError && busca.result?.structuredContent?.totalEncontradas > 0,
    `${busca.result?.structuredContent?.totalEncontradas} séries`
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
