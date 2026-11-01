import { describe, expect, it } from "vitest";
import { loadValidators } from "../../../scripts/schemas";
import { assertAssetManifest, assertWorkflowProfile } from "../contracts/assets-registry";
import { assetManifestSchema, workflowProfileSchema, type WorkflowProfile } from "../contracts";
import { publicationEligibility } from "../source/publication-policy";
import * as A from ".";

const ajv = loadValidators();
const json = (o: unknown) => JSON.stringify(o);
const wfAsset = (o: unknown, extra: Partial<A.AssetInput> = {}): A.AssetInput => ({ postRef: "post-1", originalFilename: "wf.json", mimeType: "application/json", contentText: typeof o === "string" ? o : json(o), ...extra });
const run = (assets: A.AssetInput[], knownPostRefs: string[] | null = ["post-1", "post-2"]) => A.processAssetBatch({ week: 4, knownPostRefs, assets });
const profileOf = (o: unknown): WorkflowProfile => {
  const r = run([wfAsset(o)]);
  expect(r.profiles, JSON.stringify(r.manifest.assets[0])).toHaveLength(1);
  return r.profiles[0];
};
const statusOf = (o: unknown, extra: Partial<A.AssetInput> = {}) => { const e = run([wfAsset(o, extra)]).manifest.assets[0]; return [e.status, e.reason]; };
const caps = (p: WorkflowProfile) => Object.entries(p.capabilities).filter(([, v]) => v).map(([k]) => k).sort();

describe("file validation", () => {
  it("accepts a valid workflow and profiles it", () => expect(statusOf(A.simpleAi())).toEqual(["PROFILED", null]));
  it.each([
    ["malformed JSON", A.MALFORMED_JSON, "INVALID_JSON"],
    ["valid JSON that is not n8n", json(A.notN8n()), "NOT_N8N_WORKFLOW"],
    ["JSON array", "[1,2,3]", "CONTENT_MISMATCH"],
    ["empty file", "   ", "EMPTY_FILE"],
    ["deep nesting", "{\"a\":" + "[".repeat(200) + "]".repeat(200) + "}", "JSON_TOO_DEEP"],
  ])("rejects %s", (_n, text, reason) => expect(statusOf(text)).toEqual(["REJECTED", reason]));
  it("rejects a workflow over 5 MB before parsing", () => {
    expect(statusOf("{\"x\":\"" + "a".repeat(5 * 1024 * 1024) + "\"}")).toEqual(["REJECTED", "WORKFLOW_TOO_LARGE"]);
  });
  it("rejects too many nodes and too many edges", () => {
    expect(statusOf(A.largeWorkflow(501))).toEqual(["REJECTED", "TOO_MANY_NODES"]);
    const many = A.largeWorkflow(50) as { connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }> };
    many.connections["Step 0"].main[0] = Array.from({ length: 2001 }, (_, i) => ({ node: "Step " + (i % 50), type: "main", index: 0 }));
    expect(statusOf(many)).toEqual(["REJECTED", "TOO_MANY_EDGES"]);
  });
  it("rejects unsupported structure (duplicate node names, bad parameters)", () => {
    expect(statusOf(A.wf("dup", [A.node("A", "n8n-nodes-base.set"), A.node("A", "n8n-nodes-base.set")], []))).toEqual(["REJECTED", "UNSUPPORTED_STRUCTURE"]);
    expect(statusOf({ nodes: [{ name: "x", type: "n8n-nodes-base.set", parameters: "nope" }], connections: {} })).toEqual(["REJECTED", "UNSUPPORTED_STRUCTURE"]);
  });
  it.each([
    ["script.js", "application/javascript"], ["run.sh", "text/x-shellscript"], ["a.exe", "application/octet-stream"], ["p.py", "text/x-python"],
    ["x.ps1", "text/plain"], ["page.html", "text/html"], ["pic.svg", "image/svg+xml"], ["all.zip", "application/zip"], ["code.ts", "text/plain"], ["b.bat", "text/plain"],
  ])("rejects disallowed file type %s", (name, mime) => {
    expect(run([{ postRef: "post-1", originalFilename: name, mimeType: mime, contentText: "echo synthetic" }]).manifest.assets[0]).toMatchObject({ status: "REJECTED", reason: "UNSUPPORTED_FILE_TYPE" });
  });
  it("checks extension, MIME and content for screenshots", () => {
    const png = A.syntheticImageBase64("png", "a");
    const ok = run([{ postRef: "post-1", originalFilename: "shot.png", mimeType: "image/png", contentBase64: png }]).manifest.assets[0];
    expect(ok).toMatchObject({ status: "VALIDATED", reason: null });
    expect(ok.asset.kind).toBe("workflow_screenshot");
    expect(run([{ postRef: "post-1", originalFilename: "shot.png", mimeType: "image/jpeg", contentBase64: png }]).manifest.assets[0].reason).toBe("MIME_MISMATCH");
    expect(run([{ postRef: "post-1", originalFilename: "shot.png", mimeType: "image/png", contentBase64: A.syntheticImageBase64("jpeg", "a") }]).manifest.assets[0].reason).toBe("CONTENT_MISMATCH");
    expect(run([{ postRef: "post-1", originalFilename: "shot.webp", mimeType: "image/webp", contentBase64: A.syntheticImageBase64("webp", "w") }]).manifest.assets[0].status).toBe("VALIDATED");
    expect(run([{ postRef: "post-1", originalFilename: "shot.jpg", mimeType: "image/jpeg", contentBase64: A.syntheticImageBase64("jpeg", "j") }]).manifest.assets[0].status).toBe("VALIDATED");
  });
  it("rejects a screenshot over 10 MB from its encoded length, without decoding", () => {
    const big = "A".repeat(Math.ceil((10 * 1024 * 1024 + 10) / 3) * 4);
    expect(run([{ postRef: "post-1", originalFilename: "big.png", mimeType: "image/png", contentBase64: big }]).manifest.assets[0]).toMatchObject({ status: "REJECTED", reason: "IMAGE_TOO_LARGE" });
  });
  it("sanitizes file names (no paths, safe characters)", () => {
    expect(A.safeFilename("../../etc/My Workflow (final)!.json")).toBe("My-Workflow-final-.json");
    expect(A.safeFilename("C:\\Users\\x\\wf.json")).toBe("wf.json");
  });
});

describe("batch limits, duplicates and post matching", () => {
  it("detects identical workflow content and links the duplicate", () => {
    const r = run([wfAsset(A.simpleAi()), wfAsset(A.simpleAi(), { postRef: "post-2", originalFilename: "copy.json" })]);
    expect(r.manifest.assets.map((e) => e.status)).toEqual(["PROFILED", "DUPLICATE"]);
    expect(r.manifest.assets[1]).toMatchObject({ reason: "DUPLICATE_CONTENT", duplicateOf: r.manifest.assets[0].asset.assetId });
    expect(r.profiles).toHaveLength(1);
  });
  it("detects identical screenshots", () => {
    const shot = { postRef: "post-1", originalFilename: "s.png", mimeType: "image/png", contentBase64: A.syntheticImageBase64("png", "same") };
    expect(run([shot, { ...shot, originalFilename: "t.png" }]).manifest.summary).toMatchObject({ validated: 1, duplicates: 1 });
  });
  it("never guesses a post: missing or unknown postRef is UNMATCHED_ASSET", () => {
    const r = run([wfAsset(A.simpleAi(), { postRef: null }), wfAsset(A.gmailFlow(), { postRef: "post-999" })]);
    expect(r.manifest.assets.map((e) => [e.status, e.reason, e.asset.postRef])).toEqual([
      ["UNMATCHED_ASSET", "NO_POST_REFERENCE", null], ["UNMATCHED_ASSET", "UNKNOWN_POST_REFERENCE", null],
    ]);
    expect(r.profiles.every((p) => p.postRef === null)).toBe(true);
  });
  it("enforces the per-post and per-batch limits", () => {
    const many = Array.from({ length: 11 }, (_, i) => wfAsset(A.wf("W" + i, [A.node("M", "n8n-nodes-base.manualTrigger")], [])));
    expect(run(many).manifest.assets[10]).toMatchObject({ status: "REJECTED", reason: "TOO_MANY_FILES_FOR_POST" });
    const batch = Array.from({ length: 101 }, (_, i) => wfAsset(A.wf("B" + i, [A.node("M", "n8n-nodes-base.manualTrigger")], []), { postRef: "p" + i }));
    expect(run(batch, null).manifest.assets[100]).toMatchObject({ status: "REJECTED", reason: "BATCH_LIMIT_EXCEEDED" });
  });
  it("rejects invalid post references", () => {
    expect(run([wfAsset(A.simpleAi(), { postRef: "../../x y" })]).manifest.assets[0].reason).toBe("INVALID_ASSET_METADATA");
  });
});

describe("security scan and sanitization", () => {
  it("strips credential references and never exposes their ids or names", () => {
    const p = profileOf(A.credentialRefs());
    expect(p.security.credentialReferencesDetected).toBe(2);
    expect(JSON.stringify(p)).not.toMatch(/SYNTHETIC-CRED|Synthetic Gmail|Synthetic header/);
  });
  it("flags and drops pinned data, static data and execution data", () => {
    const p = profileOf({ ...A.pinnedData(), data: { resultData: { runData: { x: 1 } } } });
    expect(p.security).toMatchObject({ pinnedDataDetected: true, staticDataDetected: true, executionDataDetected: true });
    expect(JSON.stringify(p)).not.toMatch(/Synthetic Student|pinned synthetic row/);
  });
  it("redacts and counts fake secrets in headers, query strings, keys, code and webhook URLs", () => {
    const p = profileOf(A.fakeSecrets());
    expect(p.security.possibleSecretsDetected).toBe(4); // query key, Authorization header, apiKey, password literal in code
    expect(p.security.webhookUrlsRedacted).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(p)).not.toMatch(/SYNTHETIC-FAKE|webhook\//);
  });
  it("detects vendor-shaped secrets (built at runtime, never stored in the repo)", () => {
    const fakes = ["sk-" + "a".repeat(40), "ghp_" + "b".repeat(36), "AKIA" + "C".repeat(16), "xoxb-" + "1".repeat(20), "eyJ" + "a".repeat(12) + "." + "b".repeat(12) + "." + "c".repeat(12)];
    const w = A.wf("vendor", [A.node("Manual", "n8n-nodes-base.manualTrigger"), A.node("Set", "n8n-nodes-base.set", { values: fakes.map((v) => ({ value: v })), note: "Bearer " + "z".repeat(30) })], [["Manual", "Set"]]);
    const r = A.sanitizeWorkflow(w);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.security.possibleSecretsDetected).toBe(6);
      expect(JSON.stringify(r.workflow)).not.toMatch(/sk-a|ghp_b|AKIAC|xoxb-|eyJa|Bearer z/);
    }
  });
  it("redacts and counts emails in the workflow name, node parameters and labels", () => {
    const p = profileOf(A.fakeEmail());
    expect(p.security.emailsDetected).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(p)).not.toMatch(/@example\.edu/);
  });
  it("removes webhook ids and webhook paths", () => {
    const p = profileOf(A.codeValidator());
    expect(p.security.webhookIdsRemoved).toBe(1);
    expect(JSON.stringify(p)).not.toContain("00000000-aaaa-4bbb-8ccc-000000000001");
  });
  it("drops embedded binary data URIs", () => {
    const r = A.sanitizeWorkflow(A.wf("bin", [A.node("Set", "n8n-nodes-base.set", { file: "data:image/png;base64,iVBORw0KGgo=" })], []));
    expect(r.ok && r.security.binaryDataDetected).toBe(true);
  });
  it("profiles never contain parameters, prompts or code", () => {
    const p = profileOf(A.aiValidatorEmail());
    expect(JSON.stringify(p)).not.toMatch(/jsCode|Draft a reply|text\.length|parameters/);
  });
  it("never executes or evaluates workflow content", () => {
    // A Code node that would throw or have side effects if it ran; profiling must not touch it.
    const trap = A.wf("trap", [A.node("Manual", "n8n-nodes-base.manualTrigger"), A.node("Boom", "n8n-nodes-base.code", { jsCode: "globalThis.__pwned = true; throw new Error('executed');" })], [["Manual", "Boom"]]);
    profileOf(trap);
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });
});

describe("deterministic profiling", () => {
  it("counts nodes, edges, triggers and disabled nodes; builds a safe graph", () => {
    const p = profileOf(A.disabledNodes());
    expect(p).toMatchObject({ nodeCount: 3, edgeCount: 2, triggerCount: 1, disabledNodeCount: 1 });
    expect(p.graph.nodes.map((n) => n.id)).toEqual(["n0", "n1", "n2"]);
    expect(p.graph.nodes[2]).toMatchObject({ disabled: true, category: "email" });
    expect(p.capabilities.usesEmail).toBe(false); // the only email node is disabled
    expect(p.graph.edges[0]).toEqual({ source: "n0", target: "n1", sourceOutput: 0, targetInput: 0, kind: "main" });
  });
  it.each([
    ["simple AI", A.simpleAi, ["usesAI"]],
    ["AI → validator → email", A.aiValidatorEmail, ["hasCodeValidation", "hasValidationGate", "usesAI", "usesCode", "usesEmail"]],
    // The reviewer agent gates the writer agent, so it is structurally an LLM judge behind a validation gate.
    ["writer/reviewer unbounded loop", A.writerReviewerUnbounded, ["hasValidationGate", "usesAI", "usesEmail", "usesLLMJudge", "usesMultipleAgents", "usesRetry"]],
    ["human approval", A.humanApproval, ["usesAI", "usesEmail", "usesHumanApproval"]],
    ["bounded retry", A.boundedRetry, ["hasBoundedRetry", "hasCodeValidation", "hasValidationGate", "usesCode", "usesExternalAPI", "usesRetry"]],
    ["unbounded loop", A.unboundedLoop, ["usesExternalAPI", "usesRetry"]],
    ["external API", A.externalApi, ["usesDataStore", "usesExternalAPI"]],
    ["Gmail", A.gmailFlow, ["usesEmail"]],
    // The invalid branch routes to "Respond invalid", an explicit failure path.
    ["code validator", A.codeValidator, ["hasCodeValidation", "hasExplicitFailureHandling", "hasValidationGate", "usesCode", "usesExternalAPI"]],
    ["explicit failure branch", A.failureBranch, ["hasExplicitFailureHandling", "usesExternalAPI"]],
    ["unknown custom node", A.unknownCustomNode, []],
  ])("%s → exact capabilities", (_n, build, expected) => {
    expect(caps(profileOf(build()))).toEqual([...expected].sort());
  });
  it("bounded vs unbounded retry", () => {
    expect(profileOf(A.boundedRetry()).retry).toEqual({ cycles: 1, boundedCycles: 1, nodeRetries: 0, maxAttempts: 3 });
    expect(profileOf(A.unboundedLoop()).retry).toEqual({ cycles: 1, boundedCycles: 0, nodeRetries: 0, maxAttempts: null });
    expect(profileOf(A.writerReviewerUnbounded()).capabilities.hasBoundedRetry).toBe(false);
  });
  it("node-level retryOnFail counts as bounded retry; one unbounded cycle makes the whole workflow unbounded", () => {
    const retry = A.wf("r", [A.node("M", "n8n-nodes-base.manualTrigger"), A.node("H", "n8n-nodes-base.httpRequest", {}, { retryOnFail: true, maxTries: 4 })], [["M", "H"]]);
    expect(profileOf(retry)).toMatchObject({ retry: { nodeRetries: 1, maxAttempts: 4 }, capabilities: { usesRetry: true, hasBoundedRetry: true } });
    const mixed = A.unboundedLoop() as { nodes: Array<Record<string, unknown>> };
    (mixed.nodes[1] as Record<string, unknown>).retryOnFail = true;
    expect(profileOf(mixed).capabilities.hasBoundedRetry).toBe(false);
  });
  it("does not infer capabilities from names", () => {
    const named = A.wf("AI human approval validator retry", [
      A.node("Manual", "n8n-nodes-base.manualTrigger"), A.node("AI Agent human approval", "n8n-nodes-base.set"), A.node("Validator retry loop", "n8n-nodes-base.set"),
    ], [["Manual", "AI Agent human approval"], ["AI Agent human approval", "Validator retry loop"]]);
    expect(caps(profileOf(named))).toEqual([]);
  });
  it("a Code node alone is not a validation gate", () => {
    const codeOnly = A.wf("c", [A.node("M", "n8n-nodes-base.manualTrigger"), A.node("Validate", "n8n-nodes-base.code", { jsCode: "return $input.all();" }), A.node("Send", "n8n-nodes-base.gmail")], [["M", "Validate"], ["Validate", "Send"]]);
    expect(profileOf(codeOnly).capabilities).toMatchObject({ usesCode: true, hasValidationGate: false, hasCodeValidation: false });
  });
  it("one agent is not multi-agent; the human-approval node must route onward", () => {
    expect(profileOf(A.simpleAi()).capabilities.usesMultipleAgents).toBe(false);
    const deadEnd = A.wf("d", [A.node("M", "n8n-nodes-base.manualTrigger"), A.node("Ask", "n8n-nodes-base.gmail", { operation: "sendAndWait" })], [["M", "Ask"]]);
    expect(profileOf(deadEnd).capabilities.usesHumanApproval).toBe(false);
  });
  it("classifies error outputs and unknown nodes", () => {
    const p = profileOf(A.failureBranch());
    expect(p.graph.edges.find((e) => e.kind === "error")).toMatchObject({ source: "n1", target: "n3", sourceOutput: 1 });
    expect(profileOf(A.unknownCustomNode()).graph.nodes[1]).toMatchObject({ category: "other", type: "n8n-nodes-acme-community.superNode" });
  });
  it("Week 2 builds reproduce the expected issue signals", () => {
    const sig = (b: () => Record<string, unknown>) => profileOf(b()).capabilities;
    expect(sig(A.recipeScaler)).toMatchObject({ hasCodeValidation: true, hasBoundedRetry: true, usesLLMJudge: true, usesMultipleAgents: true, hasExplicitFailureHandling: false });
    expect(profileOf(A.recipeScaler()).scoreThreshold).toEqual({ value: 8 });
    expect(sig(A.studyPlanner)).toMatchObject({ usesHumanApproval: true, hasExplicitFailureHandling: true, hasFallback: false });
    expect(sig(A.newsBrief)).toMatchObject({ hasFallback: true, hasExplicitFailureHandling: true, usesMemory: true });
    expect(sig(A.expenseLogger)).toMatchObject({ hasCodeValidation: true, hasBoundedRetry: true, hasExplicitFailureHandling: true, usesLLMJudge: false });
    expect(sig(A.supportDesk)).toMatchObject({ hasCodeValidation: true, usesHumanApproval: true, hasBoundedRetry: true, usesLLMJudge: true });
    expect(sig(A.notesQa)).toMatchObject({ usesRAG: true });
  });
  it("is deterministic: the same input gives byte-identical output", () => {
    const batch = A.syntheticAssetBatch();
    expect(JSON.stringify(A.processAssetBatch(batch))).toBe(JSON.stringify(A.processAssetBatch(JSON.parse(JSON.stringify(batch)))));
  });
});

describe("schemas", () => {
  it("manifests and profiles validate with Ajv, Zod and the n8n lite validator", () => {
    const r = A.processAssetBatch(A.syntheticAssetBatch());
    expect(ajv["asset-manifest"](r.manifest), JSON.stringify(ajv["asset-manifest"].errors)).toBe(true);
    expect(assetManifestSchema.safeParse(r.manifest).success).toBe(true);
    assertAssetManifest(r.manifest);
    r.profiles.forEach((p) => {
      expect(ajv["workflow-profile"](p), JSON.stringify(ajv["workflow-profile"].errors)).toBe(true);
      expect(workflowProfileSchema.safeParse(p).success).toBe(true);
      assertWorkflowProfile(p);
    });
    expect(r.manifest.summary).toEqual({ total: 9, profiled: 3, validated: 1, rejected: 3, duplicates: 1, unmatched: 1 });
  });
  it("the manifest has no content and no local paths", () => {
    const s = JSON.stringify(A.processAssetBatch(A.syntheticAssetBatch()).manifest);
    expect(s).not.toMatch(/contentText|contentBase64|nodes|[A-Za-z]:\\|\/Users\//);
  });
  it("both validators reject an executed profile or a credential field", () => {
    const p = profileOf(A.simpleAi());
    const bad1 = { ...p, source: { ...p.source, executed: true } };
    const bad2 = { ...p, graph: { ...p.graph, nodes: [{ ...p.graph.nodes[0], credentials: { x: 1 } }] } };
    [bad1, bad2].forEach((b) => {
      expect(ajv["workflow-profile"](b)).toBe(false);
      expect(workflowProfileSchema.safeParse(b).success).toBe(false);
      expect(() => assertWorkflowProfile(b)).toThrow(/CONTRACT_VIOLATION/);
    });
  });
});

describe("publication policy (conservative until live values are verified)", () => {
  it("never auto-publishes unverified status/visibility values", () => {
    expect(publicationEligibility({ status: "published", visibility: "public" })).toBe("needs-review");
    expect(publicationEligibility({ status: null, visibility: "public" })).toBe("needs-review");
    expect(publicationEligibility({ status: "published", visibility: "public", deleted: true })).toBe("excluded");
  });
});
