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

import { CKAN_PACKAGE_LIST, obterCatalogo, buscarSeries } from "./catalog.js";
import { FOCUS_TOOL_DEFINITIONS, dispatchFocusTool } from "./focus.js";
import { CAMBIO_TOOL_DEFINITIONS, dispatchCambioTool } from "./cambio.js";
import {
  DERIVACAO_CORRELACAO,
  DERIVACAO_DEFLACAO,
  DERIVACAO_ENCADEAMENTO,
  DERIVACAO_ESTATISTICA,
  arredondarDerivado,
  variacaoAcumulada,
  type MetodoVariacao,
  correlacaoEntreSeries,
  emVariacoes,
  estatisticasDaSerie,
  type BaseCorrelacao,
  type MetodoCorrelacao
} from "./stats.js";
import {
  ROTULO_PERIODICIDADE,
  TETO_ULTIMOS,
  alinharSeries,
  buscarSerieSgs,
  buscarUltimosSgs,
  chaveMes,
  construirDeflator,
  deflacionar,
  harmonizar,
  hojeSgs,
  inferirPeriodicidade,
  urlSerie,
  type Agregacao,
  type FrequenciaAlvo,
  type Periodicidade,
  type ResultadoSerie
} from "./series.js";
import {
  CONFIG,
  calculateVariation,
  comColetorDeExtracao,
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
import {
  NOTA_DERIVACAO_DEFLACAO,
  NOTA_DERIVACAO_ENCADEAMENTO,
  NOTA_DERIVACAO_ESTATISTICA,
  NOTA_DERIVACAO_HARMONIZACAO,
  comProveniencia,
  comProvenienciaMulti,
  provenienciaBcb,
  resultadoComProveniencia,
  type Proveniencia
} from "./provenance.js";

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

/**
 * Catálogo curado: a camada de destaque da busca, e a origem de `serie.nome` em
 * toda consulta de valores.
 *
 * **Verificado série a série contra a origem em 13/08/2026** (`bcb/docs/06`), o
 * que era dívida antiga: a lista havia sido montada sem verificação e cerca de
 * metade do que era conferível estava trocado — 432 e 1178 invertidas entre si,
 * 29033–29038 anunciadas como Focus quando são endividamento das famílias,
 * 20540 e 20541 com pessoa física e jurídica ao contrário, e por aí.
 *
 * Como ler cada campo:
 *
 * - `nome` com `fonteNome: "portal"` é **transcrição** do título que o BCB
 *   publica no dataset da série no Portal de Dados Abertos. Não editar para
 *   ficar mais bonito: o valor deste catálogo é ser o que a fonte diz, e nomes
 *   "melhorados" à mão foram exatamente o que produziu os erros anteriores.
 * - `nome` com `fonteNome: "medido"` é herdado — essas 57 séries **não têm
 *   dataset no portal**, e não há outra rota de nome (não existe endpoint de
 *   metadados, e o WSDL legado do SGS não publica nome). Delas foi medido o que
 *   o dado revela: magnitude e periodicidade. Nome compatível com o dado não é
 *   nome verificado, e o campo existe para não confundir as duas coisas.
 * - `periodicidade` é sempre a **MEDIDA** pelo espaçamento das observações,
 *   nunca o rótulo herdado — que errava em 43 das 169 entradas antigas.
 * - `categoria` é nossa: o portal não categoriza.
 *
 * 30 entradas foram REMOVIDAS na mesma verificação, cada uma com um fato da
 * origem contra: 4 códigos que não existem no SGS (14, 13523, 21860, 13690 —
 * a origem responde a eles a mesma página de "requisição inválida" que responde
 * a um código inventado), séries mortas há mais de uma década devolvendo zero, e
 * séries cujo dado desmente o nome. O motivo de cada uma está no CHANGELOG.
 *
 * Ao acrescentar série: verifique no portal antes
 * (`package_search?q=codigo_sgs:N`) e, se não houver dataset, meça `ultimos/20`
 * e entre com `fonteNome: "medido"`.
 */
export const SERIES_POPULARES: SeriePopular[] = [
  // ==================== JUROS ====================
  { codigo: 11, nome: "Taxa de juros - Selic", categoria: "Juros", periodicidade: "Diária", fonteNome: "portal", unidade: "Percentual ao dia" },
  { codigo: 432, nome: "Taxa de juros - Meta Selic definida pelo Copom", categoria: "Juros", periodicidade: "Diária", fonteNome: "portal", unidade: "Percentual ao ano" },
  { codigo: 1178, nome: "Taxa de juros - Selic anualizada base 252", categoria: "Juros", periodicidade: "Diária", fonteNome: "portal", unidade: "Percentual ao ano" },
  { codigo: 4189, nome: "Taxa de juros - Selic acumulada no mês anualizada base 252", categoria: "Juros", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual ao ano" },
  { codigo: 4390, nome: "Taxa de juros - Selic acumulada no mês", categoria: "Juros", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual ao mês" },
  { codigo: 12, nome: "Taxa de juros - CDI diária", categoria: "Juros", periodicidade: "Diária", fonteNome: "medido" },
  { codigo: 4389, nome: "Taxa de juros - CDI anualizada base 252", categoria: "Juros", periodicidade: "Diária", fonteNome: "medido" },
  { codigo: 4391, nome: "Taxa de juros - CDI acumulada no mês", categoria: "Juros", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 4392, nome: "Taxa de juros - CDI acumulada no mês anualizada", categoria: "Juros", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 226, nome: "Taxa Referencial (TR) - diária", categoria: "Juros", periodicidade: "Diária", fonteNome: "medido" },
  { codigo: 7811, nome: "Taxa Referencial (TR) - mensal", categoria: "Juros", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 7812, nome: "Taxa Referencial (TR) - anualizada", categoria: "Juros", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 256, nome: "Taxa de Juros de Longo Prazo (TJLP)", categoria: "Juros", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 253, nome: "Taxa de juros - CDB pré-fixado - 30 dias", categoria: "Juros", periodicidade: "Diária", fonteNome: "medido" },

  // ==================== INFLAÇÃO ====================
  { codigo: 433, nome: "IPCA - Variação mensal", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 13522, nome: "IPCA - Variação acumulada em 12 meses", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 7478, nome: "IPCA-15 - Variação mensal", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 10764, nome: "IPCA-E - Variação mensal", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 16121, nome: "Índice nacional de preços ao consumidor - Amplo (IPCA) - Núcleo por exclusão - ex2", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "portal", unidade: "Variação percentual mensal" },
  { codigo: 16122, nome: "Índice nacional de preços ao consumidor - Amplo (IPCA) - Núcleo de dupla ponderação", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "portal", unidade: "Variação percentual mensal" },
  { codigo: 11426, nome: "Índice nacional de preços ao consumidor - Amplo (IPCA) - Núcleo médias aparadas sem suavização", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "portal", unidade: "Variação percentual mensal" },
  { codigo: 11427, nome: "Índice nacional de preços ao consumidor - Amplo (IPCA) - Núcleo por exclusão - Sem monitorados e alimentos no domicílio", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "portal", unidade: "Variação percentual mensal" },
  { codigo: 10841, nome: "Índice de Preços ao Consumidor-Amplo (IPCA) - Bens não-duráveis", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "portal", unidade: "Variação percentual mensal" },
  { codigo: 10842, nome: "Índice de Preços ao Consumidor-Amplo (IPCA) - Bens semi-duráveis", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "portal", unidade: "Variação percentual mensal" },
  { codigo: 10843, nome: "Índice de Preços ao Consumidor-Amplo (IPCA) - Duráveis", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "portal", unidade: "Variação percentual mensal" },
  { codigo: 10844, nome: "Índice de Preços ao Consumidor-Amplo (IPCA) - Serviços", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "portal", unidade: "Variação percentual mensal" },
  { codigo: 4449, nome: "Índice nacional de preços ao consumidor-Amplo (IPCA) - Preços monitorados - Total", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "portal", unidade: "Variação percentual mensal" },
  { codigo: 11428, nome: "Índice nacional de preços ao consumidor - Amplo (IPCA) - Itens livres", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "portal", unidade: "Variação percentual mensal" },
  { codigo: 188, nome: "INPC - Variação mensal", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 189, nome: "IGP-M - Variação mensal", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 7447, nome: "IGP-10 - Variação mensal", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 190, nome: "IGP-DI - Variação mensal", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 7450, nome: "IPA-M - Variação mensal", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 225, nome: "IPA-DI - Geral - Variação mensal", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 7459, nome: "IPA-DI - Produtos industriais", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 7460, nome: "IPA-DI - Produtos agrícolas", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 191, nome: "IPC-DI - Variação mensal", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 193, nome: "IPC-Fipe - Variação mensal", categoria: "Inflação", periodicidade: "Mensal", fonteNome: "medido" },

  // ==================== CÂMBIO ====================
  { codigo: 1, nome: "Taxa de câmbio - Livre - Dólar americano (venda) - diário", categoria: "Câmbio", periodicidade: "Diária", fonteNome: "portal", unidade: "Taxa unidade monetária corrente/dólar americano" },
  { codigo: 10813, nome: "Taxa de câmbio - Livre - Dólar americano (compra)", categoria: "Câmbio", periodicidade: "Diária", fonteNome: "portal", unidade: "Taxa unidade monetária corrente/dólar americano" },
  { codigo: 3698, nome: "Taxa de câmbio - PTAX - Dólar americano (venda)", categoria: "Câmbio", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 3697, nome: "Taxa de câmbio - PTAX - Dólar americano (compra)", categoria: "Câmbio", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 3695, nome: "Taxa de câmbio - PTAX - Dólar americano (média)", categoria: "Câmbio", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 21619, nome: "Taxa de câmbio - Euro (venda)", categoria: "Câmbio", periodicidade: "Diária", fonteNome: "medido" },
  { codigo: 21620, nome: "Taxa de câmbio - Euro (compra)", categoria: "Câmbio", periodicidade: "Diária", fonteNome: "medido" },
  { codigo: 21623, nome: "Taxa de câmbio - Libra Esterlina (venda)", categoria: "Câmbio", periodicidade: "Diária", fonteNome: "medido" },
  { codigo: 21624, nome: "Taxa de câmbio - Libra Esterlina (compra)", categoria: "Câmbio", periodicidade: "Diária", fonteNome: "medido" },
  { codigo: 21621, nome: "Taxa de câmbio - Iene (venda)", categoria: "Câmbio", periodicidade: "Diária", fonteNome: "medido" },
  { codigo: 21622, nome: "Taxa de câmbio - Iene (compra)", categoria: "Câmbio", periodicidade: "Diária", fonteNome: "medido" },
  { codigo: 21625, nome: "Taxa de câmbio - Franco Suíço (venda)", categoria: "Câmbio", periodicidade: "Diária", fonteNome: "medido" },
  { codigo: 21626, nome: "Taxa de câmbio - Franco Suíço (compra)", categoria: "Câmbio", periodicidade: "Diária", fonteNome: "medido" },

  // ==================== ATIVIDADE ECONÔMICA ====================
  { codigo: 4380, nome: "PIB mensal - Valores correntes (R$ milhões)", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 4381, nome: "PIB acumulado no ano - Valores correntes (R$ milhões)", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 4382, nome: "PIB acumulado dos últimos 12 meses - Valores correntes (R$ milhões)", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 4385, nome: "PIB mensal em US$ (milhões)", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 4386, nome: "PIB acumulado no ano em US$ (milhões)", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 7324, nome: "PIB anual em US$ (milhões)", categoria: "Atividade Econômica", periodicidade: "Anual", fonteNome: "medido" },
  { codigo: 24363, nome: "Índice de Atividade Econômica do Banco Central - IBC-Br", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "portal", unidade: "Índice" },
  { codigo: 24364, nome: "Índice de Atividade Econômica do Banco Central (IBC-Br) - com ajuste sazonal", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "portal", unidade: "Índice" },
  { codigo: 29601, nome: "Índice de Atividade Econômica do Banco Central (IBC-Br) Agropecuária", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "portal", unidade: "Índice" },
  { codigo: 29602, nome: "Índice de Atividade Econômica do Banco Central (IBC-Br) Agropecuária - com ajuste sazonal", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "portal", unidade: "Índice" },
  { codigo: 29603, nome: "Índice de Atividade Econômica do Banco Central (IBC-Br) Indústria", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "portal", unidade: "Índice" },
  { codigo: 29604, nome: "Índice de Atividade Econômica do Banco Central (IBC-Br) Indústria - com ajuste sazonal", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "portal", unidade: "Índice" },
  { codigo: 29605, nome: "Índice de Atividade Econômica do Banco Central (IBC-Br) Serviços", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "portal", unidade: "Índice" },
  { codigo: 29606, nome: "Índice de Atividade Econômica do Banco Central (IBC-Br) Serviços - com ajuste sazonal", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "portal", unidade: "Índice" },
  { codigo: 22103, nome: "Exportação de bens e serviços - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral", fonteNome: "medido" },
  { codigo: 22104, nome: "Importação de bens e serviços - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral", fonteNome: "medido" },
  { codigo: 22109, nome: "Consumo das famílias - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral", fonteNome: "medido" },
  { codigo: 22110, nome: "Consumo do governo - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral", fonteNome: "medido" },
  { codigo: 22111, nome: "Formação bruta de capital fixo - Trimestral", categoria: "Atividade Econômica", periodicidade: "Trimestral", fonteNome: "medido" },
  { codigo: 21859, nome: "Produção industrial - Geral - Variação mensal", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 21862, nome: "Utilização da capacidade instalada - Indústria", categoria: "Atividade Econômica", periodicidade: "Mensal", fonteNome: "medido" },

  // ==================== EMPREGO ====================
  { codigo: 24369, nome: "Taxa de desocupação - PNAD Contínua", categoria: "Emprego", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 24380, nome: "Rendimento médio real habitual - Todos os trabalhos", categoria: "Emprego", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 24381, nome: "Massa de rendimento real habitual", categoria: "Emprego", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 28561, nome: "CAGED - Saldo de empregos formais", categoria: "Emprego", periodicidade: "Mensal", fonteNome: "medido" },

  // ==================== FISCAL ====================
  { codigo: 4503, nome: "Dívida Líquida do Setor Público (% PIB) - Total - Governo Federal e Banco Central", categoria: "Fiscal", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 4513, nome: "Dívida Líquida do Setor Público (% PIB) - Total - Setor público consolidado", categoria: "Fiscal", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 4505, nome: "Dívida Líquida do Setor Público (% PIB) - Total - Banco Central", categoria: "Fiscal", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 4536, nome: "Dívida líquida do governo geral (% PIB)", categoria: "Fiscal", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 4537, nome: "Dívida bruta do governo geral (% PIB) - Metodologia utilizada até 2007", categoria: "Fiscal", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 5364, nome: "Receita total do governo central", categoria: "Fiscal", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 5793, nome: "NFSP sem desvalorização cambial (% PIB) - Fluxo acumulado em 12 meses - Resultado primário - Total - Setor público consolidado", categoria: "Fiscal", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },

  // ==================== SETOR EXTERNO ====================
  { codigo: 3546, nome: "Reservas internacionais - Conceito liquidez - Total", categoria: "Setor Externo", periodicidade: "Mensal", fonteNome: "medido" },
  { codigo: 13621, nome: "Reservas internacionais - Conceito caixa - Total - diária", categoria: "Setor Externo", periodicidade: "Diária", fonteNome: "portal", unidade: "Milhões de dólares americanos" },
  { codigo: 22707, nome: "Balança comercial - Balanço de Pagamentos - mensal - saldo", categoria: "Setor Externo", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de dólares americanos" },
  { codigo: 22708, nome: "Exportação de bens - Balanço de Pagamentos - mensal", categoria: "Setor Externo", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de dólares americanos" },
  { codigo: 22709, nome: "Importação de bens - Balanço de Pagamentos - mensal", categoria: "Setor Externo", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de dólares americanos" },
  { codigo: 22714, nome: "Bens exportados sob merchanting - exportações positivas - mensal", categoria: "Setor Externo", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de dólares americanos" },
  { codigo: 22701, nome: "Transações correntes - mensal - saldo", categoria: "Setor Externo", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de dólares americanos" },
  { codigo: 22704, nome: "Balança comercial e Serviços - mensal - saldo", categoria: "Setor Externo", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de dólares americanos" },
  { codigo: 22715, nome: "Bens importados sob merchanting - exportações negativas - mensal", categoria: "Setor Externo", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de dólares americanos" },
  { codigo: 22716, nome: "Balança comercial - ouro não monetário - Balanço de Pagamentos - mensal - saldo", categoria: "Setor Externo", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de dólares americanos" },
  { codigo: 22846, nome: "Renda secundária - Demais setores - Transferências pessoais - mensal - receita", categoria: "Setor Externo", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de dólares americanos" },
  { codigo: 22885, nome: "Investimentos diretos no país - IDP - mensal - líquido", categoria: "Setor Externo", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de dólares americanos" },

  // ==================== CRÉDITO ====================
  { codigo: 20539, nome: "Saldo da carteira de crédito - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Unidades monetárias correntes" },
  { codigo: 20540, nome: "Saldo da carteira de crédito - Pessoas jurídicas - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de reais" },
  { codigo: 20541, nome: "Saldo da carteira de crédito - Pessoas físicas - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de reais" },
  { codigo: 20542, nome: "Saldo da carteira de crédito com recursos livres - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de reais" },
  { codigo: 20570, nome: "Saldo da carteira de crédito com recursos livres - Pessoas físicas - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de reais" },
  { codigo: 20592, nome: "Saldo da carteira de crédito com recursos livres - Pessoas físicas - Outros créditos livres", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de reais" },
  { codigo: 20615, nome: "Saldo da carteira de crédito com recursos direcionados - Pessoas físicas - Financiamento agroindustrial com recursos do BNDES", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de reais" },
  { codigo: 20631, nome: "Concessões de crédito - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de reais" },
  { codigo: 20665, nome: "Concessões de crédito com recursos livres - Pessoas físicas - Cheque especial", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhões de reais" },
  { codigo: 20714, nome: "Taxa média de juros das operações de crédito - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual ao ano" },
  { codigo: 20716, nome: "Taxa média de juros das operações de crédito - Pessoas físicas - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual ao ano" },
  { codigo: 20740, nome: "Taxa média de juros das operações de crédito com recursos livres - Pessoas físicas - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual ao ano" },
  { codigo: 20749, nome: "Taxa média de juros das operações de crédito com recursos livres - Pessoas físicas - Aquisição de veículos", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual ao ano" },
  { codigo: 20772, nome: "Taxa média de juros das operações de crédito com recursos direcionados - Pessoas físicas - Financiamento imobiliário com taxas de mercado", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual ao ano" },
  { codigo: 25497, nome: "Taxa média mensal de juros das operações de crédito com recursos direcionados - Pessoas físicas - Financiamento imobiliário com taxas de mercado", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual ao mês" },
  { codigo: 20783, nome: "Spread médio das operações de crédito - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Pontos percentuais" },
  { codigo: 20785, nome: "Spread médio das operações de crédito - Pessoas físicas - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Pontos percentuais" },
  { codigo: 20786, nome: "Spread médio das operações de crédito com recursos livres - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Pontos percentuais" },
  { codigo: 21082, nome: "Inadimplência da carteira de crédito - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 21084, nome: "Inadimplência da carteira de crédito - Pessoas físicas - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 21085, nome: "Inadimplência da carteira de crédito com recursos livres - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 21128, nome: "Inadimplência da carteira de crédito com recursos livres - Pessoas físicas - Cartão de crédito parcelado", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 21129, nome: "Inadimplência da carteira de crédito com recursos livres - Pessoas físicas - Cartão de crédito total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 13685, nome: "Inadimplência da carteira de crédito das instituições financeiras sob controle privado - Total", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 29033, nome: "Comprometimento de renda das famílias com juros da dívida com o Sistema Financeiro Nacional - Com ajuste sazonal (RNDBF)", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 29034, nome: "Comprometimento de renda das famílias com o serviço da dívida com o Sistema Financeiro Nacional - Com ajuste sazonal (RNDBF)", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 29035, nome: "Comprometimento de renda das famílias com o serviço da dívida com o Sistema Financeiro Nacional exceto crédito habitacional - Com ajuste sazonal (RNDBF)", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 29036, nome: "Comprometimento de renda das famílias com amortização da dívida com o Sistema Financeiro Nacional - Com ajuste sazonal (RNDBF)", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 29037, nome: "Endividamento das famílias com o Sistema Financeiro Nacional em relação à renda acumulada dos últimos doze meses (RNDBF)", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },
  { codigo: 29038, nome: "Endividamento das famílias com o Sistema Financeiro Nacional exceto crédito habitacional em relação à renda acumulada dos últimos 12 meses (RNDBF)", categoria: "Crédito", periodicidade: "Mensal", fonteNome: "portal", unidade: "Percentual" },

  // ==================== AGREGADOS MONETÁRIOS ====================
  { codigo: 1788, nome: "BM - Base monetária restrita (saldo em final de período)", categoria: "Agregados Monetários", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhares de unidades monetárias correntes" },
  { codigo: 1833, nome: "Base Monetária Ampliada (saldo em final de período)", categoria: "Agregados Monetários", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhares de unidades monetárias correntes" },
  { codigo: 27788, nome: "Meios de pagamento - M1 (média dos dias úteis do mês) - Novo", categoria: "Agregados Monetários", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhares de unidades monetárias correntes" },
  { codigo: 27789, nome: "Meios de pagamento - Papel moeda em poder do público (saldo em final de período) - Novo", categoria: "Agregados Monetários", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhares de unidades monetárias correntes" },
  { codigo: 27790, nome: "Meios de pagamento - Depósitos à vista (saldo em final de período) - Novo", categoria: "Agregados Monetários", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhares de unidades monetárias correntes" },
  { codigo: 27791, nome: "Meios de pagamento - M1 (saldo em final de período) - Novo", categoria: "Agregados Monetários", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhares de unidades monetárias correntes" },
  { codigo: 27815, nome: "Meios de pagamento amplos - M4 (saldo em final de periodo) - Novo", categoria: "Agregados Monetários", periodicidade: "Mensal", fonteNome: "portal", unidade: "Milhares de unidades monetárias correntes" },
  { codigo: 7530, nome: "Comportamento monetário - Comportamento do público - C", categoria: "Agregados Monetários", periodicidade: "Mensal", fonteNome: "portal", unidade: "Índice" },

  // ==================== POUPANÇA ====================
  { codigo: 25, nome: "Depósitos de poupança até 03.05.2012 - Rentabilidade no período", categoria: "Poupança", periodicidade: "Diária", fonteNome: "portal", unidade: "Percentual ao mês" },
  { codigo: 195, nome: "Depósitos de poupança a partir de 04.05.2012 - Rentabilidade no período", categoria: "Poupança", periodicidade: "Diária", fonteNome: "portal", unidade: "Percentual ao mês" }
];
/**
 * Como medir a variação de uma série do catálogo — nível, encadeamento ou recusa.
 *
 * O limite desta detecção foi medido em 14/08/2026 e é PARCIAL por construção:
 * das 135 séries curadas, 82 têm `unidade` transcrita do portal e só 10 dizem
 * literalmente "Variação percentual mensal" (núcleos e grupos do IPCA); as cabeças
 * de índice que dispararam o defeito (IPCA 433, IGP-M 189, INPC 188...) não têm
 * dataset no portal e são reconhecidas pelo NOME curado, que termina em
 * "Variação mensal". Os milhares de códigos fora do catálogo não têm unidade em
 * lugar nenhum e ficam como nível — a descrição da tool declara isso, em vez de
 * fingir que a detecção é completa. Séries de acumulado móvel ("Variação
 * acumulada em 12 meses", 13522) são recusadas: encadear um acumulado móvel
 * também seria inventar número.
 */
export function metodoVariacaoDaSerie(codigo: number): MetodoVariacao {
  const info = SERIES_POPULARES.find(s => s.codigo === codigo);
  if (!info) return "nivel";
  if (/Variação acumulada em 12 meses/i.test(info.nome)) return "acumulado";
  if (info.unidade === "Variação percentual mensal") return "encadeamento";
  if (/Variação mensal$/i.test(info.nome)) return "encadeamento";
  if (TAXAS_POR_PERIODO.has(codigo)) return "encadeamento";
  return "nivel";
}

/**
 * Taxas de juros/rentabilidade publicadas como "% no período" — Selic e CDI
 * acumulados no mês (4390, 4391) e a rentabilidade da poupança (25, 195). São
 * variação por período tanto quanto o IPCA, e a conta de nível publicava a
 * variação DA TAXA em vez do rendimento acumulado. Incluídas por decisão do
 * decisor em 15/08/2026, depois da correção dos índices de preço.
 */
export const TAXAS_POR_PERIODO: ReadonlySet<number> = new Set([4390, 4391, 25, 195]);

/**
 * Séries em que a origem publica UMA TAXA MENSAL POR DIA: a poupança (25, 195)
 * traz, em cada dia, o rendimento do depósito feito naquele dia até o
 * aniversário seguinte (`data` → `dataFim`, 30 dias). Medido em 15/08/2026:
 * janeiro de 2024 tem 28 observações, todas taxas de um mês. Encadear as
 * observações cruas comporia ~28 meses por mês; o encadeamento amostra uma
 * observação por mês — a primeira, o depósito do início do mês renovado a
 * cada aniversário — e compõe só essas.
 */
export const TAXA_MENSAL_PUBLICADA_POR_DIA: ReadonlySet<number> = new Set([25, 195]);

/**
 * Valores a encadear para uma série de variação: todos, ou um por mês quando a
 * origem publica a taxa mensal por dia. Devolve também quantos entraram, para a
 * nota dizer o que foi composto.
 */
export function valoresParaEncadear(
  codigo: number,
  observacoes: Array<{ data: string; valor: number }>
): { valores: number[]; amostradoPorMes: boolean } {
  if (!TAXA_MENSAL_PUBLICADA_POR_DIA.has(codigo)) {
    return { valores: observacoes.map(o => o.valor), amostradoPorMes: false };
  }
  const primeiroDoMes = new Map<string, number>();
  for (const obs of observacoes) {
    const chave = chaveMes(obs.data);
    if (chave !== null && !primeiroDoMes.has(chave)) primeiroDoMes.set(chave, obs.valor);
  }
  return { valores: [...primeiroDoMes.values()], amostradoPorMes: true };
}

/** Nota de derivação do encadeamento, com a frase da amostragem quando ela aconteceu. */
export function derivacaoEncadeamento(amostradoPorMes: boolean, meses: number): typeof DERIVACAO_ENCADEAMENTO | (Omit<typeof DERIVACAO_ENCADEAMENTO, "nota"> & { nota: string }) {
  if (!amostradoPorMes) return DERIVACAO_ENCADEAMENTO;
  return {
    ...DERIVACAO_ENCADEAMENTO,
    nota:
      DERIVACAO_ENCADEAMENTO.nota +
      ` ATENÇÃO: esta série publica, a cada dia, a taxa do MÊS que começa naquele dia (rentabilidade do ` +
      `depósito até o aniversário seguinte); encadear todas as observações comporia dezenas de meses por mês. ` +
      `O acumulado composto usa UMA observação por mês — a primeira de cada mês, o depósito do início do mês ` +
      `renovado a cada aniversário — e compôs ${meses} ${meses === 1 ? "mês" : "meses"}. É a mesma convenção da ` +
      `série MENSAL 7828 do BCB (poupança, dia 1), que reproduz este número. O rendimento efetivo depende do ` +
      `dia-aniversário do depósito e varia cerca de ±0,1 pp num ano (em 2024, de 6,95% a 7,14% conforme o dia; ` +
      `dia 1 = 7,03%) — divergências dessa ordem contra outras fontes são convenção, não erro.`
  };
}

/** Códigos do catálogo que a tool trata por encadeamento — para a descrição e os testes. */
export function seriesEncadeadas(): number[] {
  return SERIES_POPULARES.filter(s => metodoVariacaoDaSerie(s.codigo) === "encadeamento").map(s => s.codigo);
}

/** Mensagem da recusa: a série já é o acumulado, e o valor do último mês é a resposta. */
export function mensagemRecusaAcumulado(codigo: number, nome: string): string {
  return (
    `A série ${codigo} (${nome}) já é um acumulado em janela móvel de 12 meses: a variação entre o primeiro e ` +
    `o último valor não tem significado, e encadear os valores também não. O acumulado em 12 meses numa data ` +
    `é o próprio valor publicado nessa data — use bcb_serie_valores para lê-lo. Para acumular a inflação ` +
    `num período arbitrário use bcb_variacao sobre a série de variação mensal (IPCA 433).`
  );
}


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

/**
 * Competência do dado para o bloco de proveniência: o intervalo coberto pelas
 * observações devolvidas.
 *
 * O SGS não publica versão do dado e **não tem endpoint de metadados**
 * (`bcb/docs/04`), então a competência sai do que já veio na resposta — zero
 * requisição a mais. As datas saem no formato da própria fonte.
 */
function vintageDeObservacoes(observacoes: Array<{ data: string }>): string | null {
  if (observacoes.length === 0) return null;
  const primeira = observacoes[0].data;
  const ultima = observacoes[observacoes.length - 1].data;
  return primeira === ultima ? primeira : `${primeira}–${ultima}`;
}

/**
 * Bloco de proveniência do catálogo curado do servidor.
 *
 * Existe separado porque o catálogo NÃO é extração do BCB no momento da
 * chamada: são 135 séries mantidas no repositório, com 82 nomes transcritos do
 * portal e 57 herdados. Medido: `bcb_series_populares` responde com ZERO
 * requisição à origem (`bcb/docs/07`).
 */
function provCatalogoCurado(detalhe?: string): Proveniencia {
  return provenienciaBcb({
    fonte: "CATALOGO_CURADO",
    url: "https://github.com/SidneyBissoli/bcb-br-mcp/blob/main/src/tools.ts",
    dataset: { id: "catalogo-curado", name: "Catálogo curado de séries do SGS", version: null },
    dataVintage: "2026-08-13",
    ...(detalhe ? { detalheCitacao: detalhe } : {})
  });
}

/** Bloco de proveniência de uma consulta ao SGS. */
function provSerieSgs(
  codigo: number,
  observacoes: Array<{ data: string }>,
  janela: { dataInicial?: string; dataFinal?: string } = {},
  derivado?: { nota: string }
): Proveniencia {
  const info = SERIES_POPULARES.find(s => s.codigo === codigo);
  return provenienciaBcb({
    fonte: "SGS",
    url: urlSerie(
      codigo,
      janela.dataInicial ? formatDateForApi(janela.dataInicial) : undefined,
      janela.dataFinal ? formatDateForApi(janela.dataFinal) : undefined
    ),
    dataset: { id: `bcdata.sgs.${codigo}`, name: info?.nome ?? null, version: null },
    dataVintage: vintageDeObservacoes(observacoes),
    detalheCitacao: `série ${codigo}${info ? ` (${info.nome})` : ""}`,
    ...(derivado ? { derivado } : {})
  });
}

/**
 * Bloco de proveniência de uma resposta que funde VÁRIAS séries do SGS.
 *
 * O `source_url` não pode ser o de uma série só — escolher uma entre cinco
 * mentiria por omissão sobre as outras quatro. Vai o endpoint-base, e cada série
 * entra em `field_sources` com a própria URL.
 */
function provMultiSerieSgs(
  series: Array<{ codigo: number; campo: string; inicio?: string; fim?: string; vintage?: string | null }>,
  detalhe: string,
  derivado?: { nota: string }
): Proveniencia {
  return provenienciaBcb({
    fonte: "SGS",
    url: "https://api.bcb.gov.br/dados/serie",
    dataset: {
      id: series.map(s => `bcdata.sgs.${s.codigo}`).join(", "),
      name: detalhe,
      version: null
    },
    dataVintage: series.map(s => s.vintage).find(v => v != null) ?? null,
    detalheCitacao: `${detalhe} (séries ${series.map(s => s.codigo).join(", ")})`,
    fontesPorCampo: series.map(s => ({
      fields: [s.campo],
      source_url: urlSerie(s.codigo, s.inicio, s.fim),
      dataset_id: `bcdata.sgs.${s.codigo}`,
      data_vintage: s.vintage ?? null
    })),
    ...(derivado ? { derivado } : {})
  });
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
      return resultadoComProveniencia(
        {
          serie,
          totalRegistros: 0,
          dados: [],
          observacao: `Nenhum dado encontrado para a série ${args.codigo} no período solicitado.`,
          ...blocoRede(resultado)
        },
        provSerieSgs(args.codigo, observacoes, args)
      );
    }

    const dados = observacoes.map(d => ({ data: d.data, valor: parseFloat(d.valor) }));

    if (args.frequencia) {
      const h = harmonizar(dados, args.frequencia, args.agregacao ?? "ultimo", resultado.periodicidade);
      return resultadoComProveniencia(
        {
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
        },
        // Harmonizar agrega observações: é derivação, e o bloco diz qual.
        provSerieSgs(args.codigo, observacoes, args, { nota: NOTA_DERIVACAO_HARMONIZACAO })
      );
    }

    return resultadoComProveniencia(
      {
        serie,
        totalRegistros: dados.length,
        periodoInicial: observacoes[0].data,
        periodoFinal: observacoes[observacoes.length - 1].data,
        dados,
        ...blocoRede(resultado)
      },
      provSerieSgs(args.codigo, observacoes, args)
    );
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
      return resultadoComProveniencia(
        {
          serie,
          totalRegistros: 0,
          dados: [],
          observacao: `Nenhum dado encontrado para a série ${args.codigo}.`,
          ...blocoRede(resultado)
        },
        provSerieSgs(args.codigo, resultado.observacoes)
      );
    }

    return resultadoComProveniencia(
      {
        serie,
        totalRegistros: resultado.observacoes.length,
        dados: resultado.observacoes.map(d => ({ data: d.data, valor: parseFloat(d.valor) })),
        ...blocoRede(resultado)
      },
      provSerieSgs(args.codigo, resultado.observacoes)
    );
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

    // Duas procedências na MESMA resposta, e é o caso que o array existe para
    // servir: a periodicidade e o último valor são extração do SGS agora; o
    // nome e a categoria vêm do catálogo curado do servidor, que tem licença e
    // instante próprios. Foi dar a mesma cara a essas duas coisas que deixou 21
    // nomes trocados sobreviverem por versões (sessão 07).
    const proveniencia: Proveniencia[] = [provSerieSgs(args.codigo, observacoes)];
    if (serieInfo) proveniencia.push(provCatalogoCurado(`série ${args.codigo}`));

    return resultadoComProveniencia(
      {
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
      },
      proveniencia
    );
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

    // Zero requisição à origem: a resposta é inteiramente do catálogo curado.
    return resultadoComProveniencia(
      {
        totalSeries: series.length,
        categorias: Object.keys(porCategoria).length,
        series: args.categoria ? series : porCategoria,
        observacao: "Use bcb_serie_valores ou bcb_serie_ultimos com o código para consultar os dados"
      },
      provCatalogoCurado()
    );
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

    // Duas camadas, duas procedências — e aqui o instante importa de verdade: o
    // índice do portal é servido de cache de 24 h, então o `retrieved_at` do
    // bloco do portal pode ser de ontem. É o que o coletor preserva (`docs/07`).
    const proveniencia: Proveniencia[] = [provCatalogoCurado(`busca por "${args.termo}"`)];
    if (snapshot) {
      proveniencia.unshift(
        provenienciaBcb({
          fonte: "PORTAL",
          url: CKAN_PACKAGE_LIST,
          dataset: { id: "package_list", name: "Índice de datasets do portal", version: null },
          dataVintage: snapshot.obtidoEm,
          detalheCitacao: "índice de datasets (package_list)"
        })
      );
    }

    return resultadoComProveniencia(payload, proveniencia);
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
    // Códigos e rótulos revistos na verificação de 13/08/2026. Duas correções:
    //
    // - a 432 é a META do Copom, não "a Selic" genérica (a efetiva é a 1178) —
    //   o rótulo antigo deixava ambíguo qual das duas estava na tela;
    // - o dólar saiu da 3698 para a 1. A 3698 é a PTAX **mensal**: num painel de
    //   "indicadores atuais" ela mostrava 01/07 enquanto a 1 já trazia 12/08.
    //   Um valor de seis semanas atrás rotulado como atual é pior que ausência.
    const indicadores = [
      { codigo: 432, nome: "Selic - meta Copom (% a.a.)" },
      { codigo: 433, nome: "IPCA mensal (%)" },
      { codigo: 13522, nome: "IPCA 12 meses (%)" },
      { codigo: 1, nome: "Dólar comercial - venda (diário)" },
      { codigo: 24364, nome: "IBC-Br (com ajuste sazonal)" }
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

    return resultadoComProveniencia(
      { consultadoEm: new Date().toISOString(), indicadores: resultados },
      provMultiSerieSgs(
        indicadores.map(i => ({ codigo: i.codigo, campo: i.nome })),
        "painel de indicadores atuais"
      )
    );
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
    const serieInfo = SERIES_POPULARES.find(s => s.codigo === args.codigo);
    const nome = serieInfo?.nome || `Série ${args.codigo}`;
    const metodo = metodoVariacaoDaSerie(args.codigo);
    // Recusa ANTES da rede: a série já é o acumulado, não há conta a fazer.
    if (metodo === "acumulado") {
      return erroResult(mensagemRecusaAcumulado(args.codigo, nome));
    }

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

    const valores = data.map(d => parseFloat(d.valor));
    const valorInicial = valores[0];
    const valorFinal = valores[valores.length - 1];
    // Série de nível: variação entre as pontas. Série que JÁ É variação: acumulado
    // por encadeamento das observações (uma por mês, quando a origem publica a
    // taxa mensal por dia) — comparar a taxa de janeiro com a de dezembro
    // publicava +23,81% para o IPCA de 2024 (acumulado real: 4,83%).
    const encadeaveis = valoresParaEncadear(args.codigo, data.map(d => ({ data: d.data, valor: parseFloat(d.valor) })));
    const variacao = metodo === "encadeamento" ? variacaoAcumulada(encadeaveis.valores) : calculateVariation(valorInicial, valorFinal);
    const diferencaAbsoluta = metodo === "encadeamento" ? null : arredondarDerivado(valorFinal - valorInicial);
    // Motor comum da Fase 0 (arbitragem 4). A convenção de arredondamento e o
    // porquê de os extremos saírem verbatim moram em `stats.ts`.
    const { maximo, minimo, media, amplitude } = estatisticasDaSerie(valores);

    return resultadoComProveniencia(
      {
        serie: { codigo: args.codigo, nome, categoria: serieInfo?.categoria || "Desconhecida" },
        periodo: { dataInicial: data[0].data, dataFinal: data[data.length - 1].data, totalPeriodos: data.length },
        analise: {
          metodo,
          valorInicial, valorFinal,
          diferencaAbsoluta,
          variacaoPercentual: arredondarDerivado(variacao),
          variacaoFormatada: `${variacao >= 0 ? "+" : ""}${variacao.toFixed(2)}%`
        },
        estatisticas: { maximo, minimo, media, amplitude },
        derivacao: metodo === "encadeamento"
          ? derivacaoEncadeamento(encadeaveis.amostradoPorMes, encadeaveis.valores.length)
          : DERIVACAO_ESTATISTICA,
        ...blocoRede(resultado)
      },
      provSerieSgs(args.codigo, data, args, {
        nota: metodo === "encadeamento" ? NOTA_DERIVACAO_ENCADEAMENTO : NOTA_DERIVACAO_ESTATISTICA
      })
    );
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
        const metodo = metodoVariacaoDaSerie(codigo);
        if (metodo === "acumulado") {
          // Recusa POR SÉRIE, sem derrubar o ranking das outras — mesma regra da
          // série que falha na rede.
          return { codigo, nome: serieInfo?.nome || `Série ${codigo}`, erro: mensagemRecusaAcumulado(codigo, serieInfo?.nome || `Série ${codigo}`) };
        }
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
          // O aviso de periodicidade decide pela periodicidade MEDIDA, não pelo
          // rótulo do catálogo — mesma regra do `bcb_correlacao`. A série 11 está
          // catalogada como "Mensal" e a origem a publica todo dia útil
          // (`bcb/docs/05`): decidir pela etiqueta faz o aviso calar justamente
          // no caso em que ele deveria soar. Com o catálogo corrigido isso quase
          // nunca diverge, mas "quase nunca" não é uma fonte da verdade.
          periodicidades.set(
            codigo,
            resultado.periodicidade ? ROTULO_PERIODICIDADE[resultado.periodicidade] : String(ref.periodicidade)
          );

          let observacoes = data.map(d => ({ data: d.data, valor: parseFloat(d.valor) }));
          // O acumulado de uma série que já é variação é encadeado sobre as
          // observações ORIGINAIS, antes de qualquer harmonização: reamostrar
          // variações mensais para anual com "ultimo" ou "media" e depois
          // encadear seria compor números que não são mais taxas do período.
          const acumuladoOriginal = metodo === "encadeamento"
            ? variacaoAcumulada(valoresParaEncadear(codigo, observacoes).valores)
            : null;

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
          const variacao = acumuladoOriginal ?? calculateVariation(valorInicial, valorFinal);
          const { maximo, minimo, media } = estatisticasDaSerie(valores);

          return {
            codigo,
            nome: serieInfo?.nome || `Série ${codigo}`,
            categoria: serieInfo?.categoria || "Desconhecida",
            periodicidade: String(ref.periodicidade),
            metodo,
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

    // Se alguma série do ranking é ela própria uma variação (IPCA, IGP-M...), a
    // nota de derivação tem de dizer que ali `variacaoPercentual` é acumulado
    // encadeado — cada item carrega o próprio `metodo`, e a nota explica os dois.
    const haEncadeada = seriesComDados.some(s => "metodo" in s && s.metodo === "encadeamento");
    const derivacao = haEncadeada
      ? {
          ...DERIVACAO_ESTATISTICA,
          nota:
            DERIVACAO_ESTATISTICA.nota +
            " Cada item do ranking traz `metodo`: em `nivel`, `variacaoPercentual` compara o último valor com o " +
            "primeiro; em `encadeamento` (série que já é variação por período, como IPCA e IGP-M mensais), é o " +
            "ACUMULADO do período por composição das observações originais — (Π(1 + vᵢ/100) − 1) × 100 —, " +
            "calculado antes de qualquer harmonização de frequência; na poupança (25, 195), que publica a taxa " +
            "mensal por dia, compõe-se uma observação por mês (a primeira de cada mês)."
        }
      : DERIVACAO_ESTATISTICA;

    return resultadoComProveniencia(
      {
        periodo: { dataInicial: formatDateForApi(args.dataInicial), dataFinal: formatDateForApi(args.dataFinal) },
        totalSeries: args.codigos.length,
        seriesComDados: seriesComDados.length,
        seriesComErro: seriesComErro.length,
        ranking: seriesOrdenadas.map((s, i) => ({ posicao: i + 1, ...s })),
        erros: seriesComErro.length > 0 ? seriesComErro : [],
        derivacao,
        ...(harmonizacao ? { harmonizacao } : {}),
        ...(aviso ? { aviso } : {})
      },
      provMultiSerieSgs(
        args.codigos.map(codigo => ({
          codigo,
          campo: `ranking[codigo=${codigo}]`,
          inicio: formatDateForApi(args.dataInicial),
          fim: formatDateForApi(args.dataFinal)
        })),
        "comparação entre séries",
        { nota: haEncadeada ? NOTA_DERIVACAO_ENCADEAMENTO : NOTA_DERIVACAO_ESTATISTICA }
      )
    );
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Erro ao comparar séries: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

/** Série buscada e preparada para as tools que trabalham com mais de uma. */
interface SeriePreparada {
  codigo: number;
  ref: Record<string, unknown>;
  periodicidade: Periodicidade | null;
  observacoes: Array<{ data: string; valor: number }>;
}

/**
 * Orçamento de requisições simultâneas repartido entre as `n` séries buscadas juntas.
 *
 * O que estoura o timeout não é o número de requisições, é a PROFUNDIDADE da fila:
 * cada série diária de ~10 anos vira 4 fatias de 3 anos (`series.ts`), e fatias em
 * fila custam ~2,6 s cada. Com uma requisição por série, medido em 11/08/2026 contra
 * a origem: duas séries diárias de 2015 a 2024 levaram **10,7 s** e cinco séries de
 * 2001 a 2010 levaram **10,4 s** — as duas ACIMA dos 10 s em que o worker corta, ou
 * seja, consultas legítimas que não completavam no canal hospedado.
 *
 * O teto de 10 em voo respeita a parcimônia de ≤5 req/s que a fase adotou: como cada
 * fatia dura ~2,6 s, dez requisições simultâneas dão ~3,8 req/s, não dez. Repartido,
 * o pior caso caiu para 4,5–6,7 s em janelas nunca pedidas antes (medição fria — a
 * origem serve repetição de cache e mediria bonito por engano).
 */
const ORCAMENTO_SIMULTANEO = 10;

function concorrenciaPorSerie(n: number): number {
  return Math.max(1, Math.floor(ORCAMENTO_SIMULTANEO / Math.max(1, n)));
}

/** Busca N séries na mesma janela, isolando quem falhou. */
async function buscarVarias(
  codigos: number[],
  dataInicial: string,
  dataFinal: string,
  timeoutMs?: number,
  maxRetries?: number
): Promise<{ series: SeriePreparada[]; erros: Array<Record<string, unknown>> }> {
  const concorrencia = concorrenciaPorSerie(codigos.length);

  const resultados = await Promise.all(
    codigos.map(async (codigo) => {
      const info = SERIES_POPULARES.find(s => s.codigo === codigo);
      try {
        const r = await buscarSerieSgs(
          { codigo, dataInicial: formatDateForApi(dataInicial), dataFinal: formatDateForApi(dataFinal) },
          timeoutMs, maxRetries, concorrencia
        );
        if (r.observacoes.length === 0) {
          return { erro: { codigo, nome: info?.nome || `Série ${codigo}`, erro: "Sem dados no período" } };
        }
        return {
          serie: {
            codigo,
            ref: refSerie(codigo, r.periodicidade),
            periodicidade: r.periodicidade,
            observacoes: r.observacoes.map(o => ({ data: o.data, valor: parseFloat(o.valor) }))
          } satisfies SeriePreparada
        };
      } catch (err) {
        return { erro: { codigo, nome: info?.nome || `Série ${codigo}`, erro: mensagemDeErro(err) } };
      }
    })
  );

  return {
    series: resultados.flatMap(r => ("serie" in r && r.serie ? [r.serie] : [])),
    erros: resultados.flatMap(r => ("erro" in r && r.erro ? [r.erro] : []))
  };
}

export async function handleCorrelacao(
  args: {
    codigos: number[];
    dataInicial: string;
    dataFinal: string;
    frequencia?: FrequenciaAlvo;
    agregacao?: Agregacao;
    metodo?: MetodoCorrelacao;
    base?: BaseCorrelacao;
  },
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  try {
    const metodo: MetodoCorrelacao = args.metodo ?? "pearson";
    const base: BaseCorrelacao = args.base ?? "nivel";

    const { series, erros } = await buscarVarias(
      args.codigos, args.dataInicial, args.dataFinal, timeoutMs, maxRetries
    );

    if (series.length < 2) {
      return erroResult(
        `Correlação exige ao menos duas séries com dados no período, e apenas ${series.length} retornou. ` +
        (erros.length > 0 ? `Motivos: ${erros.map(e => `${e.codigo} — ${e.erro}`).join("; ")}.` : "")
      );
    }

    // A recusa que a medição contra a origem justificou. Casar série diária com
    // mensal por data devolve ~7 datas de 12 no ano (os dias 1º em dia útil), e o
    // coeficiente sobre esse punhado tem aparência perfeitamente saudável. Aqui não
    // basta avisar como em `bcb_comparar`, onde cada série é resumida na própria
    // grade: um coeficiente é UM número sobre as duas séries ao mesmo tempo, e ele
    // sairia simplesmente errado. Recusar com o caminho da solução é o único
    // comportamento defensável.
    //
    // A grade é decidida pela periodicidade MEDIDA (espaçamento das datas que a
    // origem devolveu), nunca pelo rótulo do catálogo curado. O rótulo é um nome de
    // exibição e pode estar errado — a série 11 está catalogada como "Mensal" e a
    // origem a publica todo dia útil —, e um rótulo errado aqui recusaria uma
    // correlação perfeitamente válida. O catálogo só entra quando não há medição
    // possível (menos de 3 observações).
    const gradeDe = (s: SeriePreparada): string =>
      s.periodicidade ? ROTULO_PERIODICIDADE[s.periodicidade] : String(s.ref.periodicidade);
    const distintas = [...new Set(series.map(gradeDe))].filter(p => p !== "Desconhecida");
    if (!args.frequencia && distintas.length > 1) {
      return erroResult(
        `As séries têm periodicidades diferentes (${distintas.join(", ")}) e a correlação foi recusada. ` +
        `Cruzar grades diferentes por data casa apenas as datas coincidentes — uma série diária e uma mensal ` +
        `coincidem em cerca de 7 datas por ano, os dias 1º que caem em dia útil —, e o coeficiente resultante ` +
        `descreveria esse punhado de pontos, não as séries. Informe \`frequencia\` (mensal, trimestral ou anual) ` +
        `para harmonizá-las na mesma grade antes de correlacionar, escolhendo a convenção em \`agregacao\`.`
      );
    }

    let harmonizacao: Record<string, unknown> | undefined;
    const preparadas = series.map(s => {
      if (!args.frequencia) return s.observacoes;
      const h = harmonizar(s.observacoes, args.frequencia, args.agregacao ?? "ultimo", s.periodicidade);
      harmonizacao = { frequencia: h.frequencia, agregacao: h.agregacao, derived: true, nota: h.nota };
      return h.dados.map(d => ({ data: d.data, valor: d.valor }));
    });

    const alinhamento = alinharSeries(preparadas);

    const pares: Array<Record<string, unknown>> = [];
    for (let i = 0; i < series.length; i++) {
      for (let j = i + 1; j < series.length; j++) {
        const brutos = alinhamento.linhas.map(l => ({ a: l.valores[i], b: l.valores[j] }));
        const entrada = base === "variacao" ? emVariacoes(brutos) : brutos;
        const c = correlacaoEntreSeries(entrada, metodo);
        pares.push({
          codigoA: series[i].codigo, nomeA: String(series[i].ref.nome),
          codigoB: series[j].codigo, nomeB: String(series[j].ref.nome),
          coeficiente: c.coeficiente,
          n: c.n,
          descartados: c.descartados,
          interpretacao: c.interpretacao,
          ...(c.motivo ? { motivo: c.motivo } : {})
        });
      }
    }

    return resultadoComProveniencia(
      {
        periodo: { dataInicial: formatDateForApi(args.dataInicial), dataFinal: formatDateForApi(args.dataFinal) },
        metodo,
        base,
        series: series.map(s => ({ ...s.ref, totalRegistros: s.observacoes.length })),
        alinhamento: {
          datas: alinhamento.linhas.length,
          completas: alinhamento.completas,
          parciais: alinhamento.parciais,
          grade: args.frequencia ?? gradeDe(series[0]).toLowerCase()
        },
        pares,
        erros,
        derivacao: DERIVACAO_CORRELACAO,
        ...(harmonizacao ? { harmonizacao } : {})
      },
      provMultiSerieSgs(
        series.map(s => ({
          codigo: s.codigo,
          campo: `series[codigo=${s.codigo}]`,
          inicio: formatDateForApi(args.dataInicial),
          fim: formatDateForApi(args.dataFinal)
        })),
        "correlação entre séries",
        { nota: NOTA_DERIVACAO_ESTATISTICA }
      )
    );
  } catch (error) {
    return erroResult(`Erro ao calcular correlação: ${mensagemDeErro(error)}`);
  }
}

/** Índices de preço aceitos como deflator, todos publicados como variação mensal em %. */
const DEFLATORES: Record<string, { codigo: number; nome: string }> = {
  ipca: { codigo: 433, nome: "IPCA — Índice Nacional de Preços ao Consumidor Amplo (IBGE)" },
  inpc: { codigo: 188, nome: "INPC — Índice Nacional de Preços ao Consumidor (IBGE)" },
  igpm: { codigo: 189, nome: "IGP-M — Índice Geral de Preços do Mercado (FGV)" }
};

export async function handleDeflacionar(
  args: {
    codigo: number;
    dataInicial: string;
    dataFinal: string;
    indice?: string;
    mesBase?: string;
    frequencia?: FrequenciaAlvo;
    agregacao?: Agregacao;
  },
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  try {
    const chaveIndice = (args.indice ?? "ipca").toLowerCase();
    const deflatorInfo = DEFLATORES[chaveIndice];
    if (!deflatorInfo) {
      return erroResult(
        `Índice de preços desconhecido: "${args.indice}". Aceitos: ${Object.keys(DEFLATORES).join(", ")}.`
      );
    }

    const inicio = formatDateForApi(args.dataInicial);
    const fim = formatDateForApi(args.dataFinal);

    // O deflator é buscado do início do período até HOJE, não até `dataFinal`: o mês
    // base default é o último mês publicado do índice ("em reais de hoje"), que é a
    // pergunta que praticamente todo mundo faz. É uma requisição mensal barata.
    // A série nominal fica com a concorrência de duas séries (3 fatias em voo): ela é
    // a única que pode ser diária e portanto fatiada em muitas janelas. O índice de
    // preços é sempre mensal — uma requisição — e não precisa de folga nenhuma.
    const [serie, indice] = await Promise.all([
      buscarSerieSgs({ codigo: args.codigo, dataInicial: inicio, dataFinal: fim }, timeoutMs, maxRetries, concorrenciaPorSerie(2)),
      buscarSerieSgs({ codigo: deflatorInfo.codigo, dataInicial: inicio, dataFinal: hojeSgs() }, timeoutMs, maxRetries, 1)
    ]);

    if (serie.observacoes.length === 0) {
      return erroResult(`A série ${args.codigo} não retornou dados entre ${inicio} e ${fim}.`);
    }
    if (indice.observacoes.length === 0) {
      return erroResult(
        `O índice de preços (${chaveIndice.toUpperCase()}, série ${deflatorInfo.codigo}) não retornou dados no período — ` +
        `sem ele não há como deflacionar.`
      );
    }

    let observacoes = serie.observacoes.map(o => ({ data: o.data, valor: parseFloat(o.valor) }));
    let harmonizacao: Record<string, unknown> | undefined;
    if (args.frequencia) {
      const h = harmonizar(observacoes, args.frequencia, args.agregacao ?? "ultimo", serie.periodicidade);
      observacoes = h.dados.map(d => ({ data: d.data, valor: d.valor }));
      harmonizacao = { frequencia: h.frequencia, agregacao: h.agregacao, derived: true, nota: h.nota };
    }

    const deflator = construirDeflator(
      indice.observacoes.map(o => ({ data: o.data, valor: parseFloat(o.valor) })),
      args.mesBase
    );
    const dados = deflacionar(observacoes, deflator).map(d => ({
      data: d.data,
      valorNominal: d.valorNominal,
      valorReal: d.valorReal === null ? null : arredondarDerivado(d.valorReal),
      fator: d.fator === null ? null : arredondarDerivado(d.fator)
    }));

    const comReal = dados.filter(d => d.valorReal !== null);
    const foraDeCobertura = dados.length - comReal.length;

    // A comparação que é o produto da tool: o mesmo período lido em moeda corrente e
    // em moeda constante. Sem isto o cliente teria de calcular a variação real, que é
    // exatamente o cálculo que ele veio aqui para não fazer.
    const variacao = comReal.length >= 2
      ? {
          nominal: arredondarDerivado(calculateVariation(comReal[0].valorNominal, comReal[comReal.length - 1].valorNominal)),
          real: arredondarDerivado(calculateVariation(comReal[0].valorReal!, comReal[comReal.length - 1].valorReal!)),
          dataInicial: comReal[0].data,
          dataFinal: comReal[comReal.length - 1].data
        }
      : null;

    const avisos: string[] = [];
    if (foraDeCobertura > 0) {
      avisos.push(
        `${foraDeCobertura} observação(ões) ficaram com \`valorReal: null\` por caírem fora da cobertura do ` +
        `índice de preços (${deflator.primeiroMes} a ${deflator.ultimoMes}). O índice é publicado com defasagem, ` +
        `então observação do mês corrente costuma ainda não ter deflator.`
      );
    }
    // `mesBase` fora da cobertura cai no default sem reclamar; dizer isso é obrigatório.
    if (args.mesBase && mesBaseSolicitadoDiferente(args.mesBase, deflator.mesBase)) {
      avisos.push(
        `O mês base pedido (${args.mesBase}) não existe na cobertura do índice ` +
        `(${deflator.primeiroMes} a ${deflator.ultimoMes}); foi usado ${deflator.mesBase}.`
      );
    }

    return resultadoComProveniencia({
      serie: { ...refSerie(args.codigo, serie.periodicidade), totalRegistros: dados.length },
      deflator: {
        indice: chaveIndice.toUpperCase(),
        codigo: deflatorInfo.codigo,
        nome: deflatorInfo.nome,
        cobertura: { primeiroMes: deflator.primeiroMes, ultimoMes: deflator.ultimoMes }
      },
      base: {
        mes: deflator.mesBase,
        descricao: `Todos os valores em \`valorReal\` estão expressos em reais de ${deflator.mesBase}.`
      },
      periodo: { dataInicial: inicio, dataFinal: fim },
      dados,
      variacao,
      derivacao: DERIVACAO_DEFLACAO,
      ...(harmonizacao ? { harmonizacao } : {}),
      ...(avisos.length > 0 ? { avisos } : {}),
      ...blocoRede(serie)
    },
    provMultiSerieSgs(
      [
        { codigo: args.codigo, campo: "dados[].valorNominal", inicio, fim },
        { codigo: deflatorInfo.codigo, campo: "dados[].fator", inicio }
      ],
      `deflação por ${chaveIndice.toUpperCase()}`,
      { nota: NOTA_DERIVACAO_DEFLACAO }
    ));
  } catch (error) {
    return erroResult(`Erro ao deflacionar a série: ${mensagemDeErro(error)}`);
  }
}

/** `yyyy-MM` pedido × `MM/yyyy` aplicado. */
function mesBaseSolicitadoDiferente(pedido: string, aplicado: string): boolean {
  const [ano, mes] = pedido.split("-");
  return `${mes}/${ano}` !== aplicado;
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

// Variante para quem LISTA o catálogo curado (`bcb_series_populares`): além da
// identificação, a procedência do nome. O campo é publicado, e não apenas
// interno, porque a diferença entre "o BCB chama assim" e "herdamos este nome"
// muda o que o cliente pode afirmar — e foi justamente apresentar as duas com a
// mesma cara que deixou nomes trocados passarem por versões. Ver `SeriePopular`.
const SERIE_CURADA_SCHEMA = {
  ...SERIE_REF_SCHEMA,
  properties: {
    ...SERIE_REF_SCHEMA.properties,
    fonteNome: {
      type: "string" as const,
      enum: ["portal", "medido"],
      description:
        "Procedência do `nome`: 'portal' = transcrito do dataset da série no Portal de Dados Abertos do " +
        "BCB; 'medido' = a série não tem dataset no portal, o nome é herdado e só a periodicidade e a " +
        "ordem de grandeza foram verificadas contra a origem."
    },
    unidade: {
      type: "string" as const,
      description: "Unidade de medida publicada pelo portal. Ausente nas séries sem dataset (fonteNome 'medido')."
    }
  }
};

// Variante para as tools que CONSULTAM série: quando o código está fora da
// curadoria, a periodicidade é inferida do espaçamento das observações (a API do
// SGS não publica metadados).
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
const METODO_VARIACAO_SCHEMA = {
  type: "string" as const,
  enum: ["nivel", "encadeamento"],
  description:
    "Como a variação foi medida: `nivel` = (último − primeiro) / primeiro, para série de nível; " +
    "`encadeamento` = acumulado composto de todas as observações, para série que já é uma variação " +
    "percentual por período (IPCA, INPC, IGP-M mensais e os núcleos/grupos do IPCA do catálogo; Selic e CDI " +
    "acumulados no mês, 4390/4391; rentabilidade da poupança, 25/195 — nesta, uma observação por mês). A " +
    "detecção cobre as séries de variação do catálogo curado; código fora dele é tratado como nível."
};

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
    "disponível. Nome e categoria vêm do catálogo curado do servidor (135 séries verificadas contra a " +
    "origem) e, fora dele, a periodicidade é inferida do espaçamento das observações, sinalizada por " +
    "`periodicidadeInferida`. " +
    BEHAVIOR_NOTE,

  bcb_series_populares:
    "Lista o catálogo interno curado de 135 séries econômicas do BCB com seus códigos, agrupadas por " +
    "categoria (Juros, Inflação, Câmbio, Atividade Econômica, Emprego, Fiscal, Setor Externo, Crédito, " +
    "Agregados Monetários, Poupança); aceita filtro por categoria. " +
    "Quando usar: para navegar/descobrir as séries disponíveis por tema. Quando NÃO usar: para busca " +
    "por palavra-chave use bcb_buscar_serie; esta ferramenta não busca valores. " +
    "Retorna: `totalSeries`, `categorias` (nº de categorias) e `series` — objeto agrupado por categoria " +
    "quando sem filtro, ou array plano quando filtrado por categoria; cada item tem codigo, nome, " +
    "categoria, periodicidade e `fonteNome`. Catálogo local: não faz chamada de rede. " +
    "Procedência: `fonteNome` = 'portal' quando o nome é transcrito do dataset da série no Portal de " +
    "Dados Abertos do BCB (82 séries, com `unidade`), e 'medido' quando a série não tem dataset lá — " +
    "nesse caso o nome é herdado e o que foi verificado contra a origem é a periodicidade e a ordem de " +
    "grandeza. Expectativas do Focus NÃO estão aqui: use bcb_focus_expectativas.",

  bcb_buscar_serie:
    "Busca séries do BCB por palavra-chave (ou pelo código) em DUAS camadas: o catálogo curado local de " +
    "135 séries verificadas contra a origem, que vem primeiro e com `fonteNome` dizendo se o nome é " +
    "transcrito do portal do BCB ou herdado, e o índice do Portal de Dados Abertos do BCB, " +
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
    "economia brasileira: Selic (meta do Copom), IPCA mensal, IPCA acumulado 12 meses, dólar comercial " +
    "de venda (série diária) " +
    "e IBC-Br. Não recebe parâmetros. " +
    "Quando usar: para um panorama econômico rápido. Quando NÃO usar: para qualquer outra série, para " +
    "dados históricos ou para escolher o período use bcb_serie_ultimos ou bcb_serie_valores. " +
    "Retorna: `consultadoEm` (timestamp ISO 8601) e `indicadores` (array com indicador, codigo, data, " +
    "valor — ou `erro` no item). Resiliente: cada indicador é buscado de forma independente, então a " +
    "falha de um não derruba os demais. " + BEHAVIOR_NOTE,

  bcb_variacao:
    "Calcula a variação percentual de UMA série no período, mais estatísticas descritivas. Para série de " +
    "NÍVEL (dólar, Selic, dívida, produção) é a variação entre o primeiro e o último ponto; para série que JÁ " +
    "É uma variação por período (IPCA 433, INPC 188, IGP-M 189 e demais índices de preço mensais do catálogo; " +
    "Selic/CDI acumulados no mês 4390/4391; rentabilidade da poupança 25/195) é o ACUMULADO do período por " +
    "encadeamento — \"quanto o IPCA acumulou em 2024\" ou \"quanto a Selic rendeu em 2024\" é esta tool. O campo " +
    "`analise.metodo` diz qual das duas contas foi feita; código fora do catálogo curado é tratado como nível. " +
    "Série de acumulado móvel (IPCA em 12 meses, 13522) é recusada com orientação — o valor publicado já é a " +
    "resposta. O período pode ser definido por datas (dataInicial/dataFinal) OU pelos " +
    "últimos N períodos (parâmetro `periodos`, que tem precedência e ignora as datas). " +
    "Quando usar: para medir tendência/variação/acumulado de uma única série. Quando NÃO usar: para comparar " +
    "várias séries use bcb_comparar; para os valores brutos use bcb_serie_valores. Requer ao menos 2 " +
    "observações no período (senão retorna `isError`). " +
    "Retorna: `serie`, `periodo` (dataInicial, dataFinal, totalPeriodos), `analise` (metodo, valorInicial, " +
    "valorFinal, diferencaAbsoluta — nula quando encadeado —, variacaoPercentual, variacaoFormatada) e " +
    "`estatisticas` (maximo, minimo, media, amplitude). " +
    "Períodos longos são tratados automaticamente: janela diária acima de 10 anos é fatiada (a API do BCB " +
    "responde 406) e `periodos` acima de 20 é atendido por janela de datas; `chunking` e `janelaAplicada` " +
    "aparecem na resposta quando isso acontece. " + BEHAVIOR_NOTE,

  bcb_comparar:
    "Compara de 2 a 5 séries temporais no MESMO período (dataInicial e dataFinal obrigatórias), " +
    "calculando a variação percentual de cada uma e ordenando-as num ranking (maior para menor variação). " +
    "Série de nível entra pela variação entre as pontas; série que já é variação por período (IPCA, INPC, " +
    "IGP-M mensais do catálogo; Selic/CDI acumulados no mês; poupança) entra pelo ACUMULADO encadeado do " +
    "período — cada item diz em `metodo` qual " +
    "conta foi feita, então \"qual índice de preço subiu mais em 2024\" é esta tool. " +
    "Quando usar: para comparar/correlacionar a evolução de vários indicadores lado a lado. Quando NÃO " +
    "usar: para uma única série use bcb_variacao. " +
    "Retorna: `periodo`, `totalSeries`, `seriesComDados`, `seriesComErro`, `ranking` (cada item com " +
    "posicao, codigo, nome, metodo, valorInicial, valorFinal, variacaoPercentual, maximo, minimo, media) e " +
    "`erros`. Resiliente: séries sem dados no período, e séries de acumulado móvel (IPCA em 12 meses), são " +
    "isoladas em `erros` sem invalidar a comparação. " +
    "Periodicidades diferentes: comparar uma série diária com uma mensal alinha pontos que não são " +
    "comparáveis, e a resposta avisa isso em `aviso`; informe `frequencia` (mensal|trimestral|anual) para " +
    "harmonizar todas na mesma grade antes de comparar, escolhendo a convenção em `agregacao`. " +
    "Janelas longas em séries diárias são fatiadas automaticamente (limite de 10 anos da API do BCB). " +
    BEHAVIOR_NOTE,

  bcb_correlacao:
    "Calcula a correlação estatística entre 2 a 5 séries temporais do BCB no MESMO período " +
    "(dataInicial e dataFinal obrigatórias), par a par. " +
    "Quando usar: para medir se dois indicadores se movem juntos (ex.: dólar e Selic, IPCA e IGP-M). " +
    "Quando NÃO usar: para comparar a variação de cada série lado a lado use bcb_comparar; para uma série " +
    "só use bcb_variacao. " +
    "Métodos: `pearson` (padrão) mede relação LINEAR entre os valores; `spearman` mede relação MONÓTONA " +
    "entre os postos e é o adequado quando a relação não é reta ou quando uma série fica parada em platôs " +
    "(taxa de juros entre reuniões do Copom). " +
    "Base: `nivel` (padrão) correlaciona os valores; `variacao` correlaciona a mudança percentual de um " +
    "ponto para o outro — prefira `variacao` quando as duas séries têm tendência (preço, índice, estoque), " +
    "porque o nível de duas séries crescentes tem correlação alta só porque ambas crescem com o tempo. " +
    "Retorna: `periodo`, `metodo`, `base`, `series`, `alinhamento` (datas cruzadas, completas e parciais), " +
    "`pares` (cada um com codigoA/codigoB, `coeficiente` entre -1 e 1, `n`, `descartados` e `interpretacao` " +
    "em prosa), `erros` e `derivacao`. Coeficiente que não pode ser calculado vem `null` com `motivo` — " +
    "nunca 0, que significaria ausência medida de relação. " +
    "Periodicidades diferentes são RECUSADAS, não avisadas: cruzar uma série diária com uma mensal por data " +
    "casa só as datas coincidentes (cerca de 7 por ano) e produziria um coeficiente sobre esse punhado; " +
    "informe `frequencia` para harmonizar todas na mesma grade antes de correlacionar. " +
    "Correlação não estabelece causalidade. " + BEHAVIOR_NOTE,

  bcb_deflacionar:
    "Converte uma série NOMINAL do BCB em valores REAIS (moeda constante), descontando a inflação do " +
    "período — a diferença entre 'o salário mínimo subiu 46% desde 2020' e 'o salário mínimo subiu 5% em " +
    "poder de compra'. " +
    "Quando usar: sempre que valores em reais de épocas diferentes forem comparados. Quando NÃO usar: para " +
    "séries que já são percentuais, índices ou taxas (deflacionar uma taxa de juros não significa nada); " +
    "para a série nominal crua use bcb_serie_valores. " +
    "Índice: `ipca` (padrão), `inpc` ou `igpm`. Base: `mesBase` no formato yyyy-MM define em reais de que " +
    "mês os valores são expressos; sem ele, usa o último mês publicado do índice ('em reais de hoje'). " +
    "Retorna: `serie`, `deflator` (índice, código, cobertura), `base`, `periodo`, `dados` (cada ponto com " +
    "valorNominal, `valorReal` e `fator`), `variacao` (a percentual nominal ao lado da real no mesmo " +
    "período), `derivacao` e `avisos`. " +
    "Limite da fonte: o SGS não publica número-índice, então o índice é reconstruído compondo as variações " +
    "mensais — reconstrução conferida contra a própria fonte (diferença máxima de 0,0052 ponto percentual " +
    "contra o acumulado oficial em 12 meses). Observação fora da cobertura do índice recebe " +
    "`valorReal: null`, nunca um valor inventado; como o índice sai com defasagem, o mês corrente " +
    "costuma cair nesse caso. " + BEHAVIOR_NOTE
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
            { type: "array" as const, items: SERIE_CURADA_SCHEMA },
            { type: "object" as const, additionalProperties: { type: "array" as const, items: SERIE_CURADA_SCHEMA } }
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
              fonteNome: {
                type: "string" as const,
                enum: ["portal", "medido"],
                description:
                  "Só quando `origem` = curado. 'portal' = nome transcrito do dataset da série no Portal de " +
                  "Dados Abertos do BCB; 'medido' = série sem dataset no portal, nome herdado e apenas " +
                  "periodicidade e ordem de grandeza verificadas contra a origem."
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
          description:
            "Resultado da variação no período. Em `metodo: \"nivel\"` é a variação entre o primeiro e o último " +
            "valor; em `metodo: \"encadeamento\"` (série que já é variação por período, como IPCA e IGP-M mensais) " +
            "é o acumulado composto de todas as observações",
          properties: {
            metodo: METODO_VARIACAO_SCHEMA,
            valorInicial: { type: "number" as const, description: "Primeira observação do período, verbatim da fonte" },
            valorFinal: { type: "number" as const, description: "Última observação do período, verbatim da fonte" },
            diferencaAbsoluta: {
              type: ["number", "null"] as const,
              description: "valorFinal − valorInicial em série de nível; NULO em série encadeada, onde não se aplica"
            },
            variacaoPercentual: { type: "number" as const, description: "Variação (nível) ou acumulado (encadeamento), em %" },
            variacaoFormatada: { type: "string" as const }
          },
          // O handler sempre devolve os seis campos — o contrato reflete isso.
          required: ["metodo", "valorInicial", "valorFinal", "diferencaAbsoluta", "variacaoPercentual", "variacaoFormatada"]
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
              metodo: METODO_VARIACAO_SCHEMA,
              totalRegistros: { type: "number" as const },
              valorInicial: { type: "number" as const },
              valorFinal: { type: "number" as const },
              variacaoPercentual: {
                type: "number" as const,
                description: "Variação entre as pontas (metodo nivel) ou acumulado encadeado do período (metodo encadeamento), em %"
              },
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
  },
  {
    name: "bcb_correlacao",
    description: TOOL_DESCRIPTIONS.bcb_correlacao,
    annotations: {
      title: "Correlacionar séries",
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
          description: "Array com 2 a 5 códigos de séries para correlacionar par a par",
          minItems: 2,
          maxItems: 5
        },
        dataInicial: { type: "string" as const, description: "Data inicial (yyyy-MM-dd ou dd/MM/yyyy)" },
        dataFinal: { type: "string" as const, description: "Data final (yyyy-MM-dd ou dd/MM/yyyy)" },
        metodo: {
          type: "string" as const,
          enum: ["pearson", "spearman"],
          default: "pearson",
          description:
            "`pearson` mede relação linear entre os valores; `spearman` mede relação monótona entre os postos " +
            "(com posto médio nos empates) e é o adequado quando a relação não é reta ou quando uma das séries " +
            "fica parada em platôs, como a Selic entre reuniões do Copom."
        },
        base: {
          type: "string" as const,
          enum: ["nivel", "variacao"],
          default: "nivel",
          description:
            "`nivel` correlaciona os valores; `variacao` correlaciona a mudança percentual de um ponto para o " +
            "seguinte. Prefira `variacao` quando as duas séries têm tendência: o nível de duas séries crescentes " +
            "tem correlação alta só porque ambas crescem com o tempo."
        },
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
          description: "Janela temporal correlacionada",
          properties: {
            dataInicial: { type: "string" as const },
            dataFinal: { type: "string" as const }
          },
          required: ["dataInicial", "dataFinal"]
        },
        metodo: { type: "string" as const, enum: ["pearson", "spearman"], description: "Método aplicado" },
        base: { type: "string" as const, enum: ["nivel", "variacao"], description: "Se o cálculo usou os valores ou as variações" },
        series: {
          type: "array" as const,
          description: "Séries que entraram no cálculo",
          items: {
            type: "object" as const,
            properties: {
              codigo: { type: "number" as const },
              nome: { type: "string" as const },
              categoria: { type: "string" as const },
              periodicidade: { type: "string" as const },
              periodicidadeInferida: { type: "boolean" as const },
              totalRegistros: { type: "number" as const }
            },
            required: ["codigo", "nome"]
          }
        },
        alinhamento: {
          type: "object" as const,
          description:
            "Como as grades foram cruzadas. `completas` é o que efetivamente entra num coeficiente: datas em " +
            "que TODAS as séries publicam. A distância entre `datas` e `completas` é a medida de quanto as " +
            "séries não se sobrepõem.",
          properties: {
            datas: { type: "number" as const, description: "Datas distintas na união das séries" },
            completas: { type: "number" as const, description: "Datas em que todas as séries publicam" },
            parciais: { type: "number" as const, description: "Datas em que ao menos uma série não publica" },
            grade: { type: "string" as const, description: "Grade temporal usada no cruzamento" }
          },
          required: ["datas", "completas", "parciais"]
        },
        pares: {
          type: "array" as const,
          description: "Um item por par de séries",
          items: {
            type: "object" as const,
            properties: {
              codigoA: { type: "number" as const },
              nomeA: { type: "string" as const },
              codigoB: { type: "number" as const },
              nomeB: { type: "string" as const },
              coeficiente: {
                type: ["number", "null"] as const,
                description: "Coeficiente entre -1 e 1; `null` quando indefinido (ver `motivo`) — nunca 0 por omissão"
              },
              n: { type: "number" as const, description: "Pares de valores efetivamente usados" },
              descartados: { type: "number" as const, description: "Datas descartadas por falta de valor em uma das pontas" },
              interpretacao: {
                type: ["string", "null"] as const,
                description: "Leitura em prosa da força e do sentido; `null` quando não há coeficiente"
              },
              motivo: { type: "string" as const, description: "Por que o coeficiente é `null`; ausente quando há coeficiente" }
            },
            required: ["codigoA", "codigoB", "coeficiente", "n", "descartados", "interpretacao"]
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
        harmonizacao: HARMONIZACAO_SCHEMA
      },
      required: ["periodo", "metodo", "base", "series", "alinhamento", "pares", "erros", "derivacao"]
    }
  },
  {
    name: "bcb_deflacionar",
    description: TOOL_DESCRIPTIONS.bcb_deflacionar,
    annotations: {
      title: "Deflacionar série (valores reais)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        codigo: { type: "number" as const, description: "Código da série NOMINAL a deflacionar (ex.: 1619 para salário mínimo)" },
        dataInicial: { type: "string" as const, description: "Data inicial (yyyy-MM-dd ou dd/MM/yyyy)" },
        dataFinal: { type: "string" as const, description: "Data final (yyyy-MM-dd ou dd/MM/yyyy)" },
        indice: {
          type: "string" as const,
          enum: ["ipca", "inpc", "igpm"],
          default: "ipca",
          description: "Índice de preços usado como deflator: IPCA (433), INPC (188) ou IGP-M (189)"
        },
        mesBase: {
          type: "string" as const,
          pattern: "^\\d{4}-\\d{2}$",
          description:
            "Mês em cujos preços os valores serão expressos, no formato yyyy-MM. Sem ele, usa o último mês " +
            "publicado do índice — isto é, 'em reais de hoje'."
        },
        frequencia: FREQUENCIA_INPUT,
        agregacao: AGREGACAO_INPUT
      },
      required: ["codigo", "dataInicial", "dataFinal"]
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        serie: {
          type: "object" as const,
          description: "Identificação da série nominal",
          properties: {
            codigo: { type: "number" as const },
            nome: { type: "string" as const },
            categoria: { type: "string" as const },
            periodicidade: { type: "string" as const },
            periodicidadeInferida: { type: "boolean" as const },
            totalRegistros: { type: "number" as const }
          },
          required: ["codigo", "nome"]
        },
        deflator: {
          type: "object" as const,
          description: "Índice de preços usado e o intervalo que ele cobre",
          properties: {
            indice: { type: "string" as const },
            codigo: { type: "number" as const },
            nome: { type: "string" as const },
            cobertura: {
              type: "object" as const,
              properties: {
                primeiroMes: { type: "string" as const, description: "MM/yyyy" },
                ultimoMes: { type: "string" as const, description: "MM/yyyy" }
              },
              required: ["primeiroMes", "ultimoMes"]
            }
          },
          required: ["indice", "codigo", "nome", "cobertura"]
        },
        base: {
          type: "object" as const,
          description: "Mês em cujos preços os valores reais estão expressos",
          properties: {
            mes: { type: "string" as const, description: "MM/yyyy" },
            descricao: { type: "string" as const }
          },
          required: ["mes", "descricao"]
        },
        periodo: {
          type: "object" as const,
          properties: {
            dataInicial: { type: "string" as const },
            dataFinal: { type: "string" as const }
          },
          required: ["dataInicial", "dataFinal"]
        },
        dados: {
          type: "array" as const,
          description: "Observações com o valor publicado e o valor em moeda constante",
          items: {
            type: "object" as const,
            properties: {
              data: { type: "string" as const, description: "dd/MM/yyyy" },
              valorNominal: { type: "number" as const, description: "Valor como o BCB publicou" },
              valorReal: {
                type: ["number", "null"] as const,
                description: "Valor em reais do mês base; `null` quando a data cai fora da cobertura do índice"
              },
              fator: {
                type: ["number", "null"] as const,
                description: "Multiplicador aplicado; `null` pelo mesmo motivo"
              }
            },
            required: ["data", "valorNominal", "valorReal", "fator"]
          }
        },
        variacao: {
          type: ["object", "null"] as const,
          description:
            "Variação percentual do período em moeda corrente ao lado da variação em moeda constante — é a " +
            "comparação que a tool existe para entregar. `null` quando há menos de duas observações deflacionadas.",
          properties: {
            nominal: { type: "number" as const, description: "Variação percentual sem descontar inflação" },
            real: { type: "number" as const, description: "Variação percentual em poder de compra" },
            dataInicial: { type: "string" as const },
            dataFinal: { type: "string" as const }
          },
          required: ["nominal", "real", "dataInicial", "dataFinal"]
        },
        derivacao: DERIVACAO_SCHEMA,
        harmonizacao: HARMONIZACAO_SCHEMA,
        avisos: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Ressalvas sobre cobertura do índice ou mês base substituído"
        },
        chunking: CHUNKING_SCHEMA,
        janelaAplicada: JANELA_APLICADA_SCHEMA
      },
      required: ["serie", "deflator", "base", "periodo", "dados", "variacao", "derivacao"]
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
/**
 * Tools cuja resposta mistura procedências e por isso publicam um ARRAY de
 * blocos. Medido em `bcb/docs/07`: não é por API (nenhuma tool mistura APIs, e
 * a licença é a mesma nas três), é por procedência.
 *
 * - `bcb_serie_metadados`: valor e periodicidade são extração do SGS agora;
 *   nome e categoria vêm do catálogo curado do servidor.
 * - `bcb_buscar_serie`: índice do portal (de cache de 24 h) + catálogo curado.
 * - `bcb_cambio_cotacao`: cotação do dólar é apurada pelo BCB; paridade de
 *   outra moeda vem de agência de informação e é só redistribuída.
 */
const TOOLS_MULTI_PROVENIENCIA = new Set([
  "bcb_serie_metadados",
  "bcb_buscar_serie",
  "bcb_cambio_cotacao"
]);

export const TOOL_DEFINITIONS = [
  ...RAW_TOOL_DEFINITIONS,
  ...FOCUS_TOOL_DEFINITIONS,
  ...CAMBIO_TOOL_DEFINITIONS
].map(tool => ({
  ...tool,
  inputSchema: sealDeep(tool.inputSchema),
  // O canal de proveniência é acrescentado AQUI, num lugar só, e não nos 15
  // literais de schema: assim tool nova o herda sem depender de ninguém lembrar.
  // As três da lista abaixo carregam mais de uma procedência — ver `provenance.ts`.
  outputSchema: sealDeep(
    (TOOLS_MULTI_PROVENIENCIA.has(tool.name) ? comProvenienciaMulti : comProveniencia)(tool.outputSchema)
  )
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

/**
 * Atalho de códigos por tema — recurso publicado (`bcb://series/codigos`).
 *
 * Carregava os MESMOS erros do catálogo curado, e por isso foi refeito na
 * verificação de 13/08/2026: apontava `selic_meta` para a 1178 (que é a Selic
 * efetiva) e `selic_acumulada` para a 432 (que é a meta) — exatamente
 * invertidos —, `divida_bruta` para a 4513 (dívida LÍQUIDA consolidada) e
 * `resultado_primario` para a 4537 (dívida bruta em metodologia de até 2007).
 * Um atalho errado é pior que atalho nenhum: ele é feito para ser usado sem
 * conferência.
 *
 * Não há entrada de dívida bruta corrente: entre as séries verificadas, a única
 * de dívida bruta é a 4537, em metodologia descontinuada em 2007. Preferimos
 * omitir a chave a apontá-la como se fosse a corrente — quem precisa acha pela
 * `bcb_buscar_serie`.
 */
export const CODIGOS_PRINCIPAIS = {
  juros: {
    selic_meta: 432,        // meta definida pelo Copom (constante entre reuniões)
    selic_efetiva: 1178,    // Selic anualizada base 252, a taxa que de fato ocorre
    selic_acumulada_mes: 4390,
    cdi: 4389,
    tr: 226
  },
  inflacao: { ipca_mensal: 433, ipca_12m: 13522, igpm: 189, inpc: 188 },
  // PTAX diária vem das tools de câmbio; a 3698 do SGS é MENSAL (medido).
  cambio: { dolar_venda: 1, dolar_compra: 10813, dolar_ptax_mensal: 3698, euro: 21619 },
  atividade: { pib_mensal: 4380, ibc_br: 24364 },
  emprego: { desemprego: 24369, rendimento_medio: 24380 },
  fiscal: {
    divida_liquida_setor_publico: 4513,
    divida_liquida_governo_geral: 4536,
    resultado_primario: 5793
  }
};

export const RESOURCE_DEFINITIONS: ResourceDefinition[] = [
  {
    name: "series_populares",
    uri: "bcb://series/populares",
    description:
      "Catálogo de 135 séries econômicas do BCB, verificadas contra a origem, organizadas por categoria; " +
      "cada entrada traz `fonteNome` (nome transcrito do portal do BCB ou herdado com periodicidade medida)",
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

/**
 * Despacha uma tool, com o coletor de extração aberto.
 *
 * O coletor é aberto AQUI, e não no `register.ts`, para que todo caminho o
 * tenha: os dois transportes, os testes e qualquer chamada direta. É o que faz
 * o `retrieved_at` do bloco de proveniência ser o instante real da extração —
 * inclusive quando a resposta vem do cache de 24 h do índice do portal, caso em
 * que o instante correto é de até um dia atrás (`bcb/docs/07`).
 */
export async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
  maxRetries?: number
): Promise<ToolResult> {
  return comColetorDeExtracao(() => despachar(toolName, args, timeoutMs, maxRetries));
}

async function despachar(
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
    case "bcb_correlacao":
      return handleCorrelacao(
        args as {
          codigos: number[]; dataInicial: string; dataFinal: string;
          frequencia?: FrequenciaAlvo; agregacao?: Agregacao;
          metodo?: MetodoCorrelacao; base?: BaseCorrelacao;
        },
        timeoutMs, maxRetries
      );
    case "bcb_deflacionar":
      return handleDeflacionar(
        args as {
          codigo: number; dataInicial: string; dataFinal: string;
          indice?: string; mesBase?: string;
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
