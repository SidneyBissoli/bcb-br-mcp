#!/usr/bin/env node
/**
 * Smoke test end-to-end contra os DOIS transportes.
 *
 * Uso:
 *   node scripts/smoke-mcp.mjs                 # worker hospedado (produção)
 *   node scripts/smoke-mcp.mjs --url <url>     # outro endpoint (ex.: wrangler dev)
 *   node scripts/smoke-mcp.mjs --stdio         # dist/index.js local (exige npm run build)
 *   node scripts/smoke-mcp.mjs --sonda         # só pergunta às fontes do BCB se estão servindo (sai 0/2)
 *
 * Verifica: handshake, superfície completa (a contagem de tools vem do baseline
 * de superfície mais recente — não é literal —, 3 resources, 3 prompts), a
 * busca com índice do portal, uma tool que vai ao SGS, as cinco tools de D3
 * (Focus e PTAX) contra a origem, o contrato Deep Research do ChatGPT
 * (search → fetch), leitura de resource, e a validação de entrada (argumento
 * obrigatório ausente tem de ser barrado ANTES de chamar o BCB — regressão
 * fechada na fundação).
 *
 * As asserções das tools de D3 pinam o que o mini-spike verificou contra a
 * origem, e não só "respondeu 200": nome de recurso por horizonte, os campos em
 * caixa baixa do Top 5 da Selic, a quebra por horizonte das referências e o
 * formato MM-DD-YYYY das datas da PTAX.
 *
 * FONTE FORA NÃO É DEPLOY QUEBRADO. A decisão é do `criarSmoke` do
 * @sbissoli/mcp-live-source (ver o comentário longo antes das sondas): tool
 * com `isError` inesperado → sonda direta na fonte que ela consulta → fonte
 * fora = AVISO (`::warning title=Fonte indisponível`, saída 0); fonte servindo
 * = FALHA com o texto da tool (saída 1). Verificação que lança (asserção, HTTP,
 * JSON-RPC) é defeito do deploy e sai vermelha sem sondar.
 */

import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { criarSmoke } from "@sbissoli/mcp-live-source";

/**
 * O smoke fala pela ROTA DE USO PRÓPRIO, e isso não é detalhe de estilo.
 *
 * Ele exercita caminhos de erro para afirmar que a ferramenta recusa o que tem
 * de recusar. Pela rota pública essas recusas entram na telemetria
 * indistinguíveis de gente batendo numa porta emperrada — e entravam: medido em
 * 11/09/2026, os DOIS primeiros itens da fila de urgências do painel eram o
 * smoke dos servidores. No `ilo_get_data`, 30 dos 36 erros da janela vinham das
 * redes da Azure, que são os runners do GitHub Actions, e os outros 6 da máquina
 * do dono: nenhum de terceiro.
 *
 * O desconto de varredura do monitor não pega isto. Ele procura rajada de
 * catálogo e assinatura de sessão repetida, e um smoke é uma sessão pequena e
 * arrumada; pior, a repetição depende da CADÊNCIA DE DEPLOY, então ele era
 * detectado nas semanas movimentadas e passava batido nas calmas. Detecção que
 * depende de quantas vezes publicamos não é critério. Quem sabe que este
 * tráfego é nosso é este arquivo, então é ele que se identifica.
 *
 * A cobertura da rota pública não se perde: `confereRotaPublica()` abre um
 * handshake contra ela antes do roteiro. `initialize` é método de protocolo e o
 * painel os exclui, então sai de graça na telemetria.
 */
const BASE_URL = "https://bcb.sidneybissoli.com";
const ROTA_MCP = process.env.SMOKE_MCP_ROUTE ?? "/mcp/uso-proprio";
const DEFAULT_URL = `${BASE_URL}${ROTA_MCP}`;

const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
const useStdio = args.includes("--stdio");
const endpoint = urlIndex >= 0 ? args[urlIndex + 1] : DEFAULT_URL;

/**
 * Indisponibilidade do BCB não é falha DESTE servidor — o smoke existe para
 * verificar o nosso lado. Mas a frase da tool não basta para dizer isso, e foi
 * medido em 22/10/2026: com o SGS em 502 (`curl` direto, 5 s), o deploy do #75
 * reprovou DUAS vezes em testes diferentes a cada rodada — `bcb_serie_metadados`,
 * `bcb_variacao`, `bcb_serie_ultimos`, `bcb_deflacionar` —, todos `isError` com
 * textos que a regex de "upstream fora" deste script não cobria: o pedido
 * pequeno que não traz dado vira "A API do BCB não trouxe dado em 2 tentativas
 * ... ou a origem está indisponível" (classe `nao_encontrado`, porque
 * inexistência e queda terminam igual, ver `traduzirErroDaOrigem` em
 * src/shared.ts), e a deflação sem observações vira "O índice de preços não
 * devolveu observações". Dez minutos depois, com a origem em 200, a terceira
 * reexecução passou sem mudar nada. A classe do erro não viaja no fio (é
 * chave-símbolo não enumerável, só a telemetria a lê), então o smoke não pode
 * decidir por ela — e por frase também não.
 *
 * O #76 (22/10/2026) trouxe o instrumento honesto: SONDAR a fonte diretamente,
 * fora do servidor, no instante em que a tool falhou. Esse molde virou o
 * `criarSmoke` do @sbissoli/mcp-live-source, e a decisão agora é do pacote,
 * pelo `kind` do erro da sonda (`entregaDaOrigem` do @sbissoli/mcp-upstream),
 * nunca por frase: tool com `isError` inesperado → sonda a(s) fonte(s) que a
 * verificação NOMEIA → fonte fora (timeout, rede, 429, 5xx, corpo que `aceita`
 * recusa) = AVISO, saída 0; fonte servindo = FALHA, e o texto da tool vai para
 * o log. Verificação que lança (asserção sobre o resultado) é defeito do deploy
 * e sai vermelha sem sondar. O disjuntor não vale: toda tool falhando com a
 * fonte fora é verde com aviso, nunca código 3.
 *
 * As sondas são UMA por API que as tools consultam, cada uma um GET mínimo a
 * recurso que EXISTE, com corpo pequeno (medidas em 22/10/2026: 200 e a forma
 * esperada, 0,2–0,3 s cada). São quatro porque o BCB cai por partes: na sessão
 * de D3 os três hosts caíram juntos por 40 min, mas em 14/10/2026 só o
 * `package_search` do portal respondia HTML com 200 enquanto o SGS servia.
 * `SMOKE_SONDA_<NOME>` aponta uma sonda para outro lugar — para provar o
 * caminho de aviso (`--sonda` dizendo FORA) sem esperar o BCB cair.
 */
const ehJson = f => corpo => {
  try {
    return f(JSON.parse(corpo));
  } catch {
    return false;
  }
};
const smoke = criarSmoke({
  sondas: [
    {
      // Um ponto da 433 (IPCA), que existe desde 1980: o que todo módulo do SGS lê.
      nome: "sgs",
      url: process.env.SMOKE_SONDA_SGS ?? process.env.SMOKE_SONDA_URL ??
        "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/1?formato=json",
      aceita: ehJson(j => Array.isArray(j) && j.length > 0)
    },
    {
      // Olinda/Expectativas: uma linha do recurso anual (o que `bcb_focus_*` consulta).
      nome: "focus",
      url: process.env.SMOKE_SONDA_FOCUS ??
        "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=1&$format=json",
      aceita: ehJson(j => Array.isArray(j?.value) && j.value.length > 0)
    },
    {
      // Olinda/PTAX: outro serviço OData, com outro backend — uma moeda.
      nome: "ptax",
      url: process.env.SMOKE_SONDA_PTAX ??
        "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/Moedas?$top=1&$format=json",
      aceita: ehJson(j => Array.isArray(j?.value) && j.value.length > 0)
    },
    {
      // Portal de dados abertos (CKAN): o índice da busca e do `search` vem do `package_list`.
      nome: "portal",
      url: process.env.SMOKE_SONDA_PORTAL ?? "https://dadosabertos.bcb.gov.br/api/3/action/package_list?limit=1",
      aceita: ehJson(j => j?.success === true && Array.isArray(j?.result))
    }
  ]
});

// Sair no mesmo tick em que o socket do fetch fecha derruba o Node 24 no
// Windows ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)", rc 127
// em vez do código pedido). Um respiro resolve; medido em 22/10/2026.
let child = null; // o processo do modo STDIO, quando houver
async function sair(codigo) {
  if (child) child.kill();
  await new Promise(r => setTimeout(r, 200));
  process.exit(codigo);
}

// `--sonda`: só as sondas, sem roteiro — para provar o caminho de aviso sem
// esperar a origem cair e para responder "o BCB está de pé?" na hora de ler
// um deploy vermelho.
if (args.includes("--sonda")) {
  const estados = await smoke.sondar();
  await sair(estados.every(e => e.veredito === "servindo") ? 0 : 2);
}

/** Asserção do roteiro: lança, e o `verificar` registra como defeito do deploy. */
function exigir(condicao, msg) {
  if (!condicao) throw new Error(msg);
}

/** Verificação de que o resto depende: se falhou, conclui e sai agora. */
async function ouPara(resultado) {
  if (resultado !== undefined) return resultado;
  const resumo = smoke.concluir();
  await sair(resumo.codigoDeSaida);
}

/**
 * Check do NOSSO lado: condição falsa é defeito do deploy, vermelho sem sondar.
 * O rótulo entra sem a indentação ("→ ..."), porque é ele que vai à anotação.
 */
async function check(label, ok, detail = "") {
  await smoke.verificar(
    label.trim(),
    async () => {
      exigir(ok, detail || "a condição do check é falsa");
      return true;
    },
    { detalhe: () => detail }
  );
}

/**
 * Tool que foi à origem: `isError` inesperado → o pacote sonda a(s) fonte(s)
 * nomeada(s) em `sondas` e decide (fora = aviso; servindo = falha com o texto).
 */
async function checkUpstream(label, result, detail = "", sondas) {
  return smoke.verificar(label.trim(), async () => result, { sondas, detalhe: () => detail });
}

/**
 * A busca não vira `isError` quando o portal de dados abertos cai: ela degrada
 * para o catálogo curado, e o sinal é estrutural — `catalogo` sem `obtidoEm`
 * (não há índice obtido). Nesse caso as checagens do índice viram AVISO
 * (veredito `indisponivel`, registrado direto no relatório porque quem mediu
 * foi este sinal, não uma sonda), e o que é do NOSSO lado continua sendo
 * checado: a degradação tem de ser dita em `avisos`, e a cobertura não pode
 * afirmar inexistência. Medido em 14/10/2026: `package_search` respondia 200
 * com HTML e o deploy saía vermelho sem defeito.
 */
async function indiceDoPortalFora(label, out) {
  const fora = !!out?.catalogo && !out.catalogo.obtidoEm;
  if (fora) {
    const nome = label.trim();
    smoke.relatorio.registrarVeredito(
      nome,
      {
        veredito: "indisponivel",
        motivo: "índice do portal de dados abertos indisponível agora; a busca degradou para o catálogo curado (`catalogo` sem `obtidoEm`)",
        kind: undefined,
        status: undefined,
        url: undefined
      },
      0
    );
    console.log(`  [AVISO] ${nome} — índice do portal de dados abertos indisponível agora; busca degradou para o catálogo curado`);
    await check(
      "  → a degradação é declarada em avisos",
      (out?.avisos ?? []).some(a => a.includes("Índice do portal indisponível")),
      (out?.avisos ?? []).join(" | ").slice(0, 120)
    );
  }
  return fora;
}

// ==================== transports ====================

function stdioClient() {
  child = spawn(process.execPath, ["dist/index.js"], { stdio: ["pipe", "pipe", "inherit"] });
  let buffer = "";
  const pending = new Map();

  child.stdout.on("data", chunk => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const resolve = pending.get(msg.id);
        if (resolve) {
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch {
        /* linha não-JSON */
      }
    }
  });

  let id = 1;
  // Teto de uma chamada no transporte STDIO. No canal hospedado quem corta é o
  // Worker (10 s) e a tool volta `isError` dizendo que a origem não respondeu;
  // aqui não há Worker, o servidor repete por dentro e uma janela longa do SGS
  // lento passa dos 30 s (medido em 22/10/2026 em `bcb_deflacionar` desde 2000).
  // Por isso o estouro de `tools/call` NÃO lança: vira o mesmo `isError` que o
  // Worker produziria, e o `verificar` SONDA a fonte antes de rotular — fonte
  // fora = aviso, fonte servindo = falha. Antes saía `Falha alheia à origem`
  // sem ninguém olhar a origem. Método de protocolo que estoura continua
  // lançando: aí é o servidor que não responde.
  const TIMEOUT_STDIO_MS = 30000;
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: msgId, method, params })}\n`);
      setTimeout(() => {
        if (!pending.delete(msgId)) return;
        if (method !== "tools/call") return reject(new Error(`timeout em ${method}`));
        resolve({
          jsonrpc: "2.0",
          id: msgId,
          result: {
            isError: true,
            content: [{ type: "text", text: `a tool ${params?.name ?? "?"} não respondeu em ${TIMEOUT_STDIO_MS / 1000} s (teto do transporte STDIO do smoke)` }],
          },
        });
      }, TIMEOUT_STDIO_MS);
    });

  const notify = method => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  return { rpc, notify, close: () => child.kill() };
}

function httpClient(url) {
  let id = 1;
  let sessionId;

  const rpc = async (method, params) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {})
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params })
    });
    const header = res.headers.get("mcp-session-id");
    if (header) sessionId = header;

    const text = await res.text();
    if (text.includes("\ndata:") || text.startsWith("event:")) {
      const line = text
        .split("\n")
        .filter(l => l.startsWith("data:"))
        .pop();
      return JSON.parse(line.slice(5).trim());
    }
    return JSON.parse(text);
  };

  const notify = async method => {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {})
      },
      body: JSON.stringify({ jsonrpc: "2.0", method })
    });
  };

  return { rpc, notify, close: () => {} };
}

// ==================== smoke ====================

/** Handshake contra a rota PÚBLICA, para uma quebra só nela não passar batida. */
async function confereRotaPublica() {
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke-rota-publica", version: "0.0.0" }
      }
    })
  });
  const texto = await res.text();
  exigir(res.ok, `rota pública /mcp: HTTP ${res.status} ${texto.slice(0, 200)}`);
  const linha = texto.includes("data:")
    ? texto.split("\n").find(l => l.startsWith("data:"))?.slice(5).trim()
    : texto;
  const nome = JSON.parse(linha)?.result?.serverInfo?.name;
  exigir(nome, `rota pública /mcp sem serverInfo (${texto.slice(0, 200)})`);
  return nome;
}

/**
 * CONTRATO DE SESSÃO (desde 2026-09-17). O Worker emite `Mcp-Session-Id` no
 * initialize para a telemetria ligar as mensagens de um aperto de mão; o
 * handler é stateless e IGNORA o cabeçalho que o cliente devolve. Este teste
 * existe porque isso depende do modo stateless do SDK e do `agents`: um
 * upgrade que passasse a validar sessão quebraria todo cliente que devolve o
 * id — e quebraria aqui, no deploy, antes de virar incidente. O DELETE é 405
 * nos sete servidores (servidor sem sessão não encerra sessão).
 */
async function contratoDeSessao(endpoint) {
  const cab = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  const init = await fetch(endpoint, {
    method: "POST", headers: cab,
    body: JSON.stringify({ jsonrpc: "2.0", id: 91, method: "initialize", params: {
      protocolVersion: "2025-06-18", capabilities: {},
      clientInfo: { name: "smoke-contrato-sessao", version: "0.0.0" } } })
  });
  await init.text();
  const sid = init.headers.get("mcp-session-id") ?? "";
  exigir(/^[A-Za-z0-9._~-]{1,64}$/.test(sid), `initialize sem Mcp-Session-Id legível (${JSON.stringify(sid)})`);
  const lista = await fetch(endpoint, {
    method: "POST", headers: { ...cab, "mcp-session-id": "contrato-inexistente-" + Date.now() },
    body: JSON.stringify({ jsonrpc: "2.0", id: 92, method: "tools/list", params: {} })
  });
  await lista.text();
  exigir(lista.status === 200, `tools/list com id desconhecido respondeu HTTP ${lista.status} (o handler stateless tem de ignorar o cabeçalho)`);
  const del = await fetch(endpoint, { method: "DELETE", headers: { "mcp-session-id": sid } });
  await del.text();
  exigir(del.status === 405, `DELETE respondeu HTTP ${del.status}, esperado 405 (servidor sem sessão)`);
  return "id emitido no initialize, id desconhecido ignorado, DELETE 405";
}

if (!useStdio && urlIndex < 0 && ROTA_MCP !== "/mcp") {
  await ouPara(await smoke.verificar("rota pública /mcp", confereRotaPublica, { detalhe: nome => nome }));
}
if (!useStdio) await ouPara(await smoke.verificar("contrato de sessão", () => contratoDeSessao(endpoint), { detalhe: d => d }));

const client = useStdio ? stdioClient() : httpClient(endpoint);
console.log(`\nSmoke: ${useStdio ? "STDIO (dist/index.js)" : endpoint}\n`);

try {
  const init = await client.rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-mcp", version: "1.0.0" }
  });
  await ouPara(
    await smoke.verificar(
      "initialize",
      async () => {
        exigir(init.result?.serverInfo, `handshake sem serverInfo: ${JSON.stringify(init).slice(0, 200)}`);
        return init;
      },
      { detalhe: i => `${i.result.serverInfo.name} ${i.result.serverInfo.version}` }
    )
  );
  await client.notify("notifications/initialized");

  // A contagem esperada NÃO é um literal: vem do baseline de superfície mais
  // recente com versão no nome (baselines/surface-stdio-<versão>.json). Mudou
  // a superfície sem recapturar o baseline → o smoke fica vermelho, que é o
  // combinado; um número pinado aqui é o que envelhece sem ninguém notar.
  const versaoDe = nome => nome.match(/(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
  const baselineMaisRecente = readdirSync("baselines")
    .filter(f => /^surface-stdio-\d+\.\d+\.\d+\.json$/.test(f))
    .sort((a, b) => {
      const [va, vb] = [versaoDe(a), versaoDe(b)];
      return va[0] - vb[0] || va[1] - vb[1] || va[2] - vb[2];
    })
    .at(-1);
  if (!baselineMaisRecente) throw new Error("nenhum baselines/surface-stdio-<versão>.json para derivar a contagem");
  const toolsEsperadas = JSON.parse(readFileSync(`baselines/${baselineMaisRecente}`, "utf8")).toolCount;

  const tools = (await client.rpc("tools/list")).result?.tools ?? [];
  await check(`tools/list = ${toolsEsperadas} (baseline ${baselineMaisRecente})`, tools.length === toolsEsperadas, `${tools.length} tools`);
  // `search` e `fetch` são as únicas sem prefixo: nomes fixados pela OpenAI (contrato Deep Research).
  const DEEP_RESEARCH_TOOLS = ["search", "fetch"];
  await check(
    "todas com prefixo bcb_ (salvo as duas do contrato Deep Research), title e outputSchema",
    tools.every(t => (t.name.startsWith("bcb_") || DEEP_RESEARCH_TOOLS.includes(t.name)) && t.annotations?.title && t.outputSchema)
  );
  await check("as 2 tools do contrato Deep Research estão publicadas", DEEP_RESEARCH_TOOLS.every(n => tools.some(t => t.name === n)));
  const nomes = tools.map(t => t.name);
  const novas = [
    "bcb_focus_expectativas",
    "bcb_focus_selic",
    "bcb_focus_referencias",
    "bcb_cambio_cotacao",
    "bcb_cambio_moedas"
  ];
  await check("as 5 tools de Focus e câmbio estão publicadas", novas.every(n => nomes.includes(n)));
  await check(
    "as 2 tools da segunda metade do D2 estão publicadas",
    ["bcb_correlacao", "bcb_deflacionar"].every(n => nomes.includes(n))
  );

  const resources = (await client.rpc("resources/list")).result?.resources ?? [];
  await check("resources/list = 3", resources.length === 3, resources.map(r => r.name).join(", "));

  const prompts = (await client.rpc("prompts/list")).result?.prompts ?? [];
  await check("prompts/list = 3", prompts.length === 3, prompts.map(p => p.name).join(", "));

  const call = (name, args) => client.rpc("tools/call", { name, arguments: args });

  // Busca: curadoria em destaque + índice do portal, e nunca afirmar inexistência.
  const busca = await client.rpc("tools/call", { name: "bcb_buscar_serie", arguments: { termo: "selic" } });
  const buscaOut = busca.result?.structuredContent;
  await smoke.verificar(
    "bcb_buscar_serie devolve structuredContent",
    async () => {
      if (busca.result?.isError) return busca.result;
      exigir(buscaOut?.totalEncontradas > 0, `totalEncontradas = ${buscaOut?.totalEncontradas}`);
      return busca.result;
    },
    { sondas: ["portal"], detalhe: () => `${buscaOut?.totalEncontradas} séries` }
  );
  if (await indiceDoPortalFora("  → declara a cobertura do índice do portal", buscaOut)) {
    await check(
      "  → declara a cobertura do catálogo curado em vez de afirmar inexistência",
      (buscaOut?.catalogo?.cobertura ?? "").includes("não significa que a série não"),
      `${buscaOut?.catalogo?.seriesIndexadas ?? 0} séries curadas`
    );
  } else {
    await check(
      "  → declara a cobertura do índice em vez de afirmar inexistência",
      (buscaOut?.catalogo?.cobertura ?? "").includes("NÃO é o SGS inteiro"),
      `${buscaOut?.catalogo?.seriesIndexadas ?? 0} séries indexadas`
    );
  }

  await check(
    "  → o achado curado declara a procedência do nome",
    (buscaOut?.series ?? []).filter(s => s.origem === "curado").every(s => s.fonteNome === "portal" || s.fonteNome === "medido")
  );

  // ---------- catálogo curado, contra a origem ----------
  //
  // A verificação de 13/08/2026 achou ~metade dos nomes conferíveis trocados
  // (`bcb/docs/06`). Estes checks pedem à origem o dado que arbitrou os casos
  // mais caros — não basta o catálogo concordar consigo mesmo.

  const meta432 = await call("bcb_serie_metadados", { codigo: 432 });
  const meta1178 = await call("bcb_serie_metadados", { codigo: 1178 });
  await checkUpstream("bcb_serie_metadados 432 = meta do Copom", meta432.result,
    `${meta432.result?.structuredContent?.nome}`, ["sgs"]);
  await checkUpstream("bcb_serie_metadados 1178 = Selic efetiva", meta1178.result,
    `${meta1178.result?.structuredContent?.nome}`, ["sgs"]);
  if (!meta432.result?.isError && !meta1178.result?.isError) {
    const n432 = meta432.result.structuredContent.nome;
    const n1178 = meta1178.result.structuredContent.nome;
    await check("  → 432 é a META e 1178 é a efetiva (estavam trocadas)",
      /Meta Selic/i.test(n432) && /anualizada base 252/i.test(n1178));
    // O dado arbitra: a meta é constante entre reuniões do Copom, a efetiva não.
    const v432 = meta432.result.structuredContent.ultimoValor?.valor;
    const v1178 = meta1178.result.structuredContent.ultimoValor?.valor;
    await check("  → e o dado separa as duas: a meta é redonda, a efetiva não",
      typeof v432 === "number" && typeof v1178 === "number" && v432 !== v1178,
      `meta ${v432} × efetiva ${v1178}`);
  }

  // Código que a origem NÃO reconhece. Ela responde de duas formas a esses
  // códigos, medido em 13/08/2026: a página de "requisição inválida" com status
  // 200 (o caso que sabemos traduzir) ou simplesmente pendurar a conexão até o
  // timeout. Exigir só a primeira faria este check piscar conforme o humor da
  // origem — o que se garante do NOSSO lado é que nunca vira sucesso silencioso.
  // Quando a origem pendura, as retentativas com backoff passam do teto de 30 s
  // desta chamada — daí o try/catch: um upstream lento não pode abortar o smoke.
  let inexistente = null;
  const inicioInexistente = Date.now();
  try {
    inexistente = await call("bcb_serie_ultimos", { codigo: 13523, quantidade: 5 });
  } catch {
    inexistente = null;
  }
  const rotuloInexistente = "código que a origem não reconhece nunca vira resposta de sucesso";
  if (inexistente === null) {
    // Nem resposta houve: a chamada estourou o prazo do próprio smoke. É a origem
    // pendurando a conexão, não defeito do deploy — aviso, com o motivo medido.
    smoke.relatorio.registrarVeredito(
      rotuloInexistente,
      {
        veredito: "indisponivel",
        motivo: "a origem pendurou a conexão no código inexistente em vez de servir a página de erro (a chamada estourou o prazo do smoke)",
        kind: undefined,
        status: undefined,
        url: undefined
      },
      Date.now() - inicioInexistente
    );
    console.log(`  [AVISO] ${rotuloInexistente} — a origem pendurou a conexão no código inexistente em vez de servir a página de erro`);
  } else {
    const textoInexistente = inexistente.result?.content?.[0]?.text ?? "";
    await smoke.verificar(rotuloInexistente, async () => inexistente.result, {
      esperaErro: true,
      detalhe: () => textoInexistente.slice(0, 70)
    });
    // A mensagem pedagógica só é possível quando a origem SERVE a página de
    // erro. Quando ela pendura, o que volta é erro de prazo — condição da
    // origem, não defeito nosso: o resultado `isError` vai ao pacote, que
    // sonda o SGS e decide (fora = aviso; servindo = falha com o texto).
    await smoke.verificar(
      "→ e o erro diz que a série é inexistente, em vez de culpar o período",
      async () => {
        if (/INEXISTENTE/i.test(textoInexistente)) return true;
        if (inexistente.result?.isError === true) return inexistente.result;
        throw new Error(`resposta sem erro: ${textoInexistente.slice(0, 90)}`);
      },
      { sondas: ["sgs"], detalhe: () => textoInexistente.slice(0, 70) }
    );
  }

  const catalogo = await call("bcb_series_populares", {});
  const catOut = catalogo.result?.structuredContent;
  // A contagem esperada vem do catálogo COMPILADO (fonte da verdade), nunca de
  // um número fixo: um 139 fossilizado aqui derrubou o deploy quando o catálogo
  // passou a 135 (23/08/2026) — e comparar produção × fonte é exatamente a
  // deriva que este smoke existe para pegar.
  let esperado = null;
  try {
    esperado = (await import("../dist/tools.js")).SERIES_POPULARES.length;
  } catch {
    // sem dist/ o smoke não sabe o esperado — falha pedindo o build
  }
  await check("bcb_series_populares lista o catálogo verificado (contagem do fonte)",
    esperado !== null && catOut?.totalSeries === esperado,
    `produção ${catOut?.totalSeries} × fonte ${esperado ?? "dist/ ausente — rode npm run build"}`);
  if (catOut) {
    const todas = Object.values(catOut.series ?? {}).flat();
    await check("  → toda entrada declara fonteNome",
      todas.length > 0 && todas.every(s => s.fonteNome === "portal" || s.fonteNome === "medido"));
    await check("  → só quem vem do portal declara unidade",
      todas.every(s => (s.fonteNome === "portal") || s.unidade === undefined));
    await check("  → os 4 códigos inexistentes ficaram fora",
      ![14, 13523, 21860, 13690].some(c => todas.some(s => s.codigo === c)));
  }

  // Tool que vai de fato à API do BCB.
  const selic = await client.rpc("tools/call", {
    name: "bcb_serie_ultimos",
    arguments: { codigo: 432, quantidade: 3 }
  });
  const dados = selic.result?.structuredContent?.dados ?? [];
  await checkUpstream(
    "bcb_serie_ultimos consulta o SGS ao vivo",
    selic.result,
    `${dados.length} obs; última = ${dados.at(-1)?.data} ${dados.at(-1)?.valor}`,
    ["sgs"]
  );

  // ---------- D1: os limites do SGS, contra a origem ----------
  //
  // Estes checks só valem se a origem participar: o 406 da janela decenal e o 400
  // do teto de 20 são a razão de existir do chunking, e nenhum mock prova que a
  // fatia funciona de verdade. Ver `bcb/docs/04-limites-sgs-medidos.md`.

  // Janela de 15 anos em série DIÁRIA (dólar): sem chunking, isto é 406.
  const longa = await call("bcb_serie_valores", {
    codigo: 1, dataInicial: "2010-01-01", dataFinal: "2024-12-31"
  });
  const longaOut = longa.result?.structuredContent;
  await checkUpstream(
    "bcb_serie_valores atravessa 15 anos de série diária (a origem recusa >10 em uma janela)",
    longa.result,
    `${longaOut?.totalRegistros} obs em ${longaOut?.chunking?.janelas} janelas`,
    ["sgs"]
  );
  if (!longa.result?.isError) {
    await check("  → a resposta declara o chunking", longaOut?.chunking?.janelas >= 5);
    await check(
      "  → o período cobre a janela pedida de ponta a ponta",
      longaOut?.periodoInicial?.endsWith("/2010") && longaOut?.periodoFinal?.endsWith("/2024"),
      `${longaOut?.periodoInicial} a ${longaOut?.periodoFinal}`
    );
    // Emenda sem duplicata: nenhuma data repetida entre fatias.
    const datas = (longaOut?.dados ?? []).map(d => d.data);
    await check("  → as fatias foram fundidas sem data repetida", new Set(datas).size === datas.length);
    await check("  → ~250 observações por ano de série diária", datas.length > 3000 && datas.length < 4200, `${datas.length} obs`);
  }

  // Teto de 20 do endpoint nativo: 60 pontos só sai por janela de datas.
  const acima = await call("bcb_serie_ultimos", { codigo: 433, quantidade: 60 });
  const acimaOut = acima.result?.structuredContent;
  await checkUpstream(
    "bcb_serie_ultimos entrega 60 pontos (a origem limita o endpoint nativo a 20)",
    acima.result,
    `${acimaOut?.totalRegistros} obs; última = ${acimaOut?.dados?.at(-1)?.data}`,
    ["sgs"]
  );
  if (!acima.result?.isError) {
    await check("  → devolveu os 60 pedidos", acimaOut?.totalRegistros === 60);
    await check("  → em ordem crescente de data", (() => {
      const anos = (acimaOut?.dados ?? []).map(d => Number(d.data.slice(6)));
      return anos.every((a, i) => i === 0 || a >= anos[i - 1]);
    })());
  }

  // Ordem cronológica onde a ORIGEM entrega ao contrário.
  //
  // A 4513 é uma das 22 séries (de 169 curadas) em que `ultimos/N` vem do mais
  // novo para o mais velho. Mock nenhum prova isto: o valor do check está em
  // pedir à origem de verdade a série que a serve invertida. Ver o CHANGELOG
  // 1.6.1 e `bcb/docs/06`.
  const invertida = await call("bcb_variacao", { codigo: 4513, periodos: 12 });
  const invOut = invertida.result?.structuredContent;
  await checkUpstream(
    "bcb_variacao numa série que a origem serve do mais novo para o mais velho",
    invertida.result,
    `${invOut?.periodo?.dataInicial} a ${invOut?.periodo?.dataFinal} = ${invOut?.analise?.variacaoFormatada}`,
    ["sgs"]
  );
  if (!invertida.result?.isError) {
    const ano = s => Number(String(s).slice(6));
    const mes = s => Number(String(s).slice(3, 5));
    const chave = s => ano(s) * 12 + mes(s);
    await check(
      "  → o período sai no sentido do tempo (inicial ANTES de final)",
      chave(invOut?.periodo?.dataInicial) < chave(invOut?.periodo?.dataFinal)
    );
    await check(
      "  → o sinal acompanha o movimento da série, não a ordem da resposta",
      Math.sign(invOut?.analise?.valorFinal - invOut?.analise?.valorInicial) ===
        Math.sign(invOut?.analise?.variacaoPercentual),
      `${invOut?.analise?.valorInicial} -> ${invOut?.analise?.valorFinal}`
    );
    await check(
      "  → os extremos seguem sendo observações da fonte",
      invOut?.estatisticas?.maximo >= invOut?.analise?.valorFinal &&
        invOut?.estatisticas?.minimo <= invOut?.analise?.valorInicial
    );
  }

  // Sessão 10 (1.9.0): série que JÁ É variação é acumulada por encadeamento. O
  // guarda de produção é o próprio BCB: o acumulado dos 12 meses de 2024 da 433
  // tem de bater com o que a 13522 publica em dezembro de 2024 (4,83), com a
  // tolerância medida do encadeamento (0,0052 pp) mais o arredondamento da fonte.
  const ipca2024 = await call("bcb_variacao", { codigo: 433, dataInicial: "2024-01-01", dataFinal: "2024-12-31" });
  const ipcaOut = ipca2024.result?.structuredContent;
  await checkUpstream(
    "bcb_variacao no IPCA de 2024 (série que já é variação)",
    ipca2024.result,
    `${ipcaOut?.analise?.metodo} = ${ipcaOut?.analise?.variacaoFormatada}`,
    ["sgs"]
  );
  if (!ipca2024.result?.isError) {
    await check("  → metodo é encadeamento e diferencaAbsoluta é nula",
      ipcaOut?.analise?.metodo === "encadeamento" && ipcaOut?.analise?.diferencaAbsoluta === null);
    await check("  → o acumulado é ~4,83, não os +23,81% da conta de nível",
      Math.abs(ipcaOut?.analise?.variacaoPercentual - 4.83) < 0.02, String(ipcaOut?.analise?.variacaoPercentual));
    const acum12 = await call("bcb_serie_valores", { codigo: 13522, dataInicial: "2024-12-01", dataFinal: "2024-12-31" });
    const publicado = Number(acum12.result?.structuredContent?.dados?.[0]?.valor);
    if (Number.isFinite(publicado)) {
      await check("  → e bate com o que o BCB publica na 13522 para 12/2024",
        Math.abs(ipcaOut?.analise?.variacaoPercentual - publicado) < 0.02, `13522 = ${publicado}`);
    }
  }
  const acumMovel = await call("bcb_variacao", { codigo: 13522, dataInicial: "2024-01-01", dataFinal: "2024-12-31" });
  const textoAcumMovel = acumMovel.result?.content?.[0]?.text ?? "";
  await smoke.verificar(
    "bcb_variacao recusa a 13522 (acumulado móvel) com orientação",
    async () => {
      exigir(/janela móvel/.test(textoAcumMovel), `recusa sem a orientação esperada: ${textoAcumMovel.slice(0, 90)}`);
      return acumMovel.result;
    },
    { esperaErro: true, detalhe: () => textoAcumMovel.slice(0, 70) }
  );

  const invUlt = await call("bcb_serie_ultimos", { codigo: 4513, quantidade: 12 });
  const invUltOut = invUlt.result?.structuredContent;
  await checkUpstream(
    "bcb_serie_ultimos normaliza a ordem da mesma série",
    invUlt.result,
    `${invUltOut?.dados?.[0]?.data} .. ${invUltOut?.dados?.at(-1)?.data}`,
    ["sgs"]
  );
  if (!invUlt.result?.isError) {
    const chaves = (invUltOut?.dados ?? []).map(d => Number(d.data.slice(6)) * 12 + Number(d.data.slice(3, 5)));
    await check("  → crescente do primeiro ao último ponto", chaves.every((k, i) => i === 0 || k >= chaves[i - 1]));
  }

  // Periodicidade inferida onde a fonte não publica metadados (endpoint 404).
  const meta = await call("bcb_serie_metadados", { codigo: 24369 });
  const metaOut = meta.result?.structuredContent;
  await checkUpstream("bcb_serie_metadados sem endpoint de metadados na origem", meta.result, `${metaOut?.periodicidade}`, ["sgs"]);
  if (!meta.result?.isError) {
    await check("  → traz o último valor e uma periodicidade", !!metaOut?.ultimoValor && !!metaOut?.periodicidade);
  }

  // Harmonização: IPCA mensal composto em ano fechado, marcado como derivado.
  const harm = await call("bcb_serie_valores", {
    codigo: 433, dataInicial: "2024-01-01", dataFinal: "2024-12-31",
    frequencia: "anual", agregacao: "acumulada"
  });
  const harmOut = harm.result?.structuredContent;
  await checkUpstream("bcb_serie_valores harmoniza IPCA mensal em anual", harm.result, `${harmOut?.dados?.[0]?.valor}% em 2024`, ["sgs"]);
  if (!harm.result?.isError) {
    await check("  → um ponto, agregando 12 observações", harmOut?.dados?.length === 1 && harmOut?.dados?.[0]?.observacoes === 12);
    await check("  → marcado como derivado, com nota", harmOut?.harmonizacao?.derived === true && !!harmOut?.harmonizacao?.nota);
    // IPCA de 2024 fechou em 4,83% — a composição tem de chegar perto disso, e a
    // soma simples (4,73) não chegaria.
    await check(
      "  → composição geométrica, não soma simples",
      Math.abs((harmOut?.dados?.[0]?.valor ?? 0) - 4.83) < 0.05,
      `${harmOut?.dados?.[0]?.valor}`
    );
  }

  // Periodicidade misturada: o aviso existe para não deixar o modelo comparar
  // uma série diária com uma mensal como se fossem a mesma grade.
  const misto = await call("bcb_comparar", {
    codigos: [1, 433], dataInicial: "2024-01-01", dataFinal: "2024-12-31"
  });
  const mistoOut = misto.result?.structuredContent;
  await checkUpstream("bcb_comparar avisa sobre periodicidades diferentes", misto.result, `${mistoOut?.seriesComDados} séries`, ["sgs"]);
  if (!misto.result?.isError) {
    await check("  → aviso presente com as duas periodicidades", (mistoOut?.aviso ?? "").includes("periodicidades diferentes"));
    await check("  → estatística marcada como derivada", mistoOut?.derivacao?.derived === true);
  }

  // ---------- correlação e deflação, contra a origem ----------

  // A recusa é a asserção principal desta tool. Medido em 11/08/2026: cruzar uma
  // série diária com uma mensal por data casa ~7 datas de 12 no ano — não zero —,
  // e o coeficiente resultante teria aparência saudável. Se a recusa parar de
  // funcionar, a tool passa a mentir em silêncio.
  const cruzado = await call("bcb_correlacao", {
    codigos: [1, 433], dataInicial: "2024-01-01", dataFinal: "2024-12-31"
  });
  const textoCruzado = cruzado.result?.content?.[0]?.text ?? "";
  await smoke.verificar(
    "bcb_correlacao RECUSA cruzar grades diferentes sem harmonizar",
    async () => {
      exigir(/periodicidades diferentes/i.test(textoCruzado), `recusa por outro motivo: ${textoCruzado.slice(0, 90)}`);
      return cruzado.result;
    },
    { esperaErro: true, detalhe: () => textoCruzado.slice(0, 70) }
  );
  await check("  → e o erro ensina a saída (`frequencia`)", textoCruzado.includes("frequencia"));

  // IPCA × INPC: os dois são índices de consumo do IBGE com cestas que se
  // sobrepõem quase inteiramente. Um coeficiente alto aqui é validação EXTERNA —
  // não é o nosso número conferindo com o nosso número.
  const gemeas = await call("bcb_correlacao", {
    codigos: [433, 188], dataInicial: "2015-01-01", dataFinal: "2024-12-31"
  });
  const gemeasOut = gemeas.result?.structuredContent;
  const parGemeas = gemeasOut?.pares?.[0];
  await checkUpstream("bcb_correlacao IPCA × INPC (mesma família de índice)", gemeas.result, `r = ${parGemeas?.coeficiente}`, ["sgs"]);
  if (!gemeas.result?.isError) {
    await check("  → alinhou os 120 meses, sem descarte", parGemeas?.n === 120 && parGemeas?.descartados === 0);
    await check("  → correlação forte, como a fonte manda esperar", (parGemeas?.coeficiente ?? 0) > 0.9);
    await check("  → interpretação em prosa acompanha o número", /forte/.test(parGemeas?.interpretacao ?? ""));
    await check("  → marcada como derivada", gemeasOut?.derivacao?.derived === true);
  }

  // Séries diárias em janela larga: o caso que exercita o chunking dos dois lados
  // e que, com uma requisição por série, não completava nos 10 s do worker.
  const diarias = await call("bcb_correlacao", {
    codigos: [1, 12], dataInicial: "2015-01-01", dataFinal: "2024-12-31"
  });
  const diariasOut = diarias.result?.structuredContent;
  await checkUpstream("bcb_correlacao em 10 anos de duas séries diárias", diarias.result, `${diariasOut?.alinhamento?.completas} datas`, ["sgs"]);
  if (!diarias.result?.isError) {
    await check("  → mais de 2000 datas alinhadas nas duas séries", (diariasOut?.alinhamento?.completas ?? 0) > 2000);
    await check("  → grade declarada como diária", diariasOut?.alinhamento?.grade === "diária");
  }

  // Deflação: salário mínimo desde 2000. O ganho real do salário mínimo no período
  // é fato público e amplamente documentado — se o número vier perto de zero ou
  // negativo, a reconstrução do índice quebrou.
  const defl = await call("bcb_deflacionar", {
    codigo: 1619, dataInicial: "2000-01-01", dataFinal: "2024-12-31"
  });
  const deflOut = defl.result?.structuredContent;
  await checkUpstream("bcb_deflacionar salário mínimo desde 2000 pelo IPCA", defl.result,
    `nominal ${deflOut?.variacao?.nominal}% × real ${deflOut?.variacao?.real}%`, ["sgs"]);
  if (!defl.result?.isError) {
    await check("  → o índice foi reconstruído desde 2000", deflOut?.deflator?.cobertura?.primeiroMes === "01/2000");
    await check("  → a base declarada é um mês do índice, não a data final pedida",
      /^\d{2}\/\d{4}$/.test(deflOut?.base?.mes ?? ""));
    await check("  → alta nominal muito maior que a real (a inflação come a maior parte)",
      (deflOut?.variacao?.nominal ?? 0) > 500 && (deflOut?.variacao?.real ?? 0) < 250);
    await check("  → ganho REAL positivo, como a literatura registra para o período",
      (deflOut?.variacao?.real ?? 0) > 50);
    await check("  → todo ponto traz o fator aplicado", (deflOut?.dados ?? []).every(d => d.fator !== undefined));
  }

  // Mês base explícito: a régua muda, o fato não. A variação real entre as mesmas
  // duas pontas tem de ser a MESMA, qualquer que seja o mês em que se expressa.
  const base2010 = await call("bcb_deflacionar", {
    codigo: 1619, dataInicial: "2000-01-01", dataFinal: "2024-12-31", mesBase: "2010-01"
  });
  const base2010Out = base2010.result?.structuredContent;
  await checkUpstream("bcb_deflacionar com mês base explícito", base2010.result, `base ${base2010Out?.base?.mes}`, ["sgs"]);
  if (!base2010.result?.isError && !defl.result?.isError) {
    await check("  → a base pedida foi aplicada", base2010Out?.base?.mes === "01/2010");
    await check(
      "  → a variação real NÃO depende do mês base",
      Math.abs((base2010Out?.variacao?.real ?? 0) - (deflOut?.variacao?.real ?? 0)) < 0.01,
      `${base2010Out?.variacao?.real} × ${deflOut?.variacao?.real}`
    );
  }

  // ---------- as 5 tools de D3, contra a origem ----------

  // Focus consolidado: o horizonte escolhe o recurso, e a URL da consulta prova qual.
  const anual = await call("bcb_focus_expectativas", { indicador: "IPCA", horizonte: "anual", referencia: "2027" });
  const anualOut = anual.result?.structuredContent;
  await checkUpstream("bcb_focus_expectativas (anual)", anual.result, `${anualOut?.totalRegistros} coletas`, ["focus"]);
  if (!anual.result?.isError) {
    await check(
      "  → foi ao recurso anual, com filtro por construção",
      anualOut?.urlConsulta?.includes("/ExpectativasMercadoAnuais?") && anualOut?.urlConsulta?.includes("$filter=")
    );
    await check("  → devolve mediana, não só eco do pedido", typeof anualOut?.expectativas?.[0]?.mediana === "number");
  }

  // Fronteira do contrato: rolante recusa `referencia`, e isso não pode ir à rede.
  const rolante = await call("bcb_focus_expectativas", { indicador: "IPCA", horizonte: "inflacao_12m", referencia: "2027" });
  const textoRolante = rolante.result?.content?.[0]?.text ?? "";
  await smoke.verificar(
    "bcb_focus_expectativas barra `referencia` em horizonte rolante",
    async () => {
      exigir(/rolante/i.test(textoRolante), `recusa por outro motivo: ${textoRolante.slice(0, 90)}`);
      return rolante.result;
    },
    { esperaErro: true, detalhe: () => textoRolante.slice(0, 70) }
  );

  // Top 5 da Selic: o recurso que publica os campos em caixa baixa. Se a
  // normalização regredir, `mediana` volta nula e este check pega.
  const top5 = await call("bcb_focus_selic", { top5: true, limite: 3 });
  const top5Out = top5.result?.structuredContent;
  await checkUpstream("bcb_focus_selic (top5)", top5.result, `${top5Out?.totalRegistros} coletas`, ["focus"]);
  if (!top5.result?.isError) {
    await check(
      "  → campos em caixa baixa do Top 5 chegam normalizados",
      typeof top5Out?.expectativas?.[0]?.mediana === "number" &&
        /^R\d+\/\d{4}$/.test(top5Out?.expectativas?.[0]?.referencia ?? "")
    );
  }

  // Referências: o valor da tool é a quebra POR horizonte.
  const refs = await call("bcb_focus_referencias", { escopo: "anual" });
  const refsOut = refs.result?.structuredContent;
  await checkUpstream("bcb_focus_referencias (anual)", refs.result, `${refsOut?.escopos?.[0]?.indicadores?.length} indicadores`, ["focus"]);
  if (!refs.result?.isError) {
    await check(
      "  → traz indicadores e referências do horizonte pedido",
      refsOut?.escopos?.[0]?.indicadores?.length > 0 && refsOut?.escopos?.[0]?.referencias?.length > 0
    );
  }

  // PTAX: o dia único usa MM-DD-YYYY. Em ISO a fonte devolve 200 com zero linhas,
  // então o check é a URL trazer a data invertida E vir cotação.
  const ptax = await call("bcb_cambio_cotacao", { moeda: "EUR", dataInicial: "2026-08-03", dataFinal: "2026-08-10" });
  const ptaxOut = ptax.result?.structuredContent;
  await checkUpstream("bcb_cambio_cotacao (EUR, intervalo)", ptax.result, `${ptaxOut?.totalRegistros} boletins`, ["ptax"]);
  if (!ptax.result?.isError) {
    await check("  → datas na URL em MM-DD-YYYY", ptaxOut?.urlConsulta?.includes("'08-03-2026'"));
    await check("  → disclaimer do BCB repassado literalmente", (ptaxOut?.disclaimer ?? "").includes("não assume qualquer responsabilidade"));
    await check("  → paridade não-USD qualificada como dado de terceiro", (ptaxOut?.qualificacaoParidade ?? "").includes("Refinitiv"));
    await check("  → cotação com compra e venda", typeof ptaxOut?.cotacoes?.[0]?.cotacaoVenda === "number");
  }

  const moedas = await call("bcb_cambio_moedas", {});
  const moedasOut = moedas.result?.structuredContent;
  await checkUpstream("bcb_cambio_moedas", moedas.result, `${moedasOut?.totalMoedas} moedas`, ["ptax"]);
  if (!moedas.result?.isError) {
    await check("  → símbolos utilizáveis em bcb_cambio_cotacao", (moedasOut?.moedas ?? []).some(m => m.simbolo === "EUR"));
  }

  // ==================== proveniência (D4) ====================
  //
  // Aqui o smoke não pergunta "veio bloco?" — isso o `provenance.test.ts` já
  // prova offline. Pergunta o que só a origem responde: se o instante afirmado
  // é o da extração de agora, e se o bloco da PTAX em moeda não-USD separa a
  // procedência de terceiro. Bloco bem-formado com data errada passa em
  // qualquer validador de schema.
  const provSerie = await call("bcb_serie_ultimos", { codigo: 433, quantidade: 3 });
  const provOut = provSerie.result?.structuredContent;
  await checkUpstream("proveniência: bcb_serie_ultimos traz o bloco", provSerie.result, "", ["sgs"]);
  if (!provSerie.result?.isError) {
    const b = provOut?.provenance;
    const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await check("  → licença declarada é a ODbL", (b?.license ?? "").includes("ODbL"));
    await check("  → a extração é de AGORA, não do build", (b?.retrieved_at ?? "").startsWith(hoje), b?.retrieved_at);
    await check("  → source_url reproduz a consulta na origem", (b?.source_url ?? "").includes("bcdata.sgs.433"));
    await check("  → citação pronta nomeia a série", (b?.citation ?? "").includes("433"));
    await check("  → lista de atribuição não vem vazia", (provOut?.attribution ?? []).length > 0);
  }

  // A busca é a única tool servida de cache: o instante tem de ser o da
  // obtenção do índice, e não o de agora. Duas chamadas seguidas provam.
  await call("bcb_buscar_serie", { termo: "selic" });
  const busca2 = await call("bcb_buscar_serie", { termo: "cambio" });
  const busca2Out = busca2.result?.structuredContent;
  await checkUpstream("proveniência: 2ª busca é servida de cache", busca2.result, "", ["portal"]);
  if (!busca2.result?.isError && await indiceDoPortalFora("  → proveniência do índice do portal", busca2Out)) {
    const doServidor = (busca2Out?.provenance ?? []).find(x => String(x.source).includes("catálogo curado"));
    await check("  → o bloco do catálogo do servidor continua presente", !!doServidor);
  } else if (!busca2.result?.isError) {
    const doPortal = (busca2Out?.provenance ?? []).find(x => String(x.source).includes("Portal"));
    const doServidor = (busca2Out?.provenance ?? []).find(x => String(x.source).includes("catálogo curado"));
    await check("  → um bloco por procedência (portal × catálogo do servidor)", !!doPortal && !!doServidor);
    // Comparar por INSTANTE, não por string: o bloco sai em horário de Brasília
    // (-03:00) e o `obtidoEm` do catálogo sai em UTC — são o mesmo momento
    // escrito de dois jeitos. O contrato serializa truncando no segundo.
    const seg = iso => Math.floor(new Date(iso).getTime() / 1000);
    await check(
      "  → o instante do portal é o da obtenção do índice, não o de agora",
      !!doPortal && seg(doPortal.retrieved_at) === seg(busca2Out?.catalogo?.obtidoEm),
      `${doPortal?.retrieved_at} × ${busca2Out?.catalogo?.obtidoEm}`
    );
  }

  // Fronteira BCB × agência de informação, dentro da mesma resposta.
  if (!ptax.result?.isError) {
    const fontes = (ptaxOut?.provenance ?? []).map(x => String(x.source));
    await check("  → paridade não-USD ganha bloco de procedência própria", fontes.some(f => f.includes("Refinitiv")));
    await check("  → e o bloco do BCB continua presente ao lado", fontes.some(f => f.includes("PTAX") && !f.includes("Refinitiv")));
  }

  // Contrato Deep Research do ChatGPT: search → fetch, sobre o mesmo índice
  // da busca. `content` tem UM bloco, com o JSON do objeto do contrato; a
  // proveniência viaja em `structuredContent`; a `url` é o que o ChatGPT cita.
  const busca3 = await call("search", { query: "selic meta copom" });
  const buscaObj = busca3.result?.structuredContent;
  const buscaTexto = (() => { try { return JSON.parse(busca3.result?.content?.[0]?.text ?? ""); } catch { return null; } })();
  await checkUpstream("search devolve resultados do contrato", busca3.result, `${buscaObj?.results?.length ?? 0} resultados`, ["portal"]);
  if (!busca3.result?.isError) {
    const primeiro = buscaObj?.results?.[0];
    await check("  → content é UM bloco com o JSON de { results }", busca3.result?.content?.length === 1 && Array.isArray(buscaTexto?.results));
    await check("  → todo resultado tem id, title e url (a citação depende da url)",
      (buscaObj?.results ?? []).length > 0 && buscaObj.results.every(r => r.id && r.title && r.url));
    await check("  → o id é sgs:<código> e a proveniência está no structuredContent",
      /^sgs:\d+$/.test(primeiro?.id ?? "") && Array.isArray(buscaObj?.provenance), `${primeiro?.id} — ${primeiro?.title}`);

    const doc = await call("fetch", { id: primeiro.id });
    const docObj = doc.result?.structuredContent;
    await checkUpstream("fetch devolve o documento do id buscado", doc.result, `${docObj?.title}`, ["sgs"]);
    if (!doc.result?.isError) {
      await check("  → id, title, text e url preenchidos, id igual ao pedido",
        docObj?.id === primeiro.id && ["title", "text", "url"].every(k => typeof docObj?.[k] === "string" && docObj[k]),
        `text ${docObj?.text?.length ?? 0} chars | ${docObj?.url}`);
      await check("  → a proveniência do fetch é a de bcb_serie_metadados (SGS + catálogo)",
        Array.isArray(docObj?.provenance) && docObj.provenance.some(b => String(b.source).includes("SGS")));
    }
  }
  const desconhecido = await call("fetch", { id: "sgs:0" });
  await smoke.verificar(
    "fetch com id desconhecido é erro de tool, não sucesso vazio",
    async () => desconhecido.result,
    { esperaErro: true, detalhe: () => desconhecido.result?.content?.[0]?.text?.slice(0, 60) ?? "" }
  );

  // Leitura de resource.
  const leitura = await client.rpc("resources/read", { uri: "bcb://series/principais" });
  await check("resources/read bcb://series/principais", !!leitura.result?.contents?.[0]?.text);

  // Validação de entrada — a regressão que a fundação fechou.
  const invalido = await client.rpc("tools/call", { name: "bcb_serie_valores", arguments: {} });
  const texto = invalido.result?.content?.[0]?.text ?? "";
  await smoke.verificar(
    "argumento obrigatório ausente é barrado (não vira consulta a 'série undefined')",
    async () => {
      exigir(!texto.includes("undefined"), `o erro cita 'undefined': ${texto.slice(0, 80)}`);
      return invalido.result;
    },
    { esperaErro: true, detalhe: () => texto.slice(0, 80) }
  );
} catch (error) {
  // Uma chamada do próprio smoke lançou (JSON-RPC, parse, timeout de método de
  // protocolo): defeito do deploy ou do roteiro, nunca da origem — vermelho, sem
  // sondar. O timeout de `tools/call` no STDIO não cai aqui: vira `isError` e é
  // sondado (ver o transporte).
  await smoke.verificar("roteiro completo (nenhuma chamada do smoke lançou)", async () => {
    throw error;
  });
} finally {
  client.close();
}

const resumo = smoke.concluir();
console.log(resumo.codigoDeSaida === 0 ? (resumo.naoMedidas.length > 0 ? "\nSmoke OK com aviso de fonte\n" : "\nSmoke OK\n") : "\nSmoke FALHOU\n");
await sair(resumo.codigoDeSaida);
