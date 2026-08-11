/**
 * Identidade e tunáveis do Worker bcb-br-mcp — instância do template de hosting
 * da Fase 0 (mcp-br-commons/templates/cloudflare-worker). Os demais módulos leem daqui.
 *
 * A versão vem do package.json do pacote pai, a única fonte de verdade de versão
 * do repo (o bundler do wrangler inlina o JSON no build).
 */

import pkg from "../../package.json";

export const SERVER_CONFIG = {
  /** Nome curto do servidor (handshake MCP, /status, landing). */
  name: "bcb-br-mcp",
  /** Versão do servidor — única fonte: package.json do pacote pai. */
  version: pkg.version,
  /** Título de exibição (landing page). */
  title: "bcb-br-mcp — séries temporais do Banco Central via MCP",
  /** Uma frase: o que o servidor serve e de qual fonte. */
  description:
    "Servidor MCP com 8 ferramentas sobre o SGS/BCB — Selic, IPCA, câmbio, PIB e " +
    "150+ indicadores econômicos e financeiros, com valores exatos e fonte citada.",
  /**
   * Contato exibido na landing page. A URL raiz do Worker é o que sysadmins upstream
   * veem — precisa resolver para identificação humana + contato.
   */
  contactEmail: "sbissoli76@gmail.com",
  /** Repositório público (serverInfo.websiteUrl + landing). */
  websiteUrl: "https://github.com/SidneyBissoli/bcb-br-mcp",
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
