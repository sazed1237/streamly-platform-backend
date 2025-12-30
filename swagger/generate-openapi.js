import path from "node:path";

// Avoid side-effects (Redis, workers, etc.) while generating docs.
process.env.OPENAPI_GENERATION = process.env.OPENAPI_GENERATION || "1";

const [{ createServer }, { buildOpenApiSpec, writeOpenApiFile }] = await Promise.all([
  import("../app.js"),
  import("./index.js"),
]);

const { app } = createServer({ enableCron: false, enableSwagger: false });

const serverUrl =
  process.env.OPENAPI_SERVER_URL ||
  process.env.PUBLIC_BASE_URL ||
  `http://localhost:${process.env.PORT || 4005}`;

const spec = buildOpenApiSpec(app, { serverUrl });
const outFile = writeOpenApiFile(spec);

console.log(`OpenAPI written: ${path.relative(process.cwd(), outFile)}`);
