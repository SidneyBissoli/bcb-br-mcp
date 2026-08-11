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

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createRequire } from "node:module";

import { setServerVersion } from "./tools.js";
import { createServer } from "./register.js";

// Version read from package.json (single source of truth — avoids drift).
const { version: SERVER_VERSION } = createRequire(import.meta.url)("../package.json") as { version: string };

// Propagate into the shared module (User-Agent sent to the BCB API).
setServerVersion(SERVER_VERSION);

await serveStdio(() => createServer(SERVER_VERSION));
