/**
 * Sinal de regressão OFFLINE das tarefas de sessão longa.
 *
 * Roda no `npm test`, sem rede, sem modelo, sem custo: valida cada tarefa contra
 * o catálogo VIVO (montado de `TOOL_DEFINITIONS`, a superfície publicada) — tool
 * citada existe, argumento obrigatório do roteiro presente, nenhum argumento
 * desconhecido nos schemas selados. Renomear uma tool ou um parâmetro quebra
 * aqui na hora, não na rodada paga.
 */

import { describe, expect, it } from "vitest";
import { catalogAsAnthropicTools } from "@sbissoli/mcp-evals";
import { validateTaskSet } from "@sbissoli/mcp-evals/session";
import { CATALOG } from "../catalog.js";
import { TASK_SET } from "./tasks.js";

const TOOLS = catalogAsAnthropicTools(CATALOG);

describe("tarefas de sessão longa (bcb)", () => {
  it("são válidas contra o catálogo vivo", () => {
    expect(validateTaskSet(TASK_SET, TOOLS, { minTasks: 10, maxTasks: 15 })).toEqual([]);
  });

  it("toda tarefa arma uma armadilha documentada", () => {
    for (const t of TASK_SET.tasks) expect(t.trap, t.id).toBeTruthy();
  });

  it("a armadilha central (série inexistente) e a ausência com 200 (símbolo errado) estão no conjunto", () => {
    const ids = TASK_SET.tasks.map((t) => t.id);
    expect(ids).toContain("serie-inexistente-99999");
    expect(ids).toContain("ptax-simbolo-errado");
  });

  it("os três níveis de falha existem e as regras casam as duas origens do bcb", () => {
    expect(Object.keys(TASK_SET.faults).sort()).toEqual(["0", "20", "20html"]);
    expect(TASK_SET.faults["0"]!.rules).toEqual([]);
    for (const level of ["20", "20html"]) {
      const re = new RegExp(TASK_SET.faults[level]!.rules[0]!.match);
      expect(re.test("https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados")).toBe(true);
      expect(re.test("https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/")).toBe(true);
      expect(re.test("https://api.anthropic.com/v1/messages")).toBe(false);
    }
  });

  it("as tools de leitura, descoberta, Focus, câmbio e estatística aparecem como esperadas em alguma tarefa", () => {
    const expected = new Set(TASK_SET.tasks.flatMap((t) => t.expectedTools));
    for (const name of ["bcb_serie_valores", "bcb_buscar_serie", "bcb_focus_expectativas", "bcb_focus_selic", "bcb_cambio_cotacao", "bcb_comparar", "bcb_correlacao", "bcb_deflacionar"]) {
      expect(expected, name).toContain(name);
    }
  });
});
