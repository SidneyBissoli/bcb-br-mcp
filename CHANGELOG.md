# Changelog

All notable changes to the BCB MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.5] - 2026-06-21

Fixes the MCP Registry publish that failed in 1.3.4.

### Fixed
- **`server.json` description shortened to ≤100 characters.** The MCP Registry
  enforces a 100-char limit on `description` and rejected 1.3.4 with HTTP 422.
  The registry description now reads "Brazilian Central Bank / Banco Central do
  Brasil (BCB) - SGS time series MCP: Selic, IPCA, FX, GDP" — both names, the
  acronym and the key indicators within the limit. The longer `package.json`
  description (used by npm) is unchanged, as npm has no such limit.

> Note: npm 1.3.4 published successfully; only the registry step failed, so
> this release re-aligns both channels on the same version.

## [1.3.4] - 2026-06-21

Discoverability release (metadata only; no functional changes).

### Changed
- **Renamed the display title to "Brazilian Central Bank (BCB) - MCP".** The
  bare "BCB" acronym is opaque to most users browsing MCP directories (Glama,
  Smithery, LobeHub), which derive the listing title from the README H1. The
  title now uses the full institution name plus the acronym so it is
  recognizable and matches both "Brazilian Central Bank" and "BCB" searches.
  The Portuguese README uses "Banco Central do Brasil (BCB) - MCP".
- **Front-loaded both names (EN + PT) and the BCB acronym** in the README intro
  and in the `package.json` / `server.json` descriptions, which directory
  search also indexes.
- **Added exact-phrase keywords**: `banco-central-do-brasil`,
  `brazilian-central-bank`, `sgs`.

The repository name, npm package and registry id (`bcb-br-mcp`, `bcb_*` tools)
are intentionally unchanged to preserve installs and the MCP Registry identity.

## [1.3.3] - 2026-06-21

Tool-definition quality release (no behavioral changes to the data returned).

### Changed
- **Enriched all 8 tool descriptions for agent-readability.** Each description
  now states its runtime behavior (public BCB SGS API — no auth, no published
  rate limit, automatic retry with backoff, `isError` on failure, JSON /
  `structuredContent` output, `dd/MM/yyyy` dates), the exact shape of what it
  returns, and explicit when-to-use / when-not-to-use guidance referencing
  sibling tools. This targets the Behavior, Completeness and Usage Guidelines
  axes surfaced by Glama's tool-quality scoring.
- **Descriptions consolidated into a single `TOOL_DESCRIPTIONS` map** consumed
  by both transports — stdio (`index.ts`) and HTTP/worker (`TOOL_DEFINITIONS`)
  — so they can no longer drift.
- **De-hardcoded the `User-Agent` version.** It is now derived from
  `package.json` via `setServerVersion()`, injected by each entry point
  (`index.ts` via `createRequire`, `worker.ts` via JSON import), with a fallback
  kept in sync with the package version.

## [1.3.2] - 2026-06-21

Supply-chain hardening release (no functional changes).

### Changed
- **Pinned `@modelcontextprotocol/sdk` to `^1.29.0`** (was `^1.0.0`). The
  previous wildcard range let any 1.x resolve into the tree; narrowing it gives
  reproducible installs and a tighter supply-chain surface.

### Security
- **Published with npm provenance attestation** via a new GitHub Actions
  release workflow (OIDC / SLSA). Earlier releases were published manually and
  carried no attestation; cutting releases through CI adds provenance, which
  Socket.dev and npm surface as a supply-chain trust signal.
