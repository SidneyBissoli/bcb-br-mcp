# BCB BR MCP Server

[![npm version](https://badge.fury.io/js/bcb-br-mcp.svg)](https://www.npmjs.com/package/bcb-br-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Servidor MCP (Model Context Protocol) para acesso às séries temporais do Banco Central do Brasil (SGS/BCB).

Permite consultar indicadores econômicos e financeiros como **Selic**, **IPCA**, **câmbio**, **PIB**, entre outros, diretamente em assistentes de IA como Claude.

## Funcionalidades

- **Consulta de séries históricas** - Busca valores de séries por código com filtro de datas
- **Últimos valores** - Obtém os N valores mais recentes de uma série
- **Metadados** - Informações detalhadas sobre séries (periodicidade, fonte, etc.)
- **Catálogo de séries populares** - Lista de 150+ indicadores econômicos organizados em 12 categorias
- **Busca inteligente** - Encontra séries por termo de busca (com ou sem acentos)
- **Indicadores atuais** - Valores mais recentes dos principais indicadores econômicos
- **Cálculo de variação** - Variação percentual entre períodos com estatísticas
- **Comparação de séries** - Compara múltiplas séries no mesmo período

## Ferramentas Disponíveis

| Ferramenta | Descrição |
|------------|-----------|
| `bcb_serie_valores` | Consulta valores de uma série por código e período |
| `bcb_serie_ultimos` | Obtém os últimos N valores de uma série |
| `bcb_serie_metadados` | Retorna informações/metadados de uma série |
| `bcb_series_populares` | Lista séries populares agrupadas por categoria |
| `bcb_buscar_serie` | Busca séries por nome ou descrição (aceita termos sem acento) |
| `bcb_indicadores_atuais` | Valores mais recentes: Selic, IPCA, Dólar, IBC-Br |
| `bcb_variacao` | Calcula variação percentual entre duas datas ou últimos N períodos |
| `bcb_comparar` | Compara 2 a 5 séries no mesmo período com ranking |

## Instalação

### Claude Desktop

Adicione ao arquivo de configuração do Claude Desktop:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

#### Opção 1: Via npx (recomendado)

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

#### Opção 2: Instalação global

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

## Exemplos de Uso

### Consultar a Selic atual

```
Qual a taxa Selic atual?
→ Usa bcb_indicadores_atuais
```

### Histórico do IPCA em 2024

```
Mostre o IPCA mensal de 2024
→ Usa bcb_serie_valores com código 433, dataInicial 2024-01-01, dataFinal 2024-12-31
```

### Listar indicadores de inflação

```
Quais séries de inflação estão disponíveis?
→ Usa bcb_series_populares com categoria "Inflação"
```

### Buscar séries sobre dólar

```
Busque séries relacionadas ao dólar
→ Usa bcb_buscar_serie com termo "dolar" (funciona mesmo sem acento)
```

### Calcular variação do dólar

```
Qual foi a variação do dólar nos últimos 12 meses?
→ Usa bcb_variacao com código 1 e periodos 12
```

### Comparar IPCA, IGP-M e INPC

```
Compare IPCA, IGP-M e INPC em 2024
→ Usa bcb_comparar com códigos [433, 189, 188], dataInicial 2024-01-01, dataFinal 2024-12-31
```

## Catálogo de Séries (150+)

O servidor inclui um catálogo com mais de 150 séries organizadas em 12 categorias.

### Juros e Taxas

| Código | Descrição |
|--------|-----------|
| 11 | Taxa Selic acumulada no mês |
| 432 | Taxa Selic anualizada base 252 |
| 1178 | Taxa Selic - Meta definida pelo Copom |
| 12 | CDI diária |
| 4389 | CDI anualizada base 252 |
| 226 | Taxa Referencial (TR) - diária |
| 256 | Taxa de Juros de Longo Prazo (TJLP) |

### Inflação (30+ séries)

| Código | Descrição |
|--------|-----------|
| 433 | IPCA - Variação mensal |
| 13522 | IPCA - Acumulado 12 meses |
| 7478 | IPCA-15 - Variação mensal |
| 188 | INPC - Variação mensal |
| 189 | IGP-M - Variação mensal |
| 190 | IGP-DI - Variação mensal |
| 7447 | IGP-10 - Variação mensal |
| 10841-10850 | IPCA por grupo (Alimentação, Habitação, Transportes, etc.) |
| 4449 | IPCA - Preços administrados |
| 11428 | IPCA - Preços livres |
| 16121-16122 | IPCA - Núcleos |

### Câmbio (15+ séries)

| Código | Descrição |
|--------|-----------|
| 1 | Dólar americano (venda) |
| 10813 | Dólar americano (compra) |
| 3698/3697 | Dólar PTAX (venda/compra) |
| 21619/21620 | Euro (venda/compra) |
| 21623/21624 | Libra Esterlina (venda/compra) |
| 21621/21622 | Iene (venda/compra) |
| 21637/21638 | Peso Argentino (venda/compra) |
| 21639/21640 | Yuan Chinês (venda/compra) |

### Atividade Econômica (25+ séries)

| Código | Descrição |
|--------|-----------|
| 4380 | PIB mensal (R$ milhões) |
| 4382 | PIB acumulado 12 meses (R$ milhões) |
| 4385 | PIB mensal em US$ |
| 7324 | PIB anual em US$ |
| 24363/24364 | IBC-Br (sem/com ajuste sazonal) |
| 29601-29606 | IBC-Br setorial (Agropecuária, Indústria, Serviços) |
| 22099 | PIB trimestral - Taxa de variação |
| 21859 | Produção industrial - Variação mensal |
| 21862 | Utilização da capacidade instalada |

### Emprego (10+ séries)

| Código | Descrição |
|--------|-----------|
| 24369 | Taxa de desocupação - PNAD Contínua |
| 24370 | Taxa de participação na força de trabalho |
| 24380 | Rendimento médio real |
| 24381 | Massa de rendimento real |
| 28561 | CAGED - Saldo de empregos formais |

### Fiscal (10+ séries)

| Código | Descrição |
|--------|-----------|
| 4503 | Dívida líquida do setor público (% PIB) |
| 4513 | Dívida bruta do governo geral (% PIB) |
| 4537 | Resultado primário (% PIB) |
| 4539 | Resultado nominal (% PIB) |
| 5364 | Receita total do governo central |

### Setor Externo (15+ séries)

| Código | Descrição |
|--------|-----------|
| 3546 | Reservas internacionais - diário |
| 22707 | Balança comercial - Saldo mensal |
| 22708 | Exportação de bens - mensal |
| 22709 | Importação de bens - mensal |
| 22701 | Transações correntes - Saldo |
| 22846 | Investimento direto no país |
| 13690 | Dívida externa total |

### Crédito (30+ séries)

| Código | Descrição |
|--------|-----------|
| 20539 | Saldo de crédito - Total |
| 20540/20541 | Saldo de crédito - PF/PJ |
| 20714 | Taxa média de juros - Total |
| 20749 | Taxa média - Aquisição de veículos |
| 20772 | Taxa média - Financiamento imobiliário |
| 20783 | Spread médio - Total |
| 21082 | Inadimplência - Total |
| 21128/21129 | Inadimplência - Cartão de crédito |

### Agregados Monetários

| Código | Descrição |
|--------|-----------|
| 1788 | Base monetária |
| 27788-27791 | Meios de pagamento M1, M2, M3, M4 |
| 27815 | Multiplicador monetário |

### Poupança

| Código | Descrição |
|--------|-----------|
| 25 | Poupança - Rendimento mensal |
| 195 | Poupança - Saldo total |
| 7165 | Poupança - Captação líquida |

### Índices de Mercado

| Código | Descrição |
|--------|-----------|
| 12466 | IMA-B |
| 12467 | IMA-B5 |
| 12468 | IMA-B5+ |
| 7832 | Ibovespa mensal |

### Expectativas (Focus)

| Código | Descrição |
|--------|-----------|
| 29033/29034 | Expectativa IPCA (ano corrente/próximo) |
| 29035/29036 | Expectativa Selic (ano corrente/próximo) |
| 29037/29038 | Expectativa PIB (ano corrente/próximo) |
| 29039/29040 | Expectativa Câmbio (ano corrente/próximo) |

## Encontrar Outras Séries

O SGS possui mais de 18.000 séries temporais. Para encontrar o código de outras séries:

1. Acesse o [Portal SGS do BCB](https://www3.bcb.gov.br/sgspub/)
2. Use a busca para encontrar a série desejada
3. Anote o código da série
4. Use esse código nas ferramentas deste servidor

## Características Técnicas

### Robustez

- **Timeout**: 30 segundos por requisição (evita travamentos)
- **Retry automático**: 3 tentativas com backoff exponencial (1s, 2s, 4s)
- **Tratamento de erros**: Mensagens claras em português

### Busca Inteligente

A ferramenta `bcb_buscar_serie` normaliza os termos de busca, permitindo encontrar séries mesmo sem acentos:

- `"inflacao"` → encontra "Inflação"
- `"cambio"` → encontra "Câmbio"
- `"credito"` → encontra "Crédito"

## Desenvolvimento

### Requisitos

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

### Teste local

```bash
npm run dev
```

Ou use o MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npm run dev
```

## API do BCB

Este servidor utiliza a API pública do Banco Central do Brasil:

- **Endpoint base:** `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados`
- **Formato:** JSON
- **Autenticação:** Nenhuma (API pública)
- **Documentação:** [Dados Abertos BCB](https://dadosabertos.bcb.gov.br/)

## Changelog

### v1.1.0

- ✨ Nova ferramenta `bcb_variacao` para cálculo de variação percentual
- ✨ Nova ferramenta `bcb_comparar` para comparação de múltiplas séries
- 🔧 Timeout de 30 segundos nas requisições
- 🔧 Retry automático com backoff exponencial (3 tentativas)
- 🔧 Busca normalizada (aceita termos sem acentos)
- 📊 Estatísticas adicionais (máximo, mínimo, média, amplitude)

### v1.0.0

- 🎉 Lançamento inicial
- 6 ferramentas básicas
- Catálogo com 150+ séries

## Contribuição

Contribuições são bem-vindas! Por favor:

1. Faça um fork do repositório
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## Licença

MIT - veja [LICENSE](LICENSE) para detalhes.

## Autor

**Sidney Bissoli**

- GitHub: [@SidneyBissoli](https://github.com/SidneyBissoli)
- Email: sbissoli76@gmail.com

## Links Úteis

- [Portal SGS BCB](https://www3.bcb.gov.br/sgspub/)
- [Dados Abertos BCB](https://dadosabertos.bcb.gov.br/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP Registry](https://registry.modelcontextprotocol.io/)
- [npm: bcb-br-mcp](https://www.npmjs.com/package/bcb-br-mcp)
