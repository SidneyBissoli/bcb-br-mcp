# BCB BR MCP Server

[![npm version](https://badge.fury.io/js/bcb-br-mcp.svg)](https://www.npmjs.com/package/bcb-br-mcp)
[![npm downloads](https://img.shields.io/npm/dm/bcb-br-mcp.svg)](https://www.npmjs.com/package/bcb-br-mcp)
[![Smithery](https://img.shields.io/badge/Smithery-bcb--br--mcp-orange)](https://smithery.ai/server/@sidneybissoli/bcb-br-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![LobeHub](https://lobehub.com/badge/mcp/sidneybissoli-bcb-br-mcp)](https://lobehub.com/mcp/sidneybissoli-bcb-br-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Leia em Português](README.pt-BR.md)

MCP (Model Context Protocol) server for accessing the Brazilian Central Bank's time series data (SGS/BCB).

Query economic and financial indicators such as **Selic** (interest rate), **IPCA** (inflation), **exchange rates**, **GDP**, and more, directly from AI assistants like Claude.

## Features

- **Historical data** - Query time series values by code with date filters
- **Latest values** - Get the most recent N values of any series
- **Metadata** - Detailed information about series (frequency, source, etc.)
- **Popular series catalog** - 150+ economic indicators organized in 12 categories
- **Smart search** - Find series by keyword (accent-insensitive)
- **Current indicators** - Latest values for key economic indicators
- **Variation calculation** - Percentage change between periods with statistics
- **Series comparison** - Compare multiple series over the same period

## Available Tools

| Tool | Description |
|------|-------------|
| `bcb_serie_valores` | Query series values by code and date range |
| `bcb_serie_ultimos` | Get the last N values of a series |
| `bcb_serie_metadados` | Get series metadata (name, frequency, source) |
| `bcb_series_populares` | List popular series grouped by category |
| `bcb_buscar_serie` | Search series by name or description (accent-insensitive) |
| `bcb_indicadores_atuais` | Latest values: Selic, IPCA, USD/BRL, IBC-Br |
| `bcb_variacao` | Calculate percentage variation between dates or last N periods |
| `bcb_comparar` | Compare 2 to 5 series over the same period with ranking |

## Installation

### Via Smithery (recommended)

Visit [bcb-br-mcp on Smithery](https://smithery.ai/server/@sidneybissoli/bcb-br-mcp) and follow the installation instructions for your MCP client.

### Via URL (Claude.ai, Claude Desktop, any MCP client)

Use the HTTP endpoint directly, no installation required:

```
https://bcb.sidneybissoli.workers.dev
```

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

## Series Catalog (150+)

The server includes a catalog of 150+ series organized in 12 categories.

### Interest Rates

| Code | Description |
|------|-------------|
| 11 | Selic rate - monthly accumulated |
| 432 | Selic rate - annualized (base 252) |
| 1178 | Selic target rate (Copom) |
| 12 | CDI daily rate |
| 4389 | CDI annualized (base 252) |
| 226 | Reference Rate (TR) - daily |
| 256 | Long-Term Interest Rate (TJLP) |

### Inflation (30+ series)

| Code | Description |
|------|-------------|
| 433 | IPCA - Monthly change |
| 13522 | IPCA - 12-month accumulated |
| 7478 | IPCA-15 - Monthly change |
| 188 | INPC - Monthly change |
| 189 | IGP-M - Monthly change |
| 190 | IGP-DI - Monthly change |
| 7447 | IGP-10 - Monthly change |
| 10841-10850 | IPCA by group (Food, Housing, Transportation, etc.) |
| 4449 | IPCA - Administered prices |
| 11428 | IPCA - Market prices |
| 16121-16122 | IPCA - Core measures |

### Exchange Rates (15+ series)

| Code | Description |
|------|-------------|
| 1 | USD/BRL - US Dollar (sell) |
| 10813 | USD/BRL - US Dollar (buy) |
| 3698/3697 | USD/BRL PTAX (sell/buy) |
| 21619/21620 | EUR/BRL - Euro (sell/buy) |
| 21623/21624 | GBP/BRL - British Pound (sell/buy) |
| 21621/21622 | JPY/BRL - Japanese Yen (sell/buy) |
| 21637/21638 | ARS/BRL - Argentine Peso (sell/buy) |
| 21639/21640 | CNY/BRL - Chinese Yuan (sell/buy) |

### Economic Activity (25+ series)

| Code | Description |
|------|-------------|
| 4380 | Monthly GDP (R$ millions) |
| 4382 | GDP - 12-month accumulated (R$ millions) |
| 4385 | Monthly GDP in USD |
| 7324 | Annual GDP in USD |
| 24363/24364 | IBC-Br Economic Activity Index (unadjusted/seasonally adjusted) |
| 29601-29606 | IBC-Br by sector (Agriculture, Industry, Services) |
| 22099 | Quarterly GDP - Rate of change |
| 21859 | Industrial production - Monthly change |
| 21862 | Installed capacity utilization |

### Employment (10+ series)

| Code | Description |
|------|-------------|
| 24369 | Unemployment rate - PNAD |
| 24370 | Labor force participation rate |
| 24380 | Average real income |
| 24381 | Real income mass |
| 28561 | CAGED - Formal job creation |

### Fiscal (10+ series)

| Code | Description |
|------|-------------|
| 4503 | Net public sector debt (% GDP) |
| 4513 | General government gross debt (% GDP) |
| 4537 | Primary balance (% GDP) |
| 4539 | Nominal balance (% GDP) |
| 5364 | Central government total revenue |

### External Sector (15+ series)

| Code | Description |
|------|-------------|
| 3546 | International reserves - daily |
| 22707 | Trade balance - Monthly |
| 22708 | Exports - Monthly |
| 22709 | Imports - Monthly |
| 22701 | Current account - Balance |
| 22846 | Foreign direct investment |
| 13690 | Total external debt |

### Credit (30+ series)

| Code | Description |
|------|-------------|
| 20539 | Total credit balance |
| 20540/20541 | Credit balance - Individuals/Corporations |
| 20714 | Average interest rate - Total |
| 20749 | Average rate - Vehicle financing |
| 20772 | Average rate - Mortgage |
| 20783 | Average spread - Total |
| 21082 | Default rate - Total |
| 21128/21129 | Default rate - Credit card |

### Monetary Aggregates

| Code | Description |
|------|-------------|
| 1788 | Monetary base |
| 27788-27791 | Money supply M1, M2, M3, M4 |
| 27815 | Money multiplier |

### Savings

| Code | Description |
|------|-------------|
| 25 | Savings - Monthly yield |
| 195 | Savings - Total balance |
| 7165 | Savings - Net deposits |

### Market Indices

| Code | Description |
|------|-------------|
| 12466 | IMA-B |
| 12467 | IMA-B5 |
| 12468 | IMA-B5+ |
| 7832 | Ibovespa - Monthly |

### Expectations (Focus Survey)

| Code | Description |
|------|-------------|
| 29033/29034 | IPCA expectation (current/next year) |
| 29035/29036 | Selic expectation (current/next year) |
| 29037/29038 | GDP expectation (current/next year) |
| 29039/29040 | Exchange rate expectation (current/next year) |

## Finding Other Series

The SGS database contains over 18,000 time series. To find codes for other series:

1. Visit the [BCB SGS Portal](https://www3.bcb.gov.br/sgspub/)
2. Search for the desired series
3. Note the series code
4. Use that code with this server's tools

## Technical Details

### Robustness

- **Timeout**: 30 seconds per request (prevents hanging)
- **Auto-retry**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Error handling**: Clear error messages

### Smart Search

The `bcb_buscar_serie` tool normalizes search terms, allowing you to find series even without Portuguese accents:

- `"inflacao"` → finds "Inflação"
- `"cambio"` → finds "Câmbio"
- `"credito"` → finds "Crédito"

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
- Catalog with 150+ series

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
- [Smithery: bcb-br-mcp](https://smithery.ai/server/@sidneybissoli/bcb-br-mcp)
- [npm: bcb-br-mcp](https://www.npmjs.com/package/bcb-br-mcp)
