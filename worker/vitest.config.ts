import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // A suíte do worker roda OFFLINE por contrato — ver o cabeçalho do arquivo.
    setupFiles: ["./tests/setup-sem-rede.ts"],
  },
});
