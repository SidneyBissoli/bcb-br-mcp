# Brazilian Central Bank (BCB) - MCP

[![npm version](https://img.shields.io/npm/v/bcb-br-mcp.svg)](https://www.npmjs.com/package/bcb-br-mcp)
[![npm downloads](https://img.shields.io/npm/dm/bcb-br-mcp.svg)](https://www.npmjs.com/package/bcb-br-mcp)
[![node](https://img.shields.io/node/v/bcb-br-mcp)](https://www.npmjs.com/package/bcb-br-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![LobeHub](https://lobehub.com/badge/mcp/sidneybissoli-bcb-br-mcp)](https://lobehub.com/mcp/sidneybissoli-bcb-br-mcp)
[![smithery badge](https://smithery.ai/badge/sidneybissoli/bcb-br-mcp)](https://smithery.ai/servers/sidneybissoli/bcb-br-mcp)
[![GitHub stars](https://img.shields.io/github/stars/SidneyBissoli/bcb-br-mcp?style=flat&logo=github)](https://github.com/SidneyBissoli/bcb-br-mcp)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/SidneyBissoli?logo=githubsponsors&label=Sponsor&color=db61a2)](https://github.com/sponsors/SidneyBissoli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![AllMCPs Verified](https://allmcps.com/api/badge/sidneybissoli-bcb-br-mcp)](https://allmcps.com/mcp/sidneybissoli-bcb-br-mcp)

[Leia em Português](README.pt-BR.md)

MCP (Model Context Protocol) server for the **Brazilian Central Bank** (Banco Central do Brasil, **BCB**) time series data (SGS/BCB).

Query economic and financial indicators such as **Selic** (interest rate), **IPCA** (inflation), **exchange rates**, **GDP**, and more, directly from AI assistants like Claude.

> If you find this project useful, please consider giving it a [star on GitHub](https://github.com/SidneyBissoli/bcb-br-mcp). It helps others discover the project!

**Capabilities:** 15 tools (skills) · 3 resources · 3 prompts — everything an MCP client needs to query the Brazilian Central Bank: SGS/BCB time series, the **Focus** market-expectations survey and **PTAX** exchange rates.

## See it in action

Ask your assistant, in plain Portuguese:

- *"Qual a taxa Selic atual?"* → `bcb_indicadores_atuais`
- *"Mostre o IPCA mês a mês em 2024."* → `bcb_serie_valores`
- *"Qual foi a variação do dólar nos últimos 12 meses?"* → `bcb_variacao`
- *"O que o mercado espera do IPCA em 2027?"* → `bcb_focus_expectativas`
- *"Qual a Selic esperada na próxima reunião do Copom?"* → `bcb_focus_selic`
- *"Qual foi a PTAX de fechamento do euro na sexta?"* → `bcb_cambio_cotacao`

The answers come live from the Brazilian Central Bank's SGS API — exact figures with provenance, not numbers guessed from training data.

## Features

- **Historical data** - Query time series values by code with date filters
- **Latest values** - Get the most recent N values of any series
- **Metadata** - Detailed information about series (frequency, source, etc.)
- **Popular series catalog** - 135 economic indicators verified against the source, organized by category
- **Smart search** - Find series by keyword (accent-insensitive)
- **Current indicators** - Latest values for key economic indicators
- **Long periods, handled** - The BCB API caps daily series at a 10-year window
  (HTTP 406) and refuses open windows; requests are sliced, fetched and merged
  automatically, so a 15-year daily query just works
- **Frequency harmonisation** - Resample a series to monthly, quarterly or annual
  with an explicit convention, including geometric compounding for series that
  already are percentage changes (monthly IPCA into annual IPCA)
- **Variation calculation** - Percentage change between periods with statistics
- **Series comparison** - Compare multiple series over the same period, with a
  warning when their periodicities differ
- **Focus survey** - Market expectations (mean, median, std. deviation, min, max, respondents) for IPCA, GDP, FX and more, by monthly/quarterly/annual horizon or rolling 12/24-month inflation, plus Selic by Copom meeting
- **PTAX exchange rates** - Official closing quotes for any currency the BCB publishes, single day or date range

## Available Tools

| Tool | Description |
|------|-------------|
| `bcb_serie_valores` | Query series values by code and date range; slices long windows automatically and can harmonise the series to a coarser frequency |
| `bcb_serie_ultimos` | Get the last N values of a series (any N — the upstream cap of 20 is worked around) |
| `bcb_serie_metadados` | Get series metadata (name, frequency, category, last value) |
| `bcb_series_populares` | List popular series grouped by category |
| `bcb_buscar_serie` | Search series by name or description (accent-insensitive) |
| `bcb_indicadores_atuais` | Latest values: Selic, IPCA, USD/BRL, IBC-Br |
| `bcb_variacao` | Percentage variation of one series over a period: level change for level series, **compounded accumulation** for series that are already period-on-period rates (IPCA, IGP-M, INPC…); `analise.metodo` says which |
| `bcb_comparar` | Compare 2 to 5 series over the same period with ranking (same level/compounding rule per series, declared in `metodo`) |
| `bcb_focus_expectativas` | Focus survey expectations for one indicator, horizon as a parameter (monthly, quarterly, annual, rolling 12m/24m inflation); `top5` flag |
| `bcb_focus_selic` | Focus expectations for the Selic rate, by Copom meeting (R1/2026 form) |
| `bcb_focus_referencias` | Which indicators and reference dates the Focus survey actually publishes, **broken down per scope** (the five horizons plus `selic`, whose axis is the Copom meeting) — the indicator set differs by scope (9 monthly vs 26 annual) |
| `bcb_cambio_cotacao` | PTAX quote for a currency (USD by default), single day or date range |
| `bcb_cambio_moedas` | Currencies with quotes published by the BCB |

## Resources

Reference catalogs the server exposes as MCP **resources** (read-only contextual data that clients can attach):

| URI | Description |
|-----|-------------|
| `bcb://series/populares` | Catalog of 135 verified BCB economic series, organized by category (JSON) |
| `bcb://series/categorias` | List of available categories in the series catalog (JSON) |
| `bcb://series/principais` | Codes of the most-used indicators — Selic, IPCA, USD/BRL, GDP, etc. (JSON) |

## Prompts

Ready-made templates the server provides as MCP **prompts**:

| Prompt | Description |
|--------|-------------|
| `indicadores_atuais` | Query Brazil's key economic indicators (Selic, IPCA, USD/BRL, IBC-Br) |
| `panorama_economico` | Generate a complete overview of the Brazilian economy |
| `comparar_inflacao` | Compare Brazil's main inflation indices (IPCA, IGP-M, INPC) over the last 12 months |

## Installation

### Via Smithery (recommended)

Visit [bcb-br-mcp on Smithery](https://smithery.ai/servers/sidneybissoli/bcb-br-mcp) and follow the installation instructions for your MCP client.

### Via URL (Claude.ai, Claude Desktop, any MCP client)

Use the HTTP endpoint directly, no installation required:

```
https://bcb.sidneybissoli.com/mcp
```

The legacy hostname `https://bcb.sidneybissoli.workers.dev` keeps working, and so
does the older `POST /` route — clients configured before the endpoint moved to
`/mcp` are rewritten transparently, so nothing that used to work stopped working.
New setups should use the URL above.

### Via npx (Claude Desktop)

Add to your Claude Desktop configuration file:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "bcb-br": {
      "command": "npx",
      "args": ["-y", "bcb-br-mcp"]
    }
  }
}
```

### Via global install

```bash
npm install -g bcb-br-mcp
```

```json
{
  "mcpServers": {
    "bcb-br": {
      "command": "bcb-br-mcp"
    }
  }
}
```

## Usage Examples

### Get the current Selic rate

```
What is the current Selic interest rate?
→ Uses bcb_indicadores_atuais
```

### IPCA history for 2024

```
Show me the monthly IPCA for 2024
→ Uses bcb_serie_valores with code 433, dataInicial 2024-01-01, dataFinal 2024-12-31
```

### List inflation indicators

```
What inflation series are available?
→ Uses bcb_series_populares with category "Inflação"
```

### Search for USD exchange rate series

```
Search for series related to the dollar
→ Uses bcb_buscar_serie with term "dolar" (works without accents)
```

### Calculate USD/BRL variation

```
What was the USD/BRL variation over the last 12 months?
→ Uses bcb_variacao with code 1 and periodos 12
```

### Compare IPCA, IGP-M, and INPC

```
Compare IPCA, IGP-M, and INPC in 2024
→ Uses bcb_comparar with codes [433, 189, 188], dataInicial 2024-01-01, dataFinal 2024-12-31
```

## Series Catalog (135)

The curated catalog holds **135 series, each verified against the source** on 2026-08-13 (4 discontinued FGV series were removed on 2026-08-23).

The `fonteNome` field on every entry says where its name comes from:

- **`portal`** (82 series) — the name is transcribed from the series' dataset on the
  BCB Open Data Portal, and `unidade` carries the published unit of measure.
- **`medido`** (57 series) — the series has no dataset on the portal, so the name is
  inherited; what was verified against the source is its periodicity and order of magnitude.

Periodicity is always the **measured** one (from the spacing between observations), never an
inherited label. Market expectations are **not** here — use `bcb_focus_expectativas`.

### Juros (14)

| Code | Name | Periodicity | Name source |
|------|------|-------------|-------------|
| 11 | Taxa de juros - Selic | Diária | `portal` |
| 432 | Taxa de juros - Meta Selic definida pelo Copom | Diária | `portal` |
| 1178 | Taxa de juros - Selic anualizada base 252 | Diária | `portal` |
| 4189 | Taxa de juros - Selic acumulada no mês anualizada base 252 | Mensal | `portal` |
| 4390 | Taxa de juros - Selic acumulada no mês | Mensal | `portal` |
| 12 | Taxa de juros - CDI diária | Diária | `medido` |
| 4389 | Taxa de juros - CDI anualizada base 252 | Diária | `medido` |
| 4391 | Taxa de juros - CDI acumulada no mês | Mensal | `medido` |
| 4392 | Taxa de juros - CDI acumulada no mês anualizada | Mensal | `medido` |
| 226 | Taxa Referencial (TR) - diária | Diária | `medido` |
| 7811 | Taxa Referencial (TR) - mensal | Mensal | `medido` |
| 7812 | Taxa Referencial (TR) - anualizada | Mensal | `medido` |
| 256 | Taxa de Juros de Longo Prazo (TJLP) | Mensal | `medido` |
| 253 | Taxa de juros - CDB pré-fixado - 30 dias | Diária | `medido` |

### Inflação (28)

| Code | Name | Periodicity | Name source |
|------|------|-------------|-------------|
| 433 | IPCA - Variação mensal | Mensal | `medido` |
| 13522 | IPCA - Variação acumulada em 12 meses | Mensal | `medido` |
| 7478 | IPCA-15 - Variação mensal | Mensal | `medido` |
| 10764 | IPCA-E - Variação mensal | Mensal | `medido` |
| 16121 | Índice nacional de preços ao consumidor - Amplo (IPCA) - Núcleo por exclusão - ex2 | Mensal | `portal` |
| 16122 | Índice nacional de preços ao consumidor - Amplo (IPCA) - Núcleo de dupla ponderação | Mensal | `portal` |
| 11426 | Índice nacional de preços ao consumidor - Amplo (IPCA) - Núcleo médias aparadas sem suavização | Mensal | `portal` |
| 11427 | Índice nacional de preços ao consumidor - Amplo (IPCA) - Núcleo por exclusão - Sem monitorados e alimentos no domicílio | Mensal | `portal` |
| 10841 | Índice de Preços ao Consumidor-Amplo (IPCA) - Bens não-duráveis | Mensal | `portal` |
| 10842 | Índice de Preços ao Consumidor-Amplo (IPCA) - Bens semi-duráveis | Mensal | `portal` |
| 10843 | Índice de Preços ao Consumidor-Amplo (IPCA) - Duráveis | Mensal | `portal` |
| 10844 | Índice de Preços ao Consumidor-Amplo (IPCA) - Serviços | Mensal | `portal` |
| 4449 | Índice nacional de preços ao consumidor-Amplo (IPCA) - Preços monitorados - Total | Mensal | `portal` |
| 11428 | Índice nacional de preços ao consumidor - Amplo (IPCA) - Itens livres | Mensal | `portal` |
| 188 | INPC - Variação mensal | Mensal | `medido` |
| 189 | IGP-M - Variação mensal | Mensal | `medido` |
| 7447 | IGP-10 - Variação mensal | Mensal | `medido` |
| 7448 | IGP-M - 1ª prévia | Mensal | `medido` |
| 7449 | IGP-M - 2ª prévia | Mensal | `medido` |
| 190 | IGP-DI - Variação mensal | Mensal | `medido` |
| 7450 | IPA-M - Variação mensal | Mensal | `medido` |
| 225 | IPA-DI - Geral - Variação mensal | Mensal | `medido` |
| 7459 | IPA-DI - Produtos industriais | Mensal | `medido` |
| 7460 | IPA-DI - Produtos agrícolas | Mensal | `medido` |
| 191 | IPC-DI - Variação mensal | Mensal | `medido` |
| 193 | IPC-Fipe - Variação mensal | Mensal | `medido` |
| 17679 | IPC-3i - Variação mensal | Mensal | `medido` |
| 17680 | IPC-C1 - Variação mensal | Mensal | `medido` |

### Câmbio (13)

| Code | Name | Periodicity | Name source |
|------|------|-------------|-------------|
| 1 | Taxa de câmbio - Livre - Dólar americano (venda) - diário | Diária | `portal` |
| 10813 | Taxa de câmbio - Livre - Dólar americano (compra) | Diária | `portal` |
| 3698 | Taxa de câmbio - PTAX - Dólar americano (venda) | Mensal | `medido` |
| 3697 | Taxa de câmbio - PTAX - Dólar americano (compra) | Mensal | `medido` |
| 3695 | Taxa de câmbio - PTAX - Dólar americano (média) | Mensal | `medido` |
| 21619 | Taxa de câmbio - Euro (venda) | Diária | `medido` |
| 21620 | Taxa de câmbio - Euro (compra) | Diária | `medido` |
| 21623 | Taxa de câmbio - Libra Esterlina (venda) | Diária | `medido` |
| 21624 | Taxa de câmbio - Libra Esterlina (compra) | Diária | `medido` |
| 21621 | Taxa de câmbio - Iene (venda) | Diária | `medido` |
| 21622 | Taxa de câmbio - Iene (compra) | Diária | `medido` |
| 21625 | Taxa de câmbio - Franco Suíço (venda) | Diária | `medido` |
| 21626 | Taxa de câmbio - Franco Suíço (compra) | Diária | `medido` |

### Atividade Econômica (21)

| Code | Name | Periodicity | Name source |
|------|------|-------------|-------------|
| 4380 | PIB mensal - Valores correntes (R$ milhões) | Mensal | `medido` |
| 4381 | PIB acumulado no ano - Valores correntes (R$ milhões) | Mensal | `medido` |
| 4382 | PIB acumulado dos últimos 12 meses - Valores correntes (R$ milhões) | Mensal | `medido` |
| 4385 | PIB mensal em US$ (milhões) | Mensal | `medido` |
| 4386 | PIB acumulado no ano em US$ (milhões) | Mensal | `medido` |
| 7324 | PIB anual em US$ (milhões) | Anual | `medido` |
| 24363 | Índice de Atividade Econômica do Banco Central - IBC-Br | Mensal | `portal` |
| 24364 | Índice de Atividade Econômica do Banco Central (IBC-Br) - com ajuste sazonal | Mensal | `portal` |
| 29601 | Índice de Atividade Econômica do Banco Central (IBC-Br) Agropecuária | Mensal | `portal` |
| 29602 | Índice de Atividade Econômica do Banco Central (IBC-Br) Agropecuária - com ajuste sazonal | Mensal | `portal` |
| 29603 | Índice de Atividade Econômica do Banco Central (IBC-Br) Indústria | Mensal | `portal` |
| 29604 | Índice de Atividade Econômica do Banco Central (IBC-Br) Indústria - com ajuste sazonal | Mensal | `portal` |
| 29605 | Índice de Atividade Econômica do Banco Central (IBC-Br) Serviços | Mensal | `portal` |
| 29606 | Índice de Atividade Econômica do Banco Central (IBC-Br) Serviços - com ajuste sazonal | Mensal | `portal` |
| 22103 | Exportação de bens e serviços - Trimestral | Trimestral | `medido` |
| 22104 | Importação de bens e serviços - Trimestral | Trimestral | `medido` |
| 22109 | Consumo das famílias - Trimestral | Trimestral | `medido` |
| 22110 | Consumo do governo - Trimestral | Trimestral | `medido` |
| 22111 | Formação bruta de capital fixo - Trimestral | Trimestral | `medido` |
| 21859 | Produção industrial - Geral - Variação mensal | Mensal | `medido` |
| 21862 | Utilização da capacidade instalada - Indústria | Mensal | `medido` |

### Emprego (4)

| Code | Name | Periodicity | Name source |
|------|------|-------------|-------------|
| 24369 | Taxa de desocupação - PNAD Contínua | Mensal | `medido` |
| 24380 | Rendimento médio real habitual - Todos os trabalhos | Mensal | `medido` |
| 24381 | Massa de rendimento real habitual | Mensal | `medido` |
| 28561 | CAGED - Saldo de empregos formais | Mensal | `medido` |

### Fiscal (7)

| Code | Name | Periodicity | Name source |
|------|------|-------------|-------------|
| 4503 | Dívida Líquida do Setor Público (% PIB) - Total - Governo Federal e Banco Central | Mensal | `portal` |
| 4513 | Dívida Líquida do Setor Público (% PIB) - Total - Setor público consolidado | Mensal | `portal` |
| 4505 | Dívida Líquida do Setor Público (% PIB) - Total - Banco Central | Mensal | `portal` |
| 4536 | Dívida líquida do governo geral (% PIB) | Mensal | `portal` |
| 4537 | Dívida bruta do governo geral (% PIB) - Metodologia utilizada até 2007 | Mensal | `portal` |
| 5364 | Receita total do governo central | Mensal | `medido` |
| 5793 | NFSP sem desvalorização cambial (% PIB) - Fluxo acumulado em 12 meses - Resultado primário - Total - Setor público consolidado | Mensal | `portal` |

### Setor Externo (12)

| Code | Name | Periodicity | Name source |
|------|------|-------------|-------------|
| 3546 | Reservas internacionais - Conceito liquidez - Total | Mensal | `medido` |
| 13621 | Reservas internacionais - Conceito caixa - Total - diária | Diária | `portal` |
| 22707 | Balança comercial - Balanço de Pagamentos - mensal - saldo | Mensal | `portal` |
| 22708 | Exportação de bens - Balanço de Pagamentos - mensal | Mensal | `portal` |
| 22709 | Importação de bens - Balanço de Pagamentos - mensal | Mensal | `portal` |
| 22714 | Bens exportados sob merchanting - exportações positivas - mensal | Mensal | `portal` |
| 22701 | Transações correntes - mensal - saldo | Mensal | `portal` |
| 22704 | Balança comercial e Serviços - mensal - saldo | Mensal | `portal` |
| 22715 | Bens importados sob merchanting - exportações negativas - mensal | Mensal | `portal` |
| 22716 | Balança comercial - ouro não monetário - Balanço de Pagamentos - mensal - saldo | Mensal | `portal` |
| 22846 | Renda secundária - Demais setores - Transferências pessoais - mensal - receita | Mensal | `portal` |
| 22885 | Investimentos diretos no país - IDP - mensal - líquido | Mensal | `portal` |

### Crédito (30)

| Code | Name | Periodicity | Name source |
|------|------|-------------|-------------|
| 20539 | Saldo da carteira de crédito - Total | Mensal | `portal` |
| 20540 | Saldo da carteira de crédito - Pessoas jurídicas - Total | Mensal | `portal` |
| 20541 | Saldo da carteira de crédito - Pessoas físicas - Total | Mensal | `portal` |
| 20542 | Saldo da carteira de crédito com recursos livres - Total | Mensal | `portal` |
| 20570 | Saldo da carteira de crédito com recursos livres - Pessoas físicas - Total | Mensal | `portal` |
| 20592 | Saldo da carteira de crédito com recursos livres - Pessoas físicas - Outros créditos livres | Mensal | `portal` |
| 20615 | Saldo da carteira de crédito com recursos direcionados - Pessoas físicas - Financiamento agroindustrial com recursos do BNDES | Mensal | `portal` |
| 20631 | Concessões de crédito - Total | Mensal | `portal` |
| 20665 | Concessões de crédito com recursos livres - Pessoas físicas - Cheque especial | Mensal | `portal` |
| 20714 | Taxa média de juros das operações de crédito - Total | Mensal | `portal` |
| 20716 | Taxa média de juros das operações de crédito - Pessoas físicas - Total | Mensal | `portal` |
| 20740 | Taxa média de juros das operações de crédito com recursos livres - Pessoas físicas - Total | Mensal | `portal` |
| 20749 | Taxa média de juros das operações de crédito com recursos livres - Pessoas físicas - Aquisição de veículos | Mensal | `portal` |
| 20772 | Taxa média de juros das operações de crédito com recursos direcionados - Pessoas físicas - Financiamento imobiliário com taxas de mercado | Mensal | `portal` |
| 25497 | Taxa média mensal de juros das operações de crédito com recursos direcionados - Pessoas físicas - Financiamento imobiliário com taxas de mercado | Mensal | `portal` |
| 20783 | Spread médio das operações de crédito - Total | Mensal | `portal` |
| 20785 | Spread médio das operações de crédito - Pessoas físicas - Total | Mensal | `portal` |
| 20786 | Spread médio das operações de crédito com recursos livres - Total | Mensal | `portal` |
| 21082 | Inadimplência da carteira de crédito - Total | Mensal | `portal` |
| 21084 | Inadimplência da carteira de crédito - Pessoas físicas - Total | Mensal | `portal` |
| 21085 | Inadimplência da carteira de crédito com recursos livres - Total | Mensal | `portal` |
| 21128 | Inadimplência da carteira de crédito com recursos livres - Pessoas físicas - Cartão de crédito parcelado | Mensal | `portal` |
| 21129 | Inadimplência da carteira de crédito com recursos livres - Pessoas físicas - Cartão de crédito total | Mensal | `portal` |
| 13685 | Inadimplência da carteira de crédito das instituições financeiras sob controle privado - Total | Mensal | `portal` |
| 29033 | Comprometimento de renda das famílias com juros da dívida com o Sistema Financeiro Nacional - Com ajuste sazonal (RNDBF) | Mensal | `portal` |
| 29034 | Comprometimento de renda das famílias com o serviço da dívida com o Sistema Financeiro Nacional - Com ajuste sazonal (RNDBF) | Mensal | `portal` |
| 29035 | Comprometimento de renda das famílias com o serviço da dívida com o Sistema Financeiro Nacional exceto crédito habitacional - Com ajuste sazonal (RNDBF) | Mensal | `portal` |
| 29036 | Comprometimento de renda das famílias com amortização da dívida com o Sistema Financeiro Nacional - Com ajuste sazonal (RNDBF) | Mensal | `portal` |
| 29037 | Endividamento das famílias com o Sistema Financeiro Nacional em relação à renda acumulada dos últimos doze meses (RNDBF) | Mensal | `portal` |
| 29038 | Endividamento das famílias com o Sistema Financeiro Nacional exceto crédito habitacional em relação à renda acumulada dos últimos 12 meses (RNDBF) | Mensal | `portal` |

### Agregados Monetários (8)

| Code | Name | Periodicity | Name source |
|------|------|-------------|-------------|
| 1788 | BM - Base monetária restrita (saldo em final de período) | Mensal | `portal` |
| 1833 | Base Monetária Ampliada (saldo em final de período) | Mensal | `portal` |
| 27788 | Meios de pagamento - M1 (média dos dias úteis do mês) - Novo | Mensal | `portal` |
| 27789 | Meios de pagamento - Papel moeda em poder do público (saldo em final de período) - Novo | Mensal | `portal` |
| 27790 | Meios de pagamento - Depósitos à vista (saldo em final de período) - Novo | Mensal | `portal` |
| 27791 | Meios de pagamento - M1 (saldo em final de período) - Novo | Mensal | `portal` |
| 27815 | Meios de pagamento amplos - M4 (saldo em final de periodo) - Novo | Mensal | `portal` |
| 7530 | Comportamento monetário - Comportamento do público - C | Mensal | `portal` |

### Poupança (2)

| Code | Name | Periodicity | Name source |
|------|------|-------------|-------------|
| 25 | Depósitos de poupança até 03.05.2012 - Rentabilidade no período | Diária | `portal` |
| 195 | Depósitos de poupança a partir de 04.05.2012 - Rentabilidade no período | Diária | `portal` |


The full machine-readable catalog is served as the `bcb://series/populares` resource and by
`bcb_series_populares`. Thousands of further series are reachable through `bcb_buscar_serie`,
which also queries the BCB Open Data Portal index.

## Finding Other Series

The SGS database contains over 18,000 time series. To find codes for other series:

1. Visit the [BCB SGS Portal](https://www3.bcb.gov.br/sgspub/)
2. Search for the desired series
3. Note the series code
4. Use that code with this server's tools

## Technical Details

### Robustness

- **Timeout**: 30 seconds per request (prevents hanging)
- **Auto-retry**: 3 attempts with exponential backoff (1s, 2s, 4s) for transient
  failures; client errors (4xx) are not retried, since they are deterministic
- **Error handling**: Clear error messages

### Working around the SGS limits

Measured against the live API, not inferred from documentation:

- A **date window over 10 years on a daily series** is refused with HTTP **406**,
  and so is an open window (no `dataInicial`, or no dates at all). The limit
  applies to the *implicit* window: with no `dataFinal` the API assumes today.
  Requests are sliced into windows of up to **3 years**, fetched with bounded
  concurrency and merged in date order without duplicating the seams; the response
  reports it in `chunking`. The slice is 3 years rather than the allowed 10 because
  a 10-year daily window costs 10–20 s upstream and may be cut off around 30 s.
- **`dados/ultimos/N` is capped at 20** by the API, in every periodicity. Above 20,
  the server infers the series' periodicity and fetches by date window instead.
- **There is no per-series metadata endpoint** (`/metadados` answers 404). Frequency
  is inferred from the spacing of the observations and flagged with
  `periodicidadeInferida`; unit of measure is not available from any source.

### Derived values

Anything this server computes — variation, descriptive statistics, harmonised
series — is marked `derived: true` and carries a note with the conventions used.
Statistics come from [`@sbissoli/mcp-stats`](https://www.npmjs.com/package/@sbissoli/mcp-stats).
A value published by the BCB is always returned verbatim; only computed values are
rounded (to 4 decimals).

### Smart Search

`bcb_buscar_serie` searches two layers: the curated curated catalog of 135 verified series (which ranks first, with the name source declared
names) and the index of the BCB Open Data Portal, with thousands of series identified by code. Terms are
accent- and case-insensitive, and several terms are combined with AND:

- `"inflacao"` → finds "Inflação"
- `"cambio"` → finds "Câmbio"
- `"ipca servicos"` → both terms must match

The portal index is served from a 24-hour cache, renewed by the first search after it expires (one request to
the portal, only metadata — series codes and names, never observations). Every answer carries
`catalogo.cobertura`: the index is **not** the whole SGS, so not finding a series here is not proof it does not
exist.

### Data source and licence

Data obtained from the Banco Central do Brasil (SGS / Olinda-Expectativas / PTAX), published under the
**Open Data Commons Open Database License (ODbL) v1.0** — https://opendatacommons.org/licenses/odbl/1-0/.
Re-verified against the source on 2026-08-13: 4,259 of the portal's 4,260 datasets declare
`license_id: "odc-odbl"`. This is **not** CC0, CC BY, or public domain — ODbL carries attribution,
share-alike (on derived databases) and anti-DRM clauses. Exchange-rate answers pass through the BCB's own
liability disclaimer verbatim; cross-currency parities are **not** compiled by the BCB — they come from an
information agency (Refinitiv) and are redistributed by the BCB, and the tools say so.

The server's own code is MIT; the data is not. See [NOTICE.md](NOTICE.md). Privacy: no user data is logged, by either channel — see [PRIVACY.md](PRIVACY.md).

### Provenance block

Every successful tool response carries a provenance block (portfolio contract v1.0) in two channels:
`structuredContent.provenance` + `attribution` (visible to the model) and a `_meta` mirror under
`br.com.sidneybissoli.bcb/*` (out of band, zero tokens). Each block names the source, the canonical URL that
reproduces the query, the data vintage, the **real** upstream extraction instant, and the licence.

Two details that are easy to get wrong and are handled here:

- **`retrieved_at` is the real extraction instant, not "now".** The portal index is served from a 24-hour
  cache, so a search answered from cache reports the instant the index was actually fetched — which can be a
  day old, and is the legally relevant date.
- **One block per provenance, never merged.** `bcb_buscar_serie` separates the BCB portal index from the
  server's own curated catalogue; `bcb_serie_metadados` separates the live SGS reading from the catalogue;
  `bcb_cambio_cotacao` separates BCB-compiled dollar rates from agency-sourced cross-currency parities.

## Development

### Requirements

- Node.js >= 18.0.0

### Setup

```bash
git clone https://github.com/SidneyBissoli/bcb-br-mcp.git
cd bcb-br-mcp
npm install
```

### Build

```bash
npm run build
```

### Local testing (stdio)

```bash
npm run dev
```

### Local testing (HTTP worker)

```bash
npm run dev:worker
```

Or use the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npm run dev
```

## BCB API

This server uses the Brazilian Central Bank's public API:

- **Base endpoint:** `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados`
- **Format:** JSON
- **Authentication:** None (public API)
- **Documentation:** [BCB Open Data](https://dadosabertos.bcb.gov.br/)

## Changelog

### v1.4.1

- `bcb_focus_referencias`: the parameter is now `escopo`, not `horizonte`, and the
  response array is `escopos`. The scopes are the five horizons of
  `bcb_focus_expectativas` **plus `selic`** — and `selic` is not a horizon: its
  axis is the Copom meeting. Each block names the `tool` that consumes it. The
  previous name implied `selic` was a queryable horizon of
  `bcb_focus_expectativas`, which it is not. Never published to npm under the old
  name.

### v1.4.0

- **Three APIs under one contract, 8 tools → 13.** Focus market-expectations
  survey (`bcb_focus_expectativas`, `bcb_focus_selic`, `bcb_focus_referencias`)
  and PTAX exchange rates (`bcb_cambio_cotacao`, `bcb_cambio_moedas`), consolidated
  by parameter rather than mirroring the source's ~18 OData resources.
- **Real search.** `bcb_buscar_serie` now queries the Open Data Portal index
  (3,500+ series, 24-hour cache, metadata only) on top of the curated catalog, and
  states the index's coverage instead of claiming a series does not exist.
- Every Focus and PTAX field name verified against the live API, including the
  Top 5 Selic resource, which publishes its fields in a different case from the
  other twelve.
- ODbL obligations shipped with the exchange-rate tools: the BCB disclaimer is
  passed through verbatim, and non-USD parities are qualified as third-party
  (Refinitiv) data redistributed by the BCB.

### v1.2.0

- HTTP endpoint via Cloudflare Workers (`https://bcb.sidneybissoli.workers.dev`)
- Published on Smithery.ai
- Refactored: tool logic extracted to `src/tools.ts` (shared between stdio and HTTP)

### v1.1.0

- New tool `bcb_variacao` for percentage variation calculation
- New tool `bcb_comparar` for comparing multiple series
- 30-second timeout on requests
- Auto-retry with exponential backoff (3 attempts)
- Normalized search (accent-insensitive)
- Additional statistics (max, min, average, range)

### v1.0.0

- Initial release
- 6 basic tools
- Catalog with 135 verified series

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes (`git commit -m 'Add new feature'`)
4. Push to the branch (`git push origin feature/new-feature`)
5. Open a Pull Request

## License

MIT - see [LICENSE](LICENSE) for details.

## Author

**Sidney da Silva Pereira Bissoli**

- GitHub: [@SidneyBissoli](https://github.com/SidneyBissoli)
- Email: sbissoli76@gmail.com

## Useful Links

- [BCB SGS Portal](https://www3.bcb.gov.br/sgspub/)
- [BCB Open Data](https://dadosabertos.bcb.gov.br/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP Registry](https://registry.modelcontextprotocol.io/)
- [Smithery: bcb-br-mcp](https://smithery.ai/servers/sidneybissoli/bcb-br-mcp)
- [npm: bcb-br-mcp](https://www.npmjs.com/package/bcb-br-mcp)
