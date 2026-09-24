import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // vitest 5 (Vite 8) transforme avec oxc, qui RESPECTE `"jsx": "preserve"` du tsconfig (réglage
  // voulu par Next) : les composants importés par les tests gardaient leur JSX brut et ne
  // s'analysaient plus. Pour les tests seulement, JSX compilé en runtime automatique (React 17+).
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    // Reproduit le path alias "@/*" du tsconfig (Next le résout en prod, pas Vitest).
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Couverture (porte qualité de l'Atelier, S6) : calculée seulement avec --coverage (npm run portes).
    coverage: {
      provider: "v8",
      include: ["app/**/*.{ts,tsx}", "lib/**/*.ts", "components/**/*.tsx"],
      exclude: ["**/*.d.ts"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
