import { readLocalEnv } from "./scripts/env-config";
const env = readLocalEnv() ?? {};
const base = (env.N8N_BASE_URL ?? "").replace(/\/+$/, "").replace(/\/api\/v1$/, "");
(async () => {
  const f = encodeURIComponent(JSON.stringify({ type: "and", filters: [{ columnName: "week", condition: "eq", value: 2 }] }));
  const r = await fetch(base + "/api/v1/data-tables/uWls7HHm5Ek7u1SQ/rows?limit=3&sortBy=" + encodeURIComponent("updatedAt:desc") + "&filter=" + f, { headers: { "X-N8N-API-KEY": env.N8N_API_KEY!, accept: "application/json" } });
  for (const x of ((await r.json()) as { data: Array<Record<string, unknown>> }).data) console.log(String(x.run_id).slice(0, 10) + "…", x.status, x.error_code || "-", x.updatedAt, "html bytes", String(x.html ?? "").length);
})();
