# Banco Central do Brasil (BCB) - MCP

[![npm version](https://img.shields.io/npm/v/bcb-br-mcp.svg)](https://www.npmjs.com/package/bcb-br-mcp)
[![npm downloads](https://img.shields.io/npm/dm/bcb-br-mcp.svg)](https://www.npmjs.com/package/bcb-br-mcp)
[![node](https://img.shields.io/node/v/bcb-br-mcp)](https://www.npmjs.com/package/bcb-br-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![LobeHub](https://lobehub.com/badge/mcp/sidneybissoli-bcb-br-mcp)](https://lobehub.com/mcp/sidneybissoli-bcb-br-mcp)
[![smithery badge](https://smithery.ai/badge/sidneybissoli/bcb-br-mcp)](https://smithery.ai/servers/sidneybissoli/bcb-br-mcp)
[![GitHub stars](https://img.shields.io/github/stars/SidneyBissoli/bcb-br-mcp?style=flat&logo=github)](https://github.com/SidneyBissoli/bcb-br-mcp)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/SidneyBissoli?logo=githubsponsors&label=Sponsor&color=db61a2)](https://github.com/sponsors/SidneyBissoli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Read in English](README.md)

Servidor MCP (Model Context Protocol) para acesso às séries temporais do Banco Central do Brasil (SGS/BCB).

Permite consultar indicadores econômicos e financeiros como **Selic**, **IPCA**, **câmbio**, **PIB**, entre outros, diretamente em assistentes de IA como Claude.

> Se você achou este projeto útil, considere dar uma [estrela no GitHub](https://github.com/SidneyBissoli/bcb-br-mcp). Isso ajuda outras pessoas a descobrirem o projeto!

**Capacidades:** 8 ferramentas (skills) · 3 recursos · 3 prompts — tudo o que um cliente MCP precisa para consultar a API de séries temporais do BCB (SGS).

## Veja na prática

Pergunte ao seu assistente, em português:

- *"Qual a taxa Selic atual?"* → `bcb_indicadores_atuais`
- *"Mostre o IPCA mês a mês em 2024."* → `bcb_serie_valores`
- *"Qual foi a variação do dólar nos últimos 12 meses?"* → `bcb_variacao`

As respostas vêm ao vivo da API SGS do Banco Central — valores exatos com procedência, não números chutados do treino.

## Funcionalidades

- **Consulta de séries históricas** - Busca valores de séries por código com filtro de datas
- **Últimos valores** - Obtém os N valores mais recentes de uma série
- **Metadados** - Informações detalhadas sobre séries (periodicidade, fonte, etc.)
- **Catálogo de séries populares** - 139 indicadores econômicos verificados contra a origem, organizados por categoria
- **Busca inteligente** - Encontra séries por termo de busca (com ou sem acentos)
- **Indicadores atuais** - Valores mais recentes dos principais indicadores econômicos
- **Períodos longos resolvidos** - A API do BCB limita séries diárias a uma janela
  de 10 anos (HTTP 406) e recusa janela aberta; a consulta é fatiada, buscada e
  fundida automaticamente, então pedir 15 anos de série diária simplesmente funciona
- **Harmonização de frequências** - Reamostra a série para mensal, trimestral ou
  anual com convenção explícita, inclusive composição geométrica para séries que já
  são variação percentual (IPCA mensal virando IPCA anual)
- **Cálculo de variação** - Variação percentual entre períodos com estatísticas
- **Comparação de séries** - Compara múltiplas séries no mesmo período, com aviso
  quando as periodicidades diferem

## Ferramentas Disponíveis

| Ferramenta | Descrição |
|------------|-----------|
| `bcb_serie_valores` | Consulta valores de uma série por código e período; fatia janelas longas automaticamente e pode harmonizar a série para uma frequência mais grossa |
| `bcb_serie_ultimos` | Obtém os últimos N valores de uma série (qualquer N — o teto de 20 da origem é contornado) |
| `bcb_serie_metadados` | Retorna nome, periodicidade, categoria e último valor de uma série |
| `bcb_series_populares` | Lista séries populares agrupadas por categoria |
| `bcb_buscar_serie` | Busca séries por nome ou descrição (aceita termos sem acento) |
| `bcb_indicadores_atuais` | Valores mais recentes: Selic, IPCA, Dólar, IBC-Br |
| `bcb_variacao` | Calcula variação percentual entre duas datas ou últimos N períodos |
| `bcb_comparar` | Compara 2 a 5 séries no mesmo período com ranking |

## Recursos

Catálogos de referência que o servidor expõe como **recursos** MCP (dados contextuais de leitura que os clientes podem anexar):

| URI | Descrição |
|-----|-----------|
| `bcb://series/populares` | Catálogo de 139 séries econômicas do BCB verificadas contra a origem, organizadas por categoria (JSON) |
| `bcb://series/categorias` | Lista de categorias disponíveis no catálogo de séries (JSON) |
| `bcb://series/principais` | Códigos dos indicadores mais usados — Selic, IPCA, Dólar, PIB, etc. (JSON) |

## Prompts

Modelos prontos que o servidor fornece como **prompts** MCP:

| Prompt | Descrição |
|--------|-----------|
| `indicadores_atuais` | Consulta os principais indicadores econômicos do Brasil (Selic, IPCA, Dólar, IBC-Br) |
| `panorama_economico` | Gera um panorama completo da economia brasileira |
| `comparar_inflacao` | Compara os principais índices de inflação (IPCA, IGP-M, INPC) nos últimos 12 meses |

## Instalação

### Via Smithery (recomendado)

Acesse [bcb-br-mcp no Smithery](https://smithery.ai/servers/sidneybissoli/bcb-br-mcp) e siga as instruções de instalação para o seu cliente MCP.

### Via URL (Claude.ai, Claude Desktop, qualquer cliente MCP)

Use o endpoint HTTP diretamente, sem instalar nada:

```
https://bcb.sidneybissoli.workers.dev
```

### Via npx (Claude Desktop)

Adicione ao arquivo de configuração do Claude Desktop:

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

### Via instalação global

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

## Catálogo de Séries (139)

O catálogo curado tem **139 séries, cada uma verificada contra a origem** em 13/08/2026.

O campo `fonteNome` de cada entrada diz de onde vem o nome dela:

- **`portal`** (82 séries) — o nome é transcrito do dataset da série no Portal de Dados
  Abertos do BCB, e `unidade` traz a unidade de medida publicada.
- **`medido`** (57 séries) — a série não tem dataset no portal, então o nome é herdado;
  o que foi verificado contra a origem é a periodicidade e a ordem de grandeza.

A periodicidade é sempre a **medida** (pelo espaçamento entre observações), nunca um rótulo
herdado. Expectativas de mercado **não** estão aqui — use `bcb_focus_expectativas`.

### Juros (14)

| Código | Nome | Periodicidade | Fonte do nome |
|--------|------|---------------|---------------|
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

| Código | Nome | Periodicidade | Fonte do nome |
|--------|------|---------------|---------------|
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

| Código | Nome | Periodicidade | Fonte do nome |
|--------|------|---------------|---------------|
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

| Código | Nome | Periodicidade | Fonte do nome |
|--------|------|---------------|---------------|
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

| Código | Nome | Periodicidade | Fonte do nome |
|--------|------|---------------|---------------|
| 24369 | Taxa de desocupação - PNAD Contínua | Mensal | `medido` |
| 24380 | Rendimento médio real habitual - Todos os trabalhos | Mensal | `medido` |
| 24381 | Massa de rendimento real habitual | Mensal | `medido` |
| 28561 | CAGED - Saldo de empregos formais | Mensal | `medido` |

### Fiscal (7)

| Código | Nome | Periodicidade | Fonte do nome |
|--------|------|---------------|---------------|
| 4503 | Dívida Líquida do Setor Público (% PIB) - Total - Governo Federal e Banco Central | Mensal | `portal` |
| 4513 | Dívida Líquida do Setor Público (% PIB) - Total - Setor público consolidado | Mensal | `portal` |
| 4505 | Dívida Líquida do Setor Público (% PIB) - Total - Banco Central | Mensal | `portal` |
| 4536 | Dívida líquida do governo geral (% PIB) | Mensal | `portal` |
| 4537 | Dívida bruta do governo geral (% PIB) - Metodologia utilizada até 2007 | Mensal | `portal` |
| 5364 | Receita total do governo central | Mensal | `medido` |
| 5793 | NFSP sem desvalorização cambial (% PIB) - Fluxo acumulado em 12 meses - Resultado primário - Total - Setor público consolidado | Mensal | `portal` |

### Setor Externo (12)

| Código | Nome | Periodicidade | Fonte do nome |
|--------|------|---------------|---------------|
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

| Código | Nome | Periodicidade | Fonte do nome |
|--------|------|---------------|---------------|
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

| Código | Nome | Periodicidade | Fonte do nome |
|--------|------|---------------|---------------|
| 1788 | BM - Base monetária restrita (saldo em final de período) | Mensal | `portal` |
| 1833 | Base Monetária Ampliada (saldo em final de período) | Mensal | `portal` |
| 27788 | Meios de pagamento - M1 (média dos dias úteis do mês) - Novo | Mensal | `portal` |
| 27789 | Meios de pagamento - Papel moeda em poder do público (saldo em final de período) - Novo | Mensal | `portal` |
| 27790 | Meios de pagamento - Depósitos à vista (saldo em final de período) - Novo | Mensal | `portal` |
| 27791 | Meios de pagamento - M1 (saldo em final de período) - Novo | Mensal | `portal` |
| 27815 | Meios de pagamento amplos - M4 (saldo em final de periodo) - Novo | Mensal | `portal` |
| 7530 | Comportamento monetário - Comportamento do público - C | Mensal | `portal` |

### Poupança (2)

| Código | Nome | Periodicidade | Fonte do nome |
|--------|------|---------------|---------------|
| 25 | Depósitos de poupança até 03.05.2012 - Rentabilidade no período | Diária | `portal` |
| 195 | Depósitos de poupança a partir de 04.05.2012 - Rentabilidade no período | Diária | `portal` |


O catálogo completo, legível por máquina, é servido no recurso `bcb://series/populares` e pela
`bcb_series_populares`. Milhares de outras séries são alcançáveis pela `bcb_buscar_serie`, que
também consulta o índice do Portal de Dados Abertos do BCB.

## Encontrar Outras Séries

O SGS possui mais de 18.000 séries temporais. Para encontrar o código de outras séries:

1. Acesse o [Portal SGS do BCB](https://www3.bcb.gov.br/sgspub/)
2. Use a busca para encontrar a série desejada
3. Anote o código da série
4. Use esse código nas ferramentas deste servidor

## Características Técnicas

### Robustez

- **Timeout**: 30 segundos por requisição (evita travamentos)
- **Retry automático**: 3 tentativas com backoff exponencial (1s, 2s, 4s) em falha
  transitória; erro de cliente (4xx) não é repetido, porque é determinístico
- **Tratamento de erros**: Mensagens claras em português

### Contornando os limites do SGS

Tudo abaixo foi **medido** contra a API ao vivo, não inferido da documentação:

- Uma **janela maior que 10 anos em série diária** é recusada com HTTP **406**, e
  janela aberta (sem `dataInicial`, ou sem data nenhuma) também. O limite vale sobre
  a janela *implícita*: sem `dataFinal`, a API assume hoje. A consulta é fatiada em
  janelas de até **3 anos**, buscada com concorrência limitada e fundida em ordem de
  data sem duplicar as emendas; a resposta informa isso em `chunking`. A fatia é de
  3 anos, e não dos 10 permitidos, porque uma janela diária decenal custa 10–20 s na
  origem e pode ser cortada por volta de 30 s.
- **`dados/ultimos/N` tem teto de 20** na API, em qualquer periodicidade. Acima de
  20, o servidor infere a periodicidade da série e busca por janela de datas.
- **Não existe endpoint de metadados por série** (`/metadados` responde 404). A
  periodicidade é inferida do espaçamento das observações e marcada com
  `periodicidadeInferida`; unidade de medida não está disponível em fonte nenhuma.

### Valores derivados

Todo número que este servidor calcula — variação, estatísticas descritivas, série
harmonizada — vem marcado com `derived: true` e uma nota com as convenções usadas.
A estatística é do [`@sbissoli/mcp-stats`](https://www.npmjs.com/package/@sbissoli/mcp-stats).
Valor publicado pelo BCB sai sempre verbatim; só o que é calculado é arredondado
(em 4 casas).

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

### v1.2.0

- Endpoint HTTP via Cloudflare Workers (`https://bcb.sidneybissoli.workers.dev`)
- Publicado no Smithery.ai
- Refatoração: lógica das tools extraída para `src/tools.ts` (compartilhada entre stdio e HTTP)

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
- Catálogo com 139 séries verificadas

## Contribuição

Contribuições são bem-vindas! Por favor:

1. Faça um fork do repositório
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## Licença

**Duas licenças, e elas não são a mesma coisa.**

- **Código:** MIT — veja [LICENSE](LICENSE).
- **Dados:** do Banco Central do Brasil, sob **Open Data Commons Open Database
  License (ODbL) v1.0** — https://opendatacommons.org/licenses/odbl/1-0/.
  Não é CC0, não é CC BY, não é domínio público: a ODbL exige **atribuição**,
  tem **share-alike** sobre bases derivadas e cláusula **anti-DRM**.

Toda resposta de sucesso carrega um bloco de proveniência com fonte, URL da
consulta, competência do dado, instante real da extração e licença. As respostas
de câmbio repassam o disclaimer do BCB literalmente, e as paridades de moedas
não-dólar são qualificadas como dado de agência de informação (Refinitiv)
redistribuído pelo BCB — não como dado apurado pelo Banco Central.

Detalhes e obrigações em [NOTICE.md](NOTICE.md).

## Autor

**Sidney da Silva Pereira Bissoli**

- GitHub: [@SidneyBissoli](https://github.com/SidneyBissoli)
- Email: sbissoli76@gmail.com

## Links Úteis

- [Portal SGS BCB](https://www3.bcb.gov.br/sgspub/)
- [Dados Abertos BCB](https://dadosabertos.bcb.gov.br/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP Registry](https://registry.modelcontextprotocol.io/)
- [Smithery: bcb-br-mcp](https://smithery.ai/servers/sidneybissoli/bcb-br-mcp)
- [npm: bcb-br-mcp](https://www.npmjs.com/package/bcb-br-mcp)
