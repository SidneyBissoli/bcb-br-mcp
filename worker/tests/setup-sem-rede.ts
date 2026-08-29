/**
 * Nenhum teste do worker fala com a internet.
 *
 * POR QUE ISTO EXISTE (2026-08-28): o teste "registra tool_call em chamada
 * bem-sucedida" chamava `bcb_buscar_serie` com um comentário afirmando que a
 * tool era "servida do catálogo local". Não era: ela mistura o catálogo curado
 * com o índice do portal de dados abertos e buscava
 * https://dadosabertos.bcb.gov.br/api/3/action/package_list de verdade. Numa
 * máquina com rede boa passa em menos de um segundo; num runner em que o portal
 * demora, `fetchBcbApi` segura por até 30s × 3 tentativas e o timeout de 5s do
 * vitest estoura. Derrubou o CI do main no run 33137210221 — a única falha em
 * doze execuções, no commit do release.
 *
 * O QUE A GUARDA GARANTE: a suíte nunca mais fica pendurada num serviço de
 * terceiro. Sem rede, o fetch falha na hora e nada espera timeout.
 *
 * O QUE ELA NÃO GARANTE, e é preciso saber: várias tools daqui DEGRADAM de
 * propósito. Medido em 28/08/2026 com a guarda ativa, `bcb_buscar_serie`
 * responde com sucesso, sem erro nenhum, servindo o catálogo curado
 * (`"origem": "curado"`) — é o desenho, e é bom. Mas isso significa que um
 * teste que toque a rede por engano NÃO falha: ele passa exercitando o caminho
 * de degradação, achando que exercitou o normal. Foi também por isso que o CI
 * caiu por TIMEOUT e não por erro.
 *
 * Consequência prática: teste que queira exercitar o caminho NORMAL de uma tool
 * que busca dado precisa dublar o `fetch` com uma resposta válida — não basta
 * confiar nesta guarda.
 *
 * Um teste que PRECISE de rede — de integração, contrato de fonte — não cabe
 * aqui; ele vive no pacote pai, onde os arquivos `*.integration.test.ts` são
 * isso por contrato. Um teste que precise apenas de uma resposta específica
 * segue dublando o `fetch` com `vi.stubGlobal`, que sobrepõe esta guarda.
 */
globalThis.fetch = (() => {
  throw new Error(
    "Teste do worker tentou uma requisição REAL de rede. Duble o fetch com " +
      "vi.stubGlobal('fetch', ...) — a suíte do worker roda offline por contrato " +
      "(tests/setup-sem-rede.ts).",
  );
}) as unknown as typeof fetch;
