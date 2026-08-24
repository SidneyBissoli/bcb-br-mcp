# Changelog

All notable changes to the BCB MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- O smoke pós-deploy quebrou na remoção acima porque pinava a contagem do
  catálogo num literal (`=== 139`); agora ele deriva a contagem esperada do
  catálogo compilado (`dist/tools.js`) — comparar produção × fonte é a deriva
  que o smoke existe para pegar, e número fixo não mede isso. Na mesma
  varredura: o nome da fonte `CATALOGO_CURADO` na proveniência perdeu a
  contagem fossilizada (dizia "139 séries" em produção), o notice passou a
  registrar 82 `portal` + 53 `medido` e a remoção das FGV, e as menções a
  "139" em README/README.pt-BR/CLAUDE/NOTICE/PRIVACY/package.json/
  lhm.plugin.json foram atualizadas para 135.

### Removed

- Séries 7448 (IGP-M 1ª prévia), 7449 (IGP-M 2ª prévia), 17679 (IPC-3i) e
  17680 (IPC-C1) saíram do catálogo curado: a FGV parou de alimentar o SGS
  (últimos pontos entre 2025-03 e 2025-07). Detectadas pelo novo contrato de
  vitalidade. O catálogo passa de 139 para 135 séries (superfície: apenas os
  textos de descrição/resource que citavam a contagem).

### Added

- `src/sgs-contract.integration.test.ts` — contrato de vitalidade/cadência do
  catálogo curado contra a API real (idade do último ponto vs. periodicidade
  declarada; gate `INTEGRATION_TESTS`), com workflow semanal
  `.github/workflows/integration.yml`. O SGS não tem endpoint de metadados
  com nome, então a metade "nome certo" segue sendo a verificação manual
  documentada em `bcb/docs/06`.

## [1.9.2] - 2026-08-15

Text only — no schema or number changes.

### Changed
- The `derivacao.nota` of compounded savings-account series (25, 195) now
  anchors the day-1 convention to the BCB's own **monthly** savings series 7828,
  which reproduces the same figure (7.03% for 2024), and warns that the
  effective yield depends on the deposit's anniversary day (6.95%–7.14% across
  days in 2024), so differences of that order against other sources are a
  convention, not an error.

## [1.9.1] - 2026-08-15

Extends the 1.9.0 rule to the four **rate-per-period** series of the catalog,
which had been left out on purpose and are now included by decision: Selic and
CDI accumulated in the month (4390, 4391) and savings-account yield (25, 195).
On these, the level arithmetic reported the change *of the rate* — Selic 2024
came out as −4% (0.93 against 0.97) — instead of what the rate accumulated. No
schema change; the `metodo` field and the null `diferencaAbsoluta` already exist.

### Fixed
- **4390/4391 compound like the price indices**: Selic 2024 now answers +10.89%.
- **25/195 compound one observation per month.** Measured at the source: these
  series publish, *every day*, the yield of a deposit made that day until its
  next anniversary (`data` → `dataFim`, 30 days) — January 2024 alone has 28
  observations, all monthly rates. Compounding the raw observations would stack
  ~28 months per month; the tool takes the first observation of each month (a
  deposit at the start of the month, rolled over at each anniversary) and
  compounds those. Savings 2024 answers +7.03% from 336 daily observations, and
  `derivacao.nota` states the sampling and how many months were compounded.
- `bcb_comparar` follows the same rule.

### Tests
- 275 in the package (+2) and 23 in the worker; the pinned set of compounded
  series is now 28.

## [1.9.0] - 2026-08-15

**Correctness fix, found in production by the paid tool-selection eval of
2026-08-14.** `bcb_variacao` computed `(last − first) / first` on the *level* of
every series. That is right for a level series (dollar, Selic, debt) and
meaningless for a series that *is already* a period-on-period rate: for the
monthly IPCA it compared January's rate with December's and published
**+23.81% for 2024, when the accumulated inflation was 4.83%** (the BCB's own
12-month series 13522 confirms), and **+252.38% for the IGP-M in 2023, when the
index fell 3.18%** — wrong sign, absurd magnitude, no warning. `bcb_comparar`
ranked by the same arithmetic and inherited the defect.

Minor bump because the output gains a field; nothing was removed.

### Fixed
- **`bcb_variacao` on rate series now returns the compounded accumulation**
  `(Π(1 + vᵢ/100) − 1) × 100` over all observations — the same index
  reconstruction `bcb_deflacionar` already used, verified against series 13522
  with a maximum error of 0.0052 pp. IPCA 2024 now answers +4.83%; IGP-M 2023
  answers −3.86% (from the monthly rates as published).
- **`bcb_comparar` applies the same per-series rule**, compounding over the
  *original* observations before any `frequencia` harmonisation, so a ranking
  between IPCA, INPC and IGP-M is a ranking of what each accumulated.
- **Series that are already a rolling accumulation** (IPCA 12-month, 13522) are
  **refused** with guidance — neither the level change nor compounding means
  anything there; the published value *is* the answer. In `bcb_comparar` the
  refusal is isolated per series in `erros`, and the ranking of the others
  proceeds.

### Added
- **`metodo` field** — `analise.metodo` in `bcb_variacao`, and per ranking item
  in `bcb_comparar` — with values `nivel` | `encadeamento`, saying which
  arithmetic was used. `derivacao.nota` and the provenance note change
  accordingly.
- `analise.diferencaAbsoluta` is now `number | null`: **null on compounded
  series**, where the difference between two monthly rates does not apply.

### Detection is partial by construction, and the contract says so
Of the 139 curated series, only 10 carry a portal `unidade` that literally
reads "Variação percentual mensal" (IPCA cores and groups). The headline indices
that triggered the defect (433, 189, 188, 190…) have no portal dataset and are
recognised by their curated *name* ("… - Variação mensal") — 24 series in total,
pinned by test. Everything else, including the thousands of codes outside the
catalog, is treated as a level and the tool description states it, rather than
pretending the detection is complete.

### Tests
- 273 in the package (+11) and 23 in the worker. The characterisation pins for
  the level arithmetic moved from series 433/189 to level series; the
  compounding gets its own pins, including the real twelve months of IPCA 2024
  → 4.8313 and IGP-M 2023 → −3.8643.
- Eval fixtures `stat-01` and `ctrl-01` keep `bcb_variacao` as expected tool —
  their expectation was only wrong in practice while the tool published a
  meaningless number.

## [1.8.0] - 2026-08-13

Every successful response now carries **where the data came from, when it was
actually extracted, and under which licence** — the portfolio's provenance
contract v1.0. Additive: nothing was removed from the tool contract, and the 15
tools, their inputs and their existing output fields are untouched. Measurements
behind the design are in `bcb/docs/07`.

### Added
- **Provenance block on all 15 tools**, in two channels: `provenance` +
  `attribution` inside `structuredContent`, and a `_meta` mirror under
  `br.com.sidneybissoli.bcb/*` (out of band, zero model tokens). Each block names
  the source, the canonical URL that reproduces the query, the data vintage, the
  extraction instant and the licence.
- **`retrieved_at` is the real upstream extraction instant, not "now".** The
  portal index is served from a 24-hour cache, and a search answered from cache
  reports the instant the index was actually fetched — which can be a day old,
  and is the legally relevant date. Claiming "now" there would assert an
  extraction that never happened.
- **One block per provenance, never merged.** `bcb_buscar_serie` and
  `bcb_serie_metadados` separate the BCB from the server's own curated catalogue;
  `bcb_cambio_cotacao` separates BCB-compiled dollar rates from cross-currency
  parities, which come from an information agency (Refinitiv) and are only
  redistributed by the BCB. These three tools publish an array of blocks.
- **`NOTICE.md`** with the ODbL v1.0 obligations, the per-API responsible
  department, the verbatim BCB disclaimer and the third-party parity
  qualification. The Portuguese README now states the data licence too — it
  previously mentioned only the MIT licence of the code, which is a different
  thing.
- **Tool-selection eval** (`src/evals/`): 42 pt-BR fixtures across seven clusters,
  validated offline against the live catalogue inside `npm test`. Not published to
  npm.

### Fixed
- **`bcb_comparar`'s mixed-periodicity warning now decides by the MEASURED
  periodicity**, not by the curated catalogue's label — the same rule
  `bcb_correlacao` already followed. Series 11 is catalogued as monthly and the
  source publishes it every business day; deciding by the label kept the warning
  silent in exactly the case that needed it.

### Changed
- The ODbL licence facts were re-verified against the source on 2026-08-13:
  4,259 of the portal's 4,260 datasets declare `odc-odbl`. The block publishes the
  canonical HTTPS licence URL; the one the portal declares resolves, but only over
  plain HTTP.
- New runtime dependency `@sbissoli/mcp-provenance` (which brings `zod` in
  transitively). The published surface is still hand-written JSON Schema served
  verbatim.

## [1.7.0] - 2026-08-13

The curated catalog was verified against the source, series by series, for the
first time. About half of what could be checked was wrong — not typos, but series
mapped to the wrong name. Full measurement in `bcb/docs/06`.

**No part of the tool contract was removed.** The schema changes are additive
(two optional output fields), and the 15 tools, their inputs and their required
fields are untouched. What changes is data: names, periodicities, and which
series the curated catalog contains.

### Fixed
- **Wrong names, corrected from the source.** 82 of the 169 curated series have a
  dataset on the BCB Open Data Portal, and their names are now **transcribed**
  from it. Among the corrections: **432 and 1178 were swapped** (432 is the Copom
  target — flat at 14.00 between meetings; 1178 is the effective annualised Selic
  — 13.90–14.15 on the same day); **20540 and 20541 had legal entities and
  individuals inverted**; **29033–29038 were advertised as Focus expectations**
  when they are household debt and debt-service ratios; **4513 is net public
  debt**, not gross; **10841–10843 are the durability breakdown**, not consumer
  groups; **25 and 195 are savings-account yields**, not balances.
- **Periodicity is now the measured one, everywhere.** The inherited label was
  wrong in 43 of the 169 entries — series 11 is daily and was labelled monthly;
  the PTAX series 3695/3697/3698 are monthly in the SGS and were labelled daily.
- **`bcb_indicadores_atuais` reported a six-week-old dollar as current.** It read
  series 3698, the *monthly* PTAX (last point 01/07/2026), while the daily series
  already had 12/08/2026. It now reads series 1.
- **The `codigos_principais` resource repeated the same errors** — `selic_meta`
  pointed at the effective rate and `selic_acumulada` at the target, exactly
  inverted; `divida_bruta` pointed at net debt. Rebuilt.
- **A nonexistent series code no longer advises "reduce the period".** The SGS
  does not answer 404 for an unknown code: it answers **HTTP 200 with its
  "invalid request" HTML page**, which is exactly what it answers for an invented
  code. That case is now told apart from the other cause of the same symptom (a
  long daily window cut by time) and reported as *series does not exist*. It is
  also no longer retried — like a 4xx, it is deterministic.

### Added
- **`fonteNome` on every curated entry**, published by `bcb_series_populares` and
  `bcb_buscar_serie`: `portal` when the name is transcribed from the BCB dataset
  (82 series, which also carry `unidade`), `medido` when the series has no
  dataset anywhere — no portal entry, no metadata endpoint, and the legacy SOAP
  facade publishes no names either — so the name is inherited and only the
  periodicity and order of magnitude were verified. Presenting both kinds with
  the same face is what let 21 wrong names survive for versions.
- `src/catalogo-curado.test.ts` pins what the verification established, with the
  arbitrating fact next to each assertion.

### Removed
- **30 series, each with a fact from the source against it.** Four codes the SGS
  does not recognise at all (14, 13523, 21860, 13690); series dead for a decade
  returning zero (10845–10850, stopped in 2014/2015; 7165–7167, stopped in 2009;
  12466–12468, stopped in 05/2023; 7832, stopped in 08/2019); and series whose
  data contradicts the advertised name (7479 returns index levels, not a 12-month
  change; 21637–21640 and 29039–29040 are monthly with magnitudes incompatible
  with an FX quote; 22099, 24370, 28763, 28785, 4538 and 4539 likewise).
- The catalog therefore holds **139 series**, all verified.

## [1.6.1] - 2026-08-13

A correctness fix. No surface change: same 15 tools, same schemas, same fields.

### Fixed
- **`bcb_variacao` computed the change backwards on part of the SGS.** The
  `ultimos/N` endpoint does not guarantee chronological order, and measurement
  over the whole curated catalog found **22 of 169 series served newest-first**
  (among them the gross and net public debt, central government revenue and
  expenditure, M1, M4 and the money multiplier). The tool takes `data[0]` as the
  starting value, so on those series it published an inverted sign with
  `dataInicial` *later* than `dataFinal` — series 4513 came back as −7.40% over a
  window in which it rose 8.00%. The failure was silent: a well-formed response
  with a wrong number.
- Same root cause, smaller effect: `bcb_serie_ultimos` listed those series
  newest-first, and `bcb_serie_metadados` reported the *oldest* observation of
  the window as `ultimoValor`.
- Every set of observations coming from the SGS now passes through a single
  ordering step (`ordenarPorData` in `src/series.ts`). Observations whose date
  cannot be parsed keep their relative order and go last, rather than being
  dropped. The date-window path measured ascending in all 151 series checked, but
  it is normalised too — the guarantee is ours now, not the source's.

### Unchanged on purpose
- `maximo`/`minimo`/`media` never depended on order and did not move.
- The chunked path already sorted on merge, so long windows were never affected.

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
