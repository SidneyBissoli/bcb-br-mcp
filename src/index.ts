#!/usr/bin/env node

/**
 * BCB BR MCP Server
 * MCP Server for Brazilian Central Bank Time Series (SGS/BCB)
 *
 * Author: Sidney Bissoli
 * License: MIT
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// API Base URL
const BCB_API_BASE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";

// Popular series catalog - Expanded with 100+ series
const SERIES_POPULARES = [
  // ==================== JUROS E TAXAS ====================
  // Selic
  { codigo: 11, nome: "Taxa de juros - Selic acumulada no mês", categoria: "Juros", periodicidade: "Mensal" },
  { codigo: 432, nome: "Taxa de juros - Selic anualizada base 252", categoria: "Juros", periodicidade: "Diária" },
  { codigo: 1178, nome: "Taxa de juros - Selic - Meta definida pelo Copom", categoria: "Juros", periodicidade: "Diária" },
  { codigo: 4189, nome: "Taxa de juros - Selic acumulada no mês anualizada", categoria: "Juros", periodicidade: "Mensal" },
  { codigo: 4390, nome: "Taxa de juros - Selic mensal", categoria: "Juros", periodicidade: "Mensal" },

  // CDI
  { codigo: 12, nome: "Taxa de juros - CDI diária", categoria: "Juros", periodicidade: "Diária" },
  { codigo: 4389, nome: "Taxa de juros - CDI anualizada base 252", categoria: "Juros", periodicidade: "Diária" },
  { codigo: 4391, nome: "Taxa de juros - CDI acumulada no mês", categoria: "Juros", periodicidade: "Mensal" },
  { codigo: 4392, nome: "Taxa de juros - CDI acumulada no mês anualizada", categoria: "Juros", periodicidade: "Mensal" },

  // TR e TJLP
  { codigo: 226, nome: "Taxa Referencial (TR) - diária", categoria: "Juros", periodicidade: "Diária" },
  { codigo: 7811, nome: "Taxa Referencial (TR) - mensal", categoria: "Juros", periodicidade: "Mensal" },
  { codigo: 7812, nome: "Taxa Referencial (TR) - anualizada", categoria: "Juros", periodicidade: "Mensal" },
  { codigo: 256, nome: "Taxa de Juros de Longo Prazo (TJLP)", categoria: "Juros", periodicidade: "Mensal" },

  // Outras taxas de juros
  { codigo: 253, nome: "Taxa de juros - CDB pré-fixado - 30 dias", categoria: "Juros", periodicidade: "Diária" },
  { codigo: 14, nome: "Taxa de juros - Poupança", categoria: "Juros", periodicidade: "Mensal" },

  // ==================== INFLAÇÃO ====================
  // IPCA
  { codigo: 433, nome: "IPCA - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 13522, nome: "IPCA - Variação acumulada em 12 meses", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7478, nome: "IPCA-15 - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7479, nome: "IPCA-15 - Variação acumulada em 12 meses", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 10764, nome: "IPCA-E - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 16121, nome: "IPCA - Núcleo por exclusão - EX0", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 16122, nome: "IPCA - Núcleo de dupla ponderação", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 11426, nome: "IPCA - Núcleo de médias aparadas com suavização", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 11427, nome: "IPCA - Núcleo de médias aparadas sem suavização", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 10841, nome: "IPCA - Alimentação e bebidas", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 10842, nome: "IPCA - Habitação", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 10843, nome: "IPCA - Artigos de residência", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 10844, nome: "IPCA - Serviços", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 10845, nome: "IPCA - Vestuário", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 10846, nome: "IPCA - Transportes", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 10847, nome: "IPCA - Saúde e cuidados pessoais", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 10848, nome: "IPCA - Despesas pessoais", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 10849, nome: "IPCA - Educação", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 10850, nome: "IPCA - Comunicação", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 4449, nome: "IPCA - Preços administrados", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 11428, nome: "IPCA - Preços livres", categoria: "Inflação", periodicidade: "Mensal" },

  // INPC
  { codigo: 188, nome: "INPC - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 13523, nome: "INPC - Variação acumulada em 12 meses", categoria: "Inflação", periodicidade: "Mensal" },

  // IGP
  { codigo: 189, nome: "IGP-M - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7447, nome: "IGP-10 - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7448, nome: "IGP-M - 1ª prévia", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7449, nome: "IGP-M - 2ª prévia", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 190, nome: "IGP-DI - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7450, nome: "IPA-M - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 225, nome: "IPA-DI - Geral - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7459, nome: "IPA-DI - Produtos industriais", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7460, nome: "IPA-DI - Produtos agrícolas", categoria: "Inflação", periodicidade: "Mensal" },

  // Outros índices de preços
  { codigo: 191, nome: "IPC-DI - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 193, nome: "IPC-Fipe - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 17679, nome: "IPC-3i - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 17680, nome: "IPC-C1 - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },

  // ==================== CÂMBIO ====================
  // Dólar
  { codigo: 1, nome: "Taxa de câmbio - Livre - Dólar americano (venda)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 10813, nome: "Taxa de câmbio - Livre - Dólar americano (compra)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 3698, nome: "Taxa de câmbio - PTAX - Dólar americano (venda)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 3697, nome: "Taxa de câmbio - PTAX - Dólar americano (compra)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 3695, nome: "Taxa de câmbio - PTAX - Dólar americano (média)", categoria: "Câmbio", periodicidade: "Diária" },

  // Euro
  { codigo: 21619, nome: "Taxa de câmbio - Euro (venda)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 21620, nome: "Taxa de câmbio - Euro (compra)", categoria: "Câmbio", periodicidade: "Diária" },

  // Outras moedas
  { codigo: 21623, nome: "Taxa de câmbio - Libra Esterlina (venda)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 21624, nome: "Taxa de câmbio - Libra Esterlina (compra)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 21621, nome: "Taxa de câmbio - Iene (venda)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 21622, nome: "Taxa de câmbio - Iene (compra)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 21625, nome: "Taxa de câmbio - Franco Suíço (venda)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 21626, nome: "Taxa de câmbio - Franco Suíço (compra)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 21637, nome: "Taxa de câmbio - Peso Argentino (venda)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 21638, nome: "Taxa de câmbio - Peso Argentino (compra)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 21639, nome: "Taxa de câmbio - Yuan Chinês (venda)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 21640, nome: "Taxa de câmbio - Yuan Chinês (compra)", categoria: "Câmbio", periodicidade: "Diária" },

  // ==================== PIB E ATIVIDADE ECONÔMICA ====================
  { codigo: 4380, nome: "PIB mensal - Valores correntes (R$ milhões)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 4381, nome: "PIB acumulado no ano - Valores correntes (R$ milhões)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 4382, nome: "PIB acumulado dos últimos 12 meses - Valores correntes (R$ milhões)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 4385, nome: "PIB mensal em US$ (milhões)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 4386, nome: "PIB acumulado no ano em US$ (milhões)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 7324, nome: "PIB anual em US$ (milhões)", categoria: "Atividade Econômica", periodicidade: "Anual" },

  // IBC-Br
  { codigo: 24363, nome: "IBC-Br - Índice de Atividade Econômica (sem ajuste)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 24364, nome: "IBC-Br - Índice de Atividade Econômica (com ajuste sazonal)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 29601, nome: "IBC-Br - Agropecuária (sem ajuste)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 29602, nome: "IBC-Br - Agropecuária (com ajuste sazonal)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 29603, nome: "IBC-Br - Indústria (sem ajuste)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 29604, nome: "IBC-Br - Indústria (com ajuste sazonal)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 29605, nome: "IBC-Br - Serviços (sem ajuste)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 29606, nome: "IBC-Br - Serviços (com ajuste sazonal)", categoria: "Atividade Econômica", periodicidade: "Mensal" },

  // Contas Nacionais Trimestrais
  { codigo: 22099, nome: "PIB trimestral - Taxa de variação (%)", categoria: "Atividade Econômica", periodicidade: "Trimestral" },
  { codigo: 22103, nome: "Exportação de bens e serviços - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral" },
  { codigo: 22104, nome: "Importação de bens e serviços - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral" },
  { codigo: 22109, nome: "Consumo das famílias - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral" },
  { codigo: 22110, nome: "Consumo do governo - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral" },
  { codigo: 22111, nome: "Formação bruta de capital fixo - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral" },

  // Produção Industrial
  { codigo: 21859, nome: "Produção industrial - Geral - Variação mensal", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 21860, nome: "Produção industrial - Geral - Variação acum. 12 meses", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 21862, nome: "Utilização da capacidade instalada - Indústria", categoria: "Atividade Econômica", periodicidade: "Mensal" },

  // ==================== EMPREGO ====================
  { codigo: 24369, nome: "Taxa de desocupação - PNAD Contínua", categoria: "Emprego", periodicidade: "Mensal" },
  { codigo: 28763, nome: "Taxa de desocupação - PNAD Contínua - Trimestral", categoria: "Emprego", periodicidade: "Trimestral" },
  { codigo: 24370, nome: "Taxa de participação na força de trabalho", categoria: "Emprego", periodicidade: "Mensal" },
  { codigo: 24380, nome: "Rendimento médio real habitual - Todos os trabalhos", categoria: "Emprego", periodicidade: "Mensal" },
  { codigo: 24381, nome: "Massa de rendimento real habitual", categoria: "Emprego", periodicidade: "Mensal" },
  { codigo: 28785, nome: "Pessoal ocupado - Total (milhões)", categoria: "Emprego", periodicidade: "Mensal" },
  { codigo: 28561, nome: "CAGED - Saldo de empregos formais", categoria: "Emprego", periodicidade: "Mensal" },

  // ==================== DÍVIDA PÚBLICA E FISCAL ====================
  { codigo: 4503, nome: "Dívida líquida do setor público (% PIB)", categoria: "Fiscal", periodicidade: "Mensal" },
  { codigo: 4513, nome: "Dívida bruta do governo geral (% PIB)", categoria: "Fiscal", periodicidade: "Mensal" },
  { codigo: 4505, nome: "Dívida líquida do governo federal (% PIB)", categoria: "Fiscal", periodicidade: "Mensal" },
  { codigo: 4536, nome: "Necessidade de financiamento - Setor público (% PIB)", categoria: "Fiscal", periodicidade: "Mensal" },
  { codigo: 4537, nome: "Resultado primário - Setor público (% PIB)", categoria: "Fiscal", periodicidade: "Mensal" },
  { codigo: 4538, nome: "Juros nominais - Setor público (% PIB)", categoria: "Fiscal", periodicidade: "Mensal" },
  { codigo: 4539, nome: "Resultado nominal - Setor público (% PIB)", categoria: "Fiscal", periodicidade: "Mensal" },
  { codigo: 5364, nome: "Receita total do governo central", categoria: "Fiscal", periodicidade: "Mensal" },
  { codigo: 5793, nome: "Despesa total do governo central", categoria: "Fiscal", periodicidade: "Mensal" },

  // ==================== SETOR EXTERNO ====================
  // Reservas Internacionais
  { codigo: 3546, nome: "Reservas internacionais - Conceito liquidez - Total", categoria: "Setor Externo", periodicidade: "Diária" },
  { codigo: 13621, nome: "Reservas internacionais - Conceito liquidez - Mensal", categoria: "Setor Externo", periodicidade: "Mensal" },

  // Balança Comercial
  { codigo: 22707, nome: "Balança comercial - Saldo mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22708, nome: "Exportação de bens - Mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22709, nome: "Importação de bens - Mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22714, nome: "Balança comercial - Saldo acumulado 12 meses (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },

  // Balanço de Pagamentos
  { codigo: 22701, nome: "Transações correntes - Saldo mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22704, nome: "Transações correntes - Saldo acumulado 12 meses (% PIB)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22715, nome: "Serviços - Saldo mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22716, nome: "Renda primária - Saldo mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22846, nome: "Investimento direto no país - Mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22885, nome: "Investimento em carteira - Mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },

  // Dívida Externa
  { codigo: 13690, nome: "Dívida externa total (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },

  // ==================== CRÉDITO ====================
  // Saldo de crédito
  { codigo: 20539, nome: "Saldo da carteira de crédito - Total", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20540, nome: "Saldo da carteira de crédito - Pessoas físicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20541, nome: "Saldo da carteira de crédito - Pessoas jurídicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20542, nome: "Saldo de crédito com recursos livres - Total", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20570, nome: "Saldo de crédito com recursos livres - Pessoas físicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20592, nome: "Saldo de crédito com recursos livres - Pessoas jurídicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20615, nome: "Saldo de crédito com recursos direcionados - Total", categoria: "Crédito", periodicidade: "Mensal" },

  // Concessões de crédito
  { codigo: 20631, nome: "Concessões de crédito - Total", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20665, nome: "Concessões de crédito - Cheque especial - Pessoas físicas", categoria: "Crédito", periodicidade: "Mensal" },

  // Taxa média de juros
  { codigo: 20714, nome: "Taxa média de juros - Crédito total", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20716, nome: "Taxa média de juros - Crédito pessoas físicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20740, nome: "Taxa média de juros - Crédito recursos livres - PF", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20749, nome: "Taxa média de juros - Aquisição de veículos - PF", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20772, nome: "Taxa média de juros - Financiamento imobiliário - PF", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 25497, nome: "Taxa média de juros - Financiamento imobiliário taxas de mercado", categoria: "Crédito", periodicidade: "Mensal" },

  // Spread bancário
  { codigo: 20783, nome: "Spread médio - Crédito total", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20785, nome: "Spread médio - Crédito pessoas físicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20786, nome: "Spread médio - Crédito pessoas jurídicas", categoria: "Crédito", periodicidade: "Mensal" },

  // Inadimplência
  { codigo: 21082, nome: "Inadimplência - Crédito total", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 21084, nome: "Inadimplência - Crédito pessoas físicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 21085, nome: "Inadimplência - Crédito pessoas jurídicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 21128, nome: "Inadimplência - Cartão de crédito parcelado - PF", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 21129, nome: "Inadimplência - Cartão de crédito total - PF", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 13685, nome: "Inadimplência - Instituições financeiras privadas", categoria: "Crédito", periodicidade: "Mensal" },

  // ==================== AGREGADOS MONETÁRIOS ====================
  { codigo: 1788, nome: "Base monetária - Saldo fim de período", categoria: "Agregados Monetários", periodicidade: "Mensal" },
  { codigo: 1833, nome: "Base monetária ampliada - M4 - Saldo fim de período", categoria: "Agregados Monetários", periodicidade: "Mensal" },
  { codigo: 27788, nome: "Meios de pagamento - M1 - Saldo fim de período", categoria: "Agregados Monetários", periodicidade: "Mensal" },
  { codigo: 27789, nome: "Meios de pagamento - M2 - Saldo fim de período", categoria: "Agregados Monetários", periodicidade: "Mensal" },
  { codigo: 27790, nome: "Meios de pagamento - M3 - Saldo fim de período", categoria: "Agregados Monetários", periodicidade: "Mensal" },
  { codigo: 27791, nome: "Meios de pagamento - M4 - Saldo fim de período", categoria: "Agregados Monetários", periodicidade: "Mensal" },
  { codigo: 27815, nome: "Multiplicador monetário - Base para M4", categoria: "Agregados Monetários", periodicidade: "Mensal" },
  { codigo: 7530, nome: "Multiplicador monetário - Média do mês", categoria: "Agregados Monetários", periodicidade: "Mensal" },

  // ==================== POUPANÇA ====================
  { codigo: 25, nome: "Poupança - Rendimento no mês de referência", categoria: "Poupança", periodicidade: "Mensal" },
  { codigo: 195, nome: "Poupança - Saldo total", categoria: "Poupança", periodicidade: "Mensal" },
  { codigo: 7165, nome: "Poupança - Captação líquida", categoria: "Poupança", periodicidade: "Mensal" },
  { codigo: 7166, nome: "Poupança - Depósitos", categoria: "Poupança", periodicidade: "Mensal" },
  { codigo: 7167, nome: "Poupança - Retiradas", categoria: "Poupança", periodicidade: "Mensal" },

  // ==================== ÍNDICES DE MERCADO ====================
  { codigo: 12466, nome: "IMA-B - Índice de Mercado ANBIMA (Base)", categoria: "Índices de Mercado", periodicidade: "Diária" },
  { codigo: 12467, nome: "IMA-B5 - Índice de Mercado ANBIMA (até 5 anos)", categoria: "Índices de Mercado", periodicidade: "Diária" },
  { codigo: 12468, nome: "IMA-B5+ - Índice de Mercado ANBIMA (acima 5 anos)", categoria: "Índices de Mercado", periodicidade: "Diária" },
  { codigo: 7832, nome: "Ibovespa - Índice mensal", categoria: "Índices de Mercado", periodicidade: "Mensal" },

  // ==================== EXPECTATIVAS (Focus) ====================
  { codigo: 29033, nome: "Expectativa IPCA - Mediana - Ano corrente", categoria: "Expectativas", periodicidade: "Semanal" },
  { codigo: 29034, nome: "Expectativa IPCA - Mediana - Próximo ano", categoria: "Expectativas", periodicidade: "Semanal" },
  { codigo: 29035, nome: "Expectativa Selic - Mediana - Ano corrente", categoria: "Expectativas", periodicidade: "Semanal" },
  { codigo: 29036, nome: "Expectativa Selic - Mediana - Próximo ano", categoria: "Expectativas", periodicidade: "Semanal" },
  { codigo: 29037, nome: "Expectativa PIB - Mediana - Ano corrente", categoria: "Expectativas", periodicidade: "Semanal" },
  { codigo: 29038, nome: "Expectativa PIB - Mediana - Próximo ano", categoria: "Expectativas", periodicidade: "Semanal" },
  { codigo: 29039, nome: "Expectativa Câmbio - Mediana - Ano corrente", categoria: "Expectativas", periodicidade: "Semanal" },
  { codigo: 29040, nome: "Expectativa Câmbio - Mediana - Próximo ano", categoria: "Expectativas", periodicidade: "Semanal" }
];

// Types for API responses
interface SerieValor {
  data: string;
  valor: string;
}

interface SerieMetadados {
  codigo: number;
  nome: string;
  unidade: string;
  periodicidade: string;
  fonte: string;
  especial: boolean;
}

// Helper function to format date for API (dd/MM/yyyy)
function formatDateForApi(dateStr: string): string {
  // Accept formats: yyyy-MM-dd, dd/MM/yyyy
  if (dateStr.includes("-")) {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

// Helper function to fetch from BCB API
async function fetchBcbApi(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "bcb-br-mcp/1.0.0"
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Série não encontrada ou sem dados para o período solicitado`);
    }
    throw new Error(`Erro na API do BCB: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Create MCP server
const server = new McpServer({
  name: "bcb-br-mcp",
  version: "1.0.0"
});

// Tool: Get series values
server.tool(
  "bcb_serie_valores",
  "Consulta valores de uma série temporal do BCB por código. Retorna dados históricos com data e valor.",
  {
    codigo: z.number().describe("Código da série no SGS/BCB (ex: 433 para IPCA mensal, 11 para Selic)"),
    dataInicial: z.string().optional().describe("Data inicial no formato yyyy-MM-dd ou dd/MM/yyyy (opcional)"),
    dataFinal: z.string().optional().describe("Data final no formato yyyy-MM-dd ou dd/MM/yyyy (opcional)")
  },
  async ({ codigo, dataInicial, dataFinal }) => {
    try {
      let url = `${BCB_API_BASE}.${codigo}/dados?formato=json`;

      if (dataInicial) {
        url += `&dataInicial=${formatDateForApi(dataInicial)}`;
      }
      if (dataFinal) {
        url += `&dataFinal=${formatDateForApi(dataFinal)}`;
      }

      const data = await fetchBcbApi(url) as SerieValor[];

      if (!Array.isArray(data) || data.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `Nenhum dado encontrado para a série ${codigo} no período solicitado.`
          }]
        };
      }

      // Find series info if available
      const serieInfo = SERIES_POPULARES.find(s => s.codigo === codigo);

      const result = {
        serie: {
          codigo,
          nome: serieInfo?.nome || `Série ${codigo}`,
          categoria: serieInfo?.categoria || "Desconhecida",
          periodicidade: serieInfo?.periodicidade || "Desconhecida"
        },
        totalRegistros: data.length,
        periodoInicial: data[0].data,
        periodoFinal: data[data.length - 1].data,
        dados: data.map(d => ({
          data: d.data,
          valor: parseFloat(d.valor)
        }))
      };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Erro ao consultar série ${codigo}: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Get last N values
server.tool(
  "bcb_serie_ultimos",
  "Obtém os últimos N valores de uma série temporal do BCB. Útil para consultar dados mais recentes.",
  {
    codigo: z.number().describe("Código da série no SGS/BCB"),
    quantidade: z.number().min(1).max(1000).default(10).describe("Quantidade de valores a retornar (1-1000, padrão: 10)")
  },
  async ({ codigo, quantidade }) => {
    try {
      const url = `${BCB_API_BASE}.${codigo}/dados/ultimos/${quantidade}?formato=json`;
      const data = await fetchBcbApi(url) as SerieValor[];

      if (!Array.isArray(data) || data.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `Nenhum dado encontrado para a série ${codigo}.`
          }]
        };
      }

      const serieInfo = SERIES_POPULARES.find(s => s.codigo === codigo);

      const result = {
        serie: {
          codigo,
          nome: serieInfo?.nome || `Série ${codigo}`,
          categoria: serieInfo?.categoria || "Desconhecida",
          periodicidade: serieInfo?.periodicidade || "Desconhecida"
        },
        totalRegistros: data.length,
        dados: data.map(d => ({
          data: d.data,
          valor: parseFloat(d.valor)
        }))
      };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Erro ao consultar últimos valores da série ${codigo}: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Get series metadata
server.tool(
  "bcb_serie_metadados",
  "Obtém informações/metadados de uma série temporal do BCB. Retorna nome, periodicidade, categoria e outros detalhes.",
  {
    codigo: z.number().describe("Código da série no SGS/BCB")
  },
  async ({ codigo }) => {
    try {
      // Try to fetch metadata from API endpoint
      const metadataUrl = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/metadados?formato=json`;

      try {
        const metadata = await fetchBcbApi(metadataUrl) as SerieMetadados;

        const serieInfo = SERIES_POPULARES.find(s => s.codigo === codigo);

        const result = {
          codigo: metadata.codigo || codigo,
          nome: metadata.nome || serieInfo?.nome || `Série ${codigo}`,
          unidade: metadata.unidade || "Não informada",
          periodicidade: metadata.periodicidade || serieInfo?.periodicidade || "Não informada",
          fonte: metadata.fonte || "Banco Central do Brasil",
          categoria: serieInfo?.categoria || "Não categorizada",
          especial: metadata.especial || false,
          urlConsulta: `${BCB_API_BASE}.${codigo}/dados?formato=json`,
          urlUltimos10: `${BCB_API_BASE}.${codigo}/dados/ultimos/10?formato=json`
        };

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch {
        // If metadata endpoint fails, try to get info from popular series or fetch sample data
        const serieInfo = SERIES_POPULARES.find(s => s.codigo === codigo);

        if (serieInfo) {
          const result = {
            codigo,
            nome: serieInfo.nome,
            periodicidade: serieInfo.periodicidade,
            categoria: serieInfo.categoria,
            fonte: "Banco Central do Brasil",
            urlConsulta: `${BCB_API_BASE}.${codigo}/dados?formato=json`,
            urlUltimos10: `${BCB_API_BASE}.${codigo}/dados/ultimos/10?formato=json`,
            observacao: "Metadados obtidos do catálogo interno"
          };

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        }

        // Try to verify if series exists by fetching last value
        const url = `${BCB_API_BASE}.${codigo}/dados/ultimos/1?formato=json`;
        const data = await fetchBcbApi(url) as SerieValor[];

        if (Array.isArray(data) && data.length > 0) {
          const result = {
            codigo,
            nome: `Série ${codigo}`,
            ultimoValor: {
              data: data[0].data,
              valor: parseFloat(data[0].valor)
            },
            fonte: "Banco Central do Brasil",
            urlConsulta: `${BCB_API_BASE}.${codigo}/dados?formato=json`,
            observacao: "Série encontrada, mas metadados detalhados não disponíveis"
          };

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        }

        throw new Error("Série não encontrada");
      }
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Erro ao consultar metadados da série ${codigo}: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool: List popular series
server.tool(
  "bcb_series_populares",
  "Lista 150+ séries temporais do BCB com seus códigos. Inclui juros, inflação, câmbio, PIB, emprego, crédito e outros indicadores econômicos.",
  {
    categoria: z.string().optional().describe("Filtrar por categoria: Juros, Inflação, Câmbio, Atividade Econômica, Emprego, Fiscal, Setor Externo, Crédito, Agregados Monetários, Poupança, Índices de Mercado, Expectativas")
  },
  async ({ categoria }) => {
    try {
      let series = SERIES_POPULARES;

      if (categoria) {
        series = series.filter(s =>
          s.categoria.toLowerCase().includes(categoria.toLowerCase())
        );
      }

      // Group by category
      const porCategoria: Record<string, typeof series> = {};
      for (const serie of series) {
        if (!porCategoria[serie.categoria]) {
          porCategoria[serie.categoria] = [];
        }
        porCategoria[serie.categoria].push(serie);
      }

      const result = {
        totalSeries: series.length,
        categorias: Object.keys(porCategoria).length,
        series: categoria ? series : porCategoria,
        observacao: "Use bcb_serie_valores ou bcb_serie_ultimos com o código para consultar os dados"
      };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Erro ao listar séries: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Search series by name
server.tool(
  "bcb_buscar_serie",
  "Busca séries no catálogo interno por nome ou descrição. Retorna séries que correspondem ao termo buscado.",
  {
    termo: z.string().min(2).describe("Termo de busca (mínimo 2 caracteres)")
  },
  async ({ termo }) => {
    try {
      const termoLower = termo.toLowerCase();

      const encontradas = SERIES_POPULARES.filter(s =>
        s.nome.toLowerCase().includes(termoLower) ||
        s.categoria.toLowerCase().includes(termoLower)
      );

      if (encontradas.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              termo,
              totalEncontradas: 0,
              mensagem: "Nenhuma série encontrada no catálogo interno. Use o portal SGS do BCB para buscar outras séries: https://www3.bcb.gov.br/sgspub/",
              sugestao: "Tente termos como: selic, ipca, dolar, cambio, pib, inflacao"
            }, null, 2)
          }]
        };
      }

      const result = {
        termo,
        totalEncontradas: encontradas.length,
        series: encontradas
      };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Erro ao buscar séries: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Get current indicators (convenience)
server.tool(
  "bcb_indicadores_atuais",
  "Obtém os valores mais recentes dos principais indicadores econômicos: Selic, IPCA, Dólar PTAX e IBC-Br.",
  {},
  async () => {
    try {
      const indicadores = [
        { codigo: 432, nome: "Selic (a.a.)" },
        { codigo: 433, nome: "IPCA mensal (%)" },
        { codigo: 13522, nome: "IPCA 12 meses (%)" },
        { codigo: 3698, nome: "Dólar PTAX (venda)" },
        { codigo: 24364, nome: "IBC-Br" }
      ];

      const resultados = await Promise.all(
        indicadores.map(async (ind) => {
          try {
            const url = `${BCB_API_BASE}.${ind.codigo}/dados/ultimos/1?formato=json`;
            const data = await fetchBcbApi(url) as SerieValor[];

            if (Array.isArray(data) && data.length > 0) {
              return {
                indicador: ind.nome,
                codigo: ind.codigo,
                data: data[0].data,
                valor: parseFloat(data[0].valor)
              };
            }
            return {
              indicador: ind.nome,
              codigo: ind.codigo,
              erro: "Sem dados disponíveis"
            };
          } catch (err) {
            return {
              indicador: ind.nome,
              codigo: ind.codigo,
              erro: err instanceof Error ? err.message : "Erro desconhecido"
            };
          }
        })
      );

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            consultadoEm: new Date().toISOString(),
            indicadores: resultados
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Erro ao consultar indicadores: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
