/**
 * Identidade e tunáveis do Worker bcb-br-mcp — instância do template de hosting
 * da Fase 0 (mcp-br-commons/templates/cloudflare-worker). Os demais módulos leem daqui.
 *
 * A versão vem do package.json do pacote pai, a única fonte de verdade de versão
 * do repo (o bundler do wrangler inlina o JSON no build).
 */

import { SERVER_IDENTITY } from "../../dist/identity.js";
import pkg from "../../package.json";

export const SERVER_CONFIG = {
  /**
   * Nome, título, descrição, site e ícone vêm do PACOTE (src/identity.ts), que é
   * o que o handshake MCP anuncia nos dois transportes. Antes estavam escritos
   * aqui: a landing anunciava uma contagem velha (8, quando já eram 15) e o `websiteUrl` apontava
   * para o repositório enquanto o server.json publicava a landing. Nada disso
   * dava erro — só divergia.
   */
  ...SERVER_IDENTITY,
  /** Versão do servidor — única fonte: package.json do pacote pai. */
  version: pkg.version,
  /**
   * Contato exibido na landing page. A URL raiz do Worker é o que sysadmins upstream
   * veem — precisa resolver para identificação humana + contato.
   */
  contactEmail: "sbissoli76@gmail.com",
  /**
   * Chave do IndexNow. É PÚBLICA por desenho: ela prova posse do domínio por
   * estar servida em `/<chave>.txt`, então versionar aqui não é vazamento.
   */
  indexNowKey: "b13771057a6b0e29bc3351359a2bc43f",
  /** Rota do endpoint MCP (Streamable HTTP). */
  mcpRoute: "/mcp",
  /**
   * Hostnames aceitos no header Host. A lista SUBSTITUI os defaults do
   * createMcpHandler (localhost e *.workers.dev) — por isso inclui também o
   * hostname workers.dev e os de dev local, além do domínio próprio.
   *
   * `bcb.sidneybissoli.workers.dev` é o hostname HISTÓRICO (o worker sempre se
   * chamou "bcb"); ele permanece válido para não quebrar quem já aponta para lá.
   */
  extraAllowedHostnames: [
    "bcb.sidneybissoli.com",
    "bcb.sidneybissoli.workers.dev",
    "localhost",
    "127.0.0.1"
  ] as string[]
} as const;

/**
 * Rate limit de entrada por cliente (IP), aplicado às rotas não-públicas.
 * Token bucket em memória por isolate: proteção contra abuso acidental/burst, não um
 * limite global exato (recicla com o isolate; instâncias em POPs distintos não somam).
 * Para limite global rígido, mover a contagem para um Durable Object.
 */
export const RATE_LIMIT = {
  /** Burst máximo por cliente. */
  clientBurst: 20,
  /** Reposição de tokens por segundo por cliente. */
  clientRefillPerSec: 5,
  /** Teto de buckets rastreados por isolate (evicção FIFO ao estourar). */
  maxClientBuckets: 1000
} as const;

/**
 * Texto da LANDING PAGE — a única superfície própria do produto, e por isso a
 * única que responde por ele numa busca. Até 2026-08-31 a página tinha oito
 * linhas de corpo, sem `meta description`, sem og:, sem dado estruturado e sem
 * link para o repositório: não havia o que indexar.
 *
 * `lang` segue o PÚBLICO do produto, não a língua do código. O bloco
 * `emOutroIdioma` não é rodapé de cortesia: é seção com resumo e exemplos
 * próprios, porque é texto indexável.
 */
export const LANDING = {
  lang: "pt-BR" as "pt-BR" | "en",
  resumo:
    "Servidor MCP com 17 ferramentas do Banco Central do Brasil: séries temporais do " +
    "SGS, expectativas de mercado da Focus e câmbio PTAX, com fonte citada.",
  exemplos: [
    "“Qual a taxa Selic atual?”",
    "“Mostre o IPCA mês a mês em 2024.”",
    "“O que o mercado espera do IPCA em 2027?”",
    "“Qual foi a PTAX de fechamento do euro na sexta?”",
  ] as readonly string[],
  destaques: [
    "Catálogo curado de 135 séries verificadas contra a origem, mais o índice do Portal de Dados Abertos.",
    "Janela diária de 15 anos simplesmente funciona: a API do BCB recusa mais de 10, e a consulta é fatiada e fundida sozinha.",
    "Variação por encadeamento nas séries que já são variação (IPCA, IGP-M, INPC) — e a resposta diz qual método usou.",
    "Licença ODbL declarada em toda resposta, com o aviso do próprio BCB repassado verbatim no câmbio.",
  ] as readonly string[],
  repoUrl: "https://github.com/SidneyBissoli/bcb-br-mcp",
  npmUrl: "https://www.npmjs.com/package/bcb-br-mcp",
  docsUrl:
    "https://github.com/SidneyBissoli/bcb-br-mcp/blob/main/docs/artigo-sgs-series-do-banco-central.pt-BR.md",
  emOutroIdioma: {
    lang: "en" as "pt-BR" | "en",
    resumo:
      "Brazilian Central Bank data for your AI assistant: SGS time series, the Focus " +
      "market-expectations survey and official PTAX exchange rates, each figure with " +
      "its source and licence.",
    exemplos: [
      "“What is Brazil’s current Selic rate?”",
      "“What does the market expect for Brazilian inflation in 2027?”",
    ] as readonly string[],
  },
} as const;
