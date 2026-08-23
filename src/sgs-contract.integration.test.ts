/**
 * Contrato do catálogo curado de séries SGS — valida, contra a API REAL do
 * BCB, que cada série de SERIES_POPULARES continua viva e publica na
 * cadência que o catálogo declara.
 *
 * Por que existe (regra de autoria do portfólio, caso ibge-br-mcp 2026-08):
 * constantes que referenciam recursos externos entram erradas "de memória"
 * e envelhecem em silêncio — uma série SGS descontinuada não dá erro, só
 * congela (ultimos/1 devolve um ponto cada vez mais antigo), e uma série
 * com código errado devolve números plausíveis de OUTRA coisa. O SGS não
 * expõe endpoint público de metadados com o NOME da série, então o contrato
 * verificável aqui é o de vitalidade/cadência: a idade do último ponto tem
 * de ser compatível com a periodicidade declarada no catálogo — a segunda
 * declaração independente que o teste confronta.
 *
 * Roda apenas com INTEGRATION_TESTS=1 (cron semanal + dispatch em
 * .github/workflows/integration.yml). Suíte offline não é afetada.
 */
import { describe, expect, it } from "vitest";
import { SERIES_POPULARES } from "./tools.js";

const LIVE = process.env.INTEGRATION_TESTS === "1" || process.env.INTEGRATION_TESTS === "true";

/** Idade máxima tolerada do último ponto, por periodicidade declarada. */
const MAX_AGE_DAYS: Record<string, number> = {
  // Datas SGS marcam o INÍCIO do período de referência; a tolerância cobre
  // período + defasagem de publicação (calibrada na ativação, 2026-08:
  // RNDBF mensais lagam ~1 trimestre; contas trimestrais saem ~2 meses
  // após o fecho; anuais como PIB em US$ saem até ~15 meses após a data).
  Diária: 15,
  Mensal: 160,
  Trimestral: 280,
  Anual: 800,
};

interface Ultimo {
  data: string; // dd/MM/yyyy
  valor: string;
}

async function ultimoPonto(codigo: number): Promise<Ultimo> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/1?formato=json`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as Ultimo[];
      if (!Array.isArray(body) || body.length === 0) {
        throw new Error("resposta vazia — série descontinuada ou código inválido");
      }
      return body[0];
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error(`SGS ${codigo}: ${String(lastErr)}`);
}

function ageDays(ddmmyyyy: string): number {
  const [d, m, y] = ddmmyyyy.split("/").map(Number);
  return (Date.now() - Date.UTC(y, m - 1, d)) / 86_400_000;
}

describe.runIf(LIVE)("contrato do catálogo SGS (API real do BCB)", () => {
  it("toda série declara periodicidade conhecida", () => {
    const bad = SERIES_POPULARES.filter((s) => !(s.periodicidade in MAX_AGE_DAYS));
    expect(
      bad.map((s) => `${s.codigo} (${s.nome}): "${s.periodicidade}"`),
      "periodicidade fora da tabela MAX_AGE_DAYS — adicione a tolerância"
    ).toEqual([]);
  });

  for (const serie of SERIES_POPULARES) {
    it(`SGS ${serie.codigo} — ${serie.nome} [${serie.periodicidade}] está viva e na cadência`, async () => {
      const ponto = await ultimoPonto(serie.codigo);
      const idade = ageDays(ponto.data);
      const tolerancia = MAX_AGE_DAYS[serie.periodicidade] ?? 90;
      expect(
        idade,
        `SGS ${serie.codigo} (${serie.nome}): último ponto em ${ponto.data} ` +
          `(${Math.round(idade)} dias) excede a tolerância de ${tolerancia} dias para ` +
          `periodicidade "${serie.periodicidade}" — série descontinuada, substituída ou código errado?`
      ).toBeLessThanOrEqual(tolerancia);
    }, 180_000);
  }
});
