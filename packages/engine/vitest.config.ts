import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      // Roadmap M4's exit bar targets 90%+ once real rules land (roadmap
      // item order: state/RNG -> turn FSM -> rent/bankruptcy -> ...).
      // Left unenforced here since M1 is scaffolding only.
      reporter: ["text", "lcov"],
    },
  },
});
