/**
 * Catálogo vivo para o eval de seleção de tool (`@sbissoli/mcp-evals`).
 *
 * Diferente do ibge e do medical, aqui o catálogo NÃO passa pelo
 * `CapturingServer`: ele é montado direto de `TOOL_DEFINITIONS`. O motivo é da
 * arquitetura deste servidor — o zod foi removido e **os JSON Schemas escritos à
 * mão SÃO a superfície publicada**, servidos verbatim aos dois transportes
 * (`CLAUDE.md`). Reconstruí-los a partir de um shape zod inventaria um schema
 * que ninguém serve, e o eval mediria uma superfície que não existe.
 *
 * A `area` de cada tool é a partição de clusters abaixo — é o que faz o
 * relatório por área responder às duas perguntas que a fase mandou medir com
 * dado, em vez de opinião.
 */

import type { Catalog, CatalogTool, JsonSchema } from "@sbissoli/mcp-evals";
import { TOOL_DEFINITIONS } from "../tools.js";

/**
 * Área primária por tool — PARTIÇÃO das 17, alinhada aos agrupamentos em que a
 * confusão seria diagnóstica. `src/evals/fixtures.test.ts` exige que ela cubra
 * exatamente o catálogo, sem sobra nem falta.
 */
export const AREA_BY_TOOL: Record<string, string> = {
  // Leitura de série do SGS: o que a maior parte do tráfego pede.
  bcb_serie_valores: "serie",
  bcb_serie_ultimos: "serie",
  bcb_serie_metadados: "serie",
  // Descoberta: "que série é essa?", antes de saber o código.
  bcb_buscar_serie: "descoberta",
  bcb_series_populares: "descoberta",
  bcb_indicadores_atuais: "descoberta",
  // Estatística derivada — inclui a fronteira comparar × correlacao.
  bcb_variacao: "estatistica",
  bcb_comparar: "estatistica",
  bcb_correlacao: "estatistica",
  bcb_deflacionar: "estatistica",
  // Expectativas (Focus).
  bcb_focus_expectativas: "focus",
  bcb_focus_selic: "focus",
  bcb_focus_referencias: "focus",
  // Câmbio (PTAX).
  bcb_cambio_cotacao: "cambio",
  bcb_cambio_moedas: "cambio",
  // Contrato Deep Research da OpenAI (nomes fixados pelo ChatGPT; `deep-research.ts`).
  search: "deep-research",
  fetch: "deep-research"
};

const tools: CatalogTool[] = TOOL_DEFINITIONS.map(t => ({
  name: t.name,
  description: t.description,
  area: AREA_BY_TOOL[t.name] ?? "sem-area",
  // O `JsonSchema` do harness declara `additionalProperties` obrigatório; os
  // schemas daqui são selados por `sealDeep` em tempo de execução, então o
  // campo existe no objeto servido — mas o tipo estático do literal não o
  // carrega. A conversão é sobre a forma, não sobre o conteúdo.
  inputSchema: t.inputSchema as unknown as JsonSchema
}));

export const CATALOG: Catalog = {
  tools,
  toolNames: new Set(tools.map(t => t.name)),
  areaByName: new Map(tools.map(t => [t.name, t.area]))
};
