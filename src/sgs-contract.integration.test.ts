/**
 * Contrato do catálogo curado de séries SGS — valida, contra a API REAL do
 * BCB, que cada série de SERIES_POPULARES continua viva e publica na
 * cadência que o catálogo declara.
 *
 * Por que existe (regra de autoria do portfólio, caso ibge-br-mcp 2026-08):
 * constantes que referenciam recursos externos entram erradas "de memória"
 * e envelhecem em silêncio — uma série SGS descontinuada não dá erro, só
 * congela (ultimos/N devolve um ponto cada vez mais antigo), e uma série
 * com código errado devolve números plausíveis de OUTRA coisa. O SGS não
 * expõe endpoint público de metadados com o NOME da série, então o contrato
 * verificável aqui é o de vitalidade/cadência: a idade do último ponto tem
 * de ser compatível com a periodicidade declarada no catálogo — a segunda
 * declaração independente que o teste confronta.
 *
 * Fonte fora ≠ deriva (item mcp:fonte-indisponivel-nao-e-deriva, 2026-10):
 * a rede passa pelo `@sbissoli/mcp-upstream` (o erro carrega o `kind`) e
 * cada série roda em `aoVivo`, que PULA o teste quando o SGS está fora
 * (timeout, rede, 429, 5xx) depois de 3 idas e o anota como `Fonte
 * indisponível` — job verde, o painel conta as noites. Corpo 200 que não é
 * um array (a página HTML de "requisição inválida", o envelope `{"erro":{}}`)
 * é ambíguo: repete, e se persistir fica vermelho rotulado `Ambíguo`. Só a
 * asserção (série congelada, código errado) é deriva, vermelho rotulado
 * `Deriva de formato`. Depois de 5 séries seguidas sem resposta e nenhuma
 * capturada, as demais pulam sem ir à rede (`Fonte inalcançável`).
 *
 * Roda apenas com INTEGRATION_TESTS=1 (cron semanal + dispatch em
 * .github/workflows/integration.yml). Suíte offline não é afetada.
 */
import { describe, expect, it } from "vitest";
import { createUpstream } from "@sbissoli/mcp-upstream";
import { suiteAoVivo } from "@sbissoli/mcp-live-source/vitest";
import { getUserAgent } from "./shared.js";
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

// `ultimos/2`, não `ultimos/1`: medido em 22/10/2026, a série 190 (IGP-DI)
// responde 200 com `{"erro":{}}` a `ultimos/1` em 5 de 5 chamadas e dados
// normais a `ultimos/2` — defeito da origem em N=1, não do catálogo (a série
// está viva: 09/2026). O último ponto é o de data MAIOR, porque `ultimos/N`
// vem invertido em 22 séries (CLAUDE.md), não "o último do array".
const ULTIMOS = 2;

// UMA tentativa de 45 s por ida; as 3 idas (2 s, 4 s de espera) são do
// `aoVivo`. Antes: fetch cru com 3 tentativas que relançava `Error("HTTP 502")`
// — sem `kind`, todo 502 era vermelho.
const upstream = createUpstream({
  userAgent: getUserAgent(),
  timeoutMs: 45_000,
  retries: 0,
  // 200 cujo corpo não é um array JSON = página de erro da origem (HTML atrás
  // do Front Door, envelope `{"erro":{}}`): ambíguo, repete.
  inspectBody: (_res, body) => (body.trimStart().startsWith("[") ? null : "malformed_body"),
});
const { aoVivo } = suiteAoVivo();

async function ultimoPonto(codigo: number): Promise<Ultimo | undefined> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/${ULTIMOS}?formato=json`;
  const body = await upstream.call().json<Ultimo[]>(url, { headers: { Accept: "application/json" } });
  let ultimo: Ultimo | undefined;
  for (const p of body) {
    if (ultimo === undefined || dataUtc(p.data) > dataUtc(ultimo.data)) ultimo = p;
  }
  return ultimo;
}

function dataUtc(ddmmyyyy: string): number {
  const [d, m, y] = ddmmyyyy.split("/").map(Number);
  return Date.UTC(y, m - 1, d);
}

function ageDays(ddmmyyyy: string): number {
  return (Date.now() - dataUtc(ddmmyyyy)) / 86_400_000;
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
    aoVivo(
      `SGS ${serie.codigo} — ${serie.nome} [${serie.periodicidade}] está viva e na cadência`,
      async () => {
        const ponto = await ultimoPonto(serie.codigo);
        expect(
          ponto,
          `SGS ${serie.codigo} (${serie.nome}): resposta vazia — série descontinuada ou código inválido`
        ).toBeDefined();
        const idade = ageDays(ponto!.data);
        const tolerancia = MAX_AGE_DAYS[serie.periodicidade] ?? 90;
        expect(
          idade,
          `SGS ${serie.codigo} (${serie.nome}): último ponto em ${ponto!.data} ` +
            `(${Math.round(idade)} dias) excede a tolerância de ${tolerancia} dias para ` +
            `periodicidade "${serie.periodicidade}" — série descontinuada, substituída ou código errado?`
        ).toBeLessThanOrEqual(tolerancia);
      },
      { endpoint: `sgs-${serie.codigo}`, timeout: 180_000 }
    );
  }
});
