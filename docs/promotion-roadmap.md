# Roadmap de Divulgação — bcb-br-mcp

Objetivo: tornar o bcb-br-mcp o MCP server de referência para dados econômicos brasileiros, com visibilidade nacional e internacional.

---

## 1. Fundação

- [x] Código-fonte publicado no GitHub
- [x] Pacote publicado no npm (`bcb-br-mcp`)
- [x] README bilíngue (EN + PT-BR)
- [x] Badges de versão, downloads, licença
- [x] Deploy HTTP via Cloudflare Workers (`https://bcb.sidneybissoli.workers.dev`)
- [x] Changelog documentado (v1.0.0, v1.1.0, v1.2.0, v1.2.1)
- [x] MCP Prompts registrados (indicadores_atuais, panorama_economico, comparar_inflacao)
- [x] MCP Resources registrados (series/populares, series/categorias, series/principais)
- [x] Badge LobeHub adicionado aos READMEs

---

## 2. Registros e Diretórios

### Tier 1 — Essenciais

- [x] **Official MCP Registry** — registry.modelcontextprotocol.io (registrado via `mcp-publisher` CLI)
- [x] **Smithery** — smithery.ai (registrado via web com `smithery.yaml`)
- [x] **Glama** — glama.ai/mcp/servers (aprovado, listado e verificado)
  - [x] Claim: autoria reivindicada via autenticação GitHub ("author verified")
  - [x] Dockerfile: build configurado e release criado no Glama
- [x] **PulseMCP** — pulsemcp.com/servers (listado)
- [x] **MCP.so** — mcp.so (submetido, aguardando aprovação)

### Tier 2 — Listas curadas no GitHub (submeter via Pull Request)

- [x] **punkpeye/awesome-mcp-servers** — github.com/punkpeye/awesome-mcp-servers (PR #3465 aberto)
- [x] **appcypher/awesome-mcp-servers** — github.com/appcypher/awesome-mcp-servers (PR #641 aberto)
- [x] **wong2/awesome-mcp-servers** — mcpservers.org (submetido, aguardando aprovação)
- [x] **jaw9c/awesome-remote-mcp-servers** — github.com/jaw9c/awesome-remote-mcp-servers (PR #156 aberto)

### Tier 3 — Diretórios adicionais

- [x] OpenTools Registry — opentools.com/registry (na waitlist)
- [ ] MCP Index — mcpindex.net
- [ ] MCP Server Finder — mcpserverfinder.com
- [x] LobeHub MCP — lobehub.com/mcp (badge adicionado, reivindicado, prompts e resources adicionados para score)

---

## 3. SEO — GitHub e npm

### GitHub — Otimização do repositório

- [x] Atualizar descrição do repositório (About — max 120 caracteres)
- [x] Configurar Topics (20 topics adicionados)

- [ ] Manter commits e releases frequentes (sinal de manutenção ativa)
- [ ] Responder issues rapidamente
- [ ] Incentivar stars (correlação 0.925 com popularidade real)

### npm — Otimização do package.json

- [x] Atualizar `keywords` no `package.json`:
  ```json
  "keywords": [
    "mcp", "mcp-server", "model-context-protocol",
    "bcb", "banco-central", "central-bank", "brazil", "brazilian",
    "selic", "ipca", "exchange-rate", "inflation",
    "financial-data", "economic-data", "gdp",
    "ai-tools", "claude", "cursor",
    "series-temporais", "time-series", "cambio"
  ]
  ```

> O ranking do npm (via Algolia) considera: relevância textual, downloads nos últimos 30 dias, qualidade (README, testes) e manutenção (frequência de releases).

---

## 4. Comunidades e Fóruns

### Comunidades MCP (internacional)

- [ ] **MCP Discord (oficial)** — Apresentar o servidor no canal apropriado (11.600+ membros)
- [ ] **r/mcp** (Reddit) — Post de anúncio com demonstração
- [ ] **r/ClaudeAI** (Reddit) — Post mostrando uso prático com Claude
- [ ] **r/programming** (Reddit) — Post técnico sobre dados econômicos via IA
- [ ] **Cursor Community Forum** (forum.cursor.com) — Post sobre integração com Cursor

### Comunidades Brasil

- [ ] **TabNews** (tabnews.com.br) — Artigo técnico em português sobre o projeto
- [ ] **Dev.to #brazil** (dev.to/t/brazil) — Tutorial bilíngue (PT/EN)
- [ ] **awesome-made-by-brazilians** (GitHub) — Requer 100+ stars (atual: 1)
- [ ] **BrasilAPI** (GitHub / comunidade) — Cross-promotion (afinidade: APIs públicas brasileiras)

---

## 5. Conteúdo e Artigos

### Artigos a produzir

- [ ] "Acessando dados do Banco Central com IA: como usar o bcb-br-mcp" — TabNews (PT) — Devs brasileiros
- [ ] "How to query Brazilian economic data with AI using MCP" — Dev.to (EN) — Devs internacionais
- [ ] "Building an MCP server for financial data: lessons learned" — Dev.to / Medium (EN) — Devs MCP
- [ ] "Selic, IPCA e dólar na ponta dos dedos: dados do BCB direto no Claude" — LinkedIn (PT) — Profissionais de finanças
- [ ] "Show HN: MCP server for Brazilian Central Bank economic data" — Hacker News (EN) — Comunidade tech geral

### Vídeo / Demo

- [ ] Gravar um vídeo curto (2-3 min) mostrando o servidor em ação com Claude
- [ ] Publicar no YouTube com título em inglês e descrição bilíngue
- [ ] Usar como material de apoio nos posts de comunidade

---

## 6. Newsletters e Mídia Especializada

- [ ] **PulseMCP Weekly Pulse** (pulsemcp.com/newsletter) — Contatar para possível feature (a principal newsletter MCP)
- [ ] **Official MCP Blog** (blog.modelcontextprotocol.io) — Sugerir como case de uso (dados governamentais abertos)
- [ ] **Latent Space Podcast** (latent.space) — Pitch como exemplo de MCP para dados econômicos

---

## 7. Redes Sociais

### X/Twitter

- [ ] Thread de lançamento explicando o que é, como funciona, e como usar
- [ ] Tags: #MCP #ModelContextProtocol #AI #Claude #FinTech #Brazil #BCB
- [ ] Marcar @AnthropicAI e @claudeai
- [ ] Postar em inglês (alcance internacional)

### LinkedIn

- [ ] Artigo técnico direcionado a profissionais de finanças e dados
- [ ] Destacar o valor para analistas econômicos e pesquisadores
- [ ] Postar em português (público brasileiro) e inglês (alcance global)

---

## 8. Parcerias e Cross-promotion

- [ ] **BrasilAPI** — Projeto open source, afinidade com APIs públicas brasileiras
- [ ] **python-bcb** — Biblioteca Python, mesmo domínio (dados BCB), público complementar
- [ ] **sidra-mcp** (se existir) — Dados IBGE + dados BCB = combo completo
- [ ] **Comunidades R/Python de finanças** — Pesquisadores que usam dados do BCB

---

## 9. Cronograma

### Semana 1-2 (Imediato)

- [x] Otimizar descrição e topics do GitHub
- [x] Atualizar keywords do package.json e publicar nova versão npm (v1.2.1)
- [x] Submeter para Glama, PulseMCP, MCP.so
- [x] Abrir PRs nas listas awesome-mcp-servers (punkpeye PR #3465, appcypher PR #641)
- [x] Submeter em mcpservers.org (submetido) e awesome-remote-mcp-servers (PR #156)
- [ ] Submeter em awesome-made-by-brazilians (requer 100+ stars)
- [ ] Post no MCP Discord

### Semana 3-4

- [ ] Escrever artigo no TabNews (PT)
- [ ] Escrever tutorial no Dev.to (EN)
- [ ] Post no r/mcp e r/ClaudeAI
- [ ] Thread no X/Twitter
- [ ] "Show HN" no Hacker News
- [ ] Submeter nos diretórios Tier 3

### Mês 2

- [ ] Artigo no LinkedIn (PT + EN)
- [ ] Gravar vídeo demo
- [ ] Contatar PulseMCP newsletter
- [ ] Post no Dev.to sobre lições aprendidas
- [ ] Engajar com BrasilAPI para cross-promotion

### Contínuo

- [ ] Manter releases frequentes
- [ ] Responder issues em < 24h
- [ ] Monitorar quais canais geram mais tráfego
- [ ] Participar ativamente nas comunidades MCP (Discord, Reddit)
- [ ] Atualizar o README com novos badges e métricas conforme crescerem

---

## 10. Métricas de Sucesso

| Métrica | Onde medir | Meta 3 meses | Meta 6 meses |
|---|---|---|---|
| GitHub stars | GitHub | 50+ | 200+ |
| npm downloads/mês | npmjs.com | 500+ | 2.000+ |
| Smithery installs | Smithery dashboard | 100+ | 500+ |
| Registros em diretórios | Manual | 10+ | 15+ |
| Artigos publicados | Manual | 3+ | 6+ |
| Menções em newsletters | Manual | 1+ | 3+ |
