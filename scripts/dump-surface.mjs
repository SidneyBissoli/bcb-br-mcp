#!/usr/bin/env node
/**
 * Captures a NORMALIZED dump of the MCP surface (tools + resources + prompts)
 * so a migration can be proven not to have moved it.
 *
 * The phase's foundation gate is "tools/list byte-identical BEFORE/AFTER,
 * except deliberate and listed changes". This script produces the artefact both
 * sides of that comparison are made of.
 *
 * Modes:
 *   node scripts/dump-surface.mjs --stdio            spawn dist/index.js and speak JSON-RPC over stdio
 *   node scripts/dump-surface.mjs --url <endpoint>   POST JSON-RPC to a hosted/local endpoint
 *   node scripts/dump-surface.mjs --source           read TOOL_DEFINITIONS from dist/tools.js (what the
 *                                                    Worker serves verbatim, without deploying it)
 *
 * Always writes to stdout; redirect into baselines/ to keep an artefact:
 *   node scripts/dump-surface.mjs --stdio > baselines/surface-stdio-1.3.5.json
 *
 * Normalization: object keys sorted recursively, tools/resources/prompts sorted
 * by name/uri, server version dropped (it changes every release and would make
 * every diff noisy — /status and package.json are where versions are checked).
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ==================== normalization ====================

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(k => [k, sortDeep(value[k])])
    );
  }
  return value;
}

function byKey(list, key) {
  return [...(list ?? [])].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

function normalizeSurface({ tools, resources, prompts, serverInfo }) {
  return sortDeep({
    serverName: serverInfo?.name ?? null,
    toolCount: (tools ?? []).length,
    tools: byKey(tools, "name"),
    resources: byKey(resources, "uri"),
    prompts: byKey(prompts, "name")
  });
}

// ==================== stdio transport ====================

async function captureStdio(entry) {
  const child = spawn(process.execPath, [entry], { stdio: ["pipe", "pipe", "inherit"] });

  let buffer = "";
  const pending = new Map();

  child.stdout.on("data", chunk => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // not JSON-RPC (stray logging)
      }
      const resolve = pending.get(msg.id);
      if (resolve) {
        pending.delete(msg.id);
        resolve(msg);
      }
    }
  });

  let nextId = 1;
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`timeout em ${method}`));
      }, 20000);
    });

  try {
    const init = await send("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "dump-surface", version: "1.0.0" }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

    const [tools, resources, prompts] = await Promise.all([
      send("tools/list", {}),
      send("resources/list", {}).catch(() => ({ result: { resources: [] } })),
      send("prompts/list", {}).catch(() => ({ result: { prompts: [] } }))
    ]);

    return normalizeSurface({
      tools: tools.result?.tools,
      resources: resources.result?.resources,
      prompts: prompts.result?.prompts,
      serverInfo: init.result?.serverInfo
    });
  } finally {
    child.kill();
  }
}

// ==================== HTTP transport ====================

async function captureHttp(url) {
  let id = 1;
  const rpc = async (method, params) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params })
    });
    const text = await res.text();
    // Streamable HTTP may answer as SSE; take the last data: line when it does.
    if (text.startsWith("event:") || text.includes("\ndata:")) {
      const line = text
        .split("\n")
        .filter(l => l.startsWith("data:"))
        .pop();
      return JSON.parse(line.slice(5).trim());
    }
    return JSON.parse(text);
  };

  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "dump-surface", version: "1.0.0" }
  });
  const tools = await rpc("tools/list", {});
  const resources = await rpc("resources/list", {}).catch(() => ({ result: { resources: [] } }));
  const prompts = await rpc("prompts/list", {}).catch(() => ({ result: { prompts: [] } }));

  return normalizeSurface({
    tools: tools.result?.tools,
    resources: resources.result?.resources,
    prompts: prompts.result?.prompts,
    serverInfo: init.result?.serverInfo
  });
}

// ==================== source mode ====================

async function captureSource() {
  const mod = require("../dist/tools.js");
  return normalizeSurface({
    tools: mod.TOOL_DEFINITIONS,
    resources: [],
    prompts: [],
    serverInfo: { name: "bcb-br-mcp" }
  });
}

// ==================== main ====================

const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");

let surface;
if (args.includes("--stdio")) {
  surface = await captureStdio("dist/index.js");
} else if (urlIndex >= 0) {
  surface = await captureHttp(args[urlIndex + 1]);
} else if (args.includes("--source")) {
  surface = await captureSource();
} else {
  console.error("uso: dump-surface.mjs --stdio | --url <endpoint> | --source");
  process.exit(2);
}

process.stdout.write(`${JSON.stringify(surface, null, 2)}\n`);
