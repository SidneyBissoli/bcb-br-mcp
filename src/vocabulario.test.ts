/**
 * O vocabulário da pergunta contra o da fonte.
 *
 * Os casos são os MEDIDOS em 2026-09-16 nas duas camadas da busca — o
 * catálogo curado (135 séries) e o índice do Portal de Dados Abertos (3.579
 * séries por código): "deficit", "calote", "juros basicos", "desemprego",
 * "arrecadacao", "gasto", "investimento estrangeiro" e "conta corrente"
 * devolviam ZERO, com a série existindo sob a palavra do BCB. A curadoria é a
 * REAL (SERIES_POPULARES); os slugs abaixo são os reais do package_list do
 * portal, lidos no mesmo dia — nada aqui prova uma tabela contra si mesma.
 */

import { describe, expect, it } from "vitest";
import { buscarSeries, parsePackageList } from "./catalog.js";
import { SERIES_POPULARES } from "./tools.js";
import { casaBusca, expandirBusca, normalizar, notasDeVocabulario, palavrasPerguntadas } from "./vocabulario.js";

// Slugs REAIS do package_list do portal em 2026-09-16.
const SLUGS = [
  "4639-nfsp-sem-desvalorizacao-cambial---fluxo-mensal-corrente---resultado-primario---total---governo",
  "4573-nfsp-sem-desvalorizacao-cambial---fluxo-mensal-corrente---resultado-nominal---total---governo-",
  "13667-inadimplencia-da-carteira-de-credito-das-instituicoes-financeiras-sob-controle-publico---tota",
  "22702-transacoes-correntes---mensal---receita",
  "22703-transacoes-correntes---mensal---despesa",
  "22864-investimento-direto---mensal---liquido",
  "22701-transacoes-correntes---mensal---saldo",
  "24031-ativo---outros-investimentos---emprestimos---estoque",
  "432-taxa-de-juros---meta-selic-definida-pelo-copom",
  "1-taxa-de-cambio---livre---dolar-americano-venda---diario"
];
const entradas = parsePackageList(SLUGS).entradas;

const busca = (q: string) => buscarSeries(q, SERIES_POPULARES, entradas, 100);
const codigos = (q: string) => busca(q).series.map(s => s.codigo);

describe("a fixture é o catálogo, não uma invenção", () => {
  it("os códigos curados que os casos esperam existem em SERIES_POPULARES", () => {
    for (const c of [432, 24369, 5364, 5793, 22701, 22885, 21082]) {
      expect(SERIES_POPULARES.some(s => s.codigo === c), `código ausente da curadoria: ${c}`).toBe(true);
    }
  });

  it("todo slug da fixture tem código e é aceito pelo parser do package_list", () => {
    expect(entradas).toHaveLength(SLUGS.length);
  });
});

describe("expansão de termo", () => {
  it("sinônimo medido: deficit → resultado primario, resultado nominal", () => {
    expect(expandirBusca("déficit")[0].padroes).toEqual(expect.arrayContaining(["resultado primario", "resultado nominal"]));
  });

  it("frase da tabela vira UM termo: 'conta corrente' não morre no 'corrente'", () => {
    const e = expandirBusca("conta corrente");
    expect(e).toHaveLength(1);
    expect(e[0].padroes).toContain("transacoes correntes");
  });

  it("stopword não entra no AND: 'taxa de juros' → taxa, juros", () => {
    expect(expandirBusca("taxa de juros").map(e => e.termo)).toEqual(["taxa", "juros"]);
  });

  it("o próprio termo vem primeiro — expandir nunca perde o que já casava", () => {
    expect(expandirBusca("selic")[0].padroes[0]).toBe("selic");
    expect(normalizar("Câmbio")).toBe("cambio");
  });

  it("plural: gastos → gasto → despesa", () => {
    expect(expandirBusca("gastos")[0].padroes).toContain("despesa");
  });
});

describe("busca com o vocabulário do usuário", () => {
  it("deficit e superavit acham o resultado primário (curado na frente) e o nominal (índice)", () => {
    expect(codigos("déficit")).toContain(5793);
    expect(codigos("deficit")).toContain(4573);
    expect(busca("superávit").series[0]?.origem).toBe("curado");
  });

  it("calote acha inadimplência", () => {
    expect(codigos("calote")).toContain(21082);
    expect(codigos("calote")).toContain(13667);
  });

  it("juros básicos acha a Selic", () => {
    expect(codigos("juros básicos")).toContain(432);
  });

  it("desemprego acha a taxa de desocupação", () => {
    expect(codigos("desemprego")).toEqual([24369]);
  });

  it("arrecadação e gasto acham receita e despesa", () => {
    expect(codigos("arrecadação")).toContain(5364);
    expect(codigos("gasto")).toContain(22703);
  });

  it("investimento estrangeiro acha investimento direto; conta corrente acha transações correntes", () => {
    expect(codigos("investimento estrangeiro")).toContain(22885);
    expect(codigos("investimento estrangeiro")).toContain(22864);
    expect(codigos("conta corrente")).toContain(22701);
  });

  it("empréstimo segue achando só o que o portal chama de empréstimo — mapear para crédito afogaria o achado", () => {
    const c = codigos("empréstimo");
    expect(c).toContain(24031);
    expect(c).not.toContain(21082);
    expect(busca("empréstimo").notas).toEqual([]);
  });

  it("taxa de juros acha a Selic apesar do 'de'", () => {
    expect(codigos("taxa de juros")).toContain(432);
  });

  it("o que já funcionava continua funcionando: dolar, e o código exato", () => {
    expect(codigos("dolar")).toContain(1);
    expect(busca("432").series.map(s => s.codigo)).toEqual([432]);
  });

  it("termo sem correspondência nenhuma segue devolvendo zero — expandir não inventa série", () => {
    expect(busca("ibovespa").total).toBe(0);
    expect(busca("salario minimo").total).toBe(0);
    expect(busca("bitcoin").total).toBe(0);
  });
});

describe("a tradução é dita, não é silenciosa", () => {
  it("a nota nomeia o termo e a palavra do BCB", () => {
    const { notas } = busca("calote");
    expect(notas).toHaveLength(1);
    expect(notas[0]).toContain('"calote"');
    expect(notas[0]).toContain("inadimplencia");
  });

  it("termo que já é o do BCB não gera nota, nem o mero plural ou acento", () => {
    expect(busca("selic").notas).toEqual([]);
    expect(busca("juros").notas).toEqual([]);
    expect(notasDeVocabulario(expandirBusca("câmbios"))).toEqual([]);
  });
});

describe("a ponta inversa, para o acervo de search (Deep Research)", () => {
  it("uma série de resultado primário é encontrável por deficit e superavit", () => {
    const k = palavrasPerguntadas("NFSP - Resultado primário - Total - Setor público consolidado");
    expect(k).toEqual(expect.arrayContaining(["deficit", "superavit"]));
  });

  it("uma série de inadimplência é encontrável por calote", () => {
    expect(palavrasPerguntadas("Inadimplência da carteira de crédito - Total")).toContain("calote");
  });

  it("nome sem palavra da tabela não ganha keyword", () => {
    expect(palavrasPerguntadas("Taxa de câmbio - Livre - Dólar americano (venda) - diário")).toEqual([]);
    expect(casaBusca(normalizar("Taxa de câmbio"), expandirBusca("selic"))).toBe(false);
  });
});
