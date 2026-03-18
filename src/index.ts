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
  SERIES_POPULARES,
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

// ==================== RESOURCES ====================

server.resource(
  "series_populares",
  "bcb://series/populares",
  {
    description: "Catálogo de 150+ séries econômicas populares do BCB organizadas por categoria",
    mimeType: "application/json"
  },
  async () => ({
    contents: [
      {
        uri: "bcb://series/populares",
        mimeType: "application/json",
        text: JSON.stringify(SERIES_POPULARES, null, 2)
      }
    ]
  })
);

server.resource(
  "categorias",
  "bcb://series/categorias",
  {
    description: "Lista de categorias disponíveis no catálogo de séries do BCB",
    mimeType: "application/json"
  },
  async () => {
    const categorias = [...new Set(SERIES_POPULARES.map(s => s.categoria))].sort();
    return {
      contents: [
        {
          uri: "bcb://series/categorias",
          mimeType: "application/json",
          text: JSON.stringify(categorias, null, 2)
        }
      ]
    };
  }
);

server.resource(
  "codigos_principais",
  "bcb://series/principais",
  {
    description: "Códigos dos indicadores econômicos mais utilizados (Selic, IPCA, Dólar, PIB, etc.)",
    mimeType: "application/json"
  },
  async () => ({
    contents: [
      {
        uri: "bcb://series/principais",
        mimeType: "application/json",
        text: JSON.stringify({
          juros: { selic_meta: 1178, selic_acumulada: 432, cdi: 4389, tr: 226 },
          inflacao: { ipca_mensal: 433, ipca_12m: 13522, igpm: 189, inpc: 188 },
          cambio: { dolar_venda: 1, dolar_ptax: 3698, euro: 21619 },
          atividade: { pib_mensal: 4380, ibc_br: 24364 },
          emprego: { desemprego: 24369, rendimento_medio: 24380 },
          fiscal: { divida_bruta: 4513, divida_liquida: 4503, resultado_primario: 4537 }
        }, null, 2)
      }
    ]
  })
);

// ==================== PROMPTS ====================

server.prompt(
  "indicadores_atuais",
  "Consulta os principais indicadores econômicos do Brasil (Selic, IPCA, Dólar, IBC-Br)",
  async () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "Consulte os indicadores econômicos atuais do Brasil usando a ferramenta bcb_indicadores_atuais e apresente os resultados de forma clara e organizada."
        }
      }
    ]
  })
);

server.prompt(
  "panorama_economico",
  "Gera um panorama completo da economia brasileira com os principais indicadores",
  async () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "Faça um panorama completo da economia brasileira. Use bcb_indicadores_atuais para obter Selic, IPCA, Dólar e IBC-Br. Depois use bcb_serie_ultimos para consultar os últimos 3 valores da taxa de desemprego (código 24369) e da dívida bruta (código 4513). Apresente tudo de forma organizada com análise breve."
        }
      }
    ]
  })
);

server.prompt(
  "comparar_inflacao",
  "Compara os principais índices de inflação do Brasil (IPCA, IGP-M, INPC) nos últimos 12 meses",
  async () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "Compare os principais índices de inflação do Brasil nos últimos 12 meses. Use bcb_serie_ultimos com quantidade 12 para IPCA (código 433), IGP-M (código 189) e INPC (código 188). Apresente uma tabela comparativa e análise das tendências."
        }
      }
    ]
  })
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
