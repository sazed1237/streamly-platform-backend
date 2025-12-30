import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const openApiSrc = path.join(rootDir, "swagger", "openapi.json");
const docsDir = path.join(rootDir, "docs");
const openApiDest = path.join(docsDir, "openapi.json");

await fs.mkdir(docsDir, { recursive: true });
await fs.copyFile(openApiSrc, openApiDest);

console.log(`GitHub Pages docs ready: ${path.relative(rootDir, docsDir)}`);
console.log(`- Copied ${path.relative(rootDir, openApiSrc)} -> ${path.relative(rootDir, openApiDest)}`);
