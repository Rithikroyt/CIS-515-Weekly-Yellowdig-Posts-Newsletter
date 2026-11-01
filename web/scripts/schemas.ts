// Compiles the JSON Schemas in /schemas with Ajv (draft 2020-12). Used by tests and scripts/validate-repo.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

export const REPO_ROOT = join(__dirname, "..", "..");
export const SCHEMA_NAMES = ["normalized-post", "workflow-profile", "workflow-asset", "asset-manifest", "metrics", "issue", "source-bundle", "week-dataset"] as const;
export type SchemaName = (typeof SCHEMA_NAMES)[number];

export function loadValidators(): Record<SchemaName, ValidateFunction> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  // Register every schema first so cross-file $refs (e.g. issue → metrics) resolve.
  const schemas = SCHEMA_NAMES.map((name) => JSON.parse(readFileSync(join(REPO_ROOT, "schemas", name + ".schema.json"), "utf8")));
  schemas.forEach((s) => ajv.addSchema(s));
  const out = {} as Record<SchemaName, ValidateFunction>;
  SCHEMA_NAMES.forEach((name, i) => { out[name] = ajv.getSchema(schemas[i].$id) as ValidateFunction; });
  return out;
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}
