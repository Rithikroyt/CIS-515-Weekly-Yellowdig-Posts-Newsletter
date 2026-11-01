// Lite validators for the editorial schemas. Used by the local runner and by n8n workflow 04 (no Ajv or Zod in n8n).
import { createLiteValidator, type LiteError } from "../contracts/validate-lite";
import workflowProfile from "../../../../schemas/workflow-profile.schema.json";
import editorialInput from "../../../../schemas/editorial-input.schema.json";
import editorialDraft from "../../../../schemas/editorial-draft.schema.json";

const BASE = "https://cis515-observatory/schemas/";
export const EDITORIAL_IDS = {
  input: BASE + "editorial-input.schema.json",
  draft: BASE + "editorial-draft.schema.json",
  stage: (def: string) => BASE + "editorial-draft.schema.json#/$defs/" + def,
} as const;

let validator: ReturnType<typeof createLiteValidator> | null = null;
export function editorialLite() {
  validator ??= createLiteValidator([workflowProfile, editorialInput, editorialDraft] as Array<Record<string, unknown>>);
  return validator;
}

/** Schema errors as "path message" strings (never the offending values). */
export function schemaErrors(id: string, data: unknown): string[] {
  return editorialLite().errors(id, data).slice(0, 8).map((e: LiteError) => (e.path || "/") + " " + e.message);
}
