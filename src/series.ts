/**
 * Engenharia de série do SGS: periodicidade, janelas, chunking e harmonização.
 *
 * Este é o módulo do **D1**. Tudo aqui existe por um limite MEDIDO da origem em
 * 11/08/2026 (`bcb/docs/04-limites-sgs-medidos.md`) — não por precaução:
 *
 * - **Janela de 10 anos, só em série diária, erro 406.** A fronteira é exata ao
 *   dia e o limite é inclusivo: 10 anos justos passam, 10 anos e 1 dia não. E
 *   vale sobre a janela IMPLÍCITA — sem `dataFinal` a origem assume hoje; sem
 *   `dataInicial`, o início da série (que quase sempre estoura os 10 anos).
 * - **O 406 identifica a periodicidade** ("séries de periodicidade diária") e se
 *   mostrou estável nas oito medições em que apareceu. Por isso o chunking é
 *   REATIVO: quem diz que a série é diária é a origem, não um palpite nosso.
 * - **Janela legal também precisa ser fatiada.** Dez anos de série diária
 *   custam 10–20 s (~4–8 ms por observação) e há corte por volta de 30 s que
 *   devolve HTML com 200. O worker tem timeout de 10 s: uma janela decenal que a
 *   origem ACEITA não completa no canal hospedado. A fatia é de 3 anos (~2,6 s),
 *   não de 10.
 * - **Não há endpoint de metadados** (404 `endpoint not found!`), então a
 *   periodicidade de um código arbitrário se descobre pelo espaçamento das
 *   datas. `ultimos/20` custa 75–340 ms e serve de sonda.
 *
 * A harmonização de frequências vive aqui pelo mesmo motivo: reamostrar exige
 * saber a periodicidade de origem, e é este módulo que a conhece.
 */

import { ErroHttpBcb, fetchBcbApi, type SerieValor } from "./shared.js";

export const BCB_SGS_BASE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";

/** Teto da origem para `dados/ultimos/N`, em TODA periodicidade (medido). */
export const TETO_ULTIMOS = 20;

/** Janela máxima que a origem aceita em série diária. */
export const JANELA_MAX_ANOS = 10;

/**
 * Fatia do chunking. Não é o limite da origem (10) de propósito: a 3 anos a
 * requisição custa ~2,6 s e cabe nos 10 s de timeout do worker; a 10 anos custa
 * 10–20 s e não cabe.
 */
export const FATIA_ANOS = 3;

/** Requisições simultâneas por série. O portal pede parcimônia (~≤5 req/s). */
export const CONCORRENCIA = 3;

/**
 * Sobra de janela que a última fatia absorve em vez de virar requisição própria.
 * Sem isto, pedir 01/01/2010–01/01/2025 gastaria uma requisição inteira para
 * buscar o dia 01/01/2025 sozinho.
 */
const SOBRA_ABSORVIDA_DIAS = 60;

/**
 * Acima desta largura de janela vale gastar a sonda de periodicidade ANTES da
 * consulta: 80–340 ms para descobrir se o que vem é uma requisição de 20 s.
 */
const LARGURA_QUE_PEDE_SONDA_ANOS = FATIA_ANOS;

// ==================== PERIODICIDADE ====================

export type Periodicidade = "diaria" | "semanal" | "mensal" | "trimestral" | "anual" | "irregular";

/** Rótulo em pt-BR para a resposta das tools (a superfície é pt-BR). */
export const ROTULO_PERIODICIDADE: Record<Periodicidade, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  mensal: "Mensal",
  trimestral: "Trimestral",
  anual: "Anual",
  irregular: "Irregular"
};

/** `dd/MM/yyyy` (formato do SGS) para epoch UTC; `null` se não casar. */
export function parseDataSgs(data: string): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data.trim());
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const t = Date.UTC(Number(ano), Number(mes) - 1, Number(dia));
  return Number.isFinite(t) ? t : null;
}

export function formatarDataSgs(epoch: number): string {
  const d = new Date(epoch);
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

const DIA_MS = 86400000;

/**
 * Periodicidade pelo espaçamento MEDIANO entre observações consecutivas.
 *
 * A mediana, e não a média: série diária tem buracos de feriado e fim de semana
 * (espaçamentos de 1 a 4 dias, e às vezes mais), e um buraco grande arrastaria a
 * média para a faixa da semanal. Com menos de 3 observações não há espaçamento
 * suficiente para afirmar nada — devolve `null`, que quem chama traduz como
 * "desconhecida" em vez de inventar.
 */
export function inferirPeriodicidade(observacoes: Array<{ data: string }>): Periodicidade | null {
  const epochs = observacoes
    .map(o => parseDataSgs(o.data))
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);

  if (epochs.length < 3) return null;

  const gaps: number[] = [];
  for (let i = 1; i < epochs.length; i++) gaps.push((epochs[i] - epochs[i - 1]) / DIA_MS);
  gaps.sort((a, b) => a - b);

  const meio = Math.floor(gaps.length / 2);
  const mediana = gaps.length % 2 === 1 ? gaps[meio] : (gaps[meio - 1] + gaps[meio]) / 2;

  if (mediana <= 4) return "diaria";
  if (mediana <= 10) return "semanal";
  if (mediana <= 45) return "mensal";
  if (mediana <= 135) return "trimestral";
  if (mediana <= 420) return "anual";
  return "irregular";
}

/**
 * Sonda de periodicidade: `ultimos/20` e inferência pelo espaçamento.
 *
 * É o substituto do endpoint de metadados que não existe. Devolve `null` (em vez
 * de propagar) quando a sonda falha: ela é uma otimização, e falhar nela não
 * pode derrubar a consulta que o usuário pediu de verdade.
 */
export async function sondarPeriodicidade(
  codigo: number,
  timeoutMs?: number,
  maxRetries?: number
): Promise<Periodicidade | null> {
  try {
    const url = `${BCB_SGS_BASE}.${codigo}/dados/ultimos/${TETO_ULTIMOS}?formato=json`;
    const dados = (await fetchBcbApi(url, timeoutMs, maxRetries)) as SerieValor[];
    if (!Array.isArray(dados)) return null;
    return inferirPeriodicidade(dados);
  } catch {
    return null;
  }
}

/** Dias que uma observação ocupa, por periodicidade — dimensiona janelas. */
const DIAS_POR_OBSERVACAO: Record<Periodicidade, number> = {
  diaria: 1.45, // dias corridos por dia útil (252 úteis / 365 corridos)
  semanal: 7,
  mensal: 30.5,
  trimestral: 91.5,
  anual: 365,
  irregular: 30.5
};

// ==================== JANELAS ====================

export interface Janela {
  /** `dd/MM/yyyy` */
  inicio: string;
  /** `dd/MM/yyyy` */
  fim: string;
}

/** Soma anos a um epoch UTC preservando o dia do mês (29/02 cai em 28/02). */
function somarAnos(epoch: number, anos: number): number {
  const d = new Date(epoch);
  const alvo = new Date(Date.UTC(d.getUTCFullYear() + anos, d.getUTCMonth(), d.getUTCDate()));
  if (alvo.getUTCMonth() !== d.getUTCMonth()) alvo.setUTCDate(0); // 29/02 -> 28/02
  return alvo.getTime();
}

/**
 * Fatia [inicio, fim] em janelas de no máximo `anos`, sem sobreposição.
 *
 * A origem trata a janela como fechada nas duas pontas, então a fatia seguinte
 * começa no dia SEGUINTE ao fim da anterior — sem isso, cada emenda duplicaria
 * uma observação. (A fusão remove duplicata de qualquer forma; isto evita pagar
 * por ela.)
 */
export function fatiarJanela(inicio: string, fim: string, anos: number = FATIA_ANOS): Janela[] {
  const t0 = parseDataSgs(inicio);
  const t1 = parseDataSgs(fim);
  if (t0 === null || t1 === null || t0 > t1) return [{ inicio, fim }];

  const janelas: Janela[] = [];
  let cursor = t0;

  while (cursor <= t1) {
    // -1 dia: a janela de N anos vai até a véspera do aniversário, e o próximo
    // corte começa no aniversário. Assim nenhuma data aparece em duas fatias.
    const corte = somarAnos(cursor, anos) - DIA_MS;
    // Sobra curta é absorvida na fatia corrente em vez de virar uma requisição
    // inteira por alguns dias. `anos` é escolha nossa de latência (3), não o
    // limite da origem (10) — esticar a última fatia continua legal e barato.
    const limite = t1 - corte <= SOBRA_ABSORVIDA_DIAS * DIA_MS ? t1 : Math.min(corte, t1);
    janelas.push({ inicio: formatarDataSgs(cursor), fim: formatarDataSgs(limite) });
    cursor = limite + DIA_MS;
  }

  return janelas;
}

// ==================== BUSCA COM CHUNKING ====================

export interface PedidoSerie {
  codigo: number;
  /** `dd/MM/yyyy` — já normalizado por quem chama. */
  dataInicial?: string;
  /** `dd/MM/yyyy` — já normalizado por quem chama. */
  dataFinal?: string;
}

export interface JanelaAplicada {
  dataInicial: string;
  dataFinal: string;
  motivo: string;
}

export interface ResultadoSerie {
  observacoes: SerieValor[];
  /** `null` quando não deu para inferir (menos de 3 observações). */
  periodicidade: Periodicidade | null;
  /** Presente só quando a consulta foi fatiada. */
  chunking?: { janelas: number; fatiaAnos: number };
  /** Presente só quando a janela pedida estava aberta e foi fechada por nós. */
  janelaAplicada?: JanelaAplicada;
  /** Requisições gastas à origem, contando a sonda. */
  requisicoes: number;
}

function urlSerie(codigo: number, inicio?: string, fim?: string): string {
  let url = `${BCB_SGS_BASE}.${codigo}/dados?formato=json`;
  if (inicio) url += `&dataInicial=${inicio}`;
  if (fim) url += `&dataFinal=${fim}`;
  return url;
}

/** `dd/MM/yyyy` de hoje — a origem usa este formato e o fuso do BCB é -03:00. */
export function hojeSgs(): string {
  return formatarDataSgs(Date.now());
}

function larguraEmAnos(inicio: string, fim: string): number {
  const t0 = parseDataSgs(inicio);
  const t1 = parseDataSgs(fim);
  if (t0 === null || t1 === null) return 0;
  return (t1 - t0) / (365.25 * DIA_MS);
}

/** Executa os thunks com no máximo `limite` em voo. Preserva a ordem. */
async function comConcorrencia<T>(thunks: Array<() => Promise<T>>, limite: number): Promise<T[]> {
  const saida: T[] = new Array(thunks.length);
  let proximo = 0;

  async function trabalhador(): Promise<void> {
    while (proximo < thunks.length) {
      const i = proximo++;
      saida[i] = await thunks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, thunks.length) }, trabalhador));
  return saida;
}

/** Funde as fatias: ordena por data e descarta data repetida na emenda. */
function fundir(partes: SerieValor[][]): SerieValor[] {
  const porData = new Map<number, SerieValor>();
  const semData: SerieValor[] = [];

  for (const parte of partes) {
    for (const obs of parte) {
      const t = parseDataSgs(obs.data);
      if (t === null) semData.push(obs);
      else if (!porData.has(t)) porData.set(t, obs);
    }
  }

  const ordenadas = [...porData.entries()].sort((a, b) => a[0] - b[0]).map(([, obs]) => obs);
  return [...ordenadas, ...semData];
}

async function buscarFatias(
  codigo: number,
  janelas: Janela[],
  timeoutMs?: number,
  maxRetries?: number,
  concorrencia: number = CONCORRENCIA
): Promise<SerieValor[][]> {
  return comConcorrencia(
    janelas.map(j => async () => {
      const dados = (await fetchBcbApi(urlSerie(codigo, j.inicio, j.fim), timeoutMs, maxRetries)) as SerieValor[];
      return Array.isArray(dados) ? dados : [];
    }),
    concorrencia
  );
}

/**
 * Busca uma série do SGS respeitando os limites da origem.
 *
 * Caminho normal (janela estreita ou série não-diária): UMA requisição, igual ao
 * que o servidor sempre fez. O trabalho extra só acontece quando é preciso:
 *
 * 1. Janela mais larga que a fatia ⇒ sonda a periodicidade (80–340 ms). Se for
 *    diária, já sai fatiando: evita a requisição de 10–20 s que morreria no
 *    timeout do worker.
 * 2. Consulta direta que volta **406** ⇒ a origem acabou de dizer que a série é
 *    diária e a janela é grande demais. Fatia e repete.
 * 3. Janela aberta em série diária (sem `dataInicial`, ou sem data nenhuma) ⇒
 *    não há como fatiar o que não tem começo, e a origem recusa a janela
 *    implícita. Aplicamos a janela máxima que ela própria aceita — 10 anos até
 *    `dataFinal` (ou até hoje) — e devolvemos isso explícito em
 *    `janelaAplicada`, para a resposta poder dizer o que fez e por quê. Truncar
 *    em silêncio seria o pior dos mundos.
 */
export async function buscarSerieSgs(
  pedido: PedidoSerie,
  timeoutMs?: number,
  maxRetries?: number,
  concorrencia?: number
): Promise<ResultadoSerie> {
  const { codigo } = pedido;
  let requisicoes = 0;

  const fatiarEBuscar = async (
    inicio: string,
    fim: string,
    janelaAplicada?: JanelaAplicada
  ): Promise<ResultadoSerie> => {
    const janelas = fatiarJanela(inicio, fim);
    const partes = await buscarFatias(codigo, janelas, timeoutMs, maxRetries, concorrencia);
    requisicoes += janelas.length;
    const observacoes = fundir(partes);

    return {
      observacoes,
      periodicidade: inferirPeriodicidade(observacoes),
      ...(janelas.length > 1 ? { chunking: { janelas: janelas.length, fatiaAnos: FATIA_ANOS } } : {}),
      ...(janelaAplicada ? { janelaAplicada } : {}),
      requisicoes
    };
  };

  // (1) Janela larga e fechada: a sonda paga por si se a série for diária.
  if (pedido.dataInicial && pedido.dataFinal &&
      larguraEmAnos(pedido.dataInicial, pedido.dataFinal) > LARGURA_QUE_PEDE_SONDA_ANOS) {
    const periodicidade = await sondarPeriodicidade(codigo, timeoutMs, maxRetries);
    requisicoes += 1;
    if (periodicidade === "diaria") {
      return fatiarEBuscar(pedido.dataInicial, pedido.dataFinal);
    }
  }

  // Caminho normal: uma requisição, como sempre foi.
  try {
    const dados = (await fetchBcbApi(
      urlSerie(codigo, pedido.dataInicial, pedido.dataFinal), timeoutMs, maxRetries
    )) as SerieValor[];
    requisicoes += 1;
    const observacoes = Array.isArray(dados) ? dados : [];
    return { observacoes, periodicidade: inferirPeriodicidade(observacoes), requisicoes };
  } catch (erro) {
    if (!(erro instanceof ErroHttpBcb) || erro.status !== 406) throw erro;
    requisicoes += 1;
  }

  // (2) e (3): o 406 confirmou série diária com janela grande demais.
  const fim = pedido.dataFinal ?? hojeSgs();

  if (pedido.dataInicial) {
    return fatiarEBuscar(pedido.dataInicial, fim);
  }

  const t1 = parseDataSgs(fim);
  const inicio = t1 === null ? fim : formatarDataSgs(somarAnos(t1, -JANELA_MAX_ANOS) + DIA_MS);

  return fatiarEBuscar(inicio, fim, {
    dataInicial: inicio,
    dataFinal: fim,
    motivo:
      `Série de periodicidade diária: a origem limita a consulta a ${JANELA_MAX_ANOS} anos e recusa ` +
      `janela aberta (HTTP 406). Foram devolvidos os ${JANELA_MAX_ANOS} anos até ${fim}. ` +
      `Informe dataInicial para outro período.`
  });
}

/**
 * Busca os N últimos valores, contornando o teto de 20 da origem.
 *
 * O `inputSchema` anuncia até 1000 desde sempre e a origem devolve **400** para
 * qualquer N acima de 20, em qualquer periodicidade — ou seja, a promessa nunca
 * foi cumprida. Em vez de reduzir o que o schema promete, cumprimos: a sonda dá
 * a periodicidade, a periodicidade dimensiona a janela de datas, e a janela vem
 * pelo caminho de `dados?dataInicial=...` (que não tem teto de linhas), fatiada
 * se for preciso. Devolve as N últimas observações.
 *
 * A margem de 1,6× na janela existe porque feriado, recesso e mês sem publicação
 * rarefazem a série: pedir exatamente o período nominal costuma voltar com menos
 * pontos do que o usuário pediu.
 */
export async function buscarUltimosSgs(
  codigo: number,
  quantidade: number,
  timeoutMs?: number,
  maxRetries?: number
): Promise<ResultadoSerie> {
  if (quantidade <= TETO_ULTIMOS) {
    const url = `${BCB_SGS_BASE}.${codigo}/dados/ultimos/${quantidade}?formato=json`;
    const dados = (await fetchBcbApi(url, timeoutMs, maxRetries)) as SerieValor[];
    const observacoes = Array.isArray(dados) ? dados : [];
    return { observacoes, periodicidade: inferirPeriodicidade(observacoes), requisicoes: 1 };
  }

  const periodicidade = (await sondarPeriodicidade(codigo, timeoutMs, maxRetries)) ?? "mensal";
  const fim = hojeSgs();
  const t1 = parseDataSgs(fim) as number;
  const diasNecessarios = Math.ceil(quantidade * DIAS_POR_OBSERVACAO[periodicidade] * 1.6);
  const inicio = formatarDataSgs(t1 - diasNecessarios * DIA_MS);

  const janelas = fatiarJanela(inicio, fim);
  const partes = await buscarFatias(codigo, janelas, timeoutMs, maxRetries);
  const todas = fundir(partes);
  const observacoes = todas.slice(-quantidade);

  return {
    observacoes,
    periodicidade: inferirPeriodicidade(observacoes) ?? periodicidade,
    ...(janelas.length > 1 ? { chunking: { janelas: janelas.length, fatiaAnos: FATIA_ANOS } } : {}),
    requisicoes: 1 + janelas.length
  };
}

// ==================== HARMONIZAÇÃO DE FREQUÊNCIAS ====================

export type FrequenciaAlvo = "mensal" | "trimestral" | "anual";
export type Agregacao = "ultimo" | "primeiro" | "media" | "soma" | "acumulada";

/** Ordem de granularidade: só se agrega para BAIXO nesta lista. */
const GRANULARIDADE: Record<Periodicidade | FrequenciaAlvo, number> = {
  diaria: 1, semanal: 2, mensal: 3, trimestral: 4, anual: 5, irregular: 0
};

export const ROTULO_AGREGACAO: Record<Agregacao, string> = {
  ultimo: "último valor do período",
  primeiro: "primeiro valor do período",
  media: "média aritmética dos valores do período",
  soma: "soma dos valores do período",
  acumulada: "variação acumulada por composição geométrica dos valores do período (em %)"
};

export interface ObservacaoHarmonizada {
  data: string;
  valor: number;
  /** Observações de origem que entraram neste ponto. */
  observacoes: number;
}

export interface ResultadoHarmonizacao {
  dados: ObservacaoHarmonizada[];
  frequencia: FrequenciaAlvo;
  agregacao: Agregacao;
  nota: string;
}

/** Chave e data canônica do período que contém `epoch`. */
function periodoDe(epoch: number, alvo: FrequenciaAlvo): { chave: string; data: string } {
  const d = new Date(epoch);
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth();

  if (alvo === "anual") {
    return { chave: `${ano}`, data: `01/01/${ano}` };
  }
  if (alvo === "trimestral") {
    const primeiroMesDoTri = Math.floor(mes / 3) * 3;
    return {
      chave: `${ano}-T${Math.floor(mes / 3) + 1}`,
      data: `01/${String(primeiroMesDoTri + 1).padStart(2, "0")}/${ano}`
    };
  }
  return { chave: `${ano}-${String(mes + 1).padStart(2, "0")}`, data: `01/${String(mes + 1).padStart(2, "0")}/${ano}` };
}

function agregar(valores: number[], agregacao: Agregacao): number {
  switch (agregacao) {
    case "primeiro": return valores[0];
    case "ultimo": return valores[valores.length - 1];
    case "media": return valores.reduce((a, b) => a + b, 0) / valores.length;
    case "soma": return valores.reduce((a, b) => a + b, 0);
    case "acumulada": return (valores.reduce((acc, v) => acc * (1 + v / 100), 1) - 1) * 100;
  }
}

/**
 * Reamostra a série para uma frequência mais grossa.
 *
 * Só agrega para baixo: pedir diária a partir de mensal exigiria inventar
 * observação, e este servidor não faz isso — devolve erro explícito.
 *
 * A escolha da agregação é do usuário porque **não existe padrão universal
 * correto**: nível de preço e taxa pedem `ultimo`, fluxo pede `soma`, e série
 * que JÁ É variação percentual (IPCA mensal, por exemplo) pede `acumulada` —
 * somar 12 variações mensais não dá a inflação do ano, e a média dá menos ainda.
 * Toda resposta harmonizada carrega a convenção usada e a marca de derivação.
 */
export function harmonizar(
  observacoes: Array<{ data: string; valor: number }>,
  alvo: FrequenciaAlvo,
  agregacao: Agregacao,
  origem: Periodicidade | null
): ResultadoHarmonizacao {
  if (origem && origem !== "irregular" && GRANULARIDADE[origem] > GRANULARIDADE[alvo]) {
    throw new Error(
      `Não é possível harmonizar de ${ROTULO_PERIODICIDADE[origem].toLowerCase()} para ${alvo}: ` +
      `desagregar exigiria inventar observações que a fonte não publica.`
    );
  }

  const grupos = new Map<string, { data: string; valores: number[] }>();

  for (const obs of observacoes) {
    const t = parseDataSgs(obs.data);
    if (t === null || !Number.isFinite(obs.valor)) continue;
    const { chave, data } = periodoDe(t, alvo);
    const g = grupos.get(chave);
    if (g) g.valores.push(obs.valor);
    else grupos.set(chave, { data, valores: [obs.valor] });
  }

  const dados = [...grupos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, g]) => ({
      data: g.data,
      valor: agregar(g.valores, agregacao),
      observacoes: g.valores.length
    }));

  const nota =
    `Valor derivado: série ${origem ? ROTULO_PERIODICIDADE[origem].toLowerCase() : "de periodicidade não identificada"} ` +
    `reamostrada para ${alvo} usando ${ROTULO_AGREGACAO[agregacao]}. ` +
    `O cálculo é do servidor, não do Banco Central; a data de cada ponto é o primeiro dia do período agregado.`;

  return { dados, frequencia: alvo, agregacao, nota };
}

// ==================== ALINHAMENTO DE GRADES ====================

export interface LinhaAlinhada {
  /** `dd/MM/yyyy` */
  data: string;
  /** Um valor por série, na ordem em que as séries entraram; `null` onde não há observação. */
  valores: Array<number | null>;
}

export interface ResultadoAlinhamento {
  linhas: LinhaAlinhada[];
  /** Datas em que TODAS as séries publicam. É o que entra num cálculo pareado. */
  completas: number;
  /** Datas em que ao menos uma série publica e ao menos uma não. */
  parciais: number;
}

/**
 * Alinha N séries pela data, na UNIÃO das datas, preservando a ordem de entrada.
 *
 * O alinhamento é separado do cálculo de propósito: é aqui que mora o erro caro.
 * Medido contra a origem em 11/08/2026: casar uma série DIÁRIA com uma MENSAL por
 * data devolve **7 datas de 12** no ano — os dias 1º que caíram em dia útil. Não dá
 * zero, que seria evidente; dá um punhado de pontos com o qual qualquer estatística
 * pareada produz um número de aparência saudável. Por isso `completas` e `parciais`
 * saem contados, e quem chama decide o que fazer com a diferença: correlacionar
 * séries de periodicidades diferentes sem harmonizar é recusado, não avisado.
 *
 * Séries de mesma periodicidade casam de verdade: dólar, Selic e CDI diários deram
 * 253 de 253 em 2024; IPCA e IGP-M mensais, 12 de 12 (todos no dia 1º).
 */
export function alinharSeries(
  series: Array<Array<{ data: string; valor: number }>>
): ResultadoAlinhamento {
  const porData = new Map<number, { data: string; valores: Array<number | null> }>();

  series.forEach((serie, indice) => {
    for (const obs of serie) {
      const t = parseDataSgs(obs.data);
      if (t === null || !Number.isFinite(obs.valor)) continue;
      let linha = porData.get(t);
      if (!linha) {
        linha = { data: obs.data, valores: new Array<number | null>(series.length).fill(null) };
        porData.set(t, linha);
      }
      // Data repetida na mesma série (emenda de fatia já deduplicada): o primeiro fica.
      if (linha.valores[indice] === null) linha.valores[indice] = obs.valor;
    }
  });

  const linhas = [...porData.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, linha]) => linha);

  let completas = 0;
  for (const linha of linhas) {
    if (linha.valores.every(v => v !== null)) completas++;
  }

  return { linhas, completas, parciais: linhas.length - completas };
}

// ==================== DEFLAÇÃO ====================

/**
 * Deflator construído por ENCADEAMENTO de variações mensais.
 *
 * Existe encadeado porque a origem não deixa alternativa: **o SGS não publica
 * número-índice do IPCA** — o índice do Portal de Dados Abertos não tem nenhuma série
 * de número-índice, só variações. Encadear é reconstruir o índice a partir delas.
 *
 * A reconstrução foi medida contra a própria fonte em 11/08/2026: compor 12 variações
 * mensais da série 433 reproduz o acumulado em 12 meses que o BCB publica na série
 * 13522 com erro máximo de **0,0052 pp** em 85 janelas de 2018 a 2025. O resíduo é o
 * arredondamento da fonte, que publica a variação com 2 casas — não é erro do método.
 */
export interface Deflator {
  /** Chave `yyyy-MM` → fator que leva o valor daquele mês a preços do mês base. */
  fatores: Map<string, number>;
  /** `MM/yyyy` do mês em cujos preços os valores são expressos. */
  mesBase: string;
  /** `MM/yyyy` do primeiro e do último mês cobertos pelo deflator. */
  primeiroMes: string;
  ultimoMes: string;
}

/** `yyyy-MM` do mês que contém a data `dd/MM/yyyy`; `null` se a data não casar. */
export function chaveMes(data: string): string | null {
  const t = parseDataSgs(data);
  if (t === null) return null;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function mesLegivel(chave: string): string {
  const [ano, mes] = chave.split("-");
  return `${mes}/${ano}`;
}

/**
 * Monta o deflator a partir das variações mensais publicadas (em %).
 *
 * O fator de um mês é `L(base) / L(mês)`, onde `L` é o nível do índice reconstruído.
 * A forma de razão, em vez de compor só as variações posteriores, é o que permite o
 * mês base ficar em QUALQUER posição — inclusive no meio ou antes do período, que é o
 * caso de "quanto valia, em reais de 2010, o salário de 2024".
 */
export function construirDeflator(
  variacoes: Array<{ data: string; valor: number }>,
  mesBaseSolicitado?: string
): Deflator {
  const porMes = new Map<string, number>();
  for (const obs of variacoes) {
    const chave = chaveMes(obs.data);
    if (chave !== null && Number.isFinite(obs.valor)) porMes.set(chave, obs.valor);
  }

  const meses = [...porMes.keys()].sort();
  if (meses.length === 0) {
    throw new Error("O índice de preços não devolveu observações no período necessário para deflacionar.");
  }

  // Nível do índice: o mês anterior ao primeiro vale 1, e cada mês aplica a sua variação.
  const nivel = new Map<string, number>();
  let atual = 1;
  for (const mes of meses) {
    atual *= 1 + porMes.get(mes)! / 100;
    nivel.set(mes, atual);
  }

  const mesBase = mesBaseSolicitado && nivel.has(mesBaseSolicitado)
    ? mesBaseSolicitado
    : meses[meses.length - 1];
  const nivelBase = nivel.get(mesBase)!;

  const fatores = new Map<string, number>();
  for (const mes of meses) fatores.set(mes, nivelBase / nivel.get(mes)!);

  return {
    fatores,
    mesBase: mesLegivel(mesBase),
    primeiroMes: mesLegivel(meses[0]),
    ultimoMes: mesLegivel(meses[meses.length - 1])
  };
}

export interface ObservacaoDeflacionada {
  data: string;
  valorNominal: number;
  /** `null` quando a data cai fora da cobertura do índice de preços. */
  valorReal: number | null;
  /** `null` pelo mesmo motivo. */
  fator: number | null;
}

/**
 * Converte cada observação nominal a preços do mês base.
 *
 * Cada observação é deflacionada pelo fator do MÊS EM QUE ELA CAI, qualquer que seja
 * a periodicidade da série — o índice de preços é mensal, então todo dia de um mesmo
 * mês compartilha o fator, o que é a convenção certa para série diária. Em série
 * trimestral ou anual isso significa usar o mês da data do ponto; quem quiser outra
 * convenção (média do período, por exemplo) harmoniza a série antes com `frequencia`.
 *
 * Data fora da cobertura do índice devolve `null` em vez de valor: o IPCA começa em
 * 01/1980 e é publicado com defasagem, então observação anterior ao início ou
 * posterior ao último mês divulgado não tem como ser deflacionada. Nulo é a
 * informação de que ali não há dado — inventar fator 1 seria mentir.
 */
export function deflacionar(
  observacoes: Array<{ data: string; valor: number }>,
  deflator: Deflator
): ObservacaoDeflacionada[] {
  return observacoes.map(obs => {
    const chave = chaveMes(obs.data);
    const fator = chave === null ? undefined : deflator.fatores.get(chave);
    return fator === undefined
      ? { data: obs.data, valorNominal: obs.valor, valorReal: null, fator: null }
      : { data: obs.data, valorNominal: obs.valor, valorReal: obs.valor * fator, fator };
  });
}
