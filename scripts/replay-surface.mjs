#!/usr/bin/env node
/**
 * REPLAY RETROATIVO da superfície: cada versão publicada no npm, instalada e
 * interrogada por stdio, normalizada com a MESMA função da trava
 * (dist/surface.js), e o endpoint no ar comparado com a versão que ele declara.
 *
 * Por que existe. A trava (surface.lock.json) só protege daqui para a frente. A
 * prova que achou o caso grave do leitor do dev.to (comentário 3g607) foi um
 * replay: a superfície como estava no dia da listagem contra a de hoje. Aqui o
 * equivalente é rodar o histórico inteiro uma vez — o que mudou entre versões
 * vizinhas, se alguma remoção saiu em versão que não é major, e se o que está no
 * ar é a superfície da versão que o /status anuncia.
 *
 *   npm run build && node scripts/replay-surface.mjs [--url https://bcb.sidneybissoli.com/mcp]
 *
 * Escreve baselines/replay-<data>.md (relatório) e baselines/replay-<data>.json
 * (sha256 e nomes por versão — a superfície inteira de 32 versões não cabe no
 * repositório; o sha é o que se compara). Instala em diretório temporário; não
 * toca o node_modules do projeto. Leva alguns minutos (uma instalação por versão).
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const { impressaoDigital, lerCorpoJsonRpc, normalizarSuperficie, PROTOCOLO_DA_CAPTURA } = await import(
  new URL("../dist/surface.js", import.meta.url).href
);

const raiz = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const url = args.includes("--url") ? args[args.indexOf("--url") + 1] : "https://bcb.sidneybissoli.com/mcp";
const PACOTE = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")).name;
const shell = process.platform === "win32";

function npmJson(...argv) {
  const r = spawnSync("npm", argv, { encoding: "utf8", shell });
  if (r.status !== 0) throw new Error(`npm ${argv.join(" ")}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

// ==================== captura por stdio ====================

async function capturarStdio(entrada) {
  const filho = spawn(process.execPath, [entrada], { stdio: ["pipe", "pipe", "ignore"] });
  let buffer = "";
  const pendentes = new Map();
  filho.stdout.on("data", pedaco => {
    buffer += pedaco.toString();
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const linha = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      let msg;
      try {
        msg = JSON.parse(linha);
      } catch {
        continue;
      }
      pendentes.get(msg.id)?.(msg);
      pendentes.delete(msg.id);
    }
  });
  let id = 1;
  const pedir = (method, params) =>
    new Promise(resolve => {
      const meu = id++;
      pendentes.set(meu, msg => resolve(msg.error ? undefined : msg.result));
      filho.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: meu, method, params })}\n`);
      setTimeout(() => pendentes.delete(meu) && resolve(undefined), 20_000);
    });
  try {
    const initialize = await pedir("initialize", {
      protocolVersion: PROTOCOLO_DA_CAPTURA,
      capabilities: {},
      clientInfo: { name: "replay-surface", version: "1.0.0" },
    });
    filho.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    return normalizarSuperficie({
      initialize,
      tools: (await pedir("tools/list", {}))?.tools,
      resources: (await pedir("resources/list", {}))?.resources,
      resourceTemplates: (await pedir("resources/templates/list", {}))?.resourceTemplates,
      prompts: (await pedir("prompts/list", {}))?.prompts,
    });
  } finally {
    filho.kill();
  }
}

async function capturarHttp() {
  const rpc = async (method, params) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return lerCorpoJsonRpc(await res.text())?.result;
  };
  return normalizarSuperficie({
    initialize: await rpc("initialize", {
      protocolVersion: PROTOCOLO_DA_CAPTURA,
      capabilities: {},
      clientInfo: { name: "replay-surface", version: "1.0.0" },
    }),
    tools: (await rpc("tools/list"))?.tools,
    resources: (await rpc("resources/list"))?.resources,
    resourceTemplates: (await rpc("resources/templates/list"))?.resourceTemplates,
    prompts: (await rpc("prompts/list"))?.prompts,
  });
}

// ==================== diferença entre versões ====================

const nomes = (lista, chave) => (lista ?? []).map(x => x[chave]);
const porNome = (lista, chave) => new Map((lista ?? []).map(x => [x[chave], x]));

function diferenca(antes, depois) {
  const r = { tools: { mais: [], menos: [], mudou: [] }, recursos: { mais: [], menos: [] }, prompts: { mais: [], menos: [] }, quebras: [] };
  const ta = porNome(antes.tools, "name");
  const td = porNome(depois.tools, "name");
  for (const n of td.keys()) if (!ta.has(n)) r.tools.mais.push(n);
  for (const n of ta.keys()) if (!td.has(n)) {
    r.tools.menos.push(n);
    r.quebras.push(`tool removida: ${n}`);
  }
  for (const [n, a] of ta) {
    const d = td.get(n);
    if (!d || impressaoDigital(a) === impressaoDigital(d)) continue;
    r.tools.mudou.push(n);
    const pa = a.inputSchema?.properties ?? {};
    const pd = d.inputSchema?.properties ?? {};
    for (const p of Object.keys(pa)) if (!(p in pd)) r.quebras.push(`${n}: parâmetro removido \`${p}\``);
    const ra = new Set(a.inputSchema?.required ?? []);
    for (const p of d.inputSchema?.required ?? []) if (!ra.has(p)) r.quebras.push(`${n}: parâmetro passou a obrigatório \`${p}\``);
  }
  for (const [campo, chave, alvo] of [["resources", "uri", r.recursos], ["prompts", "name", r.prompts]]) {
    const a = new Set(nomes(antes[campo], chave));
    const d = new Set(nomes(depois[campo], chave));
    for (const x of d) if (!a.has(x)) alvo.mais.push(x);
    for (const x of a) if (!d.has(x)) {
      alvo.menos.push(x);
      r.quebras.push(`${campo === "resources" ? "resource" : "prompt"} removido: ${x}`);
    }
  }
  r.instructions = impressaoDigital(antes.initialize.instructions) !== impressaoDigital(depois.initialize.instructions);
  r.capabilities = impressaoDigital(antes.initialize.capabilities) !== impressaoDigital(depois.initialize.capabilities);
  r.identidade = impressaoDigital(antes.initialize.serverInfo) !== impressaoDigital(depois.initialize.serverInfo);
  return r;
}

const major = v => Number(v.split(".")[0]);

// ==================== main ====================

const versoes = npmJson("view", PACOTE, "versions", "--json");
const datas = npmJson("view", PACOTE, "time", "--json");
let registro = new Set();
try {
  const nome = JSON.parse(readFileSync(join(raiz, "server.json"), "utf8")).name;
  const res = await fetch(`https://registry.modelcontextprotocol.io/v0/servers?search=${encodeURIComponent(nome)}&limit=100`);
  registro = new Set(((await res.json()).servers ?? []).filter(s => s.server.name === nome).map(s => s.server.version));
} catch {
  /* registro fora: a coluna sai vazia, o replay segue */
}

const linhas = [];
for (const v of versoes) {
  const dir = mkdtempSync(join(tmpdir(), `replay-${v}-`));
  try {
    const inst = spawnSync(
      "npm",
      ["install", `${PACOTE}@${v}`, "--prefix", dir, "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"],
      { encoding: "utf8", shell },
    );
    if (inst.status !== 0) throw new Error(inst.stderr.trim().split("\n").pop());
    const pastaPkg = join(dir, "node_modules", PACOTE);
    const pkg = JSON.parse(readFileSync(join(pastaPkg, "package.json"), "utf8"));
    const bin = typeof pkg.bin === "string" ? pkg.bin : Object.values(pkg.bin ?? {})[0] ?? pkg.main;
    const sup = await capturarStdio(join(pastaPkg, bin));
    if (!sup.tools) throw new Error("tools/list não respondeu");
    linhas.push({ versao: v, data: datas[v]?.slice(0, 10), noRegistro: registro.has(v), sha256: impressaoDigital(sup), sup });
    console.log(`${v}: ${impressaoDigital(sup).slice(0, 12)} — ${sup.tools.length} tools`);
  } catch (e) {
    linhas.push({ versao: v, data: datas[v]?.slice(0, 10), noRegistro: registro.has(v), erro: String(e.message ?? e) });
    console.log(`${v}: ERRO ${e.message ?? e}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const noAr = await capturarHttp();
const shaNoAr = impressaoDigital(noAr);
const status = await fetch(new URL("/status", url)).then(r => r.json()).catch(() => ({}));
const declarada = linhas.find(l => l.versao === status.version);

// --- relatório ---
const hoje = new Date().toISOString().slice(0, 10);
const md = [];
md.push(`# Replay retroativo da superfície — ${PACOTE}, ${hoje}`, "");
md.push(
  `Gerado por \`scripts/replay-surface.mjs\`: cada versão publicada no npm instalada e interrogada por stdio, normalizada pela mesma função da trava (\`src/surface.ts\`: \`initialize\` com instructions e capabilities, tools, resources, templates e prompts; a versão do servidor fica de fora).`,
  "",
);
md.push("## O que está no ar", "");
md.push(`- Endpoint: \`${url}\` — \`/status\` declara **${status.version ?? "?"}**.`);
md.push(`- Superfície servida: \`${shaNoAr.slice(0, 12)}\`.`);
if (declarada?.sha256) {
  md.push(
    declarada.sha256 === shaNoAr
      ? `- **Confere:** é a superfície da ${status.version} publicada no npm.`
      : `- **NÃO confere:** a ${status.version} publicada no npm tem \`${declarada.sha256.slice(0, 12)}\`.`,
  );
}
const iguais = linhas.filter(l => l.sha256 === shaNoAr).map(l => l.versao);
md.push(`- Versões publicadas com exatamente esta superfície: ${iguais.join(", ") || "nenhuma"}.`, "");

md.push("## Versão a versão", "");
md.push("| versão | data | MCP Registry | sha256 | tools | o que mudou em relação à anterior |");
md.push("|:--|:--|:--:|:--|--:|:--|");
const quebras = [];
let anterior;
for (const l of linhas) {
  if (l.erro) {
    md.push(`| ${l.versao} | ${l.data} | ${l.noRegistro ? "sim" : "—"} | erro | — | ${l.erro.replaceAll("|", "\\|")} |`);
    continue;
  }
  let mudou = "(primeira)";
  if (anterior) {
    const d = diferenca(anterior.sup, l.sup);
    const partes = [];
    if (d.tools.mais.length) partes.push(`+${d.tools.mais.length} tools (${d.tools.mais.join(", ")})`);
    if (d.tools.menos.length) partes.push(`−${d.tools.menos.length} tools (${d.tools.menos.join(", ")})`);
    if (d.tools.mudou.length) partes.push(`${d.tools.mudou.length} tools alteradas`);
    if (d.recursos.mais.length || d.recursos.menos.length) partes.push(`resources +${d.recursos.mais.length}/−${d.recursos.menos.length}`);
    if (d.prompts.mais.length || d.prompts.menos.length) partes.push(`prompts +${d.prompts.mais.length}/−${d.prompts.menos.length}`);
    if (d.instructions) partes.push("instructions");
    if (d.capabilities) partes.push("capabilities");
    if (d.identidade) partes.push("identidade");
    mudou = l.sha256 === anterior.sha256 ? "nada" : partes.join("; ") || "detalhe de normalização";
    if (d.quebras.length && major(l.versao) === major(anterior.versao)) {
      quebras.push({ de: anterior.versao, para: l.versao, itens: d.quebras });
    }
  }
  md.push(`| ${l.versao} | ${l.data} | ${l.noRegistro ? "sim" : "—"} | \`${l.sha256.slice(0, 12)}\` | ${l.sup.tools.length} | ${mudou} |`);
  anterior = l;
}
md.push("");
md.push("## Remoções fora de versão major", "");
md.push(
  "Tool, resource ou prompt removido, parâmetro removido ou parâmetro que passou a obrigatório quebra o cliente que dependia dele; pela convenção de versão isso pede major. Listado sem julgamento — cada caso pode ter tido razão registrada no CHANGELOG.",
  "",
);
if (!quebras.length) md.push("Nenhuma.");
for (const q of quebras) md.push(`- **${q.de} → ${q.para}:** ${q.itens.join("; ")}`);
md.push("");
md.push("## Limites", "");
md.push(
  "- O replay mede o PACOTE de cada versão (stdio). O que o endpoint hospedado serviu no passado não é reconstituível; o que se mede é o de hoje contra a versão que ele declara.",
  "- A cópia do MCP Registry não carrega superfície (só nome, versão, pacotes e remotos): a coluna diz só se a versão foi registrada.",
  "- Quem responde sem token não entra no replay: é comportamento da borda HTTP, medido pela trava (`worker/tests/surface-lock.test.ts`) daqui para a frente.",
);

const base = join(raiz, "baselines", `replay-${hoje}`);
writeFileSync(`${base}.md`, `${md.join("\n")}\n`);
writeFileSync(
  `${base}.json`,
  `${JSON.stringify(
    {
      gerado: new Date().toISOString(),
      endpoint: url,
      statusVersion: status.version ?? null,
      sha256NoAr: shaNoAr,
      versoes: linhas.map(({ sup, ...l }) => ({
        ...l,
        tools: sup ? nomes(sup.tools, "name") : undefined,
        resources: sup ? nomes(sup.resources, "uri") : undefined,
        prompts: sup ? nomes(sup.prompts, "name") : undefined,
        instructionsSha256: sup ? impressaoDigital(sup.initialize.instructions) : undefined,
      })),
    },
    null,
    2,
  )}\n`,
);
console.log(`\n${base}.md\n${base}.json`);
