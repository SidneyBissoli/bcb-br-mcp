/**
 * O ícone do servidor é declarado em DOIS lugares que não podem discordar:
 *
 *   1. `worker/src/icon.ts` — os bytes, em base64, servidos pela rota
 *      `/icon.png`. É a FONTE: não há cópia em `assets/`;
 *   2. `server.json`        — o que o MCP Registry publica e o que todo
 *      diretório espelha (`icons[0]`).
 *
 * POR QUE ISTO EXISTE. Até a 1.9.5 os bytes viviam em dois lugares — o arquivo
 * em `assets/icon.png` e a cópia em base64 do Worker — porque o Worker não lê
 * arquivo em runtime sem binding de assets. Duplicação que não some vira risco
 * de deriva: trocar num lugar e esquecer o outro faz a rota servir uma imagem
 * enquanto o manifesto promete outra, sem erro em lado nenhum, porque as duas
 * respondem 200. A cópia foi eliminada; o que sobra a guardar é o manifesto
 * concordar com o que o código de fato serve.
 *
 * `mimeType` e `sizes` são conferidos contra o cabeçalho REAL da imagem: um
 * manifesto que anuncia 256x256 servindo outra coisa é a mesma classe de
 * mentira que o output-contract pega nas respostas das tools.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

function bytesDoIcone(): Buffer {
  const fonte = readFileSync(join(raiz, "worker", "src", "icon.ts"), "utf8");
  // Casa a string literal do export, sem importar o módulo: o teste roda no
  // vitest da RAIZ, que não tem o tsconfig do worker no caminho.
  const m = fonte.match(/ICON_PNG_BASE64\s*=\s*\n?\s*"([A-Za-z0-9+/=]+)"/);
  if (!m) throw new Error("ICON_PNG_BASE64 não encontrado em worker/src/icon.ts");
  return Buffer.from(m[1]!, "base64");
}

/** Dimensões lidas do cabeçalho IHDR do PNG — sem dependência de imagem. */
function dimensoesPng(buf: Buffer): { largura: number; altura: number } {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("não é um PNG");
  }
  return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
}

const manifesto = () =>
  (require("../server.json") as {
    icons?: Array<{ src: string; mimeType?: string; sizes?: string[] }>;
  }).icons;

describe("ícone do servidor: bytes × manifesto × rota", () => {
  it("os bytes embutidos são um PNG válido, e são a única cópia", () => {
    expect(() => dimensoesPng(bytesDoIcone())).not.toThrow();
    // Uma cópia em assets/ reintroduziria a deriva que a 1.9.5 eliminou.
    expect(
      () => readFileSync(join(raiz, "assets", "icon.png")),
      "voltou a existir uma segunda cópia do ícone — worker/src/icon.ts é a fonte única",
    ).toThrow();
  });

  it("server.json declara o ícone servido pelo próprio domínio", () => {
    const icone = manifesto()?.[0];
    expect(
      icone,
      "server.json precisa declarar icons — são 5 pontos de completeness nos diretórios",
    ).toBeDefined();
    expect(icone!.src).toBe("https://bcb.sidneybissoli.com/icon.png");
    const indexWorker = readFileSync(join(raiz, "worker", "src", "index.ts"), "utf8");
    expect(indexWorker).toContain('url.pathname === "/icon.png"');
  });

  it("mimeType e sizes descrevem a imagem que existe, não uma promessa", () => {
    const { largura, altura } = dimensoesPng(bytesDoIcone());
    expect(manifesto()![0]!.mimeType).toBe("image/png");
    expect(manifesto()![0]!.sizes).toEqual([`${largura}x${altura}`]);
  });

  it("o ícone cabe no teto de 1 MB do Smithery", () => {
    expect(bytesDoIcone().byteLength).toBeLessThan(1024 * 1024);
  });
});
