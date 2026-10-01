/**
 * GUARDA: nenhum resultado de erro nasce sem classe declarada.
 *
 * Por que existe. Em 30/09/2026 um handler do medical montava
 * `{ content, isError: true }` à mão; sem classe anexada, o hook de telemetria
 * caiu na frase, e o código ecoado na mensagem ("INVALID") casou `\binvalid` —
 * `contrato`, classe que o painel EXCLUI da taxa de erro, para o que era
 * `nao_encontrado`. Aqui havia dois casos iguais (`bcb_variacao` com dados
 * insuficientes e o `default` do `dispatchTool`).
 *
 * A regra: em código de produção, `isError: true` só aparece dentro de
 * `erroResult` (shared.ts), cujo 2º parâmetro — a classe — é obrigatório no
 * tipo. Qualquer outro lugar que precise de erro chama `erroResult(texto,
 * classe)` ou `erroDeExcecao(prefixo, erro)`, e o compilador cobra a classe.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));

/**
 * Arquivos onde o literal é permitido, com o porquê. Lista explícita: entrar
 * aqui é decisão de revisão, não de conveniência.
 */
const PERMITIDOS: Record<string, string> = {
  // O único construtor de resultado de erro: anexa a classe (obrigatória) na
  // chave-símbolo CLASSE_DO_ERRO antes de devolver.
  "shared.ts": "erroResult — o helper que exige e anexa a classe"
};

/**
 * `isError: true` como PROPRIEDADE de objeto. A lookbehind exclui a menção em
 * prosa (descrição de tool entre crases, "`isError: true`", e comentário
 * "`result.isError: true`"), que não é código que monte resultado.
 */
const LITERAL = /(?<![`.\w])isError\s*:\s*true\b/g;

function arquivosDeProducao(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      achados.push(...arquivosDeProducao(caminho));
      continue;
    }
    if (entrada.endsWith(".ts") && !entrada.includes(".test.")) achados.push(caminho);
  }
  return achados;
}

describe("guarda: `isError: true` literal só no helper que anexa a classe", () => {
  it("nenhum arquivo de produção fora da lista monta resultado de erro à mão", () => {
    const violacoes: string[] = [];
    for (const arquivo of arquivosDeProducao(SRC)) {
      const nome = relative(SRC, arquivo).replace(/\\/g, "/");
      if (nome in PERMITIDOS) continue;
      const linhas = readFileSync(arquivo, "utf8").split("\n");
      linhas.forEach((linha, i) => {
        if (LITERAL.test(linha)) violacoes.push(`${nome}:${i + 1}: ${linha.trim()}`);
        LITERAL.lastIndex = 0;
      });
    }
    expect(violacoes, `use erroResult(texto, classe):\n${violacoes.join("\n")}`).toEqual([]);
  });

  it("o padrão pega o literal que a guarda existe para pegar (senão passaria vazia)", () => {
    expect(LITERAL.test('return { content: [], isError: true };')).toBe(true);
    LITERAL.lastIndex = 0;
    const helper = readFileSync(join(SRC, "shared.ts"), "utf8");
    expect(helper.match(LITERAL)?.length).toBe(1);
  });
});
