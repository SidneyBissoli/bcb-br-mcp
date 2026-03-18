/**
 * BCB BR MCP Server — Shared Tools Logic
 * Extracted from index.ts to be shared between stdio (index.ts) and HTTP (worker.ts) transports.
 *
 * Author: Sidney Bissoli
 * License: MIT
 */

import { z } from "zod";

// ==================== CONSTANTS ====================

export const BCB_API_BASE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";

export const CONFIG = {
  TIMEOUT_MS: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  USER_AGENT: "bcb-br-mcp/1.1.0"
};

// Worker uses shorter timeout (Cloudflare has its own limits)
export const WORKER_CONFIG = {
  TIMEOUT_MS: 10000,
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,
  USER_AGENT: "bcb-br-mcp/1.1.0"
};

// ==================== TYPES ====================

export interface SerieValor {
  data: string;
  valor: string;
}

export interface SerieMetadados {
  codigo: number;
  nome: string;
  unidade: string;
  periodicidade: string;
  fonte: string;
  especial: boolean;
}

export interface SeriePopular {
  codigo: number;
  nome: string;
  categoria: string;
  periodicidade: string;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>, config?: { timeoutMs?: number; maxRetries?: number }) => Promise<ToolResult>;
}

// ==================== SERIES CATALOG ====================

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

// ==================== UTILITY FUNCTIONS ====================

export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function formatDateForApi(dateStr: string): string {
  if (dateStr.includes("-")) {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": CONFIG.USER_AGENT
      }
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchBcbApi(
  url: string,
  timeoutMs: number = CONFIG.TIMEOUT_MS,
  maxRetries: number = CONFIG.MAX_RETRIES
): Promise<unknown> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, timeoutMs);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Série não encontrada ou sem dados para o período solicitado`);
        }
        throw new Error(`Erro na API do BCB: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError.message.includes("não encontrada")) {
        throw lastError;
      }

      const isTimeout = lastError.name === "AbortError" ||
        lastError.message.includes("aborted") ||
        lastError.message.includes("timeout");

      if (attempt < maxRetries) {
        const delayMs = CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        const reason = isTimeout ? "timeout" : "erro";
        console.error(`Tentativa ${attempt}/${maxRetries} falhou (${reason}). Aguardando ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }
  }

  throw new Error(`Falha após ${maxRetries} tentativas: ${lastError?.message || "Erro desconhecido"}`);
}

export function calculateVariation(valorInicial: number, valorFinal: number): number {
  if (valorInicial === 0) return 0;
  return ((valorFinal - valorInicial) / Math.abs(valorInicial)) * 100;
}

// ==================== TOOL HANDLERS ====================

export async function handleSerieValores(
  args: { codigo: number; dataInicial?: string; dataFinal?: string },
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  try {
    let url = `${BCB_API_BASE}.${args.codigo}/dados?formato=json`;
    if (args.dataInicial) url += `&dataInicial=${formatDateForApi(args.dataInicial)}`;
    if (args.dataFinal) url += `&dataFinal=${formatDateForApi(args.dataFinal)}`;

    const data = await fetchBcbApi(url, timeoutMs, maxRetries) as SerieValor[];

    if (!Array.isArray(data) || data.length === 0) {
      return {
        content: [{ type: "text" as const, text: `Nenhum dado encontrado para a série ${args.codigo} no período solicitado.` }]
      };
    }

    const serieInfo = SERIES_POPULARES.find(s => s.codigo === args.codigo);
    const result = {
      serie: {
        codigo: args.codigo,
        nome: serieInfo?.nome || `Série ${args.codigo}`,
        categoria: serieInfo?.categoria || "Desconhecida",
        periodicidade: serieInfo?.periodicidade || "Desconhecida"
      },
      totalRegistros: data.length,
      periodoInicial: data[0].data,
      periodoFinal: data[data.length - 1].data,
      dados: data.map(d => ({ data: d.data, valor: parseFloat(d.valor) }))
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
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
    const url = `${BCB_API_BASE}.${args.codigo}/dados/ultimos/${args.quantidade}?formato=json`;
    const data = await fetchBcbApi(url, timeoutMs, maxRetries) as SerieValor[];

    if (!Array.isArray(data) || data.length === 0) {
      return {
        content: [{ type: "text" as const, text: `Nenhum dado encontrado para a série ${args.codigo}.` }]
      };
    }

    const serieInfo = SERIES_POPULARES.find(s => s.codigo === args.codigo);
    const result = {
      serie: {
        codigo: args.codigo,
        nome: serieInfo?.nome || `Série ${args.codigo}`,
        categoria: serieInfo?.categoria || "Desconhecida",
        periodicidade: serieInfo?.periodicidade || "Desconhecida"
      },
      totalRegistros: data.length,
      dados: data.map(d => ({ data: d.data, valor: parseFloat(d.valor) }))
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Erro ao consultar últimos valores da série ${args.codigo}: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

export async function handleSerieMetadados(
  args: { codigo: number },
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  try {
    const metadataUrl = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${args.codigo}/metadados?formato=json`;

    try {
      const metadata = await fetchBcbApi(metadataUrl, timeoutMs, maxRetries) as SerieMetadados;
      const serieInfo = SERIES_POPULARES.find(s => s.codigo === args.codigo);

      const result = {
        codigo: metadata.codigo || args.codigo,
        nome: metadata.nome || serieInfo?.nome || `Série ${args.codigo}`,
        unidade: metadata.unidade || "Não informada",
        periodicidade: metadata.periodicidade || serieInfo?.periodicidade || "Não informada",
        fonte: metadata.fonte || "Banco Central do Brasil",
        categoria: serieInfo?.categoria || "Não categorizada",
        especial: metadata.especial || false,
        urlConsulta: `${BCB_API_BASE}.${args.codigo}/dados?formato=json`,
        urlUltimos10: `${BCB_API_BASE}.${args.codigo}/dados/ultimos/10?formato=json`
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch {
      const serieInfo = SERIES_POPULARES.find(s => s.codigo === args.codigo);

      if (serieInfo) {
        const result = {
          codigo: args.codigo,
          nome: serieInfo.nome,
          periodicidade: serieInfo.periodicidade,
          categoria: serieInfo.categoria,
          fonte: "Banco Central do Brasil",
          urlConsulta: `${BCB_API_BASE}.${args.codigo}/dados?formato=json`,
          urlUltimos10: `${BCB_API_BASE}.${args.codigo}/dados/ultimos/10?formato=json`,
          observacao: "Metadados obtidos do catálogo interno"
        };

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }

      const url = `${BCB_API_BASE}.${args.codigo}/dados/ultimos/1?formato=json`;
      const data = await fetchBcbApi(url, timeoutMs, maxRetries) as SerieValor[];

      if (Array.isArray(data) && data.length > 0) {
        const result = {
          codigo: args.codigo,
          nome: `Série ${args.codigo}`,
          ultimoValor: { data: data[0].data, valor: parseFloat(data[0].valor) },
          fonte: "Banco Central do Brasil",
          urlConsulta: `${BCB_API_BASE}.${args.codigo}/dados?formato=json`,
          observacao: "Série encontrada, mas metadados detalhados não disponíveis"
        };

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }

      throw new Error("Série não encontrada");
    }
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

    const result = {
      totalSeries: series.length,
      categorias: Object.keys(porCategoria).length,
      series: args.categoria ? series : porCategoria,
      observacao: "Use bcb_serie_valores ou bcb_serie_ultimos com o código para consultar os dados"
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Erro ao listar séries: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

export async function handleBuscarSerie(
  args: { termo: string }
): Promise<ToolResult> {
  try {
    const termoNorm = normalizeString(args.termo);
    const encontradas = SERIES_POPULARES.filter(s =>
      normalizeString(s.nome).includes(termoNorm) ||
      normalizeString(s.categoria).includes(termoNorm)
    );

    if (encontradas.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            termo: args.termo,
            totalEncontradas: 0,
            mensagem: "Nenhuma série encontrada no catálogo interno. Use o portal SGS do BCB para buscar outras séries: https://www3.bcb.gov.br/sgspub/",
            sugestao: "Tente termos como: selic, ipca, dolar, cambio, pib, inflacao, credito, emprego"
          }, null, 2)
        }]
      };
    }

    const result = { termo: args.termo, totalEncontradas: encontradas.length, series: encontradas };
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
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

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ consultadoEm: new Date().toISOString(), indicadores: resultados }, null, 2)
      }]
    };
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
    let data: SerieValor[];

    if (args.periodos && args.periodos > 1) {
      const url = `${BCB_API_BASE}.${args.codigo}/dados/ultimos/${args.periodos}?formato=json`;
      data = await fetchBcbApi(url, timeoutMs, maxRetries) as SerieValor[];
    } else {
      let url = `${BCB_API_BASE}.${args.codigo}/dados?formato=json`;
      if (args.dataInicial) url += `&dataInicial=${formatDateForApi(args.dataInicial)}`;
      if (args.dataFinal) url += `&dataFinal=${formatDateForApi(args.dataFinal)}`;
      data = await fetchBcbApi(url, timeoutMs, maxRetries) as SerieValor[];
    }

    if (!Array.isArray(data) || data.length < 2) {
      return {
        content: [{ type: "text" as const, text: `Dados insuficientes para calcular variação. São necessários pelo menos 2 valores.` }]
      };
    }

    const serieInfo = SERIES_POPULARES.find(s => s.codigo === args.codigo);
    const valorInicial = parseFloat(data[0].valor);
    const valorFinal = parseFloat(data[data.length - 1].valor);
    const variacao = calculateVariation(valorInicial, valorFinal);
    const diferencaAbsoluta = valorFinal - valorInicial;
    const valores = data.map(d => parseFloat(d.valor));
    const maximo = Math.max(...valores);
    const minimo = Math.min(...valores);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;

    const result = {
      serie: { codigo: args.codigo, nome: serieInfo?.nome || `Série ${args.codigo}`, categoria: serieInfo?.categoria || "Desconhecida" },
      periodo: { dataInicial: data[0].data, dataFinal: data[data.length - 1].data, totalPeriodos: data.length },
      analise: {
        valorInicial, valorFinal,
        diferencaAbsoluta: Number(diferencaAbsoluta.toFixed(4)),
        variacaoPercentual: Number(variacao.toFixed(4)),
        variacaoFormatada: `${variacao >= 0 ? "+" : ""}${variacao.toFixed(2)}%`
      },
      estatisticas: {
        maximo: Number(maximo.toFixed(4)),
        minimo: Number(minimo.toFixed(4)),
        media: Number(media.toFixed(4)),
        amplitude: Number((maximo - minimo).toFixed(4))
      }
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Erro ao calcular variação: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

export async function handleComparar(
  args: { codigos: number[]; dataInicial: string; dataFinal: string },
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  try {
    const resultados = await Promise.all(
      args.codigos.map(async (codigo) => {
        try {
          let url = `${BCB_API_BASE}.${codigo}/dados?formato=json`;
          url += `&dataInicial=${formatDateForApi(args.dataInicial)}`;
          url += `&dataFinal=${formatDateForApi(args.dataFinal)}`;

          const data = await fetchBcbApi(url, timeoutMs, maxRetries) as SerieValor[];
          const serieInfo = SERIES_POPULARES.find(s => s.codigo === codigo);

          if (!Array.isArray(data) || data.length === 0) {
            return { codigo, nome: serieInfo?.nome || `Série ${codigo}`, erro: "Sem dados no período" };
          }

          const valores = data.map(d => parseFloat(d.valor));
          const valorInicial = valores[0];
          const valorFinal = valores[valores.length - 1];
          const variacao = calculateVariation(valorInicial, valorFinal);

          return {
            codigo,
            nome: serieInfo?.nome || `Série ${codigo}`,
            categoria: serieInfo?.categoria || "Desconhecida",
            periodicidade: serieInfo?.periodicidade || "Desconhecida",
            totalRegistros: data.length,
            valorInicial, valorFinal,
            variacaoPercentual: Number(variacao.toFixed(4)),
            variacaoFormatada: `${variacao >= 0 ? "+" : ""}${variacao.toFixed(2)}%`,
            maximo: Math.max(...valores),
            minimo: Math.min(...valores),
            media: Number((valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(4))
          };
        } catch (err) {
          const serieInfo = SERIES_POPULARES.find(s => s.codigo === codigo);
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

    const result = {
      periodo: { dataInicial: formatDateForApi(args.dataInicial), dataFinal: formatDateForApi(args.dataFinal) },
      totalSeries: args.codigos.length,
      seriesComDados: seriesComDados.length,
      seriesComErro: seriesComErro.length,
      ranking: seriesOrdenadas.map((s, i) => ({ posicao: i + 1, ...s })),
      erros: seriesComErro.length > 0 ? seriesComErro : undefined
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Erro ao comparar séries: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

// ==================== TOOL DEFINITIONS (for worker JSON-RPC) ====================

export const TOOL_DEFINITIONS = [
  {
    name: "bcb_serie_valores",
    description: "Consulta valores de uma série temporal do BCB por código. Retorna dados históricos com data e valor.",
    inputSchema: {
      type: "object" as const,
      properties: {
        codigo: { type: "number" as const, description: "Código da série no SGS/BCB (ex: 433 para IPCA mensal, 11 para Selic)" },
        dataInicial: { type: "string" as const, description: "Data inicial no formato yyyy-MM-dd ou dd/MM/yyyy (opcional)" },
        dataFinal: { type: "string" as const, description: "Data final no formato yyyy-MM-dd ou dd/MM/yyyy (opcional)" }
      },
      required: ["codigo"]
    }
  },
  {
    name: "bcb_serie_ultimos",
    description: "Obtém os últimos N valores de uma série temporal do BCB. Útil para consultar dados mais recentes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        codigo: { type: "number" as const, description: "Código da série no SGS/BCB" },
        quantidade: { type: "number" as const, description: "Quantidade de valores a retornar (1-1000, padrão: 10)" }
      },
      required: ["codigo"]
    }
  },
  {
    name: "bcb_serie_metadados",
    description: "Obtém informações/metadados de uma série temporal do BCB. Retorna nome, periodicidade, categoria e outros detalhes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        codigo: { type: "number" as const, description: "Código da série no SGS/BCB" }
      },
      required: ["codigo"]
    }
  },
  {
    name: "bcb_series_populares",
    description: "Lista 150+ séries temporais do BCB com seus códigos. Inclui juros, inflação, câmbio, PIB, emprego, crédito e outros indicadores econômicos.",
    inputSchema: {
      type: "object" as const,
      properties: {
        categoria: { type: "string" as const, description: "Filtrar por categoria: Juros, Inflação, Câmbio, Atividade Econômica, Emprego, Fiscal, Setor Externo, Crédito, Agregados Monetários, Poupança, Índices de Mercado, Expectativas" }
      }
    }
  },
  {
    name: "bcb_buscar_serie",
    description: "Busca séries no catálogo interno por nome ou descrição. Aceita termos com ou sem acentos (ex: 'inflacao' encontra 'Inflação').",
    inputSchema: {
      type: "object" as const,
      properties: {
        termo: { type: "string" as const, description: "Termo de busca (mínimo 2 caracteres)" }
      },
      required: ["termo"]
    }
  },
  {
    name: "bcb_indicadores_atuais",
    description: "Obtém os valores mais recentes dos principais indicadores econômicos: Selic, IPCA, Dólar PTAX e IBC-Br.",
    inputSchema: {
      type: "object" as const,
      properties: {}
    }
  },
  {
    name: "bcb_variacao",
    description: "Calcula a variação percentual de uma série entre duas datas ou nos últimos N períodos. Útil para análise de tendências.",
    inputSchema: {
      type: "object" as const,
      properties: {
        codigo: { type: "number" as const, description: "Código da série no SGS/BCB" },
        dataInicial: { type: "string" as const, description: "Data inicial (yyyy-MM-dd ou dd/MM/yyyy)" },
        dataFinal: { type: "string" as const, description: "Data final (yyyy-MM-dd ou dd/MM/yyyy)" },
        periodos: { type: "number" as const, description: "Alternativa: calcular variação dos últimos N períodos (ignora datas se informado)" }
      },
      required: ["codigo"]
    }
  },
  {
    name: "bcb_comparar",
    description: "Compara 2 a 5 séries temporais no mesmo período. Útil para análise de correlação entre indicadores.",
    inputSchema: {
      type: "object" as const,
      properties: {
        codigos: { type: "array" as const, items: { type: "number" as const }, description: "Array com 2 a 5 códigos de séries para comparar" },
        dataInicial: { type: "string" as const, description: "Data inicial (yyyy-MM-dd ou dd/MM/yyyy)" },
        dataFinal: { type: "string" as const, description: "Data final (yyyy-MM-dd ou dd/MM/yyyy)" }
      },
      required: ["codigos", "dataInicial", "dataFinal"]
    }
  }
];

// ==================== TOOL DISPATCHER (for worker) ====================

export async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  switch (toolName) {
    case "bcb_serie_valores":
      return handleSerieValores(args as { codigo: number; dataInicial?: string; dataFinal?: string }, timeoutMs, maxRetries);
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
      return handleBuscarSerie(args as { termo: string });
    case "bcb_indicadores_atuais":
      return handleIndicadoresAtuais({} as Record<string, never>, timeoutMs, maxRetries);
    case "bcb_variacao":
      return handleVariacao(args as { codigo: number; dataInicial?: string; dataFinal?: string; periodos?: number }, timeoutMs, maxRetries);
    case "bcb_comparar":
      return handleComparar(args as { codigos: number[]; dataInicial: string; dataFinal: string }, timeoutMs, maxRetries);
    default:
      return {
        content: [{ type: "text" as const, text: `Tool não encontrada: ${toolName}` }],
        isError: true
      };
  }
}
