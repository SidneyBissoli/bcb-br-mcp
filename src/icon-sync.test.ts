/**
 * O ícone do servidor existe em TRÊS lugares e os três têm de concordar:
 *
 *   1. `assets/icon.png`      — a fonte, o arquivo que se edita;
 *   2. `worker/src/icon.ts`   — cópia em base64, porque o Worker não lê arquivo
 *                               em runtime sem binding de assets;
 *   3. `server.json`          — o que o MCP Registry publica e os diretórios
 *                               espelham (`icons[0]`).
 *
 * POR QUE ISTO EXISTE. A duplicação do byte é deliberada e não tem como sumir,
 * então o risco é ela DERIVAR: trocar o ícone em `assets/` e esquecer de
 * regenerar o módulo do Worker faz a rota `/icon.png` servir a imagem antiga
 * enquanto o `server.json` promete a nova — e ninguém percebe, porque as duas
 * respondem 200. O comentário no cabeçalho de `worker/src/icon.ts` pede a
 * regeneração; um comentário não é gate. Este arquivo é.
 *
 * Também prende `mimeType` e `sizes` ao que a imagem REALMENTE é: um manifesto
 * que anuncia 256x256 servindo outra coisa é a mesma classe de mentira que o
 * output-contract pega nas respostas das tools.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

const bytesDoAtivo = () => readFileSync(join(raiz, "assets", "icon.png"));

function bytesDoWorker(): Buffer {
  const fonte = readFileSync(join(raiz, "worker", "src", "icon.ts"), "utf8");
  // Casa a string literal do export, sem importar o módulo: o teste roda no
  // vitest da RAIZ, que não tem o tsconfig do worker no caminho.
  const m = fonte.match(/ICON_PNG_BASE64\s*=\s*\n?\s*"([A-Za-z0-9+/=]+)"/);
  if (!m) throw new Error("ICON_PNG_BASE64 não encontrado em worker/src/icon.ts");
  return Buffer.from(m[1]!, "base64");
}

/** Dimensões lidas do cabeçalho IHDR do PNG — sem dependência de imagem. */
function dimensoesPng(buf: Buffer): { largura: number; altura: number } {
  const assinatura = buf.subarray(0, 8).toString("hex");
  if (assinatura !== "89504e470d0a1a0a") throw new Error("não é um PNG");
  return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
}

describe("ícone do servidor: ativo × worker × manifesto", () => {
  it("o base64 do Worker é byte a byte o assets/icon.png", () => {
    expect(bytesDoWorker().equals(bytesDoAtivo())).toBe(true);
  });

  it("server.json declara o ícone servido pelo próprio domínio", () => {
    const server = require("../server.json") as {
      icons?: Array<{ src: string; mimeType?: string; sizes?: string[] }>;
    };
    const icone = server.icons?.[0];
    expect(icone, "server.json precisa declarar icons — são 5 pontos de completeness nos diretórios").toBeDefined();
    // Mesmo host do servidor, que é o que o schema do MCP recomenda; e a rota
    // tem de ser a que worker/src/index.ts serve.
    expect(icone!.src).toBe("https://bcb.sidneybissoli.com/icon.png");
    const indexWorker = readFileSync(join(raiz, "worker", "src", "index.ts"), "utf8");
    expect(indexWorker).toContain('url.pathname === "/icon.png"');
  });

  it("mimeType e sizes descrevem a imagem que existe, não uma promessa", () => {
    const server = require("../server.json") as {
      icons: Array<{ mimeType?: string; sizes?: string[] }>;
    };
    const { largura, altura } = dimensoesPng(bytesDoAtivo());
    expect(server.icons[0]!.mimeType).toBe("image/png");
    expect(server.icons[0]!.sizes).toEqual([`${largura}x${altura}`]);
  });

  it("o ícone cabe no teto de 1 MB do Smithery", () => {
    expect(bytesDoAtivo().byteLength).toBeLessThan(1024 * 1024);
  });
});
