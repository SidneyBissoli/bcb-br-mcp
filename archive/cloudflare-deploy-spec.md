# bcb-br-mcp — Deploy no Cloudflare Workers

## Objetivo

Adaptar e fazer o deploy do servidor MCP **bcb-br-mcp** no **Cloudflare Workers** (free tier permanente), gerando um endpoint HTTP público que permitirá:

1. Cadastro no **Smithery.ai** (que exige URL de servidor HTTP ativo)
2. Uso como **Connector** no Claude.ai e Claude Desktop via URL
3. Substituição gratuita e definitiva do Railway (que era pago)

---

## Regra Obrigatória — Consultar Documentação ANTES de Implementar

> **EXECUTAR ANTES DE QUALQUER CÓDIGO**

As APIs e SDKs utilizados evoluem rapidamente. Consulte a documentação atualizada via **Context7** antes de cada fase.

| Biblioteca / Plataforma | Como consultar |
|---|---|
| **Cloudflare Workers** | Context7: `/cloudflare/workers-sdk` |
| **Cloudflare KV** | Context7: `/cloudflare/workers-sdk` |
| **MCP TypeScript SDK** | Context7: `/modelcontextprotocol/typescript-sdk` |
| **Wrangler CLI** | Context7: `/cloudflare/workers-sdk` |

Se houver conflito entre este spec e a documentação atual, **seguir sempre a documentação atual**.

---

## Contexto do Projeto

O bcb-br-mcp é um servidor MCP TypeScript que:

- Acessa a **API pública do Banco Central do Brasil** (SGS/BCB)
- **Não requer chaves de API** — dados completamente públicos
- Funciona atualmente apenas via **stdio/npm** (`npx bcb-br-mcp`)
- Está publicado no npm como `bcb-br-mcp`
- Repositório: `https://github.com/SidneyBissoli/bcb-br-mcp`

### Estrutura atual do projeto

```
bcb-br-mcp/
├── src/
│   └── index.ts          # Entry point stdio atual
├── dist/                 # Build compilado
├── package.json
├── tsconfig.json
├── smithery.yaml         # Já existe (criado recentemente)
└── README.md
```

---

## Regra Absoluta — Ler Antes de Tocar em Qualquer Coisa

> **ESTA É A REGRA MAIS IMPORTANTE DO DOCUMENTO.**
>
> Antes de criar, modificar ou deletar **qualquer** arquivo, o Claude Code deve executar a Fase 0 completa. Qualquer modificação feita sem passar pela Fase 0 é considerada um erro de processo.
>
> O projeto bcb-br-mcp já existe localmente e no GitHub com código funcional. O objetivo é **adicionar** a capacidade de rodar no Cloudflare Workers, **sem remover nem quebrar nada** que já funciona.

---

## O Que Deve Ser Feito

### Fase 0 — Leitura e mapeamento completo do projeto existente

Esta fase é obrigatória e não pode ser pulada.

#### 0.1 — Mapear a estrutura de arquivos

Listar recursivamente todos os arquivos e pastas do projeto:

```bash
# Listar estrutura completa
find . -not -path './node_modules/*' -not -path './.git/*' | sort
```

#### 0.2 — Ler os arquivos-chave na íntegra

Ler o conteúdo completo de cada um dos arquivos abaixo, sem exceção:

- `package.json` — dependências, scripts, versão, configurações de build
- `tsconfig.json` — configurações TypeScript, targets, módulos
- `wrangler.toml` — se já existir
- `smithery.yaml` — já existe, criado recentemente
- `src/index.ts` — entry point stdio, lógica principal das tools
- Qualquer outro arquivo `.ts` em `src/` (tools, helpers, utils, etc.)
- `README.md` — para entender o que já está documentado

#### 0.3 — Inventariar o que já existe

Antes de propor qualquer mudança, responder explicitamente:

1. Quais tools MCP estão implementadas? (listar todas com nome e descrição)
2. Como as chamadas à API do BCB são feitas? (URL base, parâmetros, tratamento de erros)
3. Quais dependências npm são usadas? Alguma usa APIs Node.js nativas que podem ser incompatíveis com Workers?
4. Qual é o formato de saída das tools? (texto puro, JSON, markdown?)
5. Já existe algum entry point HTTP? (`server.ts` ou similar)
6. O `smithery.yaml` atual está correto? Precisa de ajuste?

#### 0.4 — Apresentar o diagnóstico antes de agir

Após a leitura completa, **apresentar um resumo do diagnóstico** e o **plano de ação detalhado** para aprovação antes de escrever qualquer código. O plano deve indicar:

- Quais arquivos serão **criados** (novos)
- Quais arquivos serão **modificados** (e o que exatamente muda)
- Quais arquivos serão **mantidos sem alteração**
- **Nenhum arquivo será deletado** sem aprovação explícita

Somente após apresentar e ter o plano confirmado, avançar para a Fase 1.

---

### Fase 1 — Planejamento da adaptação para Workers

Com base no diagnóstico da Fase 0, definir a estratégia de adaptação:

1. Identificar quais partes do `src/index.ts` podem ser compartilhadas entre o modo stdio e o Workers
2. Verificar compatibilidade de cada dependência com o runtime Cloudflare Workers
3. Decidir se a lógica das tools deve ser extraída para um arquivo separado ou se o `worker.ts` importará diretamente do código existente

---

### Fase 2 — Criar o Worker Cloudflare

Criar o arquivo `src/worker.ts` como entry point para o Cloudflare Workers.

#### Requisitos obrigatórios do Worker:

```typescript
// Estrutura mínima obrigatória
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Roteamento:
    // GET  /health  → retornar { status: "ok", service: "bcb-br-mcp" }
    // POST /mcp     → handler MCP (tools/list e tools/call)
    // OPTIONS /*    → CORS preflight
    // outros        → 404
  }
}
```

#### Constraints de segurança e performance:

- Max body size de entrada: **256 KB** — rejeitar com 413 se maior
- Timeout upstream para BCB: **10 segundos** via `AbortController`
- CORS: responder com `Access-Control-Allow-Origin: *` em todas as respostas
- Preflight `OPTIONS`: responder com status 204 e headers CORS corretos

#### Tipagem do ambiente:

```typescript
interface Env {
  BCB_BASE_URL?: string; // default: "https://api.bcb.gov.br"
}
```

#### Importante sobre compatibilidade:

- O runtime do Cloudflare Workers **não é Node.js**
- **NÃO usar** módulos Node.js como `fs`, `path`, `os`, `events` (native), `http`, `https`
- **NÃO usar** `require()` — apenas ESM (`import`/`export`)
- O `fetch` nativo está disponível globalmente — usá-lo diretamente
- Verificar se as dependências atuais são compatíveis com o runtime Workers

---

### Fase 3 — Adaptar o MCP Handler para Cloudflare

O código das tools existentes deve ser **reaproveitado ao máximo**. A adaptação foca apenas no transport layer:

#### Estratégia de adaptação:

1. **Extrair a lógica das tools** de `src/index.ts` para um arquivo compartilhável (ex: `src/tools/index.ts` ou `src/bcb-client.ts`)

2. **Criar o handler MCP** que processa as chamadas JSON-RPC recebidas via HTTP POST em `/mcp`:
   - `tools/list` → retornar lista de todas as tools disponíveis
   - `tools/call` → executar a tool solicitada e retornar resultado
   - Outros métodos → retornar erro MCP apropriado

3. **Manter `src/index.ts`** para o transport stdio (npm), sem alterações que quebrem o funcionamento atual

#### Estrutura de resposta MCP (JSON-RPC 2.0):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      { "type": "text", "text": "..." }
    ]
  }
}
```

---

### Fase 4 — Configurar o Wrangler

#### Criar/atualizar `wrangler.toml` na raiz do projeto:

```toml
name = "bcb-br-mcp"
main = "src/worker.ts"
compatibility_date = "2024-01-01"

[vars]
BCB_BASE_URL = "https://api.bcb.gov.br"
```

> **Nota:** Verificar via Context7 qual é a `compatibility_date` mais recente recomendada para Workers.

#### Atualizar `package.json` — adicionar scripts:

```json
{
  "scripts": {
    "build": "...",           // manter script existente
    "dev:worker": "wrangler dev src/worker.ts",
    "deploy:worker": "wrangler deploy"
  }
}
```

#### Instalar dependência de desenvolvimento:

```bash
npm install --save-dev wrangler
```

---

### Fase 5 — Atualizar `smithery.yaml`

O `smithery.yaml` existente é para o modo stdio. Ele deve permanecer como está (para o caso de o Smithery aceitar o modo stdio futuramente), mas verificar se precisa ser ajustado.

O Smithery na prática exige uma URL HTTP ativa — essa URL será gerada na Fase 6.

---

### Fase 6 — Build e testes locais

#### Testes que devem ser executados antes do deploy:

```bash
# 1. Verificar se o build TypeScript ainda funciona (stdio)
npm run build

# 2. Testar o worker localmente
npx wrangler dev src/worker.ts
```

Com o worker rodando localmente (`http://localhost:8787`), testar via PowerShell:

```powershell
# Health check
curl http://localhost:8787/health

# Listar tools
curl -X POST http://localhost:8787/mcp `
  -H "Content-Type: application/json" `
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Testar uma tool (ex: indicadores atuais)
curl -X POST http://localhost:8787/mcp `
  -H "Content-Type: application/json" `
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"bcb_indicadores_atuais","arguments":{}}}'
```

**Critério de aprovação:** Os três comandos devem retornar respostas JSON válidas e sem erro.

---

### Fase 7 — Deploy no Cloudflare

#### Pré-requisitos (orientar o usuário se necessário):  

1. Ter conta no Cloudflare (gratuita em cloudflare.com)  
2. Estar autenticado via Wrangler:  

```bash
npx wrangler login
```

Esse comando abre o navegador para autenticação OAuth — o usuário precisa aprovar no browser.

#### Deploy:

```bash
npx wrangler deploy
```

O Wrangler irá:  
1. Fazer build do TypeScript  
2. Fazer upload para a rede Cloudflare  
3. Retornar a URL pública do Worker  

A URL terá o formato:
```
https://bcb-br-mcp.SEU_USUARIO.workers.dev
```

#### Teste pós-deploy (com a URL real):

```powershell
# Health check
curl https://bcb-br-mcp.SEU_USUARIO.workers.dev/health

# Listar tools
curl -X POST https://bcb-br-mcp.SEU_USUARIO.workers.dev/mcp `
  -H "Content-Type: application/json" `
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

### Fase 8 — Atualizar `smithery.yaml` com a URL do deploy

Após o deploy bem-sucedido, atualizar o `smithery.yaml` para refletir o endpoint HTTP:

```yaml
startCommand:
  type: http
  url: "https://bcb-br-mcp.SEU_USUARIO.workers.dev/mcp"
  configSchema:
    type: object
    properties: {}
```

Substituir `SEU_USUARIO` pela subdomain real gerada pelo Wrangler.

---

### Fase 9 — Commit e push

```bash
git add wrangler.toml src/worker.ts smithery.yaml package.json
git commit -m "feat: add Cloudflare Workers deployment (HTTP endpoint)"
git push origin main
```

---

## Resultado Esperado

Ao final, o bcb-br-mcp deve:

| Funcionalidade | Status esperado |
|---|---|
| `npx bcb-br-mcp` (stdio) | ✅ Continua funcionando sem alterações |
| `GET /health` na URL Workers | ✅ Retorna `{ status: "ok" }` |
| `POST /mcp` na URL Workers | ✅ Processa tools/list e tools/call |
| URL pública disponível | ✅ `https://bcb-br-mcp.*.workers.dev` |
| Smithery.yaml atualizado | ✅ Apontando para URL HTTP real |

---

## Notas Finais para o Claude Code

- **Não quebrar o modo stdio** — o `npx bcb-br-mcp` deve continuar funcionando exatamente como antes
- **Reaproveitar o máximo de código** — não reescrever tools que já funcionam
- **Compatibilidade Workers** é a principal preocupação — verificar cada dependência que usa APIs Node.js nativas
- **Se uma dependência for incompatível** com Workers, buscar alternativa ou implementar a funcionalidade equivalente com APIs Web padrão (fetch, crypto, etc.)
- **Reportar a URL gerada** ao final do deploy para que o usuário possa cadastrar no Smithery
