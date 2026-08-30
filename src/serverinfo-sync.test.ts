/**
 * A IDENTIDADE do servidor é declarada em lugares que não podem discordar:
 *
 *   1. `src/identity.ts` — `SERVER_IDENTITY`, que `createServer` põe em
 *      `serverInfo` e TODO cliente MCP vê no handshake, nos dois transportes;
 *   2. `server.json`     — o que o MCP Registry publica e os diretórios
 *      espelham (`title`, `websiteUrl`, `icons`, eixos de completeness do
 *      mcpindex/Smithery);
 *   3. `package.json`    — `homepage`, o que o npm mostra.
 *
 * POR QUE ISTO EXISTE. Até a 1.9.5 o handshake calava sobre `title` e `icons`,
 * e sobre `websiteUrl` ele calava no stdio e MENTIA no Worker: o `server.json`
 * publicava a landing própria enquanto `worker/src/config.ts` anunciava o
 * repositório no GitHub. O `mcpscore` de 30/08/2026 reprovava
 * `server_title_present`, `server_icons_present` e — só no stdio —
 * `server_websiteurl_present`. O modo de falha agora inverte: alguém edita um
 * dos lados e não o outro, e o handshake passa a descrever um produto diferente
 * do que os diretórios mostram. Nenhum lado dá erro; eles só discordam.
 *
 * A fonte da verificação é o próprio manifesto, nunca uma literal copiada para
 * cá: um teste que fixasse a URL na mão passaria a validar a si mesmo. E o
 * `icon-sync.test.ts` fecha a cadeia do outro lado, prendendo o `server.json`
 * aos BYTES do PNG que a rota `/icon.png` de fato serve.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { SERVER_IDENTITY, SERVER_INSTRUCTIONS } from "./identity.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

const leJson = (arquivo: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(raiz, arquivo), "utf8")) as Record<string, unknown>;

describe("identidade: handshake × server.json × package.json", () => {
  it("o título do handshake é o que o registry publica", () => {
    expect(
      leJson("server.json").title,
      "server.json sem title — e é ele que o cliente MCP mostra no lugar do nome técnico",
    ).toBe(SERVER_IDENTITY.title);
  });

  it("o websiteUrl é o mesmo nos três, e é a landing (não o repositório)", () => {
    expect(leJson("server.json").websiteUrl).toBe(SERVER_IDENTITY.websiteUrl);
    expect(leJson("package.json").homepage).toBe(SERVER_IDENTITY.websiteUrl);
    expect(SERVER_IDENTITY.websiteUrl).toMatch(/^https:\/\//);
    expect(SERVER_IDENTITY.websiteUrl.endsWith("/")).toBe(false);
  });

  it("os ícones do handshake são os do manifesto, objeto por objeto", () => {
    // `icon-sync.test.ts` já confere que ESTE objeto descreve a imagem real;
    // aqui só se garante que o handshake não anuncia outra.
    expect(leJson("server.json").icons).toEqual(SERVER_IDENTITY.icons);
  });

  it("o nome do handshake é o nome do pacote npm", () => {
    expect(leJson("package.json").name).toBe(SERVER_IDENTITY.name);
  });

  it("as instruções existem, são multi-linha e dizem quando NÃO usar o servidor", () => {
    // A regra `server_instructions_present` do mcpscore só exige presença; o
    // critério do diretório da Anthropic pede o limite negativo, que é o que
    // impede o cliente de chamar este servidor para dado que ele não tem.
    expect(SERVER_INSTRUCTIONS.length).toBeGreaterThan(200);
    expect(SERVER_INSTRUCTIONS.split("\n").length).toBeGreaterThan(3);
    expect(SERVER_INSTRUCTIONS).toMatch(/Não use este servidor/);
  });
});
