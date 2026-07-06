#!/usr/bin/env node
// Bundle size budget for the entry chunk specifically — not the whole
// dist/ output, since the Pixi.js-heavy game chunks are deliberately
// lazy-loaded (see src/App.tsx) and shouldn't count against the budget
// every visitor actually pays before ever opening a game.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
const assetsDir = path.join(distDir, "assets");

const indexHtml = readFileSync(path.join(distDir, "index.html"), "utf-8");
const entryMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="\/assets\/([^"]+)"/);
if (!entryMatch) {
  console.error("Could not find the entry chunk reference in dist/index.html");
  process.exit(1);
}

const entryFile = path.join(assetsDir, entryMatch[1]);
const entryBytes = statSync(entryFile).size;
const entryGzipBytes = gzipSync(readFileSync(entryFile)).length;

// 200KB gzipped is the intentional budget for "everything a visitor
// downloads before ever opening a game" — chosen because it's roughly
// what M11 achieved after code-splitting Pixi.js out of the entry
// chunk (was ~337KB gzip before the split, now ~178KB). Tightening
// this further would mean also deferring PostHog/Sentry, which is a
// real future option, not something this budget assumes has happened.
const BUDGET_GZIP_BYTES = 200 * 1024;

console.log(`Entry chunk: ${entryMatch[1]}`);
console.log(`  raw:  ${(entryBytes / 1024).toFixed(1)} KB`);
console.log(
  `  gzip: ${(entryGzipBytes / 1024).toFixed(1)} KB (budget: ${BUDGET_GZIP_BYTES / 1024} KB)`,
);

if (entryGzipBytes > BUDGET_GZIP_BYTES) {
  console.error(
    `\nFAIL: entry chunk exceeds the ${BUDGET_GZIP_BYTES / 1024}KB gzip budget by ${(
      (entryGzipBytes - BUDGET_GZIP_BYTES) /
      1024
    ).toFixed(1)}KB.`,
  );
  console.error("Either reduce what's imported eagerly in main.tsx/App.tsx, or — if the growth");
  console.error(
    "is intentional — raise BUDGET_GZIP_BYTES in this script deliberately, not silently.",
  );
  process.exit(1);
}

console.log("\nPASS — entry chunk is within budget.");

const allJsFiles = readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
const totalBytes = allJsFiles.reduce((sum, f) => sum + statSync(path.join(assetsDir, f)).size, 0);
console.log(
  `\n(Informational: total JS across all chunks is ${(totalBytes / 1024).toFixed(0)} KB raw.)`,
);
