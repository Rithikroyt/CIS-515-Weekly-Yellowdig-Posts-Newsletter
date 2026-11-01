// Renders the synthetic Week 2 issue (mock provider) to a file, for visual checks. Invented data only.
// Usage (from web/): npx tsx scripts/render-synthetic.ts <out.html> [scenario]
import { writeFileSync } from "node:fs";
import * as E from "../src/lib/editorial";
import { renderNewsletter } from "../src/lib/render/newsletter";

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("usage: render-synthetic.ts <out.html> [scenario]");
  const input = E.syntheticEditorialInput();
  const draft = await E.runEditorial({ input, provider: E.createMockProvider(E.NAMED_SCENARIOS[process.argv[3] ?? "clean"]), now: () => "2026-11-01T12:00:00Z" });
  const r = renderNewsletter({ input, draft });
  writeFileSync(out, r.html);
  console.log(r.status, "omitted:", r.omittedClaims, "bytes:", r.html.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
