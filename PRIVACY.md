# Privacy Policy — bcb-br-mcp

**Effective date:** 2026-08-15 · **Service:** `https://bcb.sidneybissoli.com/mcp` (remote MCP server; the historical `https://bcb.sidneybissoli.workers.dev` serves the same code)

This service provides read-only access to public economic data of the Central
Bank of Brazil (Banco Central do Brasil — BCB): the SGS time series, the Focus
market-expectations survey and PTAX exchange rates. It requires no account, no
login, and no API key.

## What we collect

- **Nothing that identifies you.** The server does not log query content, tool
  parameters, request bodies, or any user data.
- **Aggregate usage metrics only:** event type (request, tool call, tool error,
  auth failure, rate-limited), tool or route name, and daily counts. These
  aggregates contain no IP addresses and no query content, and are publicly
  visible at `/metrics`.
- **Structured request logs** (Cloudflare Workers Logs) carry only HTTP method,
  path, response status and latency — never the request body, tool arguments
  or client IP.
- **Rate limiting** uses the client IP (`CF-Connecting-IP`) in ephemeral
  in-process memory only (token bucket per isolate). It is never persisted or
  logged by the application.

## Infrastructure

The service runs on Cloudflare Workers. Cloudflare, as hosting provider, may
process connection metadata (including IP addresses) per its own
[privacy policy](https://www.cloudflare.com/privacypolicy/).

## Upstream requests

Your queries are translated into requests to public BCB APIs. Only the series
codes, dates, indicators, currencies and search terms being looked up are
forwarded — never your identity, IP address, or any client metadata. The
requests carry a `User-Agent` identifying this server (name and version), not
you. Upstreams contacted at runtime:

- **SGS — Sistema Gerenciador de Séries Temporais** (`api.bcb.gov.br`) —
  time series observations
- **Olinda OData** (`olinda.bcb.gov.br`) — Focus market expectations and PTAX
  exchange rates
- **Portal de Dados Abertos** (`dadosabertos.bcb.gov.br`, CKAN) — series
  index used by the search tool; the index is cached in memory for 24 hours
  (metadata only, no observations, no user data)

The curated catalog of 135 series is bundled — listing and describing it never
leaves the server.

## Data license

Data returned by this service comes from the Central Bank of Brazil under the
Open Data Commons Open Database License (ODbL) v1.0 — see
[NOTICE.md](NOTICE.md) for the attribution, the BCB's PTAX disclaimer and the
qualification of non-USD parities as third-party data. Every response carries a
provenance block (source, URL, retrieval date, license). This service is not
affiliated with, endorsed by, or certified by the Banco Central do Brasil.

## STDIO (npm package)

The npm package `bcb-br-mcp` runs entirely on your machine. It sends nothing to
this service; it talks only to the upstream BCB APIs above, directly from your
machine, with the same rule (only the queried codes, dates and terms are sent).
No telemetry.

## Contact

sbissoli76@gmail.com
