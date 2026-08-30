#!/usr/bin/env node

/**
 * BCB BR MCP Server — STDIO entry point
 * MCP Server for Brazilian Central Bank Time Series (SGS/BCB)
 *
 * Thin wrapper: the whole surface lives in src/register.ts, shared verbatim
 * with the Cloudflare Worker. Before the SDK v2 migration this file carried a
 * second, Zod-derived copy of every schema — which is how the two transports
 * drifted apart (see baselines/README.md).
 *
 * Author: Sidney Bissoli
 * License: MIT
 */

import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createRequire } from "node:module";

import { unknownCursorError } from "./pagination.js";
import { setServerVersion } from "./tools.js";
import { createServer } from "./register.js";

// Version read from package.json (single source of truth — avoids drift).
const { version: SERVER_VERSION } = createRequire(import.meta.url)("../package.json") as { version: string };

// Propagate into the shared module (User-Agent sent to the BCB API).
setServerVersion(SERVER_VERSION);

// O transporte é construído aqui, e não deixado a cargo do `serveStdio`, para
// que o guarda de cursor abaixo possa se pendurar nele. Fora isso é exatamente
// o `StdioServerTransport` sobre o stdio do processo que o SDK criaria sozinho.
const transport = new StdioServerTransport();

serveStdio(() => createServer(SERVER_VERSION), { transport });

// Cursor de paginação inválido → -32602, o MESMO guarda que o Worker aplica no
// POST (src/pagination.ts). Ele entra DEPOIS do serveStdio porque é o
// serveStdio que instala o `onmessage` do transporte: envolvê-lo antes só
// somaria um ouvinte, sem poder de interromper a entrega ao SDK.
const entregaAoServidor = transport.onmessage;
transport.onmessage = message => {
  const recusa = unknownCursorError(message);
  if (recusa) {
    void transport.send(recusa);
    return;
  }
  entregaAoServidor?.(message);
};
