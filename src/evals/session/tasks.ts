/**
 * Tarefas de SESSÃO LONGA do bcb-br-mcp — o A/B do bloco `retrieval`.
 *
 * Pergunta que este conjunto existe para responder (comentário no dev.to em
 * 26/09/2026, item de sessão longa do ROADMAP): o diagnóstico de origem que cada
 * resposta carrega (`provenance.retrieval` — idas, tentativas, anomalias,
 * `unstable`) reduz CHAMADAS RUINS quando um agente trabalha muitos passos contra
 * este servidor? O runner (`@sbissoli/mcp-evals/session`) roda cada tarefa nos dois
 * braços — A com o campo, B sem — e conta, por trace, repetição após erro
 * definitivo, recusa de esquema e insistência num alvo que já falhou.
 *
 * As tarefas usam JANELAS HISTÓRICAS fechadas (2022–2024): os valores não mudam
 * mais, então o gabarito é fixo e checável sem juiz. Cada tarefa arma pelo menos
 * uma armadilha documentada em `trap`. O `script` é o roteiro do `--dry` — as
 * chamadas que uma trajetória correta faria —, validado offline contra o catálogo
 * vivo em `tasks.test.ts`, e é com ele que o `--dry` mede o tamanho real das
 * respostas antes da rodada paga.
 *
 * Códigos do SGS usados: 433 IPCA mensal · 432 meta Selic · 4390 Selic mensal ·
 * 1 dólar PTAX venda · 189 IGP-M · 99999 (não existe — a armadilha do 30 s).
 */

import type { TaskSet } from "@sbissoli/mcp-evals/session";

export const TASK_SET: TaskSet = {
  server: "bcb-br-mcp",

  systemPrompt:
    "Você é um assistente de dados econômicos que responde com dados oficiais do Banco Central " +
    "do Brasil, usando as ferramentas disponíveis (séries do SGS, expectativas do Focus, câmbio " +
    "PTAX). Trabalhe passo a passo: descubra o código quando não souber, confirme o que a série é " +
    "quando houver dúvida, e só então leia os valores. Cada resultado traz um bloco `provenance` " +
    "com a fonte, a URL consultada e o instante da extração; cite a fonte na resposta final. " +
    "Quando uma ferramenta devolver erro, leia a mensagem antes de decidir o próximo passo. " +
    "Termine com uma resposta objetiva ao pedido, com os números pedidos.",

  // A mensagem do bcb para código inexistente diz as duas coisas ("é a série INEXISTENTE
  // que fica ~30 s" E "se o código estiver certo, a origem está indisponível — repita").
  // Para o A/B ela é DEFINITIVA: repetir a mesma leitura, ou tentar as irmãs com o mesmo
  // código, é a chamada ruim que a métrica existe para contar.
  definitiveErrorPattern: /s[eé]rie INEXISTENTE|n[aã]o trouxe dado em \d+ tentativas/i,

  faults: {
    // Controle: o mundo como está.
    "0": { seed: 20260927, rules: [] },
    // 20 % das idas ao SGS e ao Olinda respondem 502 — o retry do servidor trabalha e
    // o `retrieval` sai verdadeiro ({1, 2..3, [http_5xx×n], unstable}).
    "20": {
      seed: 20260927,
      rules: [{ match: "api\\.bcb\\.gov\\.br|olinda\\.bcb\\.gov\\.br", rate: 0.2, kind: "http_5xx", status: 502 }],
    },
    // A variante que o portal do BCB de fato produz sob carga: 200 com HTML no lugar do JSON.
    "20html": {
      seed: 20260927,
      rules: [{ match: "api\\.bcb\\.gov\\.br|olinda\\.bcb\\.gov\\.br", rate: 0.2, kind: "html" }],
    },
  },

  tasks: [
    {
      id: "ipca-acumulado-2023",
      prompt: "Qual foi a inflação oficial (IPCA) acumulada no ano de 2023? Quero o percentual do ano fechado.",
      expectedTools: ["bcb_serie_valores"],
      script: [
        { tool: "bcb_serie_metadados", args: { codigo: 433 } },
        { tool: "bcb_serie_valores", args: { codigo: 433, dataInicial: "2023-01-01", dataFinal: "2023-12-31", frequencia: "anual", agregacao: "acumulada" } },
      ],
      answer: { kind: "number", value: 4.62, tolerance: 0.01 },
      trap: "433 já é variação mensal: somar as pontas ou pegar o último valor dá errado; a agregação acumulada encadeia.",
      note: "Leitura direta de série conhecida com agregação; fecha em 2–4 passos.",
    },
    {
      id: "selic-meta-fim-2023",
      prompt: "Qual era a meta da taxa Selic definida pelo Copom em vigor no dia 31 de dezembro de 2023?",
      expectedTools: ["bcb_serie_valores", "bcb_serie_ultimos"],
      script: [{ tool: "bcb_serie_valores", args: { codigo: 432, dataInicial: "2023-12-01", dataFinal: "2023-12-31" } }],
      answer: { kind: "number", value: 11.75, tolerance: 0.001 },
      trap: "Existem várias Selic (meta 432, diária 11, mensal 4390); a pergunta é a META.",
      note: "Desambiguação entre séries irmãs.",
    },
    {
      id: "dolar-ptax-ultimo-dia-2023",
      prompt: "Qual foi a cotação de venda do dólar PTAX no último dia útil de 2023 (29/12/2023)?",
      expectedTools: ["bcb_cambio_cotacao", "bcb_serie_valores"],
      script: [{ tool: "bcb_cambio_cotacao", args: { moeda: "USD", data: "2023-12-29" } }],
      answer: { kind: "number", value: 4.8413, tolerance: 0.002 },
      trap: "Sobreposição SGS × PTAX (série 1 também responde); as duas são defensáveis.",
      note: "Câmbio em data única.",
    },
    {
      id: "comparar-selic-ipca-cambio-2023",
      prompt:
        "Compare em 2023, mês a mês, a Selic mensal, o IPCA mensal e o dólar PTAX de venda: qual dos três variou mais no ano? Explique a base da comparação.",
      expectedTools: ["bcb_comparar"],
      script: [{ tool: "bcb_comparar", args: { codigos: [4390, 433, 1], dataInicial: "2023-01-01", dataFinal: "2023-12-31", frequencia: "mensal" } }],
      trap: "Uma das três (433) é variação por período: a tool acumula em vez de subtrair as pontas e diz isso no resultado — a resposta tem de refletir.",
      note: "Multi-série numa chamada; o resultado é grande (mede o custo).",
    },
    {
      id: "deflacionar-dolar-2019-2023",
      prompt: "O dólar PTAX de venda de janeiro de 2019 a dezembro de 2023, em reais de dezembro de 2023 (deflacionado pelo IPCA): quanto valia, em moeda constante, o dólar de janeiro de 2019?",
      expectedTools: ["bcb_deflacionar"],
      script: [
        { tool: "bcb_deflacionar", args: { codigo: 1, dataInicial: "2019-01-01", dataFinal: "2023-12-31", indice: "ipca", mesBase: "2023-12", frequencia: "mensal", agregacao: "media" } },
      ],
      trap: "Sem bcb_deflacionar a comparação é nominal e engana; deflacionar à mão exige número-índice que o SGS não publica.",
      note: "Derivada com dois insumos; resposta longa.",
    },
    {
      id: "focus-ipca-2025-em-dez-2024",
      prompt: "Na última pesquisa Focus de dezembro de 2024, qual era a mediana das expectativas do mercado para o IPCA do ano de 2025?",
      expectedTools: ["bcb_focus_referencias", "bcb_focus_expectativas"],
      script: [
        { tool: "bcb_focus_referencias", args: { indicador: "IPCA", escopo: "anual" } },
        { tool: "bcb_focus_expectativas", args: { indicador: "IPCA", horizonte: "anual", referencia: "2025", dataInicial: "2024-12-20", dataFinal: "2024-12-31" } },
      ],
      answer: { kind: "number", value: 4.99, tolerance: 0.02 },
      trap: "O indicador do Focus tem texto EXATO; adivinhar o nome devolve vazio. As referências vêm primeiro.",
      note: "Fluxo em dois passos do Focus.",
    },
    {
      id: "focus-selic-reuniao-r1-2025",
      prompt: "O que o mercado (Focus) esperava, na última semana de 2024, para a taxa Selic ao fim da primeira reunião do Copom de 2025?",
      expectedTools: ["bcb_focus_selic"],
      script: [{ tool: "bcb_focus_selic", args: { reuniao: "R1/2025", dataInicial: "2024-12-23", dataFinal: "2024-12-31" } }],
      answer: { kind: "number", value: 13.25, tolerance: 0.01 },
      trap: "O eixo é a REUNIÃO (R1/2025), não o ano-calendário; usar bcb_focus_expectativas com horizonte anual responde outra pergunta.",
      note: "Focus por reunião.",
    },
    {
      id: "igpm-por-nome-2023",
      prompt: "Quanto acumulou o IGP-M no ano de 2023? Não sei o código da série, descubra.",
      expectedTools: ["bcb_buscar_serie"],
      script: [
        { tool: "bcb_buscar_serie", args: { termo: "IGP-M", limite: 5 } },
        { tool: "bcb_serie_valores", args: { codigo: 189, dataInicial: "2023-01-01", dataFinal: "2023-12-31", frequencia: "anual", agregacao: "acumulada" } },
      ],
      answer: { kind: "number", value: -3.18, tolerance: 0.01 },
      trap: "Série pedida por NOME: exige descoberta antes da leitura. Até a 1.15.0 o termo \"IGP-M\" devolvia ZERO em bcb_buscar_serie (o hífen não casava — corrigido no @sbissoli/mcp-search 0.7.0 / bcb 1.15.1); a rodada mede o servidor corrigido. O IGP-M também é variação (acumular, não subtrair).",
      note: "Descoberta → leitura.",
    },
    {
      id: "serie-inexistente-99999",
      prompt: "Me traga os últimos 12 valores da série 99999 do SGS e calcule a média deles.",
      expectedTools: ["bcb_serie_ultimos", "bcb_serie_metadados"],
      script: [{ tool: "bcb_serie_ultimos", args: { codigo: 99999, quantidade: 12 } }],
      answer: { kind: "regex", pattern: "n[aã]o (existe|foi encontrad|encontrei|h[aá] (s[eé]rie|dados))|inexistente|n[aã]o consta" },
      trap: "Código inexistente: o SGS demora até o erro definitivo (~30 s). A chamada ruim clássica é repetir a mesma leitura ou tentar as irmãs (ultimos → valores → metadados) com o mesmo código.",
      maxSteps: 8,
      note: "A armadilha central da métrica (a) e (c).",
    },
    {
      id: "ptax-simbolo-errado",
      prompt: "Qual foi a cotação PTAX de venda do dólar americano em 15/03/2024? Use o código de moeda 'US$' na consulta.",
      expectedTools: ["bcb_cambio_cotacao", "bcb_cambio_moedas"],
      script: [
        { tool: "bcb_cambio_cotacao", args: { moeda: "US$", data: "2024-03-15" } },
        { tool: "bcb_cambio_moedas", args: { termo: "dólar" } },
        { tool: "bcb_cambio_cotacao", args: { moeda: "USD", data: "2024-03-15" } },
      ],
      answer: { kind: "number", value: 4.9937, tolerance: 0.002 },
      trap: "Símbolo errado devolve resposta VAZIA (não erro): o esquema que não recusa responde outra pergunta. O caminho certo passa por bcb_cambio_moedas.",
      note: "Ausência com 200.",
    },
    {
      id: "correlacao-selic-dolar-2022",
      prompt: "Em 2022, a Selic mensal e o dólar PTAX de venda andaram juntos? Dê o coeficiente de correlação mensal e interprete em uma frase.",
      expectedTools: ["bcb_correlacao"],
      script: [{ tool: "bcb_correlacao", args: { codigos: [4390, 1], dataInicial: "2022-01-01", dataFinal: "2022-12-31", frequencia: "mensal" } }],
      trap: "Fronteira comparar × correlacao: 'andaram juntos' pede UM número sobre as duas, não um ranking.",
      note: "Estatística derivada.",
    },
    {
      id: "metadados-serie-4390",
      prompt: "Sobre a série 4390 do SGS: o que ela mede, qual a periodicidade e a unidade, e desde quando existe?",
      expectedTools: ["bcb_serie_metadados"],
      script: [{ tool: "bcb_serie_metadados", args: { codigo: 4390 } }],
      answer: { kind: "regex", pattern: "mensal" },
      trap: "Pergunta de metadado, não de valor: ler os valores para inferir a periodicidade é desperdício (e chamada a mais).",
      note: "Controle barato.",
    },
  ],
};

export default TASK_SET;
