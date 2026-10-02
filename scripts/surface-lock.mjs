#!/usr/bin/env node
/**
 * A impressão digital da superfície (src/surface.ts), pela linha de comando.
 *
 *   node scripts/surface-lock.mjs
 *       Regrava o surface.lock.json: build, depois os dois testes da trava em
 *       modo de escrita (raiz = superfície declarada; worker = quem responde sem
 *       token). Obedece à regra do teste: se a superfície mudou e a versão do
 *       package.json não, RECUSA — suba a versão antes.
 *
 *   node scripts/surface-lock.mjs --verificar <endpoint> [--config apiKeyAusente|apiKeyPresente]
 *       Confere o que está NO AR contra a trava: a superfície declarada servida
 *       pelo endpoint (sem credencial) e, método a método, quem responde sem
 *       token, comparado à configuração esperada em produção (padrão:
 *       apiKeyAusente — acesso aberto). Roda no fim do deploy: prova que o que
 *       subiu é o que foi travado, e não só que o teste passou.
 *       Repete por até ~1 min: a Cloudflare serve isolates mistos logo após o
 *       deploy.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);

function rodar(cmd, argv, cwd, env = {}) {
  const r = spawnSync(cmd, argv, { cwd, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!args.includes("--verificar")) {
  rodar("npm", ["run", "build"], raiz);
  const escrever = { SURFACE_LOCK_ESCREVER: "1" };
  rodar("npx", ["vitest", "run", "src/surface-lock.test.ts"], raiz, escrever);
  rodar("npx", ["vitest", "run", "tests/surface-lock.test.ts"], `${raiz}worker`, escrever);
  console.log("surface.lock.json em dia — commite-o junto com a versão.");
  process.exit(0);
}

const { SONDA_SEM_TOKEN, impressaoDigital, lerCorpoJsonRpc, normalizarSuperficie } = await import(
  new URL("../dist/surface.js", import.meta.url).href
);

const url = args[args.indexOf("--verificar") + 1];
const config = args.includes("--config") ? args[args.indexOf("--config") + 1] : "apiKeyAusente";
const trava = JSON.parse(readFileSync(`${raiz}surface.lock.json`, "utf8"));

async function rpc(method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { status: res.status, corpo: lerCorpoJsonRpc(await res.text()) };
}

async function medirNoAr() {
  const r = {};
  for (const { method, params } of SONDA_SEM_TOKEN) {
    const { status, corpo } = await rpc(method, params);
    r[method] = { responde: status === 200 && corpo?.result !== undefined, result: corpo?.result };
  }
  const lista = async (m, chave) => (await rpc(m)).corpo?.result?.[chave];
  const declarada = normalizarSuperficie({
    initialize: r.initialize.result,
    tools: await lista("tools/list", "tools"),
    resources: await lista("resources/list", "resources"),
    resourceTemplates: await lista("resources/templates/list", "resourceTemplates"),
    prompts: await lista("prompts/list", "prompts"),
  });
  const semToken = Object.fromEntries(Object.entries(r).map(([m, v]) => [m, v.responde]));
  return { declarada, semToken };
}

const esperadoSemToken = trava.semToken?.conteudo?.[config]?.["POST /mcp"];
if (!trava.declarada || !esperadoSemToken) {
  console.error(`surface.lock.json incompleto (seção declarada ou semToken.${config}).`);
  process.exit(1);
}

let ultimo = "";
for (let tentativa = 1; tentativa <= 6; tentativa++) {
  const { declarada, semToken } = await medirNoAr();
  const sha = impressaoDigital(declarada);
  const difSem = Object.keys(esperadoSemToken).filter(m => esperadoSemToken[m] !== semToken[m]);
  if (sha === trava.declarada.sha256 && difSem.length === 0) {
    console.log(`no ar = trava: declarada ${sha.slice(0, 12)} (travada em ${trava.declarada.versao}); sem token: ${config} confere.`);
    process.exit(0);
  }
  ultimo =
    (sha !== trava.declarada.sha256 ? `declarada no ar ${sha.slice(0, 12)} ≠ trava ${trava.declarada.sha256.slice(0, 12)}. ` : "") +
    (difSem.length ? `sem token diverge em: ${difSem.map(m => `${m} (no ar ${semToken[m]})`).join(", ")}.` : "");
  console.log(`tentativa ${tentativa}: ${ultimo}`);
  if (tentativa < 6) await new Promise(r => setTimeout(r, 10_000));
}
console.error(`O que está no ar NÃO é o que foi travado: ${ultimo}`);
process.exit(1);
