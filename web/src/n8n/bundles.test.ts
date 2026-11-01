// Runs the generated Code-node bundles in a simulated n8n Code node ($input, $(), $runIndex, require)
// and checks that chaining them gives the same result as the tested shared functions.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENTRIES, bundleEntry } from "../../scripts/build-n8n";
import { REPO_ROOT, readJson } from "../../scripts/schemas";
import { SYNTHETIC_WEEK2_RUN, syntheticWeek2Pages } from "../lib/source";
import { NODE } from "./runtime";

type J = Record<string, unknown>;
const nodeRequire = createRequire(import.meta.url);
const code = new Map<string, string>();
const get = (wf: "wf01" | "wf02", entry: string) => {
  const key = wf + "." + entry;
  if (!code.has(key)) code.set(key, bundleEntry(wf, entry));
  return code.get(key)!;
};

/** Executes one Code node. `ran` holds the first output item of nodes that already ran. */
function runNode(wf: "wf01" | "wf02", entry: string, items: J[], ran: Record<string, J> = {}, runIndex = 0): J[] {
  const $input = { all: () => items.map((json) => ({ json })) };
  const $ = (name: string) => {
    if (!(name in ran)) throw new Error("Referenced node is unexecuted: " + name);
    return { first: () => ({ json: ran[name] }) };
  };
  // Only "crypto" may be required, and URL, fetch, Buffer and process are hidden, as in the n8n Cloud Code-node sandbox.
  const req = (m: string) => { if (m !== "crypto") throw new Error("module not allowed: " + m); return nodeRequire(m); };
  const out = new Function("$input", "$", "$runIndex", "require", "URL", "fetch", "Buffer", "process", get(wf, entry))($input, $, runIndex, req, undefined, undefined, undefined, undefined) as Array<{ json: J }>;
  return out.map((o) => JSON.parse(JSON.stringify(o.json)));
}

function run01(input: J, pages?: J[]) {
  const ran: Record<string, J> = {};
  const [cfg] = runNode("wf01", "devRunConfig", [input]);
  ran[NODE.devRunConfig] = cfg;
  const [validated] = runNode("wf01", "validateConfig", [cfg], ran);
  ran[NODE.validateConfig] = validated;
  const [resolved] = runNode("wf01", "resolveMode", [validated], ran);
  ran[NODE.resolveMode] = resolved;
  let pageItems: J[];
  if (resolved.route === "fixture") pageItems = runNode("wf01", "loadFixture", [resolved], ran);
  else {
    const [cap] = runNode("wf01", "checkCapability", [pages![0]], ran);
    ran[NODE.checkCapability] = cap;
    pageItems = pages!;
  }
  let s = runNode("wf01", "collectAndMinimize", pageItems, ran);
  s = runNode("wf01", "dedupe", s, ran);
  s = runNode("wf01", "filterDateTopic", s, ran);
  return { bundle: runNode("wf01", "assembleAndValidate", s, ran)[0], resolved };
}

function run02(bundle: J) {
  let s = runNode("wf02", "validateSourceMetadata", [bundle]);
  for (const e of ["classifyEvents", "joinToPosts", "computeMetrics", "validateDataset"]) s = runNode("wf02", e, s);
  return s[0];
}

describe("generated n8n bundles", () => {
  it("only require crypto and contain no secrets or fixture-only identifiers in live entries", () => {
    for (const [wf, entries] of Object.entries(ENTRIES)) {
      for (const e of entries) {
        const c = get(wf as "wf01" | "wf02", e);
        expect(c.match(/require\("([^"]+)"\)/g) ?? []).toEqual((c.match(/require\("crypto"\)/g) ?? []));
        expect(c).not.toMatch(/apikey["']?\s*[:=]\s*["'][^"']{8,}/i);
      }
    }
  });

  it("fixture mode: 01 → 02 reproduces the committed week dataset", () => {
    const { bundle } = run01({});
    expect(bundle.sourceModeUsed).toBe("fixture");
    expect(bundle.liveSourceVerified).toBe(false);
    const dataset = run02(bundle);
    const expected = readJson(join(REPO_ROOT, "fixtures", "synthetic", "week-02", "week-dataset.json")) as J;
    const strip = (d: J) => ({ ...d, source: { ...(d.source as J), fetchedAt: "X" } });
    expect(strip(dataset)).toEqual(strip(expected));
  });

  it("auto mode without a credential: explicit fixture fallback", () => {
    const { bundle } = run01({ sourceMode: "auto" });
    expect(bundle).toMatchObject({ sourceModeRequested: "auto", sourceModeUsed: "fixture", fallbackReason: "YELLOWDIG_CREDENTIAL_NOT_CONFIGURED", liveSourceVerified: false });
  });

  it("yellowdig mode without a credential fails in Validate Run Configuration", () => {
    expect(() => run01({ sourceMode: "yellowdig" })).toThrow(/YELLOWDIG_CREDENTIAL_NOT_CONFIGURED/);
  });

  it("live path with simulated (synthetic) API pages: bundle is marked live and pseudonymized with the run's salt", () => {
    const salt = "s".repeat(40);
    const pages = syntheticWeek2Pages(250) as J[];
    const input = { sourceMode: "yellowdig", yellowdigCredentialConfigured: true, pseudonymSalt: salt };
    expect(() => run01({ sourceMode: "yellowdig", yellowdigCredentialConfigured: true }, pages)).toThrow(/pseudonymSalt/);
    const { bundle } = run01(input, pages);
    expect(bundle).toMatchObject({ sourceModeUsed: "yellowdig", provider: "yellowdig-api", liveSourceVerified: true, fallbackReason: "NONE" });
    expect(JSON.stringify(bundle)).not.toContain(salt);
    expect((bundle.capability as J).sampleSize).toBe(250);
    const dataset = run02(bundle);
    expect((dataset.metrics as J).posts).toBe(8);
    expect((dataset.source as J).liveSourceVerified).toBe(true);
  });

  it("Classify Fetch Failure: retry, fallback and failure", () => {
    const ran = { [NODE.validateConfig]: runNode("wf01", "validateConfig", [{ ...SYNTHETIC_WEEK2_RUN, sourceMode: "auto", yellowdigCredentialConfigured: true, pseudonymSalt: "s".repeat(40) }])[0] };
    expect(runNode("wf01", "classifyFetchFailure", [{ error: { message: "429 - Too Many Requests", httpCode: "429" } }], ran, 0)[0]).toMatchObject({ action: "retry", waitSeconds: 1 });
    expect(runNode("wf01", "classifyFetchFailure", [{ error: { message: "503 - Service Unavailable" } }], ran, 3)[0]).toMatchObject({ action: "fallback", fallbackReason: "YELLOWDIG_TEMPORARY_FAILURE" });
    expect(runNode("wf01", "classifyFetchFailure", [{ error: { message: "Authorization failed", httpCode: "401" } }], ran)[0]).toMatchObject({ action: "fallback", fallbackReason: "YELLOWDIG_UNAUTHORIZED" });
    const strict = { [NODE.validateConfig]: runNode("wf01", "validateConfig", [{ ...SYNTHETIC_WEEK2_RUN, sourceMode: "yellowdig", yellowdigCredentialConfigured: true, pseudonymSalt: "s".repeat(40) }])[0] };
    expect(() => runNode("wf01", "classifyFetchFailure", [{ error: { message: "403 - Forbidden", httpCode: "403" } }], strict)).toThrow(/YELLOWDIG_FORBIDDEN/);
  });

  it("02 rejects a bundle that claims fixture data is live", () => {
    const { bundle } = run01({});
    expect(() => run02({ ...bundle, liveSourceVerified: true })).toThrow(/CONTRACT_VIOLATION/);
  });

  it("committed generated files match a fresh build", () => {
    for (const [wf, entries] of Object.entries(ENTRIES)) {
      for (const e of entries) {
        const committed = readFileSync(join(REPO_ROOT, "n8n", "src", "generated", wf, e + ".js"), "utf8");
        expect(committed, wf + "." + e + " is stale: run npm run build:n8n").toBe(get(wf as "wf01" | "wf02", e));
      }
    }
  });
});
