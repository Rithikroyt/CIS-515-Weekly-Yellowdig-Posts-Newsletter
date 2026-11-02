// Starts the local finalize page on this computer only (127.0.0.1). Images are downloaded from Yellowdig into the
// folder you choose and embedded locally; nothing is uploaded.
// Usage (from web/): npm run newsletter:finalize-ui [-- --port 5175]
import { createFinalizeServer } from "../src/lib/local-ui/server";
import { REPO_ROOT } from "./schemas";

async function main() {
  const i = process.argv.indexOf("--port");
  const port = i > 0 ? Number(process.argv[i + 1]) : 5175;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("--port must be 1024-65535");
  const ui = createFinalizeServer({ port, repoRoot: REPO_ROOT });
  const { url } = await ui.listen();
  console.log("Finalize newsletter images: " + url);
  console.log("Local only (127.0.0.1). Press Ctrl+C to stop.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
