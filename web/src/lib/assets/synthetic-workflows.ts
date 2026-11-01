// Synthetic n8n workflows for tests, fixtures and the workflow 03 dev run. All values are invented.
// "Secrets" are obviously fake (SYNTHETIC-FAKE-…) and emails use the reserved example.edu domain.
// Each builder is a separate export so bundles only carry what they use.

type N = Record<string, unknown> & { name: string; type: string };
type E = [from: string, to: string, out?: number, kind?: "main" | "ai_languageModel" | "ai_memory" | "ai_tool" | "ai_vectorStore"];

const B = "n8n-nodes-base.";
const L = "@n8n/n8n-nodes-langchain.";

export function node(name: string, type: string, parameters: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): N {
  return { name, type, typeVersion: 1, parameters, ...extra };
}

/** Builds an n8n workflow object: positions and fake ids are added; edges become n8n connections. */
export function wf(name: string, nodes: N[], edges: E[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  const connections: Record<string, Record<string, Array<Array<{ node: string; type: string; index: number }>>>> = {};
  edges.forEach(([from, to, out = 0, kind = "main"]) => {
    const byType = (connections[from] ??= {});
    const outs = (byType[kind] ??= []);
    while (outs.length <= out) outs.push([]);
    outs[out].push({ node: to, type: kind, index: 0 });
  });
  return {
    name,
    nodes: nodes.map((n, i) => ({ id: "00000000-0000-4000-8000-" + String(i).padStart(12, "0"), position: [i * 220, 0], ...n })),
    connections,
    settings: { executionOrder: "v1" },
    ...extra,
  };
}

const lt = (left: string, right: number) => ({
  conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, combinator: "and",
    conditions: [{ leftValue: left, rightValue: right, operator: { type: "number", operation: "lt" } }] },
});
const isTrue = (left: string) => ({
  conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, combinator: "and",
    conditions: [{ leftValue: left, rightValue: true, operator: { type: "boolean", operation: "true" } }] },
});
const model = (name = "OpenAI Chat Model") => node(name, L + "lmChatOpenAi", { model: "gpt-4o-mini" });

// ---------- Phase 3 fixture cases ----------
export const simpleAi = () => wf("Simple AI summary", [
  node("Manual", B + "manualTrigger"), node("Summarize", L + "agent", { text: "={{ $json.notes }}" }), model(), node("Output", B + "set"),
], [["Manual", "Summarize"], ["Summarize", "Output"], ["OpenAI Chat Model", "Summarize", 0, "ai_languageModel"]]);

export const aiValidatorEmail = () => wf("AI with validator and email", [
  node("Form", B + "formTrigger"), node("Draft reply", L + "chainLlm", { prompt: "Draft a reply" }), model(),
  node("Validate output", B + "code", { jsCode: "const ok = $json.text.length > 20;\nreturn [{ json: { ...$json, ok } }];" }),
  node("Valid?", B + "if", isTrue("={{ $json.ok }}")), node("Send email", B + "gmail", { operation: "send", sendTo: "={{ $json.to }}" }),
], [["Form", "Draft reply"], ["Draft reply", "Validate output"], ["Validate output", "Valid?"], ["Valid?", "Send email"], ["OpenAI Chat Model", "Draft reply", 0, "ai_languageModel"]]);

export const writerReviewerUnbounded = () => wf("Writer and reviewer loop", [
  node("Manual", B + "manualTrigger"), node("Writer", L + "agent"), node("Reviewer", L + "agent"),
  node("Approved?", B + "if", isTrue("={{ $json.approved }}")), node("Send", B + "gmail", { operation: "send" }), model(),
], [["Manual", "Writer"], ["Writer", "Reviewer"], ["Reviewer", "Approved?"], ["Approved?", "Send", 0], ["Approved?", "Writer", 1],
  ["OpenAI Chat Model", "Writer", 0, "ai_languageModel"], ["OpenAI Chat Model", "Reviewer", 0, "ai_languageModel"]]);

export const humanApproval = () => wf("Human approval before calendar", [
  node("Every Monday", B + "scheduleTrigger"), node("Plan", L + "chainLlm"), model(),
  node("Ask for approval", B + "gmail", { operation: "sendAndWait", subject: "Approve plan?" }),
  node("Approved?", B + "if", isTrue("={{ $json.data.approved }}")), node("Create events", B + "googleCalendar", { operation: "create" }),
], [["Every Monday", "Plan"], ["Plan", "Ask for approval"], ["Ask for approval", "Approved?"], ["Approved?", "Create events"], ["OpenAI Chat Model", "Plan", 0, "ai_languageModel"]]);

export const boundedRetry = () => wf("Bounded API retry", [
  node("Manual", B + "manualTrigger"), node("Call API", B + "httpRequest", { url: "https://api.example.invalid/items" }),
  node("Check response", B + "code", { jsCode: "return [{ json: { ok: $json.status === 'ok' } }];" }),
  node("OK?", B + "if", isTrue("={{ $json.ok }}")), node("Done", B + "set"),
  node("Attempts left?", B + "if", lt("={{ $runIndex }}", 3)), node("Pause", B + "wait", { amount: 2 }),
], [["Manual", "Call API"], ["Call API", "Check response"], ["Check response", "OK?"], ["OK?", "Done", 0], ["OK?", "Attempts left?", 1],
  ["Attempts left?", "Pause", 0], ["Pause", "Call API"]]);

export const unboundedLoop = () => wf("Polling loop without a limit", [
  node("Manual", B + "manualTrigger"), node("Poll", B + "httpRequest", { url: "https://api.example.invalid/status" }),
  node("Done?", B + "if", isTrue("={{ $json.done }}")), node("Pause", B + "wait", { amount: 5 }), node("Finish", B + "set"),
], [["Manual", "Poll"], ["Poll", "Done?"], ["Done?", "Finish", 0], ["Done?", "Pause", 1], ["Pause", "Poll"]]);

export const externalApi = () => wf("External API to sheet", [
  node("Daily", B + "scheduleTrigger"), node("Fetch rates", B + "httpRequest", { url: "https://api.example.invalid/rates" }),
  node("Shape rows", B + "set"), node("Append rows", B + "googleSheets", { operation: "append" }),
], [["Daily", "Fetch rates"], ["Fetch rates", "Shape rows"], ["Shape rows", "Append rows"]]);

export const gmailFlow = () => wf("Gmail auto-labeler", [
  node("New email", B + "gmailTrigger"), node("Pick label", B + "set"), node("Reply", B + "gmail", { operation: "reply" }),
], [["New email", "Pick label"], ["Pick label", "Reply"]]);

export const codeValidator = () => wf("Webhook with code validation", [
  node("Incoming", B + "webhook", { path: "00000000-aaaa-4bbb-8ccc-000000000001", httpMethod: "POST" }, { webhookId: "00000000-aaaa-4bbb-8ccc-000000000001" }),
  node("Validate input", B + "code", { jsCode: "if (!$json.body.id) throw new Error('missing id');\nreturn $input.all();" }),
  node("Valid?", B + "if", isTrue("={{ !!$json.body.id }}")), node("Forward", B + "httpRequest", { url: "https://api.example.invalid/forward" }),
  node("Respond invalid", B + "respondToWebhook"),
], [["Incoming", "Validate input"], ["Validate input", "Valid?"], ["Valid?", "Forward", 0], ["Valid?", "Respond invalid", 1]]);

export const failureBranch = () => wf("Explicit failure branch", [
  node("Manual", B + "manualTrigger"), node("Call API", B + "httpRequest", { url: "https://api.example.invalid/x" }, { onError: "continueErrorOutput" }),
  node("Use result", B + "set"), node("Alert on failure", B + "slack", { operation: "post" }),
], [["Manual", "Call API"], ["Call API", "Use result", 0], ["Call API", "Alert on failure", 1]]);

export const disabledNodes = () => wf("Disabled nodes", [
  node("Manual", B + "manualTrigger"), node("Prepare", B + "set"), node("Send (off)", B + "gmail", { operation: "send" }, { disabled: true }),
], [["Manual", "Prepare"], ["Prepare", "Send (off)"]]);

export const MALFORMED_JSON = '{ "name": "broken", "nodes": [ { "name": "x", "type": ';
export const notN8n = () => ({ title: "Course notes", items: [1, 2, 3], connections: "none" });

export const credentialRefs = () => wf("Credential references", [
  node("Manual", B + "manualTrigger"),
  node("Send", B + "gmail", { operation: "send" }, { credentials: { gmailOAuth2: { id: "SYNTHETIC-CRED-ID-1", name: "Synthetic Gmail account" } } }),
  node("Call", B + "httpRequest", { url: "https://api.example.invalid", authentication: "genericCredentialType" }, { credentials: { httpHeaderAuth: { id: "SYNTHETIC-CRED-ID-2", name: "Synthetic header auth" } } }),
], [["Manual", "Send"], ["Send", "Call"]]);

export const pinnedData = () => wf("Pinned data", [node("Manual", B + "manualTrigger"), node("Shape", B + "set")], [["Manual", "Shape"]], {
  pinData: { Manual: [{ json: { student: "Synthetic Student", note: "pinned synthetic row" } }] },
  staticData: { lastRun: "2026-01-01" },
});

/** Obviously fake secret values, assembled at runtime so no source or bundle holds a literal key assignment. */
const fake = (kind: string) => ["SYNTHETIC", "FAKE", kind].join("-");

export const fakeSecrets = () => wf("Hard-coded fake secrets", [
  node("Manual", B + "manualTrigger"),
  node("Call API", B + "httpRequest", {
    url: "https://api.example.invalid/v1?api_key=" + fake("KEY-000000000000") + "&q=1",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Authorization", value: "Bearer " + fake("TOKEN-0000000000000000") }, { name: "Accept", value: "application/json" }] },
    apiKey: fake("KEY-111111111111"),
    callbackUrl: "https://n8n.example.invalid/webhook/00000000-0000-4000-8000-00000000abcd",
  }),
  node("Code", B + "code", { jsCode: "const password = '" + fake("PASSWORD") + "';\nreturn $input.all();" }),
], [["Manual", "Call API"], ["Call API", "Code"]]);

export const fakeEmail = () => wf("Notify student.one@example.edu", [
  node("Manual", B + "manualTrigger"),
  node("Compose", B + "set", { assignments: { assignments: [{ name: "to", value: "student.two@example.edu" }, { name: "note", value: "Ask student.three@example.edu" }] } }),
], [["Manual", "Compose"]]);

export const unknownCustomNode = () => wf("Community node", [
  node("Manual", B + "manualTrigger"), node("Acme magic", "n8n-nodes-acme-community.superNode", { mode: "auto" }),
], [["Manual", "Acme magic"]]);

/** n nodes in a chain (for limit tests). Not written to disk. */
export const largeWorkflow = (n: number) => wf("Large", Array.from({ length: n }, (_, i) => node("Step " + i, B + "set")),
  Array.from({ length: Math.max(0, n - 1) }, (_, i) => ["Step " + i, "Step " + (i + 1)] as E));

// ---------- Synthetic Week 2 builds (the fixture's posts 1, 2, 3, 4, 5, 7, 8) ----------
export const recipeScaler = () => wf("Recipe Scaler", [
  node("Recipe form", B + "formTrigger"), node("Draft scaled recipe", L + "agent"), node("Judge draft", L + "agent"), model(),
  node("Check units and score", B + "code", { jsCode: "const pass = $json.score >= 8 && $json.units.every(Boolean);\nreturn [{ json: { ...$json, pass } }];" }),
  node("Passed?", B + "if", isTrue("={{ $json.pass }}")), node("Email recipe", B + "gmail", { operation: "send" }),
  node("Revisions left?", B + "if", lt("={{ $json.revision }}", 2)), node("Revise draft", L + "agent"),
  node("Email for manual check", B + "gmail", { operation: "send" }),
], [["Recipe form", "Draft scaled recipe"], ["Draft scaled recipe", "Judge draft"], ["Judge draft", "Check units and score"], ["Check units and score", "Passed?"],
  ["Passed?", "Email recipe", 0], ["Passed?", "Revisions left?", 1], ["Revisions left?", "Revise draft", 0], ["Revisions left?", "Email for manual check", 1],
  ["Revise draft", "Judge draft"], ["OpenAI Chat Model", "Draft scaled recipe", 0, "ai_languageModel"], ["OpenAI Chat Model", "Judge draft", 0, "ai_languageModel"],
  ["OpenAI Chat Model", "Revise draft", 0, "ai_languageModel"]]);

export const studyPlanner = () => wf("Study Planner", [
  node("Every Monday", B + "scheduleTrigger"), node("Read calendar", B + "googleCalendar", { operation: "getAll" }),
  node("Plan the week", L + "chainLlm"), node("Anthropic Chat Model", L + "lmChatAnthropic"),
  node("Ask for approval", B + "gmail", { operation: "sendAndWait" }), node("Approved?", B + "if", isTrue("={{ $json.data.approved }}")),
  node("Create events", B + "googleCalendar", { operation: "create" }, { onError: "continueErrorOutput" }), node("Notify failure", B + "gmail", { operation: "send" }),
], [["Every Monday", "Read calendar"], ["Read calendar", "Plan the week"], ["Plan the week", "Ask for approval"], ["Ask for approval", "Approved?"],
  ["Approved?", "Create events"], ["Create events", "Notify failure", 1], ["Anthropic Chat Model", "Plan the week", 0, "ai_languageModel"]]);

export const newsBrief = () => wf("Morning News Brief", [
  node("Daily 7am", B + "scheduleTrigger"), node("Read feeds", B + "rssFeedRead"),
  node("Summarize", L + "agent", {}, { onError: "continueErrorOutput" }), node("Gemini Chat Model", L + "lmChatGoogleGemini"),
  node("Yesterday's headlines", L + "memoryBufferWindow"), node("Fallback list", B + "set"), node("Send brief", B + "telegram", { operation: "sendMessage" }),
], [["Daily 7am", "Read feeds"], ["Read feeds", "Summarize"], ["Summarize", "Send brief", 0], ["Summarize", "Fallback list", 1], ["Fallback list", "Send brief"],
  ["Gemini Chat Model", "Summarize", 0, "ai_languageModel"], ["Yesterday's headlines", "Summarize", 0, "ai_memory"]]);

export const expenseLogger = () => wf("Expense Logger", [
  node("New receipt email", B + "gmailTrigger"), node("Extract fields", L + "informationExtractor"), model(),
  node("Validate amount and date", B + "code", { jsCode: "const ok = typeof $json.amount === 'number' && $json.month === new Date().getMonth();\nreturn [{ json: { ...$json, ok } }];" }),
  node("Valid?", B + "if", isTrue("={{ $json.ok }}")), node("Append to sheet", B + "googleSheets", { operation: "append" }),
  node("Retry allowed?", B + "if", lt("={{ $runIndex }}", 3)), node("Flag invalid receipt", B + "googleSheets", { operation: "append" }),
], [["New receipt email", "Extract fields"], ["Extract fields", "Validate amount and date"], ["Validate amount and date", "Valid?"], ["Valid?", "Append to sheet", 0],
  ["Valid?", "Retry allowed?", 1], ["Retry allowed?", "Extract fields", 0], ["Retry allowed?", "Flag invalid receipt", 1],
  ["OpenAI Chat Model", "Extract fields", 0, "ai_languageModel"]]);

export const supportDesk = () => wf("Support Reply Desk", [
  node("Ticket form", B + "formTrigger"), node("Writer", L + "agent"), node("Judge", L + "agent"), node("Anthropic Chat Model", L + "lmChatAnthropic"),
  node("Risk flags", B + "code", { jsCode: "const risky = $json.refund > 100;\nconst pass = $json.score >= 8 && !risky;\nreturn [{ json: { ...$json, risky, pass } }];" }),
  node("Pass rule", B + "if", isTrue("={{ $json.pass }}")), node("Telegram approval", B + "telegram", { operation: "sendAndWait" }),
  node("Send reply", B + "gmail", { operation: "send" }), node("Revisions left?", B + "if", lt("={{ $runIndex }}", 2)),
], [["Ticket form", "Writer"], ["Writer", "Judge"], ["Judge", "Risk flags"], ["Risk flags", "Pass rule"], ["Pass rule", "Telegram approval", 0], ["Pass rule", "Revisions left?", 1],
  ["Revisions left?", "Writer", 0], ["Telegram approval", "Send reply"], ["Anthropic Chat Model", "Writer", 0, "ai_languageModel"], ["Anthropic Chat Model", "Judge", 0, "ai_languageModel"]]);

export const notesQa = () => wf("Lecture Notes Q&A", [
  node("Chat", L + "chatTrigger"), node("Answer", L + "agent"), model(), node("Notes store", L + "vectorStoreInMemory", { mode: "retrieve-as-tool" }),
], [["Chat", "Answer"], ["OpenAI Chat Model", "Answer", 0, "ai_languageModel"], ["Notes store", "Answer", 0, "ai_tool"]]);

export const meetingSummarizer = () => wf("Meeting Notes Summarizer", [
  node("Notes form", B + "formTrigger"), node("Summarize", L + "chainLlm"), model(), node("Email team", B + "gmail", { operation: "send" }),
], [["Notes form", "Summarize"], ["Summarize", "Email team"], ["OpenAI Chat Model", "Summarize", 0, "ai_languageModel"]]);

/** A tiny synthetic PNG/JPEG/WEBP: a valid signature followed by deterministic filler bytes. */
export function syntheticImageBase64(kind: "png" | "jpeg" | "webp", seed: string): string {
  const head = kind === "png" ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] : kind === "jpeg" ? [0xff, 0xd8, 0xff, 0xe0]
    : [0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
  const bytes = [...head, ...Array.from(seed).map((ch) => ch.charCodeAt(0) & 255)];
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < bytes.length ? A[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? A[n & 63] : "=");
  }
  return out;
}

/** The small batch used by workflow 03's manual test run (synthetic only). */
export function syntheticAssetBatch() {
  const json = (o: unknown) => JSON.stringify(o);
  return {
    week: 2,
    knownPostRefs: ["syn-w2-p01", "syn-w2-p02"],
    assets: [
      { postRef: "syn-w2-p01", originalFilename: "recipe-scaler.json", mimeType: "application/json", contentText: json(recipeScaler()) },
      { postRef: "syn-w2-p02", originalFilename: "study-planner.json", mimeType: "application/json", contentText: json(studyPlanner()) },
      { postRef: "syn-w2-p02", originalFilename: "study-planner-copy.json", mimeType: "application/json", contentText: json(studyPlanner()) },
      { postRef: "syn-w2-p01", originalFilename: "recipe-overview.png", mimeType: "image/png", contentBase64: syntheticImageBase64("png", "recipe-overview") },
      { postRef: null, originalFilename: "community-node.json", mimeType: "application/json", contentText: json(unknownCustomNode()) },
      { postRef: "syn-w2-p02", originalFilename: "broken.json", mimeType: "application/json", contentText: MALFORMED_JSON },
      { postRef: "syn-w2-p02", originalFilename: "notes.json", mimeType: "application/json", contentText: json(notN8n()) },
      { postRef: "syn-w2-p01", originalFilename: "secrets.json", mimeType: "application/json", contentText: json(fakeSecrets()) },
      { postRef: "syn-w2-p01", originalFilename: "run.sh", mimeType: "text/x-shellscript", contentText: "echo synthetic" },
    ],
  };
}
