// Compiles the JSON Schemas in /schemas with Ajv (draft 2020-12). Used by tests and scripts/validate-repo.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

export const REPO_ROOT = join(__dirname, "..", "..");
export const SCHEMA_NAMES = ["normalized-post", "workflow-profile", "asset-manifest", "issue"] as const;
export type SchemaName = (typeof SCHEMA_NAMES)[number];

export function loadValidators(): Record<SchemaName, ValidateFunction> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const out = {} as Record<SchemaName, ValidateFunction>;
  for (const name of SCHEMA_NAMES) {
    const schema = JSON.parse(readFileSync(join(REPO_ROOT, "schemas", name + ".schema.json"), "utf8"));
    out[name] = ajv.compile(schema);
  }
  return out;
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}
