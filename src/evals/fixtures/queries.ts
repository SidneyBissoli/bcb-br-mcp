/**
 * Fixtures de seleção de tool — 44 consultas pt-BR na persona do usuário-alvo
 * (jornalista de economia, analista, pesquisador brasileiro pedindo dado do
 * BCB).
 *
 * O conjunto não existe para dar nota bonita: existe para medir, com dado, as
 * DUAS perguntas que a fase deixou explicitamente em aberto para o eval pago.
 *
 * 1. **A sobreposição deliberada entre SGS e Focus/PTAX** (arbitragem 3). O
 *    dólar PTAX também é série do SGS (1, 3695, 3697, 3698) e as medianas do
 *    Focus também (29033–29040). O decisor aprovou CONVIVER com a sobreposição,
 *    com referência cruzada nas descrições, a confirmar por dado — amputar
 *    códigos publicados foi descartado. As fixtures `sobrep-` são o teste: se o
 *    modelo escolher a tool errada de forma sistemática, a decisão volta à mesa.
 *
 * 2. **A fronteira `bcb_comparar` × `bcb_correlacao`.** As duas recebem uma
 *    LISTA de códigos e um período, e as perguntas do usuário se parecem. Elas
 *    respondem coisas diferentes: `comparar` resume cada série na própria grade
 *    (quem subiu mais?); `correlacao` produz UM número sobre as duas ao mesmo
 *    tempo (elas andam juntas?) e recusa grades diferentes. Prefixo `stat-`.
 *
 * Prefixo do id = cluster: `serie-`, `desc-`, `stat-`, `focus-`, `cambio-`,
 * `sobrep-` (a sobreposição da arbitragem 3), `ctrl-` (controles sem irmã) e
 * `dr-` (a forma Deep Research do ChatGPT: descobrir documentos no acervo e
 * ler um por inteiro — `search`/`fetch`, contra as `bcb_*` que respondem dado).
 *
 * `expectedTools` = a(s) PRIMEIRA(S) chamada(s) aceitável(is). Mais de uma
 * entrada só onde duas tools são primeiro passo genuinamente defensável — e nas
 * fixtures `sobrep-` isso é proposital: ali a pergunta é "o modelo cai numa das
 * duas defensáveis, ou numa terceira que estaria errada?".
 */

import type { EvalFixture } from "@sbissoli/mcp-evals";

export const FIXTURES: EvalFixture[] = [
  // ── série: leitura de valores do SGS ─────────────────────────────────────
  {
    id: "serie-01",
    query: "Me dá a série do IPCA mensal de janeiro de 2020 até dezembro de 2024.",
    expectedTools: ["bcb_serie_valores"],
    note: "Janela explícita de datas numa série conhecida é o caso central de bcb_serie_valores."
  },
  {
    id: "serie-02",
    query: "Quais foram os últimos 12 valores da Selic meta?",
    expectedTools: ["bcb_serie_ultimos"],
    note: "\"Os últimos N\" sem período é bcb_serie_ultimos; serie_valores pede janela."
  },
  {
    id: "serie-03",
    query: "O que é a série 24364 do BCB e com que frequência ela é publicada?",
    expectedTools: ["bcb_serie_metadados"],
    note: "Pergunta sobre a IDENTIDADE da série (nome, periodicidade), não sobre os valores."
  },
  {
    id: "serie-04",
    query: "Preciso da série 4390 agregada por ano, usando a média de cada ano.",
    expectedTools: ["bcb_serie_valores"],
    note: "Harmonização de frequência (frequencia + agregacao) é parâmetro de bcb_serie_valores."
  },
  {
    id: "serie-05",
    query: "Me mostra o histórico completo da série 433 desde 1996.",
    expectedTools: ["bcb_serie_valores"],
    note: "Janela longa continua sendo serie_valores — o chunking é interno, não muda a tool."
  },
  {
    id: "serie-06",
    query: "Qual foi o último dado publicado do IBC-Br?",
    expectedTools: ["bcb_serie_ultimos"],
    note: "Um único valor mais recente de UMA série é serie_ultimos; indicadores_atuais é o painel fixo."
  },

  // ── descoberta: antes de saber o código ──────────────────────────────────
  {
    id: "desc-01",
    query: "Existe alguma série do Banco Central sobre inadimplência de crédito?",
    expectedTools: ["bcb_buscar_serie"],
    note: "Busca por tema, sem código na mão, é bcb_buscar_serie."
  },
  {
    id: "desc-02",
    query: "Quais séries vocês têm sobre câmbio? Quero ver a lista.",
    expectedTools: ["bcb_buscar_serie", "bcb_series_populares"],
    note: "Ambíguo de propósito: buscar por termo ou listar o catálogo curado são os dois defensáveis."
  },
  {
    id: "desc-03",
    query: "Me dá um panorama rápido: Selic, IPCA, dólar e IBC-Br agora.",
    expectedTools: ["bcb_indicadores_atuais"],
    note: "O painel de indicadores atuais existe exatamente para esta pergunta em uma chamada."
  },
  {
    id: "desc-04",
    query: "Que categorias de indicadores o servidor cobre?",
    expectedTools: ["bcb_series_populares"],
    note: "Listar o catálogo por categoria é series_populares; buscar_serie exige um termo."
  },
  {
    id: "desc-05",
    query: "Qual é o código da série do saldo da dívida líquida do setor público?",
    expectedTools: ["bcb_buscar_serie"],
    note: "Descobrir o CÓDIGO a partir do nome é busca, não leitura de valores."
  },

  // ── estatística, com a fronteira comparar × correlacao ───────────────────
  {
    id: "stat-01",
    query: "Quanto o IPCA acumulou de variação entre janeiro e dezembro de 2024?",
    expectedTools: ["bcb_variacao"],
    note:
      "UMA série, acumulado no período: bcb_variacao. Até a v1.8.0 esta expectativa estava ERRADA na prática — " +
      "a tool comparava a taxa de janeiro com a de dezembro (+23,81% onde o acumulado é 4,83%) e o modelo, " +
      "certo, recusava e ia aos valores brutos. Desde a 1.9.0 a série 433 é acumulada por encadeamento " +
      "(`analise.metodo: \"encadeamento\"`), e a expectativa vale legitimamente."
  },
  {
    id: "stat-02",
    query: "Compare o desempenho do IPCA, do INPC e do IGP-M em 2024: qual subiu mais?",
    expectedTools: ["bcb_comparar"],
    note: "\"Qual subiu mais\" é ranking de variação por série — comparar, não correlacao."
  },
  {
    id: "stat-03",
    query: "O IPCA e o INPC andam juntos? Tem correlação entre os dois nos últimos 10 anos?",
    expectedTools: ["bcb_correlacao"],
    note: "\"Andam juntos\"/\"correlação\" pede UM coeficiente sobre as duas — correlacao, não comparar."
  },
  {
    id: "stat-04",
    query: "O salário mínimo subiu de verdade desde 2000, descontando a inflação?",
    expectedTools: ["bcb_deflacionar"],
    note: "\"Descontando a inflação\" / valor real é deflacionar; variacao daria só o nominal."
  },
  {
    id: "stat-05",
    query: "Quero ver IPCA e IGP-M lado a lado em 2023 e 2024, com máximo e mínimo de cada.",
    expectedTools: ["bcb_comparar"],
    note: "Resumo de cada série na própria grade, lado a lado: comparar."
  },
  {
    id: "stat-06",
    query: "A Selic tem relação com o câmbio? Me mostra o coeficiente.",
    expectedTools: ["bcb_correlacao"],
    note: "Pedido explícito de coeficiente entre duas séries."
  },
  {
    id: "stat-07",
    query: "Converta a série 1619 para reais de hoje pelo IPCA.",
    expectedTools: ["bcb_deflacionar"],
    note: "Moeda constante por índice de preço é deflacionar."
  },
  {
    id: "stat-08",
    query: "Entre 2015 e 2025, qual das duas variou mais: a dívida bruta ou a dívida líquida?",
    expectedTools: ["bcb_comparar"],
    note: "Superlativo entre séries = ranking de variação; correlacao não responde \"qual variou mais\"."
  },

  // ── Focus ────────────────────────────────────────────────────────────────
  {
    id: "focus-01",
    query: "Qual é a expectativa do mercado para o IPCA de 2027?",
    expectedTools: ["bcb_focus_expectativas"],
    note: "Expectativa de calendário com referência anual: focus_expectativas com horizonte anual."
  },
  {
    id: "focus-02",
    query: "O que o mercado espera para a Selic na próxima reunião do Copom?",
    expectedTools: ["bcb_focus_selic"],
    note: "O eixo é a REUNIÃO do Copom — tool separada de propósito."
  },
  {
    id: "focus-03",
    query: "Quais indicadores e referências o Focus publica no horizonte anual?",
    expectedTools: ["bcb_focus_referencias"],
    note: "Descoberta dos textos exatos, que é a causa mais comum de resposta vazia."
  },
  {
    id: "focus-04",
    query: "Qual a expectativa de inflação para os próximos 12 meses, na série suavizada?",
    expectedTools: ["bcb_focus_expectativas"],
    note: "Horizonte rolante (inflacao_12m) mora dentro de focus_expectativas, com `suavizada`."
  },
  {
    id: "focus-05",
    query: "Me mostra o Top 5 das projeções de IPCA para 2026.",
    expectedTools: ["bcb_focus_expectativas"],
    note: "Top 5 é SINALIZADOR (top5: true), não tool própria."
  },
  {
    id: "focus-06",
    query: "Como está a mediana das projeções de PIB para o ano que vem?",
    expectedTools: ["bcb_focus_expectativas"],
    note: "Projeção de indicador por ano-calendário: horizonte anual."
  },

  // ── câmbio ───────────────────────────────────────────────────────────────
  {
    id: "cambio-01",
    query: "Qual foi a PTAX de fechamento do euro no dia 10 de agosto de 2026?",
    expectedTools: ["bcb_cambio_cotacao"],
    note: "Boletim de câmbio de uma moeda num dia: cotacao."
  },
  {
    id: "cambio-02",
    query: "Qual é o símbolo da coroa norueguesa na tabela do Banco Central?",
    expectedTools: ["bcb_cambio_moedas"],
    note: "Descobrir o símbolo é pergunta própria — e pré-requisito da tool de cotação."
  },
  {
    id: "cambio-03",
    query: "Me dá as cotações de compra e venda do iene entre 1º e 31 de julho.",
    expectedTools: ["bcb_cambio_cotacao"],
    note: "Intervalo de boletins de uma moeda."
  },
  {
    id: "cambio-04",
    query: "Que moedas o BCB publica boletim?",
    expectedTools: ["bcb_cambio_moedas"],
    note: "Lista de moedas."
  },

  // ── sobreposição deliberada (arbitragem 3) ───────────────────────────────
  //
  // Aqui o `expectedTools` tem DUAS entradas de propósito: as duas superfícies
  // publicam o mesmo dado e o decisor aprovou conviver. O que o eval mede é se
  // o modelo cai numa das duas defensáveis — ou numa terceira, que seria erro.
  {
    id: "sobrep-01",
    query: "Qual é a cotação do dólar hoje?",
    expectedTools: ["bcb_cambio_cotacao", "bcb_serie_ultimos"],
    note: "O dólar PTAX é a série 1 do SGS E é a tool de câmbio: as duas são defensáveis."
  },
  {
    id: "sobrep-02",
    query: "Me dá a série histórica do dólar comercial de venda em 2024.",
    expectedTools: ["bcb_serie_valores", "bcb_cambio_cotacao"],
    note: "\"Série histórica\" puxa para o SGS; a PTAX responde o mesmo período por boletim."
  },
  {
    id: "sobrep-03",
    query: "Qual a mediana das expectativas de IPCA do Focus para 12 meses à frente?",
    expectedTools: ["bcb_focus_expectativas", "bcb_serie_valores"],
    note: "As medianas do Focus também são séries do SGS (29033–29040); a tool do Focus é a via direta."
  },
  {
    id: "sobrep-04",
    query: "Preciso do dólar PTAX de fechamento como série mensal para uma planilha.",
    expectedTools: ["bcb_serie_valores", "bcb_cambio_cotacao"],
    note: "Pedido de SÉRIE mensal favorece o SGS (3698), mas a PTAX é resposta legítima."
  },
  {
    id: "sobrep-05",
    query: "Qual foi a taxa Selic efetiva no fim de 2025?",
    expectedTools: ["bcb_serie_ultimos", "bcb_serie_valores"],
    note: "Selic EFETIVA é dado observado do SGS (1178), não expectativa — focus_selic aqui seria erro."
  },
  {
    id: "sobrep-06",
    query: "O mercado espera que o dólar feche o ano em quanto?",
    expectedTools: ["bcb_focus_expectativas"],
    note: "\"O mercado espera\" é expectativa, não cotação observada — cambio_cotacao aqui seria erro."
  },

  // ── controles: sem irmã plausível ────────────────────────────────────────
  {
    id: "ctrl-01",
    query: "Quanto o IGP-M acumulou em 2023?",
    expectedTools: ["bcb_variacao"],
    note:
      "Controle: uma série, um período, acumulado. Mesma história de stat-01: publicava +252,38% para 2023, " +
      "quando o IGP-M caiu 3,18%; desde a 1.9.0 a 189 é encadeada e a expectativa vale."
  },
  {
    id: "ctrl-02",
    query: "Tem alguma série do BCB sobre endividamento das famílias?",
    expectedTools: ["bcb_buscar_serie"],
    note: "Controle de busca por tema."
  },
  {
    id: "ctrl-03",
    query: "Quais são as datas de referência que o Focus usa no horizonte trimestral?",
    expectedTools: ["bcb_focus_referencias"],
    note: "Controle: descoberta de referências, sem irmã."
  },
  {
    id: "ctrl-04",
    query: "Me lista as moedas com boletim de fechamento no BCB.",
    expectedTools: ["bcb_cambio_moedas"],
    note: "Controle de câmbio."
  },
  {
    id: "ctrl-05",
    query: "Qual a periodicidade da série 27788?",
    expectedTools: ["bcb_serie_metadados"],
    note: "Controle: identidade da série, não valores."
  },
  {
    id: "ctrl-06",
    query: "IPCA e Selic caminham na mesma direção nos últimos cinco anos?",
    expectedTools: ["bcb_correlacao"],
    note: "Controle da fronteira: \"mesma direção\" é correlação, não ranking."
  },
  {
    id: "ctrl-07",
    query: "Quanto vale hoje, em reais de agora, um salário de R$ 3.000 de 2010?",
    expectedTools: ["bcb_deflacionar"],
    note: "Controle de deflação."
  },

  // ── Deep Research (contrato do ChatGPT): documentos do acervo, não dados ──
  {
    id: "dr-01",
    query: "Encontre documentos no acervo do BCB sobre crédito às famílias para eu ler um deles na íntegra e citar a página.",
    expectedTools: ["search"],
    note: "Descoberta de documentos com citação (a forma Deep Research) é `search`; as bcb_* respondem dado."
  },
  {
    id: "dr-02",
    query: "Abra o documento sgs:433 que a busca devolveu e me traga o texto completo com a URL para citar.",
    expectedTools: ["fetch"],
    note: "Id devolvido por `search` → `fetch` lê o documento inteiro; não é consulta de valores."
  }
];
