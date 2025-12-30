import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_OPENAPI_OUT_FILE = path.join(__dirname, "openapi.json");

function capitalize(value) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function expressPathToOpenApi(pathname) {
  // Express params: /users/:id -> OpenAPI: /users/{id}
  return pathname.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function inferTagFromPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const afterApi = parts[0] === "api" ? parts.slice(1) : parts;
  const tag = afterApi[0] || "Default";
  return capitalize(tag);
}

function joinPaths(basePath, nextPath) {
  const base = basePath || "";
  const next = nextPath || "";

  if (!base) return next.startsWith("/") ? next : `/${next}`;
  if (!next || next === "/") return base;

  const a = base.endsWith("/") ? base.slice(0, -1) : base;
  const b = next.startsWith("/") ? next.slice(1) : next;
  return `${a}/${b}`;
}

function listDirectAppRoutes(app) {
  const router = app?.router || app?._router;
  const stack = router?.stack || [];
  const out = [];

  for (const layer of stack) {
    if (!layer || !layer.route) continue;
    const routePath = layer.route.path;
    const fullPath = expressPathToOpenApi(joinPaths("", routePath));
    const methods = Object.keys(layer.route.methods || {}).filter(
      (m) => layer.route.methods[m]
    );
    out.push({ path: fullPath, methods: methods.map((m) => m.toUpperCase()) });
  }

  return out;
}

function listMountedRouterRoutes(mounts) {
  const out = [];
  for (const mount of mounts || []) {
    const basePath = mount?.basePath || "";
    const router = mount?.router;
    const stack = router?.stack || [];

    for (const layer of stack) {
      if (!layer || !layer.route) continue;
      const routePath = layer.route.path;
      const fullPath = expressPathToOpenApi(joinPaths(basePath, routePath));
      const methods = Object.keys(layer.route.methods || {}).filter(
        (m) => layer.route.methods[m]
      );
      out.push({ path: fullPath, methods: methods.map((m) => m.toUpperCase()) });
    }
  }
  return out;
}

function loadManualYamlPaths() {
  const yamlFiles = fs
    .readdirSync(__dirname)
    .filter((f) => /\.ya?ml$/i.test(f));

  const merged = {};
  for (const file of yamlFiles) {
    const doc = YAML.load(path.join(__dirname, file));
    if (doc?.paths && typeof doc.paths === "object") {
      for (const [p, ops] of Object.entries(doc.paths)) {
        merged[p] = { ...(merged[p] ?? {}), ...(ops ?? {}) };
      }
    }
  }
  return merged;
}

function mergePaths(autoPaths, manualPaths) {
  const out = { ...autoPaths };

  for (const [p, manualOps] of Object.entries(manualPaths || {})) {
    out[p] = out[p] ?? {};
    for (const [method, manualOp] of Object.entries(manualOps || {})) {
      out[p][method] = {
        ...(out[p][method] ?? {}),
        ...(manualOp ?? {}),
      };
    }
  }

  return out;
}

export function buildOpenApiSpec(app, { serverUrl } = {}) {
  const mounts = app?.locals?.swaggerMounts || [];
  const raw = [...listDirectAppRoutes(app), ...listMountedRouterRoutes(mounts)];
  const autoPaths = {};

  for (const endpoint of raw) {
    const openApiPath = endpoint.path;
    autoPaths[openApiPath] = autoPaths[openApiPath] ?? {};

    for (const method of endpoint.methods || []) {
      const lower = method.toLowerCase();

      // Keep the first generated stub if duplicates appear.
      autoPaths[openApiPath][lower] = autoPaths[openApiPath][lower] ?? {
        tags: [inferTagFromPath(openApiPath)],
        summary: `${method} ${openApiPath}`,
        responses: {
          "200": { description: "Success" },
        },
      };
    }
  }

  const manualPaths = loadManualYamlPaths();
  const paths = mergePaths(autoPaths, manualPaths);

  return {
    openapi: "3.0.3",
    info: {
      title: "Streamly API",
      version: "1.0.0",
    },
    servers: [
      {
        url:
          serverUrl ||
          process.env.PUBLIC_BASE_URL ||
          `http://localhost:${process.env.PORT || 4005}`,
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    paths,
  };
}

export function writeOpenApiFile(spec, outFile = DEFAULT_OPENAPI_OUT_FILE) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(spec, null, 2), "utf8");
  return outFile;
}

export function setupSwagger(app, { serverUrl } = {}) {
  // Generate BEFORE registering /api-docs so we don't include docs routes in the spec.
  const spec = buildOpenApiSpec(app, { serverUrl });

  // Avoid writing files during normal runtime by default.
  // Writing swagger/openapi.json is handled by `npm run openapi:generate` / `npm run docs:build`.
  const shouldWriteFile =
    process.env.WRITE_OPENAPI_FILE === "1" ||
    (process.env.WRITE_OPENAPI_FILE || "").toLowerCase() === "true";

  if (shouldWriteFile) {
    try {
      writeOpenApiFile(spec);
    } catch (err) {
      // Best-effort only: serving docs at runtime shouldn't fail if the filesystem is read-only.
      console.warn("OpenAPI file write skipped:", err?.message || err);
    }
  }

  app.get("/openapi.json", (_req, res) => res.json(spec));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(spec));

  return spec;
}
