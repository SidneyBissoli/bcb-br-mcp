import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only the npm package's own suite. The Worker gets its own vitest run
    // (own deps, own config) once it is retrofitted to the Fase 0 template.
    include: ["src/**/*.test.ts"]
  }
});
