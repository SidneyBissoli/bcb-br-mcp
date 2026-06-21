# Changelog

All notable changes to the BCB MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
