/**
 * BCB BR MCP Server — tools do SGS + montagem do catálogo canônico de tools.
 *
 * Os primitivos (fetch, config, versão, tipos, `sealDeep`) moraram aqui até a
 * sessão de D3 e foram para `shared.ts` quando o servidor passou a falar com
 * três APIs. Este módulo os RE-EXPORTA porque o worker, os testes e o
 * `register.ts` importam desses nomes daqui desde a fundação.
 *
 * Author: Sidney Bissoli
 * License: MIT
 */

import { obterCatalogo, buscarSeries } from "./catalog.js";
import { FOCUS_TOOL_DEFINITIONS, dispatchFocusTool } from "./focus.js";
import { CAMBIO_TOOL_DEFINITIONS, dispatchCambioTool } from "./cambio.js";
import { DERIVACAO_ESTATISTICA, arredondarDerivado, estatisticasDaSerie } from "./stats.js";
import {
  ROTULO_PERIODICIDADE,
  TETO_ULTIMOS,
  buscarSerieSgs,
  buscarUltimosSgs,
  harmonizar,
  inferirPeriodicidade,
  type Agregacao,
  type FrequenciaAlvo,
  type Periodicidade,
  type ResultadoSerie
} from "./series.js";
import {
  CONFIG,
  calculateVariation,
  erroResult,
  fetchBcbApi,
  formatDateForApi,
  mensagemDeErro,
  normalizeString,
  sealDeep,
  structuredResult,
  type SerieMetadados,
  type SeriePopular,
  type SerieValor,
  type ToolResult
} from "./shared.js";

export {
  ROTULO_PERIODICIDADE,
  TETO_ULTIMOS,
  buscarSerieSgs,
  buscarUltimosSgs,
  harmonizar,
  inferirPeriodicidade
} from "./series.js";

export {
  CONFIG,
  WORKER_CONFIG,
  calculateVariation,
  erroResult,
  fetchBcbApi,
  fetchWithTimeout,
  formatDateForApi,
  getUserAgent,
  mensagemDeErro,
  normalizeString,
  sealDeep,
  setServerVersion,
  sleep,
  structuredResult,
  type SerieMetadados,
  type SeriePopular,
  type SerieValor,
  type ToolResult
} from "./shared.js";

// ==================== CONSTANTS ====================

export const BCB_API_BASE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";

export const SERIES_POPULARES: SeriePopular[] = [
  // ==================== JUROS E TAXAS ====================
  { codigo: 11, nome: "Taxa de juros - Selic acumulada no mês", categoria: "Juros", periodicidade: "Mensal" },
  { codigo: 432, nome: "Taxa de juros - Selic anualizada base 252", categoria: "Juros", periodicidade: "Diária" },
  { codigo: 1178, nome: "Taxa de juros - Selic - Meta definida pelo Copom", categoria: "Juros", periodicidade: "Diária" },
  { codigo: 4189, nome: "Taxa de juros - Selic acumulada no mês anualizada", categoria: "Juros", periodicidade: "Mensal" },
  { codigo: 4390, nome: "Taxa de juros - Selic mensal", categoria: "Juros", periodicidade: "Mensal" },
  { codigo: 12, nome: "Taxa de juros - CDI diária", categoria: "Juros", periodicidade: "Diária" },
  { codigo: 4389, nome: "Taxa de juros - CDI anualizada base 252", categoria: "Juros", periodicidade: "Diária" },
  { codigo: 4391, nome: "Taxa de juros - CDI acumulada no mês", categoria: "Juros", periodicidade: "Mensal" },
  { codigo: 4392, nome: "Taxa de juros - CDI acumulada no mês anualizada", categoria: "Juros", periodicidade: "Mensal" },
  { codigo: 226, nome: "Taxa Referencial (TR) - diária", categoria: "Juros", periodicidade: "Diária" },
  { codigo: 7811, nome: "Taxa Referencial (TR) - mensal", categoria: "Juros", periodicidade: "Mensal" },
  { codigo: 7812, nome: "Taxa Referencial (TR) - anualizada", categoria: "Juros", periodicidade: "Mensal" },
  { codigo: 256, nome: "Taxa de Juros de Longo Prazo (TJLP)", categoria: "Juros", periodicidade: "Mensal" },
  { codigo: 253, nome: "Taxa de juros - CDB pré-fixado - 30 dias", categoria: "Juros", periodicidade: "Diária" },
  { codigo: 14, nome: "Taxa de juros - Poupança", categoria: "Juros", periodicidade: "Mensal" },

  // ==================== INFLAÇÃO ====================
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
  { codigo: 188, nome: "INPC - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 13523, nome: "INPC - Variação acumulada em 12 meses", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 189, nome: "IGP-M - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7447, nome: "IGP-10 - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7448, nome: "IGP-M - 1ª prévia", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7449, nome: "IGP-M - 2ª prévia", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 190, nome: "IGP-DI - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7450, nome: "IPA-M - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 225, nome: "IPA-DI - Geral - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7459, nome: "IPA-DI - Produtos industriais", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 7460, nome: "IPA-DI - Produtos agrícolas", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 191, nome: "IPC-DI - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 193, nome: "IPC-Fipe - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 17679, nome: "IPC-3i - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },
  { codigo: 17680, nome: "IPC-C1 - Variação mensal", categoria: "Inflação", periodicidade: "Mensal" },

  // ==================== CÂMBIO ====================
  { codigo: 1, nome: "Taxa de câmbio - Livre - Dólar americano (venda)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 10813, nome: "Taxa de câmbio - Livre - Dólar americano (compra)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 3698, nome: "Taxa de câmbio - PTAX - Dólar americano (venda)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 3697, nome: "Taxa de câmbio - PTAX - Dólar americano (compra)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 3695, nome: "Taxa de câmbio - PTAX - Dólar americano (média)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 21619, nome: "Taxa de câmbio - Euro (venda)", categoria: "Câmbio", periodicidade: "Diária" },
  { codigo: 21620, nome: "Taxa de câmbio - Euro (compra)", categoria: "Câmbio", periodicidade: "Diária" },
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
  { codigo: 24363, nome: "IBC-Br - Índice de Atividade Econômica (sem ajuste)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 24364, nome: "IBC-Br - Índice de Atividade Econômica (com ajuste sazonal)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 29601, nome: "IBC-Br - Agropecuária (sem ajuste)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 29602, nome: "IBC-Br - Agropecuária (com ajuste sazonal)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 29603, nome: "IBC-Br - Indústria (sem ajuste)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 29604, nome: "IBC-Br - Indústria (com ajuste sazonal)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 29605, nome: "IBC-Br - Serviços (sem ajuste)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 29606, nome: "IBC-Br - Serviços (com ajuste sazonal)", categoria: "Atividade Econômica", periodicidade: "Mensal" },
  { codigo: 22099, nome: "PIB trimestral - Taxa de variação (%)", categoria: "Atividade Econômica", periodicidade: "Trimestral" },
  { codigo: 22103, nome: "Exportação de bens e serviços - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral" },
  { codigo: 22104, nome: "Importação de bens e serviços - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral" },
  { codigo: 22109, nome: "Consumo das famílias - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral" },
  { codigo: 22110, nome: "Consumo do governo - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral" },
  { codigo: 22111, nome: "Formação bruta de capital fixo - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral" },
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
  { codigo: 3546, nome: "Reservas internacionais - Conceito liquidez - Total", categoria: "Setor Externo", periodicidade: "Diária" },
  { codigo: 13621, nome: "Reservas internacionais - Conceito liquidez - Mensal", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22707, nome: "Balança comercial - Saldo mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22708, nome: "Exportação de bens - Mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22709, nome: "Importação de bens - Mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22714, nome: "Balança comercial - Saldo acumulado 12 meses (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22701, nome: "Transações correntes - Saldo mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22704, nome: "Transações correntes - Saldo acumulado 12 meses (% PIB)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22715, nome: "Serviços - Saldo mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22716, nome: "Renda primária - Saldo mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22846, nome: "Investimento direto no país - Mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 22885, nome: "Investimento em carteira - Mensal (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },
  { codigo: 13690, nome: "Dívida externa total (US$ milhões)", categoria: "Setor Externo", periodicidade: "Mensal" },

  // ==================== CRÉDITO ====================
  { codigo: 20539, nome: "Saldo da carteira de crédito - Total", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20540, nome: "Saldo da carteira de crédito - Pessoas físicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20541, nome: "Saldo da carteira de crédito - Pessoas jurídicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20542, nome: "Saldo de crédito com recursos livres - Total", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20570, nome: "Saldo de crédito com recursos livres - Pessoas físicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20592, nome: "Saldo de crédito com recursos livres - Pessoas jurídicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20615, nome: "Saldo de crédito com recursos direcionados - Total", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20631, nome: "Concessões de crédito - Total", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20665, nome: "Concessões de crédito - Cheque especial - Pessoas físicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20714, nome: "Taxa média de juros - Crédito total", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20716, nome: "Taxa média de juros - Crédito pessoas físicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20740, nome: "Taxa média de juros - Crédito recursos livres - PF", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20749, nome: "Taxa média de juros - Aquisição de veículos - PF", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20772, nome: "Taxa média de juros - Financiamento imobiliário - PF", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 25497, nome: "Taxa média de juros - Financiamento imobiliário taxas de mercado", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20783, nome: "Spread médio - Crédito total", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20785, nome: "Spread médio - Crédito pessoas físicas", categoria: "Crédito", periodicidade: "Mensal" },
  { codigo: 20786, nome: "Spread médio - Crédito pessoas jurídicas", categoria: "Crédito", periodicidade: "Mensal" },
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

// ==================== TOOL HANDLERS ====================

/**
 * Bloco `serie` das respostas do SGS.
 *
 * A periodicidade vinha do catálogo curado ou saía "Desconhecida" — e sai
 * "Desconhecida" para a esmagadora maioria das séries, porque a curadoria cobre
 * ~150 de milhares. Como a origem NÃO tem endpoint de metadados
 * (404 medido, `bcb/docs/04`), a periodicidade agora é inferida do espaçamento
 * das observações que já vieram, e o campo `periodicidadeInferida` diz quando o
 * valor é nosso e não da fonte.
 */
function refSerie(codigo: number, periodicidade: Periodicidade | null): Record<string, unknown> {
  const info = SERIES_POPULARES.find(s => s.codigo === codigo);
  const inferida = !info?.periodicidade && periodicidade !== null;

  return {
    codigo,
    nome: info?.nome || `Série ${codigo}`,
    categoria: info?.categoria || "Desconhecida",
    periodicidade: info?.periodicidade || (periodicidade ? ROTULO_PERIODICIDADE[periodicidade] : "Desconhecida"),
    ...(inferida ? { periodicidadeInferida: true } : {})
  };
}

/** Campos de transparência da consulta: só aparecem quando houve o que contar. */
function blocoRede(resultado: ResultadoSerie): Record<string, unknown> {
  return {
    ...(resultado.chunking ? { chunking: resultado.chunking } : {}),
    ...(resultado.janelaAplicada ? { janelaAplicada: resultado.janelaAplicada } : {})
  };
}

export async function handleSerieValores(
  args: {
    codigo: number;
    dataInicial?: string;
    dataFinal?: string;
    frequencia?: FrequenciaAlvo;
    agregacao?: Agregacao;
  },
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  try {
    const resultado = await buscarSerieSgs(
      {
        codigo: args.codigo,
        dataInicial: args.dataInicial ? formatDateForApi(args.dataInicial) : undefined,
        dataFinal: args.dataFinal ? formatDateForApi(args.dataFinal) : undefined
      },
      timeoutMs,
      maxRetries
    );

    const serie = refSerie(args.codigo, resultado.periodicidade);
    const observacoes = resultado.observacoes;

    if (observacoes.length === 0) {
      return structuredResult({
        serie,
        totalRegistros: 0,
        dados: [],
        observacao: `Nenhum dado encontrado para a série ${args.codigo} no período solicitado.`,
        ...blocoRede(resultado)
      });
    }

    const dados = observacoes.map(d => ({ data: d.data, valor: parseFloat(d.valor) }));

    if (args.frequencia) {
      const h = harmonizar(dados, args.frequencia, args.agregacao ?? "ultimo", resultado.periodicidade);
      return structuredResult({
        serie,
        totalRegistros: h.dados.length,
        periodoInicial: h.dados[0]?.data,
        periodoFinal: h.dados[h.dados.length - 1]?.data,
        dados: h.dados,
        harmonizacao: {
          frequencia: h.frequencia,
          agregacao: h.agregacao,
          observacoesOriginais: dados.length,
          derived: true,
          nota: h.nota
        },
        ...blocoRede(resultado)
      });
    }

    return structuredResult({
      serie,
      totalRegistros: dados.length,
      periodoInicial: observacoes[0].data,
      periodoFinal: observacoes[observacoes.length - 1].data,
      dados,
      ...blocoRede(resultado)
    });
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Erro ao consultar série ${args.codigo}: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

export async function handleSerieUltimos(
  args: { codigo: number; quantidade: number },
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  try {
    // O endpoint nativo tem teto de 20 em TODA periodicidade (medido); acima
    // disso a busca é feita por janela de datas. Ver `series.ts`.
    const resultado = await buscarUltimosSgs(args.codigo, args.quantidade, timeoutMs, maxRetries);
    const serie = refSerie(args.codigo, resultado.periodicidade);

    if (resultado.observacoes.length === 0) {
      return structuredResult({
        serie,
        totalRegistros: 0,
        dados: [],
        observacao: `Nenhum dado encontrado para a série ${args.codigo}.`,
        ...blocoRede(resultado)
      });
    }

    return structuredResult({
      serie,
      totalRegistros: resultado.observacoes.length,
      dados: resultado.observacoes.map(d => ({ data: d.data, valor: parseFloat(d.valor) })),
      ...blocoRede(resultado)
    });
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Erro ao consultar últimos valores da série ${args.codigo}: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

/**
 * Metadados de uma série do SGS — sem endpoint de metadados.
 *
 * MUDANÇA DELIBERADA DO D1. A versão anterior chamava
 * `bcdata.sgs.{codigo}/metadados?formato=json` em toda invocação e tratava a
 * falha como exceção. Medição de 11/08/2026 (`bcb/docs/04`): **esse endpoint não
 * existe** — responde 404 `{"error":"endpoint not found!"}`, e as variantes
 * também. Ou seja, o caminho "metadados da API" era código morto que gastava uma
 * requisição por chamada, e o que o usuário sempre recebeu foi o fallback.
 *
 * O que substitui: os últimos valores servem de sonda (uma requisição, ~80 ms) e
 * dão a **periodicidade por inferência** — que é justamente o que faltava para
 * as milhares de séries fora da curadoria. `unidade` e `especial` saíram do
 * contrato porque nenhuma fonte disponível os publica; anunciar campo que nunca
 * chega é pior do que não anunciar.
 */
export async function handleSerieMetadados(
  args: { codigo: number },
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  const serieInfo = SERIES_POPULARES.find(s => s.codigo === args.codigo);
  const urlConsulta = `${BCB_API_BASE}.${args.codigo}/dados?formato=json`;
  const urlUltimos10 = `${BCB_API_BASE}.${args.codigo}/dados/ultimos/10?formato=json`;

  try {
    const resultado = await buscarUltimosSgs(args.codigo, TETO_ULTIMOS, timeoutMs, maxRetries);
    const observacoes = resultado.observacoes;

    if (observacoes.length === 0 && !serieInfo) {
      throw new Error("Série não encontrada");
    }

    const ultima = observacoes[observacoes.length - 1];
    const periodicidadeCatalogo = serieInfo?.periodicidade;
    const periodicidadeInferida = resultado.periodicidade
      ? ROTULO_PERIODICIDADE[resultado.periodicidade]
      : undefined;

    return structuredResult({
      codigo: args.codigo,
      nome: serieInfo?.nome || `Série ${args.codigo}`,
      periodicidade: periodicidadeCatalogo || periodicidadeInferida || "Não informada",
      ...(!periodicidadeCatalogo && periodicidadeInferida ? { periodicidadeInferida: true } : {}),
      categoria: serieInfo?.categoria || "Não categorizada",
      fonte: "Banco Central do Brasil",
      ...(ultima ? { ultimoValor: { data: ultima.data, valor: parseFloat(ultima.valor) } } : {}),
      urlConsulta,
      urlUltimos10,
      observacao: serieInfo
        ? "Nome e categoria vêm do catálogo curado do servidor; a API do SGS não publica endpoint de metadados."
        : "Série fora do catálogo curado: nome genérico. A API do SGS não publica endpoint de metadados, então a periodicidade é inferida do espaçamento das observações."
    });
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Erro ao consultar metadados da série ${args.codigo}: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

export async function handleSeriesPopulares(
  args: { categoria?: string }
): Promise<ToolResult> {
  try {
    let series: SeriePopular[] = SERIES_POPULARES;

    if (args.categoria) {
      const categoriaNorm = normalizeString(args.categoria);
      series = series.filter(s => normalizeString(s.categoria).includes(categoriaNorm));
    }

    const porCategoria: Record<string, SeriePopular[]> = {};
    for (const serie of series) {
      if (!porCategoria[serie.categoria]) porCategoria[serie.categoria] = [];
      porCategoria[serie.categoria].push(serie);
    }

    return structuredResult({
      totalSeries: series.length,
      categorias: Object.keys(porCategoria).length,
      series: args.categoria ? series : porCategoria,
      observacao: "Use bcb_serie_valores ou bcb_serie_ultimos com o código para consultar os dados"
    });
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Erro ao listar séries: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

/**
 * Busca real: catálogo curado (camada de destaque) + índice do Portal de Dados
 * Abertos do BCB, servido de cache de 24 h com renovação bloqueante (ver
 * `catalog.ts`). A tool NUNCA afirma que uma série não existe: o índice cobre os
 * datasets do portal nomeados por código, que não são o SGS inteiro.
 */
export async function handleBuscarSerie(
  args: { termo: string; limite?: number },
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  try {
    const limite = args.limite ?? 20;
    const { snapshot, aviso } = await obterCatalogo(timeoutMs, maxRetries);
    const { total, series } = buscarSeries(args.termo, SERIES_POPULARES, snapshot?.entradas ?? null, limite);

    const catalogo = snapshot
      ? {
          origem: "Portal de Dados Abertos do BCB (CKAN) + catálogo curado local",
          obtidoEm: snapshot.obtidoEm,
          seriesIndexadas: snapshot.entradas.length,
          cobertura:
            `O índice cobre ${snapshot.entradas.length} séries identificadas por código no portal de dados ` +
            "abertos, o que NÃO é o SGS inteiro (o portal SGS expõe mais séries). Não encontrar aqui não " +
            "significa que a série não exista: confirme em https://www3.bcb.gov.br/sgspub/ ou consulte o " +
            "código diretamente com bcb_serie_metadados."
        }
      : {
          origem: "catálogo curado local",
          seriesIndexadas: SERIES_POPULARES.length,
          cobertura:
            `A busca usou apenas o catálogo curado (${SERIES_POPULARES.length} séries) porque o índice do ` +
            "portal de dados abertos não estava disponível. Não encontrar aqui não significa que a série não " +
            "exista: confirme em https://www3.bcb.gov.br/sgspub/."
        };

    const payload: Record<string, unknown> = {
      termo: args.termo,
      totalEncontradas: total,
      series,
      catalogo
    };

    if (series.length < total) payload.observacao = `Exibindo ${series.length} de ${total} séries; aumente 'limite' ou refine o termo.`;
    if (aviso) payload.avisos = [aviso];

    if (total === 0) {
      payload.mensagem =
        "Nenhuma série casou com o termo no catálogo curado nem no índice do portal de dados abertos. " +
        "Isso não é prova de inexistência — veja 'catalogo.cobertura'.";
      payload.sugestao = "Tente termos mais gerais (selic, ipca, dolar, cambio, pib, credito, emprego) ou o código da série.";
    }

    return structuredResult(payload);
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Erro ao buscar séries: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

export async function handleIndicadoresAtuais(
  _args: Record<string, never>,
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
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
          const data = await fetchBcbApi(url, timeoutMs, maxRetries) as SerieValor[];

          if (Array.isArray(data) && data.length > 0) {
            return { indicador: ind.nome, codigo: ind.codigo, data: data[0].data, valor: parseFloat(data[0].valor) };
          }
          return { indicador: ind.nome, codigo: ind.codigo, erro: "Sem dados disponíveis" };
        } catch (err) {
          return { indicador: ind.nome, codigo: ind.codigo, erro: err instanceof Error ? err.message : "Erro desconhecido" };
        }
      })
    );

    return structuredResult({ consultadoEm: new Date().toISOString(), indicadores: resultados });
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Erro ao consultar indicadores: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

export async function handleVariacao(
  args: { codigo: number; dataInicial?: string; dataFinal?: string; periodos?: number },
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  try {
    // `periodos` mantém a precedência sobre as datas (comportamento de sempre).
    // O que mudou: acima de 20 períodos a consulta não falha mais, e janela
    // diária larga é fatiada em vez de estourar o tempo. Ver `series.ts`.
    const resultado = args.periodos && args.periodos > 1
      ? await buscarUltimosSgs(args.codigo, args.periodos, timeoutMs, maxRetries)
      : await buscarSerieSgs(
          {
            codigo: args.codigo,
            dataInicial: args.dataInicial ? formatDateForApi(args.dataInicial) : undefined,
            dataFinal: args.dataFinal ? formatDateForApi(args.dataFinal) : undefined
          },
          timeoutMs,
          maxRetries
        );

    const data: SerieValor[] = resultado.observacoes;

    if (!Array.isArray(data) || data.length < 2) {
      return {
        content: [{ type: "text" as const, text: `Dados insuficientes para calcular variação. São necessários pelo menos 2 valores.` }],
        isError: true
      };
    }

    const serieInfo = SERIES_POPULARES.find(s => s.codigo === args.codigo);
    const valorInicial = parseFloat(data[0].valor);
    const valorFinal = parseFloat(data[data.length - 1].valor);
    const variacao = calculateVariation(valorInicial, valorFinal);
    const diferencaAbsoluta = valorFinal - valorInicial;
    // Motor comum da Fase 0 (arbitragem 4). A convenção de arredondamento e o
    // porquê de os extremos saírem verbatim moram em `stats.ts`.
    const { maximo, minimo, media, amplitude } = estatisticasDaSerie(data.map(d => parseFloat(d.valor)));

    return structuredResult({
      serie: { codigo: args.codigo, nome: serieInfo?.nome || `Série ${args.codigo}`, categoria: serieInfo?.categoria || "Desconhecida" },
      periodo: { dataInicial: data[0].data, dataFinal: data[data.length - 1].data, totalPeriodos: data.length },
      analise: {
        valorInicial, valorFinal,
        diferencaAbsoluta: arredondarDerivado(diferencaAbsoluta),
        variacaoPercentual: arredondarDerivado(variacao),
        variacaoFormatada: `${variacao >= 0 ? "+" : ""}${variacao.toFixed(2)}%`
      },
      estatisticas: { maximo, minimo, media, amplitude },
      derivacao: DERIVACAO_ESTATISTICA,
      ...blocoRede(resultado)
    });
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Erro ao calcular variação: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

export async function handleComparar(
  args: {
    codigos: number[];
    dataInicial: string;
    dataFinal: string;
    frequencia?: FrequenciaAlvo;
    agregacao?: Agregacao;
  },
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  try {
    const periodicidades = new Map<number, string>();
    let harmonizacao: Record<string, unknown> | undefined;

    const resultados = await Promise.all(
      args.codigos.map(async (codigo) => {
        const serieInfo = SERIES_POPULARES.find(s => s.codigo === codigo);
        try {
          // Concorrência 1 por série: as séries já são buscadas em paralelo entre
          // si, e o portal pede parcimônia. Sem isto, 5 séries fatiadas em 4
          // janelas cada poriam 20 requisições em voo ao mesmo tempo.
          const resultado = await buscarSerieSgs(
            {
              codigo,
              dataInicial: formatDateForApi(args.dataInicial),
              dataFinal: formatDateForApi(args.dataFinal)
            },
            timeoutMs,
            maxRetries,
            1
          );

          const data = resultado.observacoes;

          if (data.length === 0) {
            return { codigo, nome: serieInfo?.nome || `Série ${codigo}`, erro: "Sem dados no período" };
          }

          const ref = refSerie(codigo, resultado.periodicidade);
          periodicidades.set(codigo, String(ref.periodicidade));

          let observacoes = data.map(d => ({ data: d.data, valor: parseFloat(d.valor) }));

          if (args.frequencia) {
            const h = harmonizar(observacoes, args.frequencia, args.agregacao ?? "ultimo", resultado.periodicidade);
            observacoes = h.dados.map(d => ({ data: d.data, valor: d.valor }));
            harmonizacao = {
              frequencia: h.frequencia,
              agregacao: h.agregacao,
              derived: true,
              nota: h.nota
            };
          }

          const valores = observacoes.map(o => o.valor);
          const valorInicial = valores[0];
          const valorFinal = valores[valores.length - 1];
          const variacao = calculateVariation(valorInicial, valorFinal);
          const { maximo, minimo, media } = estatisticasDaSerie(valores);

          return {
            codigo,
            nome: serieInfo?.nome || `Série ${codigo}`,
            categoria: serieInfo?.categoria || "Desconhecida",
            periodicidade: String(ref.periodicidade),
            totalRegistros: observacoes.length,
            valorInicial, valorFinal,
            variacaoPercentual: arredondarDerivado(variacao),
            variacaoFormatada: `${variacao >= 0 ? "+" : ""}${variacao.toFixed(2)}%`,
            maximo, minimo, media
          };
        } catch (err) {
          return { codigo, nome: serieInfo?.nome || `Série ${codigo}`, erro: err instanceof Error ? err.message : "Erro desconhecido" };
        }
      })
    );

    const seriesComDados = resultados.filter(r => !("erro" in r));
    const seriesComErro = resultados.filter(r => "erro" in r);

    const seriesOrdenadas = [...seriesComDados].sort((a, b) => {
      const varA = "variacaoPercentual" in a && typeof a.variacaoPercentual === "number" ? a.variacaoPercentual : 0;
      const varB = "variacaoPercentual" in b && typeof b.variacaoPercentual === "number" ? b.variacaoPercentual : 0;
      return varB - varA;
    });

    // Periodicidade misturada é a armadilha silenciosa desta tool: comparar a
    // variação de uma série diária com a de uma mensal alinha pontos que não são
    // comparáveis, e o resultado parece perfeitamente saudável. O aviso é campo
    // de topo (não entra nos itens do ranking) e some quando não se aplica.
    const distintas = [...new Set(periodicidades.values())].filter(p => p !== "Desconhecida");
    const aviso = !args.frequencia && distintas.length > 1
      ? `As séries comparadas têm periodicidades diferentes (${distintas.join(", ")}): a variação de cada uma ` +
        `foi calculada na grade da própria série, então os números não são diretamente comparáveis. ` +
        `Use o parâmetro \`frequencia\` (mensal, trimestral ou anual) para harmonizá-las antes da comparação.`
      : undefined;

    return structuredResult({
      periodo: { dataInicial: formatDateForApi(args.dataInicial), dataFinal: formatDateForApi(args.dataFinal) },
      totalSeries: args.codigos.length,
      seriesComDados: seriesComDados.length,
      seriesComErro: seriesComErro.length,
      ranking: seriesOrdenadas.map((s, i) => ({ posicao: i + 1, ...s })),
      erros: seriesComErro.length > 0 ? seriesComErro : [],
      derivacao: DERIVACAO_ESTATISTICA,
      ...(harmonizacao ? { harmonizacao } : {}),
      ...(aviso ? { aviso } : {})
    });
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Erro ao comparar séries: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

// ==================== OUTPUT SCHEMAS (JSON Schema, for worker JSON-RPC) ====================

// Shared fragment: identification block for a BCB time series.
const SERIE_REF_SCHEMA = {
  type: "object" as const,
  description: "Identificação da série temporal",
  properties: {
    codigo: { type: "number" as const, description: "Código da série no SGS/BCB" },
    nome: { type: "string" as const, description: "Nome da série" },
    categoria: { type: "string" as const, description: "Categoria econômica" },
    periodicidade: { type: "string" as const, description: "Periodicidade (Diária, Mensal, etc.)" }
  },
  required: ["codigo", "nome"]
};

// Variante para as tools que CONSULTAM série: quando o código está fora da
// curadoria, a periodicidade é inferida do espaçamento das observações (a API do
// SGS não publica metadados). `bcb_series_populares` segue com o fragmento acima
// de propósito — ele lista o catálogo curado, onde nada é inferido, e anunciar um
// campo que a tool nunca produz seria sujar a superfície.
const SERIE_REF_CONSULTADA_SCHEMA = {
  ...SERIE_REF_SCHEMA,
  properties: {
    ...SERIE_REF_SCHEMA.properties,
    periodicidadeInferida: {
      type: "boolean" as const,
      description:
        "Presente e true quando a periodicidade foi inferida do espaçamento das observações, e não lida " +
        "do catálogo — a API do SGS não publica metadados de série."
    }
  }
};

// Shared fragment: a single observation (date + numeric value).
const OBSERVACAO_SCHEMA = {
  type: "object" as const,
  properties: {
    data: { type: "string" as const, description: "Data da observação (dd/MM/yyyy)" },
    valor: { type: "number" as const, description: "Valor numérico da observação" }
  },
  required: ["data", "valor"]
};

// Observação que pode ser bruta OU agregada: quando a resposta é harmonizada,
// cada ponto carrega quantas observações de origem entraram nele. Declarar o
// campo como opcional aqui é o que permite os dois casos passarem pelo mesmo
// contrato — os schemas são selados (`additionalProperties: false`), então campo
// não declarado invalidaria a resposta inteira.
const OBSERVACAO_OU_AGREGADO_SCHEMA = {
  ...OBSERVACAO_SCHEMA,
  properties: {
    ...OBSERVACAO_SCHEMA.properties,
    observacoes: {
      type: "number" as const,
      description: "Só em resposta harmonizada: observações de origem agregadas neste ponto"
    }
  }
};

// Transparência da consulta: aparece quando o servidor precisou fatiar a janela
// (limite de 10 anos em série diária, erro 406) ou fechar uma janela aberta.
const CHUNKING_SCHEMA = {
  type: "object" as const,
  description:
    "Presente quando a consulta foi fatiada em várias requisições à origem, por causa do limite de " +
    "10 anos por janela em séries diárias. As fatias são fundidas e ordenadas antes de responder.",
  properties: {
    janelas: { type: "number" as const, description: "Quantidade de janelas consultadas" },
    fatiaAnos: { type: "number" as const, description: "Largura máxima de cada janela, em anos" }
  },
  required: ["janelas", "fatiaAnos"]
};

const JANELA_APLICADA_SCHEMA = {
  type: "object" as const,
  description:
    "Presente quando o período pedido estava aberto numa série diária e o servidor aplicou uma janela " +
    "própria (a origem recusa janela aberta em série diária com HTTP 406).",
  properties: {
    dataInicial: { type: "string" as const, description: "Início da janela efetivamente consultada (dd/MM/yyyy)" },
    dataFinal: { type: "string" as const, description: "Fim da janela efetivamente consultada (dd/MM/yyyy)" },
    motivo: { type: "string" as const, description: "Por que a janela foi aplicada e como pedir outra" }
  },
  required: ["dataInicial", "dataFinal", "motivo"]
};

// Marca de derivação das tools quantitativas: separa o que o BCB publica do que
// este servidor calcula. Ver `stats.ts` para as convenções.
const DERIVACAO_SCHEMA = {
  type: "object" as const,
  description: "Origem dos números calculados: o que é derivado, por qual motor e com quais convenções",
  properties: {
    derived: { type: "boolean" as const, description: "Sempre true: há número calculado nesta resposta" },
    motor: { type: "string" as const, description: "Componente que computou a estatística" },
    nota: { type: "string" as const, description: "Convenções de cálculo e arredondamento, em prosa" }
  },
  required: ["derived", "motor", "nota"]
};

const HARMONIZACAO_SCHEMA = {
  type: "object" as const,
  description:
    "Presente quando `frequencia` foi informada: descreve a reamostragem aplicada. Valor DERIVADO — " +
    "calculado por este servidor, não publicado pelo Banco Central.",
  properties: {
    frequencia: { type: "string" as const, enum: ["mensal", "trimestral", "anual"], description: "Frequência de destino" },
    agregacao: {
      type: "string" as const,
      enum: ["ultimo", "primeiro", "media", "soma", "acumulada"],
      description: "Convenção usada para agregar os valores de cada período"
    },
    observacoesOriginais: { type: "number" as const, description: "Observações antes da agregação" },
    derived: { type: "boolean" as const, description: "Sempre true: o valor é derivado, não publicado pela fonte" },
    nota: { type: "string" as const, description: "Descrição em prosa do que foi calculado" }
  },
  required: ["frequencia", "agregacao", "derived", "nota"]
};

// Parâmetros de harmonização, iguais em `bcb_serie_valores` e `bcb_comparar`.
const FREQUENCIA_INPUT = {
  type: "string" as const,
  enum: ["mensal", "trimestral", "anual"],
  description:
    "Opcional: reamostra a série para esta frequência antes de responder (só agrega para períodos MAIORES; " +
    "pedir frequência mais fina que a da série é recusado). Útil para comparar séries de periodicidades diferentes."
};

const AGREGACAO_INPUT = {
  type: "string" as const,
  enum: ["ultimo", "primeiro", "media", "soma", "acumulada"],
  default: "ultimo",
  description:
    "Como agregar os valores de cada período quando `frequencia` é informada. `ultimo` (padrão) serve a nível " +
    "de preço, taxa e índice; `soma` a fluxo; `acumulada` a séries que JÁ SÃO variação percentual (IPCA mensal, " +
    "por exemplo), compondo geometricamente — somar 12 variações mensais NÃO dá a inflação do ano."
};

// ==================== TOOL DESCRIPTIONS (single source of truth) ====================
//
// Reused by both transports: TOOL_DEFINITIONS below (worker / HTTP JSON-RPC) and
// the server.registerTool() calls in index.ts (stdio). Each description is written
// to score well on agent-readability rubrics (Glama): it states purpose, when to use
// the tool vs. its siblings, the exact shape of what it returns, and its runtime
// behavior. BEHAVIOR_NOTE captures the facts common to every tool so they stay in sync.

const BEHAVIOR_NOTE =
  "Comportamento: consome a API pública SGS do Banco Central do Brasil — sem autenticação, " +
  "chave de API ou cadastro, e sem limite de requisições divulgado (uso é best-effort). " +
  "Em falha transitória ou timeout a chamada é repetida automaticamente (até 3 tentativas, " +
  "backoff exponencial); persistindo o erro, retorna `isError: true` com mensagem em português " +
  "(HTTP 404 = série inexistente ou sem dados no período solicitado). O resultado vem como JSON " +
  "tanto em texto quanto em `structuredContent` (conforme o outputSchema); datas no formato " +
  "dd/MM/yyyy e valores numéricos (ponto decimal).";

export const TOOL_DESCRIPTIONS: Record<string, string> = {
  bcb_serie_valores:
    "Consulta o histórico de valores de UMA série temporal do BCB pelo código SGS, opcionalmente " +
    "limitado por um intervalo de datas (dataInicial/dataFinal). " +
    "Quando usar: para obter a série histórica completa ou uma janela de datas específica. " +
    "Quando NÃO usar: para apenas os pontos mais recentes use bcb_serie_ultimos; para a variação " +
    "percentual use bcb_variacao; para comparar várias séries use bcb_comparar; se não souber o " +
    "código, descubra-o antes com bcb_buscar_serie ou bcb_series_populares. " +
    "Retorna: objeto `serie` (codigo, nome, categoria, periodicidade), `totalRegistros`, " +
    "`periodoInicial`, `periodoFinal` e `dados` (array de {data, valor}); quando não há dados, " +
    "`totalRegistros` = 0 e uma `observacao` explicativa. " +
    "Períodos longos: a API do BCB limita séries DIÁRIAS a 10 anos por consulta e recusa janela aberta " +
    "(HTTP 406). Isso é tratado automaticamente — a janela é fatiada em requisições de até 3 anos e o " +
    "resultado vem fundido e ordenado, com `chunking` na resposta dizendo quantas janelas foram usadas; " +
    "se o período pedido estava aberto numa série diária, `janelaAplicada` diz qual janela foi usada e por quê. " +
    "Harmonização: `frequencia` (mensal|trimestral|anual) reamostra a série antes de responder, com a " +
    "convenção escolhida em `agregacao`; a resposta traz `harmonizacao` com `derived: true` e a nota do cálculo. " +
    BEHAVIOR_NOTE,

  bcb_serie_ultimos:
    "Obtém as últimas N observações de UMA série temporal do BCB (mais recentes primeiro a partir " +
    "do fim da série). " +
    "Quando usar: para ver os dados mais recentes sem precisar calcular datas (ex.: últimos 12 meses " +
    "do IPCA). Quantidade entre 1 e 1000 (padrão 10). " +
    "Quando NÃO usar: para um intervalo de datas ou o histórico completo use bcb_serie_valores. " +
    "Retorna: objeto `serie`, `totalRegistros` e `dados` (array de {data, valor}); sem dados, " +
    "`totalRegistros` = 0 com `observacao`. " +
    "Acima de 20: o endpoint nativo do BCB rejeita N > 20 em qualquer periodicidade, então o servidor " +
    "descobre a periodicidade da série e busca por janela de datas, devolvendo os N últimos pontos. " +
    BEHAVIOR_NOTE,

  bcb_serie_metadados:
    "Obtém a descrição de UMA série do BCB (nome, periodicidade, categoria, fonte e último valor), sem " +
    "trazer a série histórica. " +
    "Quando usar: para confirmar o que uma série representa e com que frequência é publicada antes de " +
    "consultar os dados. Quando NÃO usar: para os valores em si use bcb_serie_valores ou bcb_serie_ultimos. " +
    "Retorna: codigo, nome, periodicidade, categoria, fonte, `ultimoValor` e URLs diretas da API " +
    "(urlConsulta, urlUltimos10). " +
    "Limite da fonte: a API do SGS NÃO publica endpoint de metadados por série — não há unidade de medida " +
    "disponível. Nome e categoria vêm do catálogo curado do servidor (150+ séries) e, fora dele, a " +
    "periodicidade é inferida do espaçamento das observações, sinalizada por `periodicidadeInferida`. " +
    BEHAVIOR_NOTE,

  bcb_series_populares:
    "Lista o catálogo interno curado de 150+ séries econômicas do BCB com seus códigos, agrupadas por " +
    "categoria (Juros, Inflação, Câmbio, Atividade Econômica, Emprego, Fiscal, Setor Externo, Crédito, " +
    "Agregados Monetários, Poupança, Índices de Mercado, Expectativas); aceita filtro por categoria. " +
    "Quando usar: para navegar/descobrir as séries disponíveis por tema. Quando NÃO usar: para busca " +
    "por palavra-chave use bcb_buscar_serie; esta ferramenta não busca valores. " +
    "Retorna: `totalSeries`, `categorias` (nº de categorias) e `series` — objeto agrupado por categoria " +
    "quando sem filtro, ou array plano quando filtrado por categoria; cada item tem codigo, nome, " +
    "categoria e periodicidade. Catálogo local: não faz chamada de rede.",

  bcb_buscar_serie:
    "Busca séries do BCB por palavra-chave (ou pelo código) em DUAS camadas: o catálogo curado local de " +
    "150+ séries, que vem primeiro e com nome revisado, e o índice do Portal de Dados Abertos do BCB, " +
    "com milhares de séries identificadas por código. Ignora acentos e maiúsculas ('inflacao' encontra " +
    "'Inflação'); vários termos são combinados com E ('ipca servicos'). " +
    "Quando usar: para descobrir o código de uma série antes de consultar valores. Quando NÃO usar: para " +
    "navegar tudo por categoria use bcb_series_populares; para valores use bcb_serie_valores. " +
    "Retorna: `termo`, `totalEncontradas`, `series` (cada item com codigo, nome, origem — 'curado' ou " +
    "'indice' — e, no índice, `dataset` com a página do portal), `catalogo` (origem, obtidoEm, " +
    "seriesIndexadas, cobertura) e, quando aplicável, `observacao`, `avisos`, `mensagem` e `sugestao`. " +
    "Cobertura: o índice NÃO é o SGS inteiro, portanto não encontrar aqui não prova que a série não " +
    "exista — o campo `catalogo.cobertura` diz isso explicitamente em toda resposta. " +
    "Comportamento de rede: o índice é servido de cache com validade de 24 h e a renovação é feita pela " +
    "primeira busca após o vencimento (uma requisição ao portal, ~1 s); as demais buscas não tocam a rede. " +
    "Se o portal estiver fora, a busca degrada para o catálogo curado (ou para o último índice obtido) e " +
    "sinaliza em `avisos`, sempre com a data de obtenção visível.",

  bcb_indicadores_atuais:
    "Atalho que retorna, em uma única chamada, o valor mais recente dos principais indicadores da " +
    "economia brasileira: Selic anualizada, IPCA mensal, IPCA acumulado 12 meses, Dólar PTAX (venda) " +
    "e IBC-Br. Não recebe parâmetros. " +
    "Quando usar: para um panorama econômico rápido. Quando NÃO usar: para qualquer outra série, para " +
    "dados históricos ou para escolher o período use bcb_serie_ultimos ou bcb_serie_valores. " +
    "Retorna: `consultadoEm` (timestamp ISO 8601) e `indicadores` (array com indicador, codigo, data, " +
    "valor — ou `erro` no item). Resiliente: cada indicador é buscado de forma independente, então a " +
    "falha de um não derruba os demais. " + BEHAVIOR_NOTE,

  bcb_variacao:
    "Calcula a variação percentual de UMA série entre o primeiro e o último ponto do período, mais " +
    "estatísticas descritivas. O período pode ser definido por datas (dataInicial/dataFinal) OU pelos " +
    "últimos N períodos (parâmetro `periodos`, que tem precedência e ignora as datas). " +
    "Quando usar: para medir tendência/variação de uma única série. Quando NÃO usar: para comparar " +
    "várias séries use bcb_comparar; para os valores brutos use bcb_serie_valores. Requer ao menos 2 " +
    "observações no período (senão retorna `isError`). " +
    "Retorna: `serie`, `periodo` (dataInicial, dataFinal, totalPeriodos), `analise` (valorInicial, " +
    "valorFinal, diferencaAbsoluta, variacaoPercentual, variacaoFormatada) e `estatisticas` (maximo, " +
    "minimo, media, amplitude). " +
    "Períodos longos são tratados automaticamente: janela diária acima de 10 anos é fatiada (a API do BCB " +
    "responde 406) e `periodos` acima de 20 é atendido por janela de datas; `chunking` e `janelaAplicada` " +
    "aparecem na resposta quando isso acontece. " + BEHAVIOR_NOTE,

  bcb_comparar:
    "Compara de 2 a 5 séries temporais no MESMO período (dataInicial e dataFinal obrigatórias), " +
    "calculando a variação percentual de cada uma e ordenando-as num ranking (maior para menor variação). " +
    "Quando usar: para comparar/correlacionar a evolução de vários indicadores lado a lado. Quando NÃO " +
    "usar: para uma única série use bcb_variacao. " +
    "Retorna: `periodo`, `totalSeries`, `seriesComDados`, `seriesComErro`, `ranking` (cada item com " +
    "posicao, codigo, nome, valorInicial, valorFinal, variacaoPercentual, maximo, minimo, media) e " +
    "`erros`. Resiliente: séries sem dados no período são isoladas em `erros` sem invalidar a comparação. " +
    "Periodicidades diferentes: comparar uma série diária com uma mensal alinha pontos que não são " +
    "comparáveis, e a resposta avisa isso em `aviso`; informe `frequencia` (mensal|trimestral|anual) para " +
    "harmonizar todas na mesma grade antes de comparar, escolhendo a convenção em `agregacao`. " +
    "Janelas longas em séries diárias são fatiadas automaticamente (limite de 10 anos da API do BCB). " +
    BEHAVIOR_NOTE
};

// ==================== TOOL DEFINITIONS (canonical, both transports) ====================
//
// Since the SDK v2 migration these JSON Schemas are the SINGLE advertised
// surface: `src/register.ts` hands them to the SDK verbatim (via
// `fromJsonSchema` + a permissive validator) for both stdio and the Worker.
// Before, stdio derived its schemas from Zod and the Worker used this list,
// so the two transports advertised different contracts — see
// `baselines/README.md`. Zod stays as the runtime validator inside handlers
// (that is what produces the pedagogical error results); it is no longer the
// source of the published schema.

const RAW_TOOL_DEFINITIONS = [
  {
    name: "bcb_serie_valores",
    description: TOOL_DESCRIPTIONS.bcb_serie_valores,
    annotations: {
      title: "Consultar valores da série",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        codigo: { type: "number" as const, description: "Código da série no SGS/BCB (ex: 433 para IPCA mensal, 11 para Selic)" },
        dataInicial: { type: "string" as const, description: "Data inicial no formato yyyy-MM-dd ou dd/MM/yyyy (opcional)" },
        dataFinal: { type: "string" as const, description: "Data final no formato yyyy-MM-dd ou dd/MM/yyyy (opcional)" },
        frequencia: FREQUENCIA_INPUT,
        agregacao: AGREGACAO_INPUT
      },
      required: ["codigo"]
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        serie: SERIE_REF_CONSULTADA_SCHEMA,
        totalRegistros: { type: "number" as const, description: "Quantidade de observações retornadas" },
        periodoInicial: { type: "string" as const, description: "Data da primeira observação" },
        periodoFinal: { type: "string" as const, description: "Data da última observação" },
        dados: { type: "array" as const, description: "Observações históricas", items: OBSERVACAO_OU_AGREGADO_SCHEMA },
        harmonizacao: HARMONIZACAO_SCHEMA,
        chunking: CHUNKING_SCHEMA,
        janelaAplicada: JANELA_APLICADA_SCHEMA,
        observacao: { type: "string" as const, description: "Mensagem informativa (ex.: quando não há dados)" }
      },
      required: ["serie", "totalRegistros", "dados"]
    }
  },
  {
    name: "bcb_serie_ultimos",
    description: TOOL_DESCRIPTIONS.bcb_serie_ultimos,
    annotations: {
      title: "Últimos valores da série",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        codigo: { type: "number" as const, description: "Código da série no SGS/BCB" },
        quantidade: {
          type: "number" as const,
          description:
            "Quantidade de valores a retornar (1-1000, padrão: 10). A API do BCB tem teto de 20 no endpoint " +
            "nativo; acima disso o servidor busca por janela de datas e devolve os N últimos.",
          default: 10,
          minimum: 1,
          maximum: 1000
        }
      },
      required: ["codigo"]
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        serie: SERIE_REF_CONSULTADA_SCHEMA,
        totalRegistros: { type: "number" as const, description: "Quantidade de observações retornadas" },
        dados: { type: "array" as const, description: "Observações mais recentes", items: OBSERVACAO_SCHEMA },
        chunking: CHUNKING_SCHEMA,
        observacao: { type: "string" as const, description: "Mensagem informativa (ex.: quando não há dados)" }
      },
      required: ["serie", "totalRegistros", "dados"]
    }
  },
  {
    name: "bcb_serie_metadados",
    description: TOOL_DESCRIPTIONS.bcb_serie_metadados,
    annotations: {
      title: "Metadados da série",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        codigo: { type: "number" as const, description: "Código da série no SGS/BCB" }
      },
      required: ["codigo"]
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        codigo: { type: "number" as const, description: "Código da série no SGS/BCB" },
        nome: { type: "string" as const, description: "Nome da série" },
        periodicidade: { type: "string" as const, description: "Periodicidade da série" },
        periodicidadeInferida: {
          type: "boolean" as const,
          description: "Presente e true quando a periodicidade foi inferida do espaçamento das observações"
        },
        fonte: { type: "string" as const, description: "Fonte dos dados" },
        categoria: { type: "string" as const, description: "Categoria econômica" },
        ultimoValor: { ...OBSERVACAO_SCHEMA, description: "Última observação disponível" },
        urlConsulta: { type: "string" as const, description: "URL da API do BCB para consulta completa" },
        urlUltimos10: { type: "string" as const, description: "URL da API do BCB para os últimos 10 valores" },
        observacao: { type: "string" as const, description: "Observação sobre a origem dos metadados" }
      },
      required: ["codigo", "nome", "fonte"]
    }
  },
  {
    name: "bcb_series_populares",
    description: TOOL_DESCRIPTIONS.bcb_series_populares,
    annotations: {
      title: "Listar séries populares",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        categoria: { type: "string" as const, description: "Filtrar por categoria: Juros, Inflação, Câmbio, Atividade Econômica, Emprego, Fiscal, Setor Externo, Crédito, Agregados Monetários, Poupança, Índices de Mercado, Expectativas" }
      }
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        totalSeries: { type: "number" as const, description: "Quantidade total de séries retornadas" },
        categorias: { type: "number" as const, description: "Quantidade de categorias distintas" },
        // União modelada de verdade: array plano quando há filtro de categoria,
        // objeto agrupado por categoria quando não há. Descrever em prosa sem
        // o `anyOf` deixaria o cliente sem contrato para o caso agrupado.
        series: {
          description:
            "Séries encontradas. Objeto agrupado por categoria quando sem filtro; array plano quando filtrado por categoria.",
          anyOf: [
            { type: "array" as const, items: SERIE_REF_SCHEMA },
            { type: "object" as const, additionalProperties: { type: "array" as const, items: SERIE_REF_SCHEMA } }
          ]
        },
        observacao: { type: "string" as const, description: "Dica de uso" }
      },
      required: ["totalSeries", "categorias", "series"]
    }
  },
  {
    name: "bcb_buscar_serie",
    description: TOOL_DESCRIPTIONS.bcb_buscar_serie,
    annotations: {
      title: "Buscar série no catálogo",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      // Passou a true na sessão de D3: a busca deixou de ser puramente local e
      // consulta o índice do portal de dados abertos (com cache de 24 h).
      openWorldHint: true
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        termo: {
          type: "string" as const,
          description: "Termo de busca (mínimo 2 caracteres) ou o código da série. Vários termos são combinados com E.",
          minLength: 2
        },
        limite: {
          type: "number" as const,
          description: "Máximo de séries a devolver (1-100, padrão: 20). `totalEncontradas` traz o total antes do corte.",
          default: 20,
          minimum: 1,
          maximum: 100
        }
      },
      required: ["termo"]
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        termo: { type: "string" as const, description: "Termo pesquisado" },
        totalEncontradas: { type: "number" as const, description: "Quantidade de séries encontradas, antes do corte por `limite`" },
        series: {
          type: "array" as const,
          description: "Séries que correspondem ao termo — as do catálogo curado primeiro",
          items: {
            type: "object" as const,
            properties: {
              codigo: { type: "number" as const, description: "Código da série no SGS/BCB" },
              nome: { type: "string" as const, description: "Nome da série (revisado quando `origem` = curado; derivado do slug do portal quando = indice)" },
              categoria: { type: "string" as const, description: "Categoria econômica (só no catálogo curado)" },
              periodicidade: { type: "string" as const, description: "Periodicidade (só no catálogo curado)" },
              origem: {
                type: "string" as const,
                enum: ["curado", "indice"],
                description: "Camada de onde veio o achado"
              },
              dataset: { type: "string" as const, description: "Página do dataset no portal de dados abertos (só quando `origem` = indice)" }
            },
            required: ["codigo", "nome", "origem"]
          }
        },
        catalogo: {
          type: "object" as const,
          description: "Proveniência do índice usado na busca",
          properties: {
            origem: { type: "string" as const, description: "Camadas consultadas" },
            obtidoEm: { type: "string" as const, description: "Timestamp ISO 8601 em que o índice do portal foi obtido" },
            seriesIndexadas: { type: "number" as const, description: "Quantidade de séries no índice consultado" },
            cobertura: { type: "string" as const, description: "Limite explícito de cobertura do índice" }
          },
          required: ["origem", "seriesIndexadas", "cobertura"]
        },
        observacao: { type: "string" as const, description: "Aviso de corte quando há mais resultados que `limite`" },
        avisos: {
          type: "array" as const,
          description: "Avisos de degradação (índice vencido ou indisponível)",
          items: { type: "string" as const }
        },
        mensagem: { type: "string" as const, description: "Mensagem exibida quando nada é encontrado" },
        sugestao: { type: "string" as const, description: "Sugestões de termos alternativos" }
      },
      required: ["termo", "totalEncontradas", "series", "catalogo"]
    }
  },
  {
    name: "bcb_indicadores_atuais",
    description: TOOL_DESCRIPTIONS.bcb_indicadores_atuais,
    annotations: {
      title: "Indicadores econômicos atuais",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object" as const,
      properties: {}
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        consultadoEm: { type: "string" as const, description: "Timestamp ISO 8601 da consulta" },
        indicadores: {
          type: "array" as const,
          description: "Lista de indicadores com seus valores mais recentes",
          items: {
            type: "object" as const,
            properties: {
              indicador: { type: "string" as const, description: "Nome do indicador" },
              codigo: { type: "number" as const, description: "Código da série no SGS/BCB" },
              data: { type: "string" as const, description: "Data da observação" },
              valor: { type: "number" as const, description: "Valor mais recente" },
              erro: { type: "string" as const, description: "Mensagem de erro quando o indicador não pôde ser obtido" }
            },
            required: ["indicador", "codigo"]
          }
        }
      },
      required: ["consultadoEm", "indicadores"]
    }
  },
  {
    name: "bcb_variacao",
    description: TOOL_DESCRIPTIONS.bcb_variacao,
    annotations: {
      title: "Variação percentual da série",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        codigo: { type: "number" as const, description: "Código da série no SGS/BCB" },
        dataInicial: {
          type: "string" as const,
          description: "Data inicial (yyyy-MM-dd ou dd/MM/yyyy). Se não informada, usa o primeiro valor disponível."
        },
        dataFinal: {
          type: "string" as const,
          description: "Data final (yyyy-MM-dd ou dd/MM/yyyy). Se não informada, usa o último valor disponível."
        },
        periodos: {
          type: "number" as const,
          description:
            "Alternativa: calcular variação dos últimos N períodos (ignora datas se informado). Acima de 20 " +
            "o servidor busca por janela de datas, porque o endpoint nativo do BCB tem esse teto."
        }
      },
      required: ["codigo"]
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        serie: {
          type: "object" as const,
          description: "Identificação da série",
          properties: {
            codigo: { type: "number" as const },
            nome: { type: "string" as const },
            categoria: { type: "string" as const }
          },
          required: ["codigo", "nome"]
        },
        periodo: {
          type: "object" as const,
          description: "Janela temporal analisada",
          properties: {
            dataInicial: { type: "string" as const },
            dataFinal: { type: "string" as const },
            totalPeriodos: { type: "number" as const }
          },
          required: ["dataInicial", "dataFinal", "totalPeriodos"]
        },
        analise: {
          type: "object" as const,
          description: "Resultado da variação entre o primeiro e o último valor",
          properties: {
            valorInicial: { type: "number" as const },
            valorFinal: { type: "number" as const },
            diferencaAbsoluta: { type: "number" as const },
            variacaoPercentual: { type: "number" as const },
            variacaoFormatada: { type: "string" as const }
          },
          // O handler sempre devolve os cinco campos — o contrato reflete isso.
          required: ["valorInicial", "valorFinal", "diferencaAbsoluta", "variacaoPercentual", "variacaoFormatada"]
        },
        estatisticas: {
          type: "object" as const,
          description: "Estatísticas descritivas dos valores no período",
          properties: {
            maximo: { type: "number" as const },
            minimo: { type: "number" as const },
            media: { type: "number" as const },
            amplitude: { type: "number" as const }
          },
          required: ["maximo", "minimo", "media", "amplitude"]
        },
        derivacao: DERIVACAO_SCHEMA,
        chunking: CHUNKING_SCHEMA,
        janelaAplicada: JANELA_APLICADA_SCHEMA
      },
      required: ["serie", "periodo", "analise", "estatisticas", "derivacao"]
    }
  },
  {
    name: "bcb_comparar",
    description: TOOL_DESCRIPTIONS.bcb_comparar,
    annotations: {
      title: "Comparar séries",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        codigos: {
          type: "array" as const,
          items: { type: "number" as const },
          description: "Array com 2 a 5 códigos de séries para comparar",
          minItems: 2,
          maxItems: 5
        },
        dataInicial: { type: "string" as const, description: "Data inicial (yyyy-MM-dd ou dd/MM/yyyy)" },
        dataFinal: { type: "string" as const, description: "Data final (yyyy-MM-dd ou dd/MM/yyyy)" },
        frequencia: FREQUENCIA_INPUT,
        agregacao: AGREGACAO_INPUT
      },
      required: ["codigos", "dataInicial", "dataFinal"]
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        periodo: {
          type: "object" as const,
          description: "Janela temporal comparada",
          properties: {
            dataInicial: { type: "string" as const },
            dataFinal: { type: "string" as const }
          },
          required: ["dataInicial", "dataFinal"]
        },
        totalSeries: { type: "number" as const, description: "Quantidade de séries solicitadas" },
        seriesComDados: { type: "number" as const, description: "Quantidade de séries com dados no período" },
        seriesComErro: { type: "number" as const, description: "Quantidade de séries sem dados ou com erro" },
        ranking: {
          type: "array" as const,
          description: "Séries ordenadas pela variação percentual (maior para menor)",
          items: {
            type: "object" as const,
            properties: {
              posicao: { type: "number" as const, description: "Posição no ranking" },
              codigo: { type: "number" as const },
              nome: { type: "string" as const },
              categoria: { type: "string" as const },
              periodicidade: { type: "string" as const },
              totalRegistros: { type: "number" as const },
              valorInicial: { type: "number" as const },
              valorFinal: { type: "number" as const },
              variacaoPercentual: { type: "number" as const },
              variacaoFormatada: { type: "string" as const },
              maximo: { type: "number" as const },
              minimo: { type: "number" as const },
              media: { type: "number" as const }
            },
            required: ["posicao", "codigo", "nome"]
          }
        },
        erros: {
          type: "array" as const,
          description: "Séries que não retornaram dados, com o motivo",
          items: {
            type: "object" as const,
            properties: {
              codigo: { type: "number" as const },
              nome: { type: "string" as const },
              erro: { type: "string" as const }
            },
            required: ["codigo", "erro"]
          }
        },
        derivacao: DERIVACAO_SCHEMA,
        harmonizacao: HARMONIZACAO_SCHEMA,
        aviso: {
          type: "string" as const,
          description:
            "Presente quando as séries comparadas têm periodicidades diferentes e nenhuma harmonização foi " +
            "pedida — os números do ranking, nesse caso, não são diretamente comparáveis entre si."
        }
      },
      required: ["periodo", "totalSeries", "seriesComDados", "seriesComErro", "ranking", "erros", "derivacao"]
    }
  }
];

/**
 * Catálogo canônico das tools, na ordem em que o `tools/list` publica: primeiro
 * as 8 do SGS (ordem preservada desde a fundação — mexer nela move a superfície
 * sem motivo), depois as 3 do Focus e as 2 de câmbio, que a sessão de D3
 * acrescentou. O selo (`additionalProperties: false`) é aplicado num lugar só,
 * para todas.
 */
export const TOOL_DEFINITIONS = [
  ...RAW_TOOL_DEFINITIONS,
  ...FOCUS_TOOL_DEFINITIONS,
  ...CAMBIO_TOOL_DEFINITIONS
].map(tool => ({
  ...tool,
  inputSchema: sealDeep(tool.inputSchema),
  outputSchema: sealDeep(tool.outputSchema)
}));

// ==================== RESOURCES (canonical, both transports) ====================
//
// Previously duplicated between index.ts (stdio) and worker.ts (HTTP), which is
// how the two channels drifted apart — the HTTP side published human-readable
// labels ("Séries Populares BCB") where stdio published identifiers
// ("series_populares"). The identifier is what MCP's `name` means, so the stdio
// form is canonical and the Worker now follows it.

export interface ResourceDefinition {
  name: string;
  uri: string;
  description: string;
  mimeType: string;
  read: () => string;
}

export const CODIGOS_PRINCIPAIS = {
  juros: { selic_meta: 1178, selic_acumulada: 432, cdi: 4389, tr: 226 },
  inflacao: { ipca_mensal: 433, ipca_12m: 13522, igpm: 189, inpc: 188 },
  cambio: { dolar_venda: 1, dolar_ptax: 3698, euro: 21619 },
  atividade: { pib_mensal: 4380, ibc_br: 24364 },
  emprego: { desemprego: 24369, rendimento_medio: 24380 },
  fiscal: { divida_bruta: 4513, divida_liquida: 4503, resultado_primario: 4537 }
};

export const RESOURCE_DEFINITIONS: ResourceDefinition[] = [
  {
    name: "series_populares",
    uri: "bcb://series/populares",
    description: "Catálogo de 150+ séries econômicas populares do BCB organizadas por categoria",
    mimeType: "application/json",
    read: () => JSON.stringify(SERIES_POPULARES, null, 2)
  },
  {
    name: "categorias",
    uri: "bcb://series/categorias",
    description: "Lista de categorias disponíveis no catálogo de séries do BCB",
    mimeType: "application/json",
    read: () => JSON.stringify([...new Set(SERIES_POPULARES.map(s => s.categoria))].sort(), null, 2)
  },
  {
    name: "codigos_principais",
    uri: "bcb://series/principais",
    description: "Códigos dos indicadores econômicos mais utilizados (Selic, IPCA, Dólar, PIB, etc.)",
    mimeType: "application/json",
    read: () => JSON.stringify(CODIGOS_PRINCIPAIS, null, 2)
  }
];

// ==================== PROMPTS (canonical, both transports) ====================

export interface PromptDefinition {
  name: string;
  description: string;
  text: string;
}

export const PROMPT_DEFINITIONS: PromptDefinition[] = [
  {
    name: "indicadores_atuais",
    description: "Consulta os principais indicadores econômicos do Brasil (Selic, IPCA, Dólar, IBC-Br)",
    text: "Consulte os indicadores econômicos atuais do Brasil usando a ferramenta bcb_indicadores_atuais e apresente os resultados de forma clara e organizada."
  },
  {
    name: "panorama_economico",
    description: "Gera um panorama completo da economia brasileira com os principais indicadores",
    text: "Faça um panorama completo da economia brasileira. Use bcb_indicadores_atuais para obter Selic, IPCA, Dólar e IBC-Br. Depois use bcb_serie_ultimos para consultar os últimos 3 valores da taxa de desemprego (código 24369) e da dívida bruta (código 4513). Apresente tudo de forma organizada com análise breve."
  },
  {
    name: "comparar_inflacao",
    description: "Compara os principais índices de inflação do Brasil (IPCA, IGP-M, INPC) nos últimos 12 meses",
    text: "Compare os principais índices de inflação do Brasil nos últimos 12 meses. Use bcb_serie_ultimos com quantidade 12 para IPCA (código 433), IGP-M (código 189) e INPC (código 188). Apresente uma tabela comparativa e análise das tendências."
  }
];

// ==================== TOOL DISPATCHER (for worker) ====================

export async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  // As tools das outras duas APIs despacham nos próprios módulos; cada um
  // devolve null quando a tool não é dele, e o SGS segue abaixo.
  const focus = dispatchFocusTool(toolName, args, timeoutMs, maxRetries);
  if (focus) return focus;

  const cambio = dispatchCambioTool(toolName, args, timeoutMs, maxRetries);
  if (cambio) return cambio;

  switch (toolName) {
    case "bcb_serie_valores":
      return handleSerieValores(
        args as {
          codigo: number; dataInicial?: string; dataFinal?: string;
          frequencia?: FrequenciaAlvo; agregacao?: Agregacao;
        },
        timeoutMs, maxRetries
      );
    case "bcb_serie_ultimos":
      return handleSerieUltimos(
        { codigo: args.codigo as number, quantidade: (args.quantidade as number) || 10 },
        timeoutMs, maxRetries
      );
    case "bcb_serie_metadados":
      return handleSerieMetadados(args as { codigo: number }, timeoutMs, maxRetries);
    case "bcb_series_populares":
      return handleSeriesPopulares(args as { categoria?: string });
    case "bcb_buscar_serie":
      return handleBuscarSerie(args as { termo: string; limite?: number }, timeoutMs, maxRetries);
    case "bcb_indicadores_atuais":
      return handleIndicadoresAtuais({} as Record<string, never>, timeoutMs, maxRetries);
    case "bcb_variacao":
      return handleVariacao(args as { codigo: number; dataInicial?: string; dataFinal?: string; periodos?: number }, timeoutMs, maxRetries);
    case "bcb_comparar":
      return handleComparar(
        args as {
          codigos: number[]; dataInicial: string; dataFinal: string;
          frequencia?: FrequenciaAlvo; agregacao?: Agregacao;
        },
        timeoutMs, maxRetries
      );
    default:
      return {
        content: [{ type: "text" as const, text: `Tool não encontrada: ${toolName}` }],
        isError: true
      };
  }
}
