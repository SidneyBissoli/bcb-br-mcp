# Changelog

All notable changes to the BCB MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-08-11

Cross-series statistics and inflation adjustment — the half of D2 that the
previous session left open. Both tools were measured against the live API before
any code was written, and the measurement changed the design twice.

### Added
- **`bcb_correlacao`** — pairwise correlation of 2 to 5 series over the same
  window. `metodo` picks Pearson (linear, on the values) or Spearman (monotonic,
  on average ranks — the right one when a series sits on plateaus, like the Selic
  target between Copom meetings). `base` picks levels or period-over-period
  change; the tool says, in its own derivation note, that correlating the *levels*
  of two trending series is high by construction. Every pair reports the
  coefficient, the number of pairs actually used and how many dates were dropped.
  A coefficient that cannot be computed comes back as `null` with a reason —
  never 0, which would claim a measured absence of relationship.
- **`bcb_deflacionar`** — a nominal series restated in constant currency, by IPCA
  (default), INPC or IGP-M, with `mesBase` choosing the reference month (default:
  the last month the index published, i.e. "in today's money"). The response puts
  the nominal change next to the real one, which is the whole point: the minimum
  wage is up 938% in current reais since 2000 and 134% in purchasing power.
- **Correlation in `@sbissoli/mcp-stats` 0.2.0.** The maths went into the shared
  engine, not here, so the `motor` field this server already publishes stays
  truthful.

### Changed
- **Mixed periodicities are now REFUSED by `bcb_correlacao`**, not merely flagged
  as they are in `bcb_comparar`. Measured against the source: joining a daily
  series to a monthly one by date matches about 7 dates in 12 per year — the 1st
  of each month that falls on a business day. Not zero, which would be obvious;
  seven, which yields a healthy-looking coefficient computed over a handful of
  points. The error names `frequencia` as the way out.
- **Grid compatibility is decided by the MEASURED periodicity**, from the spacing
  of the dates the source returned, not by the curated catalogue's label. Series
  11 is catalogued as monthly and the source publishes it every business day; the
  label would have refused a perfectly valid correlation.
- **Concurrency budget for multi-series fetches**, shared across the series
  requested. What overruns the hosted transport's 10 s timeout is queue *depth*,
  not request count: at one request per series, two daily series over 10 years
  took 10.7 s and five took 10.4 s. Ten in flight, split across the series, brings
  the worst case to ~8.8 s while staying inside the ≤5 req/s parsimony the project
  adopted (each slice lasts ~2.6 s, so ten at once is ~3.8 req/s).

## [1.5.0] - 2026-08-11

The SGS limits, handled. Three of them were measured against the live API before
any code was written, and two turned out to be **defects that had always been
there**: `quantidade`/`periodos` above 20 never worked, and the per-series
metadata endpoint does not exist at all.

### Added
- **Automatic window chunking for daily series.** The BCB API caps a date window
  at 10 years for daily series (HTTP **406**) and refuses an open window
  altogether. Requests are now sliced into windows of up to 3 years, fetched with
  bounded concurrency and merged in date order, with no duplicate at the seams.
  The response reports it in `chunking`. The slice is 3 years rather than the
  allowed 10 because a 10-year daily window costs 10–20 s at the origin and can be
  cut off around 30 s — a window the API *accepts* would not complete over the
  hosted transport, whose timeout is 10 s.
- **Declared window instead of an error** when the period is left open on a daily
  series: the server applies the widest window the source itself allows and says
  what it did, and how to ask for another period, in `janelaAplicada`.
- **Frequency harmonisation** in `bcb_serie_valores` and `bcb_comparar` via
  `frequencia` (`mensal`, `trimestral`, `anual`) and `agregacao` (`ultimo`,
  `primeiro`, `media`, `soma`, `acumulada`). `acumulada` compounds geometrically,
  which is the only correct aggregation for series that already are percentage
  changes — summing twelve monthly IPCA readings does not give the year's
  inflation. Harmonised responses carry `derived: true` and a note.
- **Inferred periodicity** from the spacing of the returned observations, flagged
  by `periodicidadeInferida`. This is what replaces the metadata endpoint that
  does not exist, and it means series outside the curated catalog finally report a
  frequency instead of "Desconhecida".
- **`derivacao` block** in `bcb_variacao` and `bcb_comparar`, separating what the
  BCB publishes from what this server computes, with the rounding conventions
  spelled out.
- **`aviso` in `bcb_comparar`** when the compared series have different
  periodicities — the ranking numbers are not comparable across different grids,
  and that used to be silent.

### Fixed
- **`bcb_serie_ultimos` above 20 values.** The input schema advertised up to 1000
  while the upstream endpoint rejects any N above 20 **in every periodicity** (not
  only daily, as previously documented). Above 20, the server now discovers the
  series' periodicity and fetches by date window, delivering the N requested
  points. Same fix for `periodos` in `bcb_variacao`.
- **`bcb_serie_metadados` no longer calls a dead endpoint.**
  `bcdata.sgs.{code}/metadados` answers 404 `endpoint not found!` — as do the
  route variants — so every invocation wasted a request and always fell through to
  the fallback. The tool now spends its single request on the last values, which
  double as the periodicity probe.
- Non-JSON responses from the origin (the institutional HTML page served with
  status 200 when a heavy query is cut off) now produce an explanatory error
  instead of a raw parsing failure.
- Client errors (4xx) are no longer retried three times with backoff. They are
  deterministic, and the 406 in particular needs to come back fast so the window
  can be sliced.

### Changed
- **Statistics are now computed by `@sbissoli/mcp-stats`** (the portfolio's shared
  engine) instead of two divergent hand-rolled implementations. Output field names
  and structure are unchanged. One rounding convention now applies to both tools:
  **a value published by the BCB is returned verbatim, a value computed here is
  rounded to 4 decimals.** Practical effect: `bcb_comparar` is unchanged, and
  `bcb_variacao` stops rounding `estatisticas.maximo`/`minimo` — rounding an
  observation invented a number the source never published.
- `bcb_serie_metadados` no longer advertises `unidade` or `especial` in its output
  schema. No available source publishes them, and no client ever received them.

## [1.4.1] - 2026-08-11

Two new APIs and a real series search. The server stops being an SGS wrapper: it
now covers the **Focus** market-expectations survey and **PTAX** exchange rates
as well, and the search finally reaches beyond the curated catalog.

### Added
- **`bcb_focus_expectativas`** — Focus survey expectations for one indicator with
  the **horizon as a parameter** (monthly, quarterly, annual, rolling 12-month and
  24-month inflation), returning mean, median, standard deviation, min, max and
  number of respondents per collection date. Five OData resources behind one
  contract instead of five mirrored tools. `top5: true` switches to the Top 5
  institutions where the source publishes it (monthly and annual) and is refused,
  with an explanatory error, where it does not.
- **`bcb_focus_selic`** — Focus expectations for the Selic rate, keyed by **Copom
  meeting** (`R1/2026`). Deliberately separate: the time axis is the meeting, not
  the calendar.
- **`bcb_focus_referencias`** — which indicators and reference dates exist, plus
  the contract rules per horizon. The source matches text exactly, and a wrong
  string is the most common cause of an empty answer.
- **`bcb_cambio_cotacao`** — PTAX quote for any currency (USD by default), single
  day or date range; the four quote resources of the source behind one tool. Every
  answer carries the BCB's liability **disclaimer verbatim**, and cross-currency
  parities are qualified as data from an information agency (Refinitiv)
  redistributed by the BCB — not compiled by the Central Bank.
- **`bcb_cambio_moedas`** — currencies with quotes published by the BCB.

### Changed
- **`bcb_buscar_serie` searches for real.** It used to see only the curated
  catalog of ~150 series and answered "no series found in the internal catalog",
  which read as proof of absence. It now searches two layers: the curated catalog
  first (reviewed names, categories), then the index of the BCB Open Data Portal
  with thousands of series identified by code, each with its dataset page. New:
  lookup by series code, several terms combined with AND, a `limite` parameter,
  and `catalogo.cobertura` in **every** answer stating that the index is not the
  whole SGS. `openWorldHint` moved to `true` because the tool now reaches the
  network. The portal index is served from a 24-hour cache renewed by the first
  search after expiry (one request, ~1 s); simultaneous searches share a single
  renewal; if the portal is down, the last snapshot is served **declared as
  stale**, with its collection date, or the search falls back to the curated
  catalog and says so. The cache holds **metadata only** — codes and names, never
  observations.
- **Internal layout: one module per API, primitives in one place.** `src/shared.ts`
  now holds the dependency-free primitives (fetch with timeout/retry, config,
  version, types, `sealDeep`), `src/olinda.ts` the OData translation layer,
  `src/focus.ts` and `src/cambio.ts` the new tools, `src/catalog.ts` the portal
  index. `src/tools.ts` re-exports every moved name, so nothing that imported from
  it needs to change.

### Notes
- Surface: 8 → **13 tools**; resources and prompts unchanged (3 and 3). The only
  change to a pre-existing tool is `bcb_buscar_serie`, listed above.
- Microdata by institution is **not** exposed and will not be: the source
  deactivated that resource over confidentiality of the microdata authorship.

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
