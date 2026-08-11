/**
 * Camada de tradução do OData do Olinda (Expectativas/Focus e PTAX).
 *
 * O PLANO da fase chama o Olinda de "genuinamente penoso", e as medições da
 * abertura (`bcb/docs/01`) explicam por quê — cada fato aqui virou uma regra
 * desta camada:
 *
 * - **Não há paginação**: sem `@odata.nextLink`, sem page size padrão, sem corte
 *   server-side. `$top` alto devolve tudo (47.984 linhas / 11,3 MB numa medição).
 * - **`$count=true` é IGNORADO** (a resposta não traz `@odata.count`), então a
 *   contagem é sempre client-side.
 * - **Consulta sem filtro não completa** (~40 s sem resposta). Por isso toda
 *   tool desta camada monta filtro por construção: o indicador é obrigatório e a
 *   janela de coleta tem padrão, nunca fica em aberto.
 * - **`$orderby` não é usado de propósito**: já recebemos o conjunto inteiro, e
 *   ordenar do lado do cliente elimina uma classe de falha no servidor.
 *
 * O que NUNCA entra aqui: `ExpectativasMercadoInstituicoes`, desativado pelo BCB
 * por risco de quebra de confidencialidade da autoria dos microdados. Não expor,
 * não reconstruir, não cachear.
 */

import { fetchBcbApi } from "./shared.js";

export const OLINDA_BASE = "https://olinda.bcb.gov.br/olinda/servico";
export const EXPECTATIVAS_ODATA = `${OLINDA_BASE}/Expectativas/versao/v1/odata`;
export const PTAX_ODATA = `${OLINDA_BASE}/PTAX/versao/v1/odata`;

/** Teto de linhas que pedimos numa consulta — a fonte não impõe nenhum. */
export const OLINDA_MAX_LINHAS = 5000;

/** Literal de string em OData: aspas simples, com `'` duplicado por escape. */
export function odataString(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

export interface ConsultaOData {
  recurso: string;
  filtro?: string[];
  select?: string[];
  top?: number;
}

/**
 * Monta a URL de um recurso OData. `$format=json` é explícito mesmo sendo o
 * padrão, porque a mesma URL vai na proveniência e precisa ser reproduzível por
 * quem colar no navegador.
 */
export function montarUrlOData(base: string, consulta: ConsultaOData): string {
  const partes = ["$format=json"];
  if (consulta.select?.length) partes.push(`$select=${consulta.select.join(",")}`);
  if (consulta.filtro?.length) partes.push(`$filter=${encodeURIComponent(consulta.filtro.join(" and "))}`);
  if (consulta.top) partes.push(`$top=${consulta.top}`);
  return `${base}/${consulta.recurso}?${partes.join("&")}`;
}

/**
 * Executa a consulta e devolve as linhas de `value`. Contagem é client-side por
 * obrigação (`$count` ignorado pela fonte), então quem chama conta o array.
 */
export async function consultarOData(
  url: string,
  timeoutMs?: number,
  maxRetries?: number
): Promise<Array<Record<string, unknown>>> {
  const resposta = (await fetchBcbApi(url, timeoutMs, maxRetries)) as { value?: unknown };

  if (!resposta || !Array.isArray(resposta.value)) {
    throw new Error("Resposta inesperada do Olinda: payload OData sem a coleção `value`");
  }

  return resposta.value as Array<Record<string, unknown>>;
}

// ==================== DATAS ====================

/** `yyyy-MM-dd` do momento atual (o Olinda filtra por data ISO). */
export function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function somarDiasIso(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Aceita `yyyy-MM-dd` ou `dd/MM/yyyy` e normaliza para ISO. */
export function paraIso(data: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

/**
 * A PTAX recebe data nos parâmetros de função no formato **MM-DD-YYYY** — não é
 * ISO nem o dd/MM/yyyy do SGS. É a pegadinha da API e mora só aqui.
 */
export function paraDataPtax(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${mes}-${dia}-${ano}`;
}

/** Número do OData que pode vir como string; devolve null em vez de NaN. */
export function numeroOuNulo(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string" && valor.trim() !== "") {
    const n = Number(valor.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function textoOuNulo(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}
