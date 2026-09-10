import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classifyError, errorText, paramNames } from "./call-shape.js";

/**
 * A FORMA da chamada. O teste que importa aqui é a GUARDA: ele varre as
 * mensagens de erro do próprio `src/` e reprova se alguma cair em `outro`.
 *
 * Foi escrito assim de propósito. A primeira versão do classificador nasceu
 * das mensagens do senado que eu tinha lido à mão, e quando passei a varredura
 * pelo bcb, 13 das 18 mensagens caíam em `outro` — a telemetria não
 * responderia nada para este servidor. Uma lista de literais copiados aqui
 * fossilizaria o dia da varredura e não diria nada sobre a mensagem que
 * alguém acrescentar amanhã; a guarda continua verdadeira sozinha.
 */

const SRC = dirname(fileURLToPath(import.meta.url));

/** Junta os literais adjacentes de uma chamada — o formatador quebra a
 * mensagem em várias strings, e ler só a primeira falseia a classificação. */
const CHAMADA = /erroResult\(([\s\S]{10,1200}?)\n?\s*\);/g;
const LITERAL = /(["'`])((?:\\.|(?!\1)[\s\S])*)\1/g;

function mensagensDeErro(): string[] {
  const achadas = new Set<string>();
  const ande = (dir: string): void => {
    for (const entrada of readdirSync(dir)) {
      const caminho = join(dir, entrada);
      if (statSync(caminho).isDirectory()) {
        ande(caminho);
        continue;
      }
      if (!entrada.endsWith(".ts") || entrada.includes(".test.")) continue;
      const fonte = readFileSync(caminho, "utf8");
      for (const chamada of fonte.matchAll(CHAMADA)) {
        const partes = [...chamada[1].matchAll(LITERAL)].map((p) => p[2]);
        if (partes.length === 0) continue;
        const texto = partes.join("").replace(/\$\{[^}]*\}/g, "X").replace(/\s+/g, " ").trim();
        // Exige espaco: literais colados sem prosa (uma lista de nomes de
        // parametro, por exemplo) nao sao mensagem e nao se classificam.
        if (texto.length > 15 && /\s/.test(texto)) achadas.add(texto);
      }
    }
  };
  ande(SRC);
  return [...achadas];
}

/** Mensagem que só repassa o texto de cima ("Erro ao consultar X: ${e}"). O
 * sinal dela chega em tempo de execução, no trecho interpolado. */
const REPASSE = /:\s*X\.?$/;

describe("guarda: as mensagens deste servidor são classificáveis", () => {
  const mensagens = mensagensDeErro();

  it("a varredura encontra as mensagens (senão a guarda passaria vazia)", () => {
    expect(mensagens.length).toBeGreaterThan(10);
  });

  it("nenhuma mensagem própria cai em `outro`", () => {
    const orfas = mensagens.filter((m) => !REPASSE.test(m) && classifyError(m) === "outro");
    expect(orfas, `sem classe:\n${orfas.map((m) => `  - ${m}`).join("\n")}`).toEqual([]);
  });
});

describe("classifyError separa a bifurcação do conserto", () => {
  it("parâmetro que falta ou combinação proibida é contrato", () => {
    expect(classifyError('O horizonte "anual" exige `referencia` no formato yyyy.')).toBe("contrato");
    expect(classifyError("`suavizada` só existe nos horizontes rolantes.")).toBe("contrato");
    expect(classifyError("Informe `codigoReuniao`, ou `sigla` da comissão.")).toBe("contrato");
    expect(classifyError('Índice de preços desconhecido: "X". Aceitos: 433, 189.')).toBe("contrato");
  });

  it("chamou certo, mas não há dado, é nao_encontrado", () => {
    expect(classifyError("A série 433 não retornou dados entre 2030 e 2031.")).toBe("nao_encontrado");
    expect(classifyError('A fonte não publica Top 5 para o horizonte "anual".')).toBe("nao_encontrado");
  });

  it("`erro desconhecido` NÃO é contrato — é o caso sem classe", () => {
    // Achado ao inspecionar o ibge: a primeira versão da ampliação lia o
    // radical "desconhecid" e classificava este erro genérico como contrato.
    expect(classifyError("Erro desconhecido ao consultar calendário do IBGE.")).toBe("outro");
    expect(classifyError('Índice de preços desconhecido: "X". Aceitos: 433.')).toBe("contrato");
  });

  it("nenhum X encontrado é nao_encontrado, com o substantivo que for", () => {
    expect(classifyError("Nenhum evento encontrado para os critérios informados.")).toBe("nao_encontrado");
    expect(classifyError("Nenhuma reunião encontrada no período.")).toBe("nao_encontrado");
  });

  it("erro de validação do zod é contrato", () => {
    expect(classifyError("Validation error: codigo: Expected number")).toBe("contrato");
  });

  it("a fonte falhou ou demorou é fonte", () => {
    expect(classifyError("Tempo esgotado ao consultar a fonte")).toBe("fonte");
    expect(classifyError("Fonte devolveu 503")).toBe("fonte");
  });

  it("`informe` no MEIO da frase não sequestra um não encontrado", () => {
    // `informe` é testado DEPOIS de não-encontrado justamente por isso: é o
    // sinal mais fraco dos dois e não pode sequestrar a classe.
    expect(classifyError("Não existe reunião com esse código. Informe um código válido.")).toBe(
      "nao_encontrado",
    );
  });

  it("um código com 5 no meio não vira erro 5xx", () => {
    expect(classifyError("Não existe série com o código 591234.")).toBe("nao_encontrado");
  });
});

describe("paramNames nunca deixa passar valor", () => {
  it("devolve os NOMES, em ordem", () => {
    const s = paramNames([{ indicador: "IPCA", horizonte: "anual", referencia: "2026" }]);
    expect(s).toBe("horizonte,indicador,referencia");
    expect(s).not.toContain("IPCA");
    expect(s).not.toContain("2026");
  });

  it("aguenta chamada sem argumento, estranha ou com array", () => {
    expect(paramNames([])).toBe("");
    expect(paramNames([null])).toBe("");
    expect(paramNames(["texto"])).toBe("");
    expect(paramNames([["a", "b"]])).toBe("");
  });

  it("ignora parâmetro ausente e corta o que não cabe no blob", () => {
    expect(paramNames([{ codigo: 433, extra: undefined }])).toBe("codigo");
    const muitos = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`parametro_numero_${i}`, 1]));
    expect(paramNames([muitos]).length).toBeLessThanOrEqual(200);
  });
});

describe("errorText lê o texto que o handler devolveu", () => {
  it("erroResult daqui é texto puro em content[0]", () => {
    expect(errorText({ content: [{ type: "text", text: "falhou" }], isError: true })).toBe("falhou");
  });

  it("não quebra sem conteúdo", () => {
    expect(errorText({})).toBe("");
    expect(errorText(null)).toBe("");
    expect(errorText({ content: [] })).toBe("");
  });
});
