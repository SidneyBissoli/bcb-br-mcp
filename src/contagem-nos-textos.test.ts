/**
 * Toda contagem de ferramentas escrita em texto para HUMANO bate com a
 * superfície real do servidor — e o texto em português diz as mesmas
 * ferramentas que o texto em inglês.
 *
 * POR QUE ESTE ARQUIVO EXISTE. A v1.4.0 levou o servidor de 8 para 13 tools e a
 * v1.4.2 para 15. O inglês foi junto; o português não. Em 2026-08-31 o
 * `README.pt-BR.md` ainda anunciava "8 ferramentas", listava 9 das 15 (faltavam
 * as famílias `bcb_focus_*` e `bcb_cambio_*` inteiras) e mandava o leitor
 * apontar o cliente para o hostname `workers.dev` antigo. O comentário do
 * `worker/src/config.ts` registra que a MESMA frase ("8 ferramentas", eram 15)
 * já tinha sido corrigida na landing — e ninguém voltou ao README traduzido.
 *
 * É a assimetria que faz o defeito: o texto em inglês é o que se revisa a cada
 * release, o traduzido é cópia que ninguém reabre. Nada quebra, nenhum teste
 * reprova, e o leitor em português recebe a descrição de um produto menor e
 * mais antigo — justo a superfície que o buscador indexa em português.
 *
 * A defesa é derivada da FONTE, nunca de literal ([[verificacao-deriva-da-fonte]]):
 * a contagem vem de `TOOL_DEFINITIONS` e o conjunto de tools citadas vem do
 * próprio texto. Histórico (CHANGELOG, seções de versão antiga) fica de fora de
 * propósito: ali o número velho é o registro correto do que era verdade.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { TOOL_DEFINITIONS } from "./tools.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const leia = (f: string) => readFileSync(join(raiz, f), "utf8");

/** Textos vivos, voltados ao público, que podem afirmar um total. */
const TEXTOS = ["README.md", "README.pt-BR.md", "server.json", "package.json", "src/identity.ts"];

/** "15 tools", "15 ferramentas". */
const AFIRMACAO = /(\d+)\s+(?:tools|ferramentas)\b/gi;
/** Nomes de ferramenta citados em crase no texto. */
const CITADAS = /`(bcb_[a-z_0-9]+)`/g;

/**
 * Trechos que descrevem o passado e por isso podem citar contagens antigas:
 * do cabeçalho `## Changelog` (ou `## Changelog`/`## Histórico`) até o fim.
 */
function semHistorico(texto: string): string {
  const corte = texto.search(/^## (Changelog|Hist[óo]rico)/m);
  return corte === -1 ? texto : texto.slice(0, corte);
}

describe("contagem de ferramentas nos textos públicos", () => {
  const esperado = TOOL_DEFINITIONS.length;

  it("a lista de tools do servidor é a fonte da contagem", () => {
    expect(esperado).toBeGreaterThan(0);
  });

  for (const arquivo of TEXTOS) {
    it(`${arquivo} não afirma uma contagem diferente de ${esperado}`, () => {
      const conteudo = semHistorico(leia(arquivo));
      for (const m of conteudo.matchAll(AFIRMACAO)) {
        expect(
          Number(m[1]),
          `${arquivo} anuncia "${m[0]}", mas o servidor registra ${esperado} ferramentas`,
        ).toBe(esperado);
      }
    });
  }
});

describe("paridade entre o README em inglês e o em português", () => {
  const pt = "README.pt-BR.md";

  it("o README em português existe", () => {
    expect(existsSync(join(raiz, pt)), `${pt} ausente — metade da superfície em pt`).toBe(true);
  });

  it("cita exatamente as mesmas ferramentas que o README em inglês", () => {
    const nomes = (f: string) => new Set([...leia(f).matchAll(CITADAS)].map((m) => m[1]));
    const en = nomes("README.md");
    const ptBR = nomes(pt);
    const faltamNoPt = [...en].filter((n) => !ptBR.has(n)).sort();
    const sobramNoPt = [...ptBR].filter((n) => !en.has(n)).sort();
    expect(faltamNoPt, "ferramentas no README em inglês e ausentes do português").toEqual([]);
    expect(sobramNoPt, "ferramentas no README em português e ausentes do inglês").toEqual([]);
  });

  it("tem o mesmo esqueleto de seções", () => {
    const secoes = (f: string) => (leia(f).match(/^#{2,3} /gm) ?? []).length;
    expect(secoes(pt), "número de seções divergente entre os dois READMEs").toBe(secoes("README.md"));
  });
});
