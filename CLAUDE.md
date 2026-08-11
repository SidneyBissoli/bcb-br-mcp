# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An MCP server, published to npm as `bcb-br-mcp`, exposing the Brazilian Central
Bank's SGS time series (Selic, IPCA, FX, GDP and 150+ economic indicators) as 8
tools over STDIO and Streamable HTTP. Pure TypeScript, ESM, one runtime
dependency: `@modelcontextprotocol/server` (MCP SDK v2). No database; the only
state is the module-level series catalog.

Two consumer channels, both in production and both protected:

- **npm** (`bcb-br-mcp`, ~500 downloads/month, 1.36k uses on Smithery) — stdio.
- **Hosted** — `https://bcb.sidneybissoli.com/mcp` (custom domain) and the
  historical `https://bcb.sidneybissoli.workers.dev`.

## Commands

```bash
npm run build          # limpa dist/ e compila com tsconfig.build.json (sem testes)
npm start              # node dist/index.js (servidor MCP em stdio)
npm test               # vitest run
npm run typecheck      # tsc --noEmit (inclui os testes — o build os exclui)
npm run smoke          # smoke contra o worker hospedado
node scripts/smoke-mcp.mjs --stdio        # o mesmo smoke sobre dist/index.js local
node scripts/dump-surface.mjs --stdio     # dump normalizado da superfície (ver baselines/)
```

O Worker (`worker/`, não publicado no npm) é uma instância do template de
hosting da Fase 0 (`mcp-br-commons/templates/cloudflare-worker`) e tem scripts
próprios, rodados de dentro de `worker/`:

```bash
cd worker && npm run dev        # wrangler dev — HTTP local em :8787
cd worker && npm run deploy     # wrangler deploy
cd worker && npm run typecheck
cd worker && npm test           # auth, rate limit, usage, status, superfície
```

O Worker **não** lista `@modelcontextprotocol/server` nas próprias deps — ele
resolve do `node_modules` do pacote pai, para haver uma única cópia do SDK.
`worker/.npmrc` fixa `legacy-peer-deps=true` porque o pacote `agents` declara
peers rígidos e o npm instalaria uma segunda cópia.

## Arquitetura

**Um registro, dois transportes.** `src/register.ts` é o ÚNICO lugar que projeta
tools/resources/prompts num `McpServer`; exporta `registerAll(server, options)` e
`createServer(version, options)`. `src/index.ts` é um wrapper fino de stdio
(`serveStdio`); `worker/src/server.ts` chama o mesmo `registerAll` por request
(`createMcpHandler`, stateless). `src/tools.ts` concentra catálogo, handlers,
`dispatchTool` e as definições canônicas (`TOOL_DEFINITIONS`,
`RESOURCE_DEFINITIONS`, `PROMPT_DEFINITIONS`).

Isso é recente e o motivo importa: até a fundação da fase bcb havia DUAS
superfícies independentes — o stdio derivava schemas do zod e o worker
reimplementava o JSON-RPC à mão com sua própria cópia dos schemas. Elas tinham
divergido de verdade (contrato HTTP sem `minItems`/`maxItems`, sem `default`,
sem `additionalProperties`; resources publicados com nomes diferentes;
descrições de tool 12× menores em produção). A medição está em
`baselines/README.md` — leia antes de mexer na superfície.

**Schemas:** os JSON Schemas em `TOOL_DEFINITIONS` são a superfície publicada e
vão ao ar VERBATIM (via `fromJsonSchema`). Não devolva schemas derivados de zod
ao SDK — o emissor dele reescreveria o dialeto. `sealDeep` fecha
(`additionalProperties: false`) todo nó objeto num lugar só.

**Validação:** entrada é validada, saída não. O validador é o
`CfWorkerJsonSchemaValidator` — nos DOIS runtimes de propósito: o provider de
ajv compila com `new Function`, que o runtime da Cloudflare proíbe (derruba todo
`/mcp` com HTTP 500). Erros de validação voltam como resultado `isError` com
texto, não como erro de protocolo.

**Regra dura do SDK v2:** toda tool que declara `outputSchema` PRECISA devolver
`structuredContent` em todo sucesso — a checagem roda antes de qualquer
validador e não dá para desligar. Todos os handlers passam por
`structuredResult()`.

**Rota legada:** `POST /` no worker é reescrito para `/mcp`. O worker antigo
servia o JSON-RPC na raiz e é isso que o README publicou por versões; sem a
reescrita, todo cliente HTTP configurado quebraria. `GET /` segue sendo a
landing page. O contador `legacy_root_post` em `/metrics` mede quem ainda usa.

## Testes

- `src/tools.characterization.test.ts` — baseline do comportamento pré-migração
  das 8 tools, valor a valor, com `global.fetch` mockado (nunca rede). **Não
  relaxe estas asserções para fazer um refactor passar**: `bcb_variacao` e
  `bcb_comparar` são o gate registrado da migração ao `@sbissoli/mcp-stats`
  (arbitragem 4 da fase) — a migração só passa se cada diferença for nenhuma ou
  explicável. Repare que as duas tools usam convenções de arredondamento
  DIFERENTES entre si hoje; isso está pinado de propósito.
- `src/register.test.ts` — fidelidade registro↔wire pelo cliente v2 sobre
  transporte em memória.
- `worker/tests/` — auth, rate limit, agregação de uso, status, superfície.

## Baselines de superfície

`baselines/` guarda dumps normalizados de `tools/list` + resources + prompts.
Depois de qualquer mudança que possa mexer na superfície:

```bash
npm run build && node scripts/dump-surface.mjs --stdio > /tmp/depois.json
# comparar com baselines/surface-stdio-after-fundacao.json
```

Toda diferença precisa ser deliberada e listada no CHANGELOG.

## Convenções

- ESM com `NodeNext`: **todo import relativo leva `.js`**, mesmo em `.ts`.
- Descrições de tool e mensagens de erro em pt-BR (chegam ao usuário final);
  código e comentários acompanham o arquivo em que você está.
- Versão só em `package.json` — `index.ts` lê via `createRequire`, o worker via
  import do JSON. `server.json` é ressincronizado pelo CI no publish.
- Commits em Conventional Commits; o corpo explica o *porquê*.

## CI

- `ci.yml` — pacote (Node 20 e 22: typecheck + testes + build + dump da
  superfície) · worker (build da raiz + typecheck + testes) · npm audit.
- `deploy-worker.yml` — deploy contínuo em push para `main` nos caminhos do
  worker, com smoke de produção ao final. Existe porque o deploy manual produziu
  deriva real (npm 1.3.5 × hospedado 1.3.1 por versões).
- `publish.yml` — npm (com provenance) → MCP Registry (OIDC) → GitHub release.
  Sincroniza `server.json` a partir do `package.json`.

Secrets necessários: `NPM_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Pontos que mordem

- **A API do BCB cai.** Retornos 502 em massa no `api.bcb.gov.br` acontecem (um
  aconteceu durante a fundação, atingindo todos os endpoints do SGS por horas).
  O servidor degrada com `isError` e o smoke distingue isso de falha nossa.
- **Limite de 10 anos do SGS** vale só para séries **diárias**, e o erro é
  **406** (não 400/404) — o tratamento ainda não existe, está no escopo do D1.
- **`ultimos/N` tem teto de 20** no upstream, embora o schema anuncie até 1000.
- **Renomear o worker quebraria a URL**: ele se chama `bcb` desde a origem e é
  isso que define `bcb.sidneybissoli.workers.dev`.
- **Propagação da Cloudflare serve isolates mistos** por alguns segundos após o
  deploy; um smoke imediato pode pegar a versão antiga. Re-rodar resolve.
