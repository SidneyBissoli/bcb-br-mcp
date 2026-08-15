# Gate de segurança — Snyk Agent Scan (2026-08-15)

Gate de fechamento de conformidade (padrão do portfólio, o mesmo dos
servidores ilo/uis/ibge/medical).

## Resultado

**PASSOU** — nenhum achado de análise, nenhuma falha de runtime; `--ci`
devolveu **exit 0**.

- Scanner: `snyk-agent-scan` v0.5.17 (via `uvx`), autenticado (SNYK_TOKEN).
- Modo: `--ci --dangerously-run-mcp-servers` (STDIO local real — o scanner
  lançou `node dist/index.js` da v1.9.2 diretamente, sem ponte `mcp-remote`).
  O CLI recebe um **arquivo de config MCP** (`mcpServers`), não o comando cru:

  ```json
  { "mcpServers": { "bcb-br-mcp": { "command": "node", "args": ["dist/index.js"] } } }
  ```

- Alvo: a superfície completa da v1.9.2 — **15 tools**, 3 prompts e 3
  resources — enumerada com sucesso (`serverInfo.version` = 1.9.2;
  `error: null` no servidor e no scan; `issues: []`). As 21 entradas rotuladas
  (15 tools + 3 prompts + 3 resources) saíram com `is_public_sink`,
  `destructive`, `untrusted_content` e `private_data` = 0.
- Evidência bruta: `2026-08-15-snyk-agent-scan.json` (caminhos locais
  normalizados; verificado sem token nem segredo antes de entrar no repo).

## Sem ressalva

Diferente de ibge e medical, **não houve o achado W001 "Dangerous Words"** —
nenhuma descrição desta superfície usa termos que a heurística lê como
manipulação do agente. A varredura anti-injection do fechamento (descrições de
tools/prompts/resources/parâmetros sem diretivas de comportamento) já tinha
passado; as três ocorrências de "ignora" ("ignora acentos", "a fonte ignora
`$count`", "`periodos` ignora as datas") descrevem comportamento do servidor ou
da origem, não instruem o agente.

## Limitação conhecida

O scan cobre apenas o transporte STDIO local; o Worker hospedado
(`https://bcb.sidneybissoli.com/mcp`) serve a MESMA superfície (`registerAll`
único em `src/register.ts`; dumps stdio × HTTP byte-idênticos, reconferidos a
cada deploy pelo smoke), então a enumeração vale para os dois transportes.
