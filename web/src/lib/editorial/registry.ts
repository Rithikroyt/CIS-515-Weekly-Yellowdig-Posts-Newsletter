// Lite validators for the editorial schemas. Used by the local runner and by n8n workflow 04 (no Ajv or Zod in n8n).
import { createLiteValidator, type LiteError } from "../contracts/validate-lite";
import { shortenProse } from "../text/shorten";
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

/**
 * Structural repair of model output, driven by the validator's own errors: unexpected properties are dropped, strings
 * over maxLength are shortened to their last complete sentence, arrays over maxItems are cut, and an array element that is otherwise invalid is
 * removed. Nothing is invented; the evidence checks still run on whatever remains. Returns how many fixes were made.
 */
export function repairToSchema(id: string, value: unknown): number {
  const seg = (p: string) => p.split("/").slice(1);
  const at = (path: string[]) => path.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), value);
  let fixes = 0;
  for (let pass = 0; pass < 300; pass++) {
    const errs = editorialLite().errors(id, value);
    if (!errs.length) break;
    let fixed = false;
    for (const e of errs) {
      const path = seg(e.path);
      const parent = at(path.slice(0, -1)) as Record<string, unknown> | unknown[] | undefined;
      const key = path[path.length - 1];
      const target = at(path);
      const max = /\(max (\d+)\)$/.exec(e.message);
      if (e.message === "unexpected property" && parent && !Array.isArray(parent)) { delete parent[key]; fixed = true; break; }
      if (max && typeof target === "string") { (parent as Record<string, unknown>)[key] = shortenProse(target, Number(max[1])); fixed = true; break; }
      if (max && Array.isArray(target)) { target.length = Number(max[1]); fixed = true; break; }
      // Anything else: drop the innermost array element that contains the error.
      for (let i = path.length - 1; i >= 0; i--) {
        const arr = at(path.slice(0, i));
        if (Array.isArray(arr) && /^\d+$/.test(path[i])) { arr.splice(Number(path[i]), 1); fixed = true; break; }
      }
      if (fixed) break;
    }
    if (!fixed) break;
    fixes++;
  }
  return fixes;
}

/** Schema errors as "path message" strings (never the offending values). */
export function schemaErrors(id: string, data: unknown): string[] {
  return editorialLite().errors(id, data).slice(0, 8).map((e: LiteError) => (e.path || "/") + " " + e.message);
}
