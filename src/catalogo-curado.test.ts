/**
 * Invariantes do catálogo curado, verificado contra a origem em 13/08/2026.
 *
 * Existe porque nada mais protegia esta lista. Ela foi montada sem verificação e
 * carregou por versões cerca de metade dos nomes conferíveis errados — séries
 * TROCADAS, não erros de digitação: 432 e 1178 uma no lugar da outra, 20540 e
 * 20541 com pessoa física e jurídica invertidas, 29033–29038 anunciadas como
 * expectativas do Focus quando são endividamento das famílias. Nada disso é
 * detectável por tipo, por lint ou por teste de comportamento: o servidor
 * respondia perfeitamente, com o nome errado.
 *
 * O que se pina aqui é o que a verificação estabeleceu, com o fato ao lado.
 * Nenhum destes testes toca a rede — a medição já foi feita e está em
 * `bcb/docs/06`; o que estes testes impedem é a regressão silenciosa.
 */

import { describe, it, expect } from "vitest";
import { SERIES_POPULARES, metodoVariacaoDaSerie, seriesEncadeadas } from "./tools.js";

describe("catálogo curado — integridade", () => {
  it("não tem código repetido", () => {
    const codigos = SERIES_POPULARES.map(s => s.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("toda entrada declara a procedência do nome", () => {
    const semProcedencia = SERIES_POPULARES.filter(s => s.fonteNome !== "portal" && s.fonteNome !== "medido");
    expect(semProcedencia).toEqual([]);
  });

  it("só quem tem dataset no portal declara unidade", () => {
    // `unidade` vem do dataset. Série sem dataset não tem de onde tirar unidade,
    // e inventá-la seria repetir o erro que este catálogo acabou de corrigir.
    const medidasComUnidade = SERIES_POPULARES.filter(s => s.fonteNome === "medido" && s.unidade !== undefined);
    expect(medidasComUnidade).toEqual([]);
  });

  it("periodicidade é um dos rótulos que a inferência produz", () => {
    const validos = new Set(["Diária", "Semanal", "Mensal", "Trimestral", "Anual", "Irregular"]);
    const invalidas = SERIES_POPULARES.filter(s => !validos.has(s.periodicidade));
    expect(invalidas).toEqual([]);
  });
});

describe("catálogo curado — o que a verificação contra a origem estabeleceu", () => {
  const nomeDe = (codigo: number) => SERIES_POPULARES.find(s => s.codigo === codigo)?.nome;
  const serie = (codigo: number) => SERIES_POPULARES.find(s => s.codigo === codigo);

  it("432 é a META do Copom e 1178 é a Selic efetiva — não o contrário", () => {
    // O dado arbitrou: em 12/08/2026 a 432 estava constante em 14,00 (meta entre
    // reuniões) e a 1178 oscilava entre 13,90 e 14,15 (taxa efetiva).
    expect(nomeDe(432)).toBe("Taxa de juros - Meta Selic definida pelo Copom");
    expect(nomeDe(1178)).toBe("Taxa de juros - Selic anualizada base 252");
  });

  it("11 é a Selic ao DIA e é diária — o rótulo antigo dizia mensal", () => {
    // A origem publica a 11 todo dia útil, com valor 0,05166 — percentual ao dia.
    // O rótulo "Mensal" do catálogo antigo chegou a causar recusa indevida em
    // `bcb_correlacao` (por isso a grade passou a ser decidida pela medição).
    expect(serie(11)?.periodicidade).toBe("Diária");
    expect(serie(11)?.unidade).toBe("Percentual ao dia");
  });

  it("29033–29038 são endividamento das famílias, não expectativas do Focus", () => {
    // Devolvem 10,68 e 49,83 em base mensal; expectativa de IPCA do Focus é
    // semanal e roda perto de 4–5. Quem quer Focus usa `bcb_focus_expectativas`.
    for (const codigo of [29033, 29034, 29035, 29036, 29037, 29038]) {
      expect(nomeDe(codigo)).toMatch(/(Comprometimento|Endividamento) de renda|Endividamento das famílias/);
      expect(serie(codigo)?.categoria).toBe("Crédito");
    }
  });

  it("20540 é pessoa JURÍDICA e 20541 é pessoa FÍSICA", () => {
    expect(nomeDe(20540)).toContain("Pessoas jurídicas");
    expect(nomeDe(20541)).toContain("Pessoas físicas");
  });

  it("4513 é dívida LÍQUIDA do setor público consolidado", () => {
    // 60,97–68,48 no período medido; a dívida bruta roda perto de 78%.
    expect(nomeDe(4513)).toBe("Dívida Líquida do Setor Público (% PIB) - Total - Setor público consolidado");
  });

  it("25 e 195 são rentabilidade da poupança, diária, e não saldo", () => {
    for (const codigo of [25, 195]) {
      expect(nomeDe(codigo)).toContain("Rentabilidade no período");
      expect(serie(codigo)?.periodicidade).toBe("Diária");
    }
  });

  it("10841–10843 são a quebra por DURABILIDADE, não os grupos de consumo", () => {
    expect(nomeDe(10841)).toContain("não-duráveis");
    expect(nomeDe(10842)).toContain("semi-duráveis");
    expect(nomeDe(10843)).toContain("Duráveis");
  });

  it("os códigos que a origem não reconhece ficaram FORA", () => {
    // 14, 13523, 21860 e 13690 devolvem a mesma página de "requisição inválida"
    // que um código inventado (999999999) — não existem no SGS. Estavam no
    // catálogo e eram oferecidos ao usuário.
    for (const codigo of [14, 13523, 21860, 13690]) {
      expect(SERIES_POPULARES.find(s => s.codigo === codigo)).toBeUndefined();
    }
  });

  it("as séries mortas e as desmentidas pelo dado ficaram FORA", () => {
    // 10845–10850: devolvem 0 desde 2014/2015. 12466–12468: param em 05/2023.
    // 7832: para em 08/2019. 21637–21640 e 29039–29040: mensais com magnitude
    // incompatível com o nome que traziam.
    for (const codigo of [10845, 10846, 10847, 10848, 10849, 10850,
                          12466, 12467, 12468, 7832,
                          21637, 21638, 21639, 21640, 29039, 29040]) {
      expect(SERIES_POPULARES.find(s => s.codigo === codigo)).toBeUndefined();
    }
  });

  it("as séries populares que o dado confirma continuam no catálogo", () => {
    // O corte não podia levar junto o que as pessoas de fato consultam.
    for (const codigo of [433, 13522, 188, 189, 1, 10813, 11, 432, 12, 226, 256, 4380, 24369]) {
      expect(SERIES_POPULARES.find(s => s.codigo === codigo)).toBeDefined();
    }
  });
});

/**
 * Sessão 10. A detecção de "série que já é variação" é PARCIAL por construção e
 * o conjunto está pinado para que uma mudança de catálogo não a mova em silêncio:
 * 10 pela `unidade` do portal ("Variação percentual mensal") + 14 pelo nome
 * curado ("... - Variação mensal") + 4 taxas por período (Selic/CDI acumulados
 * no mês, poupança — incluídas por decisão do decisor em 15/08/2026). A 13522
 * (acumulado em 12 meses) é recusada; tudo o mais — inclusive código fora do
 * catálogo — é nível.
 */
describe("catálogo curado — método de variação por série (sessão 10)", () => {
  it("as 28 séries encadeadas são exatamente estas", () => {
    expect(seriesEncadeadas().sort((a, b) => a - b)).toEqual(
      [188, 189, 190, 191, 193, 225, 433, 4449, 7447, 7450, 7478, 10764, 10841, 10842, 10843, 10844,
        11426, 11427, 11428, 16121, 16122, 17679, 17680, 21859, 4390, 4391, 25, 195].sort((a, b) => a - b)
    );
  });

  it("as cabeças de índice que dispararam o defeito são reconhecidas pelo NOME (não têm unidade do portal)", () => {
    for (const codigo of [433, 189, 188, 190]) {
      const info = SERIES_POPULARES.find(s => s.codigo === codigo)!;
      expect(info.unidade).toBeUndefined();
      expect(metodoVariacaoDaSerie(codigo)).toBe("encadeamento");
    }
  });

  it("acumulado móvel é recusado; nível e fora do catálogo ficam como nível", () => {
    expect(metodoVariacaoDaSerie(13522)).toBe("acumulado");
    expect(metodoVariacaoDaSerie(4390)).toBe("encadeamento");
    expect(metodoVariacaoDaSerie(1)).toBe("nivel");
    expect(metodoVariacaoDaSerie(4513)).toBe("nivel");
    expect(metodoVariacaoDaSerie(99999)).toBe("nivel");
  });
});
