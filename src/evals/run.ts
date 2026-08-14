/**
 * Eval de seleção de tool — rodada com MODELO REAL (Anthropic Messages API).
 *
 * **CUSTA DINHEIRO**: consome a API, cobrada à parte de qualquer assinatura.
 * Nunca rodar com `ANTHROPIC_API_KEY` no ambiente sem o decisor ter pedido a
 * rodada. Sem a chave, imprime as instruções e sai com 0 (seguro em CI).
 *
 * O sinal de regressão OFFLINE — o que roda em `npm test` — é
 * `src/evals/fixtures.test.ts`: ele valida as fixtures contra o catálogo VIVO,
 * sem rede e sem modelo.
 *
 * Uso: `npx tsx src/evals/run.ts`
 * Variáveis opcionais: `EVAL_MODEL`, `EVAL_CONCURRENCY`, `EVAL_LIMIT`.
 */

import { runEval } from "@sbissoli/mcp-evals";
import { CATALOG } from "./catalog.js";
import { FIXTURES } from "./fixtures/queries.js";

const { exitCode } = await runEval({
  catalog: CATALOG,
  fixtures: FIXTURES,
  systemPrompt:
    "Você é o roteador de ferramentas do servidor MCP bcb-br (dados oficiais do Banco Central " +
    "do Brasil: séries temporais do SGS, expectativas de mercado do Focus e cotações de câmbio " +
    "PTAX). Dada a consulta do usuário, escolha a ferramenta mais adequada do catálogo e " +
    "chame-a. Não responda em texto; apenas chame a ferramenta."
});

process.exit(exitCode);
