import { build } from "esbuild";
import { describe, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const packageDir = dirname(fileURLToPath(import.meta.url));
const entryPoint = resolve(packageDir, "../src/index.ts");

describe("engine bundle compatibility", () => {
  it("can be bundled from the package entrypoint", async () => {
    await build({
      entryPoints: [entryPoint],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      target: "es2023",
      absWorkingDir: resolve(packageDir, ".."),
    });
  });
});
