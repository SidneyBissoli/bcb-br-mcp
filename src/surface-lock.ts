/**
 * A regra do `surface.lock.json`, num lugar só — a raiz (`declarada`) e o
 * Worker (`semToken`) a aplicam do mesmo jeito. Ver `src/surface.ts`.
 *
 * Regra: a seção guarda a versão do `package.json` em que foi travada. Se o
 * medido diverge do travado:
 *  - versão igual à da trava → FALHA: a superfície mudou sem subir a versão;
 *  - versão diferente → FALHA pedindo `npm run surface:lock`, que regrava.
 * O modo de escrita (`SURFACE_LOCK_ESCREVER=1`, posto pelo script) obedece à
 * mesma regra: ele se RECUSA a travar superfície nova sob a versão antiga.
 * É isso que transforma a disciplina da receita de release em teste.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { impressaoDigital } from "./surface.js";

export type NomeDaSecao = "declarada" | "semToken";

interface Secao {
  versao: string;
  sha256: string;
  conteudo: unknown;
}

type Trava = Partial<Record<NomeDaSecao, Secao>> & { $comentario?: string };

const COMENTARIO =
  "Impressão digital da superfície (src/surface.ts). Não editar à mão: `npm run surface:lock` regrava, e só aceita superfície nova sob versão nova.";

export interface Veredito {
  ok: boolean;
  mensagem: string;
}

function lerTrava(caminho: string): Trava {
  try {
    return JSON.parse(readFileSync(caminho, "utf8")) as Trava;
  } catch {
    return {};
  }
}

/**
 * Confere (e, em modo de escrita, regrava) UMA seção da trava contra o medido.
 * Devolve o veredito em vez de lançar, para o teste mostrar a mensagem inteira.
 */
export function conferirSecao(
  caminhoDaTrava: string,
  secao: NomeDaSecao,
  medido: unknown,
  versaoDoPacote: string,
  escrever: boolean,
): Veredito {
  const trava = lerTrava(caminhoDaTrava);
  const atual = trava[secao];
  const sha = impressaoDigital(medido);

  if (atual && impressaoDigital(atual.conteudo) !== atual.sha256) {
    return {
      ok: false,
      mensagem: `surface.lock.json: a seção "${secao}" foi editada à mão (o sha256 gravado não é o do conteúdo). Restaure o arquivo e rode \`npm run surface:lock\`.`,
    };
  }
  if (atual && atual.sha256 === sha) {
    return { ok: true, mensagem: `seção "${secao}" confere (${sha.slice(0, 12)}, travada em ${atual.versao})` };
  }
  if (atual && atual.versao === versaoDoPacote) {
    return {
      ok: false,
      mensagem:
        `A superfície "${secao}" MUDOU e a versão continua ${versaoDoPacote} ` +
        `(travada ${atual.sha256.slice(0, 12)}, medida ${sha.slice(0, 12)}). ` +
        "Quem compara o registro com o servidor só enxerga a versão: suba-a " +
        "(`npm version <patch|minor|major> --no-git-tag-version`) e rode `npm run surface:lock`.",
    };
  }
  if (!escrever) {
    return {
      ok: false,
      mensagem: atual
        ? `A superfície "${secao}" mudou junto com a versão (${atual.versao} → ${versaoDoPacote}): rode \`npm run surface:lock\` e commite o surface.lock.json.`
        : `surface.lock.json não tem a seção "${secao}": rode \`npm run surface:lock\`.`,
    };
  }

  trava[secao] = { versao: versaoDoPacote, sha256: sha, conteudo: medido };
  const saida: Trava = { $comentario: COMENTARIO };
  for (const nome of ["declarada", "semToken"] as const) if (trava[nome]) saida[nome] = trava[nome];
  writeFileSync(caminhoDaTrava, `${JSON.stringify(saida, null, 2)}\n`);
  return { ok: true, mensagem: `seção "${secao}" travada em ${versaoDoPacote} (${sha.slice(0, 12)})` };
}
