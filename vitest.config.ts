import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Mirror the tsconfig "@/*" path alias so tests can import the app modules.
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, ".") } },
  test: { include: ["**/*.test.ts"], environment: "node" },
});
