// A small JSON Schema (2020-12 subset) validator that runs anywhere, including n8n Code nodes.
// It reads the same /schemas files as Ajv; tests check that both give the same verdicts.
// Unsupported keywords throw, so a schema change it cannot honour fails loudly instead of passing silently.

type Schema = Record<string, unknown> | boolean;
const ANNOTATIONS = new Set(["$schema", "$id", "$defs", "$comment", "title", "description", "examples", "default"]);
const SUPPORTED = new Set([
  "type", "const", "enum", "pattern", "minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems",
  "uniqueItems", "items", "required", "properties", "additionalProperties", "oneOf", "$ref", "format",
]);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const typeOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

function isDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
const FORMATS: Record<string, (s: string) => boolean> = {
  date: isDate,
  "date-time": (s) => {
    const m = /^(\d{4}-\d{2}-\d{2})[Tt ]([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d+)?([Zz]|[+-]([01]\d|2[0-3]):?[0-5]\d)$/.exec(s);
    return !!m && isDate(m[1]);
  },
  uri: (s) => /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]*$/.test(s),
};

export type LiteError = { path: string; message: string };

export function createLiteValidator(schemas: Array<Record<string, unknown>>) {
  const registry = new Map<string, Record<string, unknown>>();
  schemas.forEach((s) => registry.set(String(s.$id), s));
  const regexCache = new Map<string, RegExp>();

  function resolve(ref: string, base: string): { schema: Schema; base: string } {
    const [file, pointer = ""] = ref.split("#");
    // No URL global in the n8n Code-node sandbox, so resolve sibling-file refs by hand.
    const docId = !file ? base : /^[a-z]+:\/\//i.test(file) ? file : base.slice(0, base.lastIndexOf("/") + 1) + file;
    const doc = registry.get(docId);
    if (!doc) throw new Error("unknown schema " + docId);
    let cur: unknown = doc;
    pointer.split("/").filter(Boolean).forEach((seg) => {
      const key = seg.replace(/~1/g, "/").replace(/~0/g, "~");
      cur = isObj(cur) ? cur[key] : undefined;
    });
    if (cur === undefined) throw new Error("unresolved $ref " + ref);
    return { schema: cur as Schema, base: docId };
  }

  function check(schema: Schema, data: unknown, base: string, path: string, errors: LiteError[]): void {
    if (schema === true) return;
    if (schema === false) { errors.push({ path, message: "not allowed" }); return; }
    for (const k of Object.keys(schema)) if (!SUPPORTED.has(k) && !ANNOTATIONS.has(k)) throw new Error("unsupported keyword " + k);
    const err = (message: string) => errors.push({ path, message });

    if (typeof schema.$ref === "string") {
      const r = resolve(schema.$ref, base);
      check(r.schema, data, r.base, path, errors);
    }
    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      const t = typeOf(data);
      const ok = types.some((x) => x === t || (x === "integer" && t === "number" && Number.isInteger(data)));
      if (!ok) { err("must be " + types.join("|")); return; }
    }
    if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(data)) err("must equal constant");
    if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(data))) err("must be one of the allowed values");
    if (Array.isArray(schema.oneOf)) {
      const passing = schema.oneOf.filter((s) => { const e: LiteError[] = []; check(s as Schema, data, base, path, e); return e.length === 0; }).length;
      if (passing !== 1) err("must match exactly one schema in oneOf");
    }
    if (typeof data === "string") {
      const len = [...data].length;
      if (typeof schema.minLength === "number" && len < schema.minLength) err("too short");
      if (typeof schema.maxLength === "number" && len > schema.maxLength) err("too long");
      if (typeof schema.pattern === "string") {
        let re = regexCache.get(schema.pattern);
        if (!re) { re = new RegExp(schema.pattern, "u"); regexCache.set(schema.pattern, re); }
        if (!re.test(data)) err("must match pattern");
      }
      if (typeof schema.format === "string") {
        const f = FORMATS[schema.format];
        if (!f) throw new Error("unsupported format " + schema.format);
        if (!f(data)) err("must be a valid " + schema.format);
      }
    }
    if (typeof data === "number") {
      if (typeof schema.minimum === "number" && data < schema.minimum) err("below minimum");
      if (typeof schema.maximum === "number" && data > schema.maximum) err("above maximum");
    }
    if (Array.isArray(data)) {
      if (typeof schema.minItems === "number" && data.length < schema.minItems) err("too few items");
      if (typeof schema.maxItems === "number" && data.length > schema.maxItems) err("too many items");
      if (schema.uniqueItems === true && new Set(data.map((x) => JSON.stringify(x))).size !== data.length) err("items must be unique");
      if (schema.items !== undefined) data.forEach((x, i) => check(schema.items as Schema, x, base, path + "/" + i, errors));
    }
    if (isObj(data)) {
      if (Array.isArray(schema.required)) schema.required.forEach((k) => { if (!(k in data)) err("missing " + k); });
      const props = isObj(schema.properties) ? schema.properties : {};
      for (const [k, v] of Object.entries(data)) {
        if (k in props) check(props[k] as Schema, v, base, path + "/" + k, errors);
        else if (schema.additionalProperties === false) errors.push({ path: path + "/" + k, message: "unexpected property" });
        else if (isObj(schema.additionalProperties)) check(schema.additionalProperties, v, base, path + "/" + k, errors);
      }
    }
  }

  return {
    /** Validates data against the schema with this $id (or a $id#pointer ref). Returns the errors, empty when valid. */
    errors(schemaRef: string, data: unknown): LiteError[] {
      const errors: LiteError[] = [];
      const [id] = schemaRef.split("#");
      check({ $ref: schemaRef }, data, id, "", errors);
      return errors.slice(0, 20);
    },
  };
}
