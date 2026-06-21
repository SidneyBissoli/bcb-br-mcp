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
  version: "1.3.1"
});

// ==================== OUTPUT SCHEMAS (Zod) ====================
// Mirror the structuredContent returned by each handler so MCP clients can
// validate and consume tool results programmatically.

const observacaoSchema = z.object({
  data: z.string().describe("Data da observação (dd/MM/yyyy)"),
  valor: z.number().describe("Valor numérico da observação")
});

const serieRefSchema = z.object({
  codigo: z.number().describe("Código da série no SGS/BCB"),
  nome: z.string().describe("Nome da série"),
  categoria: z.string().optional().describe("Categoria econômica"),
  periodicidade: z.string().optional().describe("Periodicidade da série")
});

const serieValoresOutput = {
  serie: serieRefSchema,
  totalRegistros: z.number().describe("Quantidade de observações retornadas"),
  periodoInicial: z.string().optional().describe("Data da primeira observação"),
  periodoFinal: z.string().optional().describe("Data da última observação"),
  dados: z.array(observacaoSchema).describe("Observações históricas"),
  observacao: z.string().optional().describe("Mensagem informativa (ex.: quando não há dados)")
};

const serieUltimosOutput = {
  serie: serieRefSchema,
  totalRegistros: z.number().describe("Quantidade de observações retornadas"),
  dados: z.array(observacaoSchema).describe("Observações mais recentes"),
  observacao: z.string().optional().describe("Mensagem informativa (ex.: quando não há dados)")
};

const metadadosOutput = {
  codigo: z.number().describe("Código da série no SGS/BCB"),
  nome: z.string().describe("Nome da série"),
  unidade: z.string().optional().describe("Unidade de medida"),
  periodicidade: z.string().optional().describe("Periodicidade da série"),
  fonte: z.string().describe("Fonte dos dados"),
  categoria: z.string().optional().describe("Categoria econômica"),
  especial: z.boolean().optional().describe("Indica se é uma série especial"),
  ultimoValor: observacaoSchema.optional().describe("Última observação disponível (fallback)"),
  urlConsulta: z.string().optional().describe("URL da API do BCB para consulta completa"),
  urlUltimos10: z.string().optional().describe("URL da API do BCB para os últimos 10 valores"),
  observacao: z.string().optional().describe("Observação sobre a origem dos metadados")
};

const seriesPopularesOutput = {
  totalSeries: z.number().describe("Quantidade total de séries retornadas"),
  categorias: z.number().describe("Quantidade de categorias distintas"),
  series: z.union([
    z.array(serieRefSchema),
    z.record(z.array(serieRefSchema))
  ]).describe("Séries encontradas (array quando filtrado; objeto agrupado por categoria caso contrário)"),
  observacao: z.string().optional().describe("Dica de uso")
};

const buscarSerieOutput = {
  termo: z.string().describe("Termo pesquisado"),
  totalEncontradas: z.number().describe("Quantidade de séries encontradas"),
  series: z.array(serieRefSchema).describe("Séries que correspondem ao termo"),
  mensagem: z.string().optional().describe("Mensagem exibida quando nada é encontrado"),
  sugestao: z.string().optional().describe("Sugestões de termos alternativos")
};

const indicadoresAtuaisOutput = {
  consultadoEm: z.string().describe("Timestamp ISO 8601 da consulta"),
  indicadores: z.array(z.object({
    indicador: z.string().describe("Nome do indicador"),
    codigo: z.number().describe("Código da série no SGS/BCB"),
    data: z.string().optional().describe("Data da observação"),
    valor: z.number().optional().describe("Valor mais recente"),
    erro: z.string().optional().describe("Mensagem de erro quando indisponível")
  })).describe("Indicadores com seus valores mais recentes")
};

const variacaoOutput = {
  serie: z.object({
    codigo: z.number(),
    nome: z.string(),
    categoria: z.string().optional()
  }).describe("Identificação da série"),
  periodo: z.object({
    dataInicial: z.string(),
    dataFinal: z.string(),
    totalPeriodos: z.number()
  }).describe("Janela temporal analisada"),
  analise: z.object({
    valorInicial: z.number(),
    valorFinal: z.number(),
    diferencaAbsoluta: z.number(),
    variacaoPercentual: z.number(),
    variacaoFormatada: z.string()
  }).describe("Resultado da variação entre o primeiro e o último valor"),
  estatisticas: z.object({
    maximo: z.number(),
    minimo: z.number(),
    media: z.number(),
    amplitude: z.number()
  }).describe("Estatísticas descritivas dos valores no período")
};

const compararOutput = {
  periodo: z.object({
    dataInicial: z.string(),
    dataFinal: z.string()
  }).describe("Janela temporal comparada"),
  totalSeries: z.number().describe("Quantidade de séries solicitadas"),
  seriesComDados: z.number().describe("Quantidade de séries com dados no período"),
  seriesComErro: z.number().describe("Quantidade de séries sem dados ou com erro"),
  ranking: z.array(z.object({
    posicao: z.number(),
    codigo: z.number(),
    nome: z.string(),
    categoria: z.string().optional(),
    periodicidade: z.string().optional(),
    totalRegistros: z.number().optional(),
    valorInicial: z.number().optional(),
    valorFinal: z.number().optional(),
    variacaoPercentual: z.number().optional(),
    variacaoFormatada: z.string().optional(),
    maximo: z.number().optional(),
    minimo: z.number().optional(),
    media: z.number().optional()
  })).describe("Séries ordenadas pela variação percentual (maior para menor)"),
  erros: z.array(z.object({
    codigo: z.number(),
    nome: z.string().optional(),
    erro: z.string()
  })).describe("Séries que não retornaram dados, com o motivo")
};

// Tool: Get series values
server.registerTool(
  "bcb_serie_valores",
  {
    description: "Consulta valores de uma série temporal do BCB por código. Retorna dados históricos com data e valor.",
    annotations: {
      title: "Consultar valores da série",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      codigo: z.number().describe("Código da série no SGS/BCB (ex: 433 para IPCA mensal, 11 para Selic)"),
      dataInicial: z.string().optional().describe("Data inicial no formato yyyy-MM-dd ou dd/MM/yyyy (opcional)"),
      dataFinal: z.string().optional().describe("Data final no formato yyyy-MM-dd ou dd/MM/yyyy (opcional)")
    },
    outputSchema: serieValoresOutput
  },
  async (args) => handleSerieValores(args)
);

// Tool: Get last N values
server.registerTool(
  "bcb_serie_ultimos",
  {
    description: "Obtém os últimos N valores de uma série temporal do BCB. Útil para consultar dados mais recentes.",
    annotations: {
      title: "Últimos valores da série",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      codigo: z.number().describe("Código da série no SGS/BCB"),
      quantidade: z.number().min(1).max(1000).default(10).describe("Quantidade de valores a retornar (1-1000, padrão: 10)")
    },
    outputSchema: serieUltimosOutput
  },
  async (args) => handleSerieUltimos(args)
);

// Tool: Get series metadata
server.registerTool(
  "bcb_serie_metadados",
  {
    description: "Obtém informações/metadados de uma série temporal do BCB. Retorna nome, periodicidade, categoria e outros detalhes.",
    annotations: {
      title: "Metadados da série",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      codigo: z.number().describe("Código da série no SGS/BCB")
    },
    outputSchema: metadadosOutput
  },
  async (args) => handleSerieMetadados(args)
);

// Tool: List popular series
server.registerTool(
  "bcb_series_populares",
  {
    description: "Lista 150+ séries temporais do BCB com seus códigos. Inclui juros, inflação, câmbio, PIB, emprego, crédito e outros indicadores econômicos.",
    annotations: {
      title: "Listar séries populares",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    inputSchema: {
      categoria: z.string().optional().describe("Filtrar por categoria: Juros, Inflação, Câmbio, Atividade Econômica, Emprego, Fiscal, Setor Externo, Crédito, Agregados Monetários, Poupança, Índices de Mercado, Expectativas")
    },
    outputSchema: seriesPopularesOutput
  },
  async (args) => handleSeriesPopulares(args)
);

// Tool: Search series by name (with normalized search)
server.registerTool(
  "bcb_buscar_serie",
  {
    description: "Busca séries no catálogo interno por nome ou descrição. Aceita termos com ou sem acentos (ex: 'inflacao' encontra 'Inflação').",
    annotations: {
      title: "Buscar série no catálogo",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    inputSchema: {
      termo: z.string().min(2).describe("Termo de busca (mínimo 2 caracteres)")
    },
    outputSchema: buscarSerieOutput
  },
  async (args) => handleBuscarSerie(args)
);

// Tool: Get current indicators (convenience)
server.registerTool(
  "bcb_indicadores_atuais",
  {
    description: "Obtém os valores mais recentes dos principais indicadores econômicos: Selic, IPCA, Dólar PTAX e IBC-Br.",
    annotations: {
      title: "Indicadores econômicos atuais",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {},
    outputSchema: indicadoresAtuaisOutput
  },
  async () => handleIndicadoresAtuais({} as Record<string, never>)
);

// Tool: Calculate percentage variation
server.registerTool(
  "bcb_variacao",
  {
    description: "Calcula a variação percentual de uma série entre duas datas ou nos últimos N períodos. Útil para análise de tendências.",
    annotations: {
      title: "Variação percentual da série",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      codigo: z.number().describe("Código da série no SGS/BCB"),
      dataInicial: z.string().optional().describe("Data inicial (yyyy-MM-dd ou dd/MM/yyyy). Se não informada, usa o primeiro valor disponível."),
      dataFinal: z.string().optional().describe("Data final (yyyy-MM-dd ou dd/MM/yyyy). Se não informada, usa o último valor disponível."),
      periodos: z.number().optional().describe("Alternativa: calcular variação dos últimos N períodos (ignora datas se informado)")
    },
    outputSchema: variacaoOutput
  },
  async (args) => handleVariacao(args)
);

// Tool: Compare multiple series
server.registerTool(
  "bcb_comparar",
  {
    description: "Compara 2 a 5 séries temporais no mesmo período. Útil para análise de correlação entre indicadores.",
    annotations: {
      title: "Comparar séries",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      codigos: z.array(z.number()).min(2).max(5).describe("Array com 2 a 5 códigos de séries para comparar"),
      dataInicial: z.string().describe("Data inicial (yyyy-MM-dd ou dd/MM/yyyy)"),
      dataFinal: z.string().describe("Data final (yyyy-MM-dd ou dd/MM/yyyy)")
    },
    outputSchema: compararOutput
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
