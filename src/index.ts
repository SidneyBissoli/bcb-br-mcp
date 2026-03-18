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

import {
  handleSerieValores,
  handleSerieUltimos,
  handleSerieMetadados,
  handleSeriesPopulares,
  handleBuscarSerie,
  handleIndicadoresAtuais,
  handleVariacao,
  handleComparar
} from "./tools.js";

// ==================== MCP SERVER ====================

// Create MCP server
const server = new McpServer({
  name: "bcb-br-mcp",
  version: "1.1.0"
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
  async (args) => handleSerieValores(args)
);

// Tool: Get last N values
server.tool(
  "bcb_serie_ultimos",
  "Obtém os últimos N valores de uma série temporal do BCB. Útil para consultar dados mais recentes.",
  {
    codigo: z.number().describe("Código da série no SGS/BCB"),
    quantidade: z.number().min(1).max(1000).default(10).describe("Quantidade de valores a retornar (1-1000, padrão: 10)")
  },
  async (args) => handleSerieUltimos(args)
);

// Tool: Get series metadata
server.tool(
  "bcb_serie_metadados",
  "Obtém informações/metadados de uma série temporal do BCB. Retorna nome, periodicidade, categoria e outros detalhes.",
  {
    codigo: z.number().describe("Código da série no SGS/BCB")
  },
  async (args) => handleSerieMetadados(args)
);

// Tool: List popular series
server.tool(
  "bcb_series_populares",
  "Lista 150+ séries temporais do BCB com seus códigos. Inclui juros, inflação, câmbio, PIB, emprego, crédito e outros indicadores econômicos.",
  {
    categoria: z.string().optional().describe("Filtrar por categoria: Juros, Inflação, Câmbio, Atividade Econômica, Emprego, Fiscal, Setor Externo, Crédito, Agregados Monetários, Poupança, Índices de Mercado, Expectativas")
  },
  async (args) => handleSeriesPopulares(args)
);

// Tool: Search series by name (with normalized search)
server.tool(
  "bcb_buscar_serie",
  "Busca séries no catálogo interno por nome ou descrição. Aceita termos com ou sem acentos (ex: 'inflacao' encontra 'Inflação').",
  {
    termo: z.string().min(2).describe("Termo de busca (mínimo 2 caracteres)")
  },
  async (args) => handleBuscarSerie(args)
);

// Tool: Get current indicators (convenience)
server.tool(
  "bcb_indicadores_atuais",
  "Obtém os valores mais recentes dos principais indicadores econômicos: Selic, IPCA, Dólar PTAX e IBC-Br.",
  {},
  async () => handleIndicadoresAtuais({} as Record<string, never>)
);

// Tool: Calculate percentage variation
server.tool(
  "bcb_variacao",
  "Calcula a variação percentual de uma série entre duas datas ou nos últimos N períodos. Útil para análise de tendências.",
  {
    codigo: z.number().describe("Código da série no SGS/BCB"),
    dataInicial: z.string().optional().describe("Data inicial (yyyy-MM-dd ou dd/MM/yyyy). Se não informada, usa o primeiro valor disponível."),
    dataFinal: z.string().optional().describe("Data final (yyyy-MM-dd ou dd/MM/yyyy). Se não informada, usa o último valor disponível."),
    periodos: z.number().optional().describe("Alternativa: calcular variação dos últimos N períodos (ignora datas se informado)")
  },
  async (args) => handleVariacao(args)
);

// Tool: Compare multiple series
server.tool(
  "bcb_comparar",
  "Compara 2 a 5 séries temporais no mesmo período. Útil para análise de correlação entre indicadores.",
  {
    codigos: z.array(z.number()).min(2).max(5).describe("Array com 2 a 5 códigos de séries para comparar"),
    dataInicial: z.string().describe("Data inicial (yyyy-MM-dd ou dd/MM/yyyy)"),
    dataFinal: z.string().describe("Data final (yyyy-MM-dd ou dd/MM/yyyy)")
  },
  async (args) => handleComparar(args)
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
