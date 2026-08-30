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
   * aqui: a landing dizia "8 ferramentas" (eram 15) e o `websiteUrl` apontava
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
