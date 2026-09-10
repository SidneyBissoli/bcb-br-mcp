import { describe, it, expect } from "vitest";
import { withAnalytics, tagRequest } from "../src/analytics.js";
import { classifyError, paramNames } from "../../src/call-shape.js";

/**
 * A FORMA da chamada (blobs 7 e 8). Ligada aqui depois de provar no senado, e
 * pelo mesmo motivo: `bcb_focus_expectativas` falha em 42 de 116 chamadas e a
 * telemetria dizia QUE falhou, não por quê. O caso que importa mais é o
 * último: nenhum blob pode carregar valor de parâmetro.
 */
interface Ponto {
  indexes?: string[];
  blobs?: string[];
  doubles?: number[];
}

function fake() {
  const points: Ponto[] = [];
  return {
    points,
    dataset: { writeDataPoint: (p: Ponto) => points.push(p) } as unknown as AnalyticsEngineDataset,
  };
}

const tag = tagRequest(new Request("https://example.com/mcp"));

describe("withAnalytics grava a forma da chamada", () => {
  it("êxito: nomes dos parâmetros, classe vazia", async () => {
    const a = fake();
    const rec = withAnalytics(() => {}, a.dataset, tag);
    rec("tool_call", "bcb_series", { params: "codigo", classe: "" });
    await Promise.resolve(); // deixa o microtask descarregar
    expect(a.points[0]?.blobs?.[6]).toBe("");
    expect(a.points[0]?.blobs?.[7]).toBe("codigo");
  });

  it("erro: a classe vem do par tool_error, os parâmetros do tool_call", async () => {
    const a = fake();
    const rec = withAnalytics(() => {}, a.dataset, tag);
    rec("tool_call", "bcb_focus_expectativas", { params: "horizonte,indicador", classe: "" });
    rec("tool_error", "bcb_focus_expectativas", { params: "horizonte,indicador", classe: "contrato" });
    await Promise.resolve();
    expect(a.points).toHaveLength(1);
    expect(a.points[0]?.blobs?.[1]).toBe("error");
    expect(a.points[0]?.blobs?.[6]).toBe("contrato");
    expect(a.points[0]?.blobs?.[7]).toBe("horizonte,indicador");
  });

  it("chamador antigo, sem forma, continua funcionando", async () => {
    const a = fake();
    const rec = withAnalytics(() => {}, a.dataset, tag);
    rec("tool_call", "bcb_series");
    await Promise.resolve();
    expect(a.points[0]?.blobs?.[6]).toBe("");
    expect(a.points[0]?.blobs?.[7]).toBe("");
  });

  it("NENHUM blob carrega valor de parâmetro", async () => {
    const a = fake();
    const rec = withAnalytics(() => {}, a.dataset, tag);
    const args = { indicador: "IPCA", referencia: "2026" };
    rec("tool_call", "bcb_focus_expectativas", {
      params: paramNames([args]),
      classe: classifyError('O horizonte "anual" exige `referencia` no formato yyyy'),
    });
    await Promise.resolve();
    const blobs = (a.points[0]?.blobs ?? []).join("|");
    expect(blobs).not.toContain("IPCA");
    expect(blobs).not.toContain("2026");
    expect(blobs).toContain("indicador,referencia");
  });
});
