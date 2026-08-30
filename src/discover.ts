/**
 * `server/discover` anuncia TODAS as revisões que o servidor atende, não só as
 * modernas.
 *
 * O ACHADO. O `mcpscore` reprovava
 * `protocol_version_supported_versions_include_negotiated`: o servidor negocia
 * 2025-11-25 pelo handshake `initialize` — é a revisão que o próprio auditor
 * negocia, e a que a maioria dos clientes fala hoje — mas o `server/discover`
 * anunciava só `["2026-07-28"]`. A mensagem do auditor é explícita sobre as duas
 * saídas: "add it to supportedVersions, or disable the legacy lifecycle".
 * Desligar o ciclo legado trocaria 1 ponto por uma regressão de compatibilidade
 * com quase todos os clientes; sobra anunciar a verdade.
 *
 * POR QUE O SDK NÃO FAZ ISSO. O `_ondiscover()` do
 * `@modelcontextprotocol/server` 2.x devolve
 * `modernProtocolVersions(this._supportedProtocolVersions)`, um filtro que
 * descarta por desenho toda revisão pré-2026 ("2025-era versions are negotiated
 * via `initialize`"). Não há opção que o desligue. É uma leitura mais estrita
 * que a do auditor, que se apoia em Basic §Versioning — onde o exemplo de
 * `UnsupportedProtocolVersionError` lista revisões legadas em `supported`.
 *
 * POR QUE PATCH DE MÉTODO, E NÃO TROCA DE HANDLER. Registrar um handler próprio
 * de `server/discover` não gruda: as entradas do SDK (o `createMcpHandler` do
 * Worker e o `serveStdio`) chamam `installModernOnlyHandlers` DEPOIS da nossa
 * factory, e ela reinstala `() => server._ondiscover()` por cima. Como o que ela
 * instala é uma closure que chama o MÉTODO, trocar o método vale para os dois
 * caminhos — o handler do construtor e o reinstalado — e sobrevive à
 * reinstalação. Trocar o handler valeria só num transporte.
 *
 * A GUARDA. Isto mexe em `_ondiscover`, que é interno do SDK. O risco de um
 * patch assim é virar silêncio: o SDK renomeia o método, o patch não aplica nada
 * e ninguém percebe. Por isso `announceServedVersions` FALHA ALTO se a forma
 * esperada não estiver lá — o servidor nem constrói — em vez de seguir com o
 * anúncio antigo. `discover.test.ts` prende o comportamento, e a catraca do
 * mcpscore no CI pega a regressão pelo lado de fora.
 *
 * Transplantado de ilo-mcp-server/src/discover.ts.
 */

import type { McpServer } from "@modelcontextprotocol/server";

/** A forma interna do SDK da qual este módulo depende — declarada, não suposta. */
interface ServidorComDiscover {
  _ondiscover(): { supportedVersions?: unknown };
  _supportedProtocolVersions?: unknown;
}

/**
 * Ordena revisões datadas da mais nova para a mais antiga. São strings
 * `AAAA-MM-DD`, então a ordem lexicográfica É a cronológica.
 */
export function maisNovaPrimeiro(versoes: readonly string[]): string[] {
  return [...new Set(versoes)].sort().reverse();
}

/**
 * Troca o `_ondiscover` da instância por um que anuncia todas as revisões
 * atendidas. Só a lista muda: capacidades e instruções continuam vindo do
 * cálculo do próprio SDK.
 */
export function announceServedVersions(server: McpServer): void {
  const low = server.server as unknown as ServidorComDiscover;

  if (typeof low._ondiscover !== "function") {
    throw new Error(
      "SDK mudou: Server._ondiscover sumiu — o anúncio de versões em src/discover.ts " +
        "deixaria de aplicar em silêncio. Reveja o módulo contra a versão nova do " +
        "@modelcontextprotocol/server antes de seguir."
    );
  }
  if (
    !Array.isArray(low._supportedProtocolVersions) ||
    low._supportedProtocolVersions.some(v => typeof v !== "string")
  ) {
    throw new Error(
      "SDK mudou: Server._supportedProtocolVersions não é mais uma lista de strings — " +
        "src/discover.ts não tem de onde tirar as revisões atendidas."
    );
  }

  const original = low._ondiscover.bind(low);
  low._ondiscover = () => {
    const base = original();
    // LER NA HORA DA CHAMADA, não aqui na aplicação do patch. O
    // `installModernOnlyHandlers` do SDK ACRESCENTA as revisões modernas a
    // `_supportedProtocolVersions` por REATRIBUIÇÃO, já com o servidor
    // construído: uma referência capturada agora ficaria presa ao array
    // anterior — o anúncio sairia com as revisões legadas e SEM a 2026-07-28, e
    // a regra do auditor passaria assim mesmo, porque ela só confere se a
    // negociada está na lista. Trocar uma omissão por outra não é corrigir.
    const agora = low._supportedProtocolVersions;
    if (!Array.isArray(agora) || agora.some(v => typeof v !== "string")) return base;
    // A lista vem do próprio SDK, nunca de literais nossas: anunciar uma revisão
    // que o servidor não atende seria a mentira simétrica da que este módulo
    // corrige.
    return { ...base, supportedVersions: maisNovaPrimeiro(agora as string[]) };
  };
}
