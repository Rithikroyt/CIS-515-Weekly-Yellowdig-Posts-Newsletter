// Deterministic workflow profile from a sanitized workflow. Static analysis only; nothing is executed.
// Every capability rule is structural. Node names are used only together with structure (documented below).
import type { CapabilityKey, WorkflowProfile } from "../contracts";
import { CATEGORIES, NODE_CATEGORIES } from "../contracts/vocab";
import { ACTION_CATEGORIES, AI_CATEGORIES, GATE_TYPES, LOOP_TYPES, classifyNode, type Classification } from "./classify";
import { adjacency, cycles, extractEdges, reachable, type Edge } from "./graph";
import { ASSET_LIMITS, PROFILER_VERSION } from "./limits";
import type { AssetReason, NodeCategory, SanitizedWorkflow, SecurityReport } from "./types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

const COUNTER_WORD = /(attempt|retr(y|ies)|tries|iteration|revision|counter|count|round|loop|runIndex)/i;
const CODE_COUNTER_RE = /\b[\w$.]*(attempt|retr(?:y|ies)|tries|iteration|revision|counter|round|runIndex)\w*\s*(<=|<|>=|>|===|==)\s*(\d{1,4})\b/i;
const CODE_COUNTER_REV_RE = /\b(\d{1,4})\s*(<=|<|>=|>)\s*[\w$.]*(attempt|retr(?:y|ies)|tries|iteration|revision|counter|round|runIndex)/i;
const SCORE_WORD = /(score|rating|grade)/i;
const CODE_SCORE_RE = /\b[\w$.]*(score|rating|grade)\w*\s*(>=|>|<=|<)\s*(\d{1,3}(?:\.\d+)?)\b/i;
const FAILURE_NAME_RE = /(fail|error|invalid|reject|fallback|flag|alert)/i;
const VALIDATOR_NAME_RE = /(valid|check|verif|guard|quality|qa\b|assert)/i;

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
};

/** Finds {left, right} comparison pairs in IF/Switch/Filter parameters (v2 conditions and v1 value1/value2). Iterative. */
function comparisons(params: Obj): Array<{ left: string; right: number | null }> {
  const out: Array<{ left: string; right: number | null }> = [];
  const stack: unknown[] = [params];
  let budget = 5000;
  while (stack.length && budget-- > 0) {
    const v = stack.pop();
    if (Array.isArray(v)) v.forEach((x) => stack.push(x));
    else if (isObj(v)) {
      if (typeof v.leftValue === "string") out.push({ left: v.leftValue, right: num(v.rightValue) });
      if (typeof v.value1 === "string") out.push({ left: v.value1, right: num(v.value2) });
      Object.values(v).forEach((x) => { if (x && typeof x === "object") stack.push(x); });
    }
  }
  return out;
}

const codeOf = (p: Obj) => String(p.jsCode ?? p.pythonCode ?? p.functionCode ?? p.code ?? "").slice(0, ASSET_LIMITS.maxCodeInspect);

export type ProfileResult = { ok: true; profile: WorkflowProfile } | { ok: false; reason: AssetReason };

export function buildProfile(input: { assetId: string; postRef: string | null; sha256: string; workflow: SanitizedWorkflow; security: SecurityReport }): ProfileResult {
  const { workflow: wf } = input;
  const g = extractEdges(wf);
  if (!g.ok) return g;
  const nodes = wf.nodes;
  const n = nodes.length;
  const cls: Classification[] = nodes.map((x) => classifyNode(x.type, x.parameters));
  const enabled = nodes.map((x) => !x.disabled);
  const isGate = nodes.map((x) => GATE_TYPES.has(x.type));
  const flow = adjacency(n, g.edges, ["main", "error"], enabled);
  const preds: number[][] = Array.from({ length: n }, () => []);
  flow.forEach((ts, s) => ts.forEach((t) => preds[t].push(s)));
  const enabledIdx = nodes.map((_, i) => i).filter((i) => enabled[i]);
  const has = (cats: NodeCategory[], useBase = false) => enabledIdx.some((i) => cats.includes(useBase ? cls[i].baseCategory : cls[i].category));
  const isAI = (i: number) => AI_CATEGORIES.has(cls[i].category) || AI_CATEGORIES.has(cls[i].baseCategory);

  // Retry: cycles over main + error edges among enabled nodes, and node-level retryOnFail (bounded by n8n's maxTries).
  const loops = cycles(flow);
  let maxAttempts: number | null = null;
  const bump = (v: number | null) => { if (v !== null && v >= 1 && v <= 1000) maxAttempts = Math.max(maxAttempts ?? 0, Math.floor(v)); };
  const loopBounded = loops.map((comp) => {
    let bounded = false;
    comp.forEach((i) => {
      if (LOOP_TYPES.has(nodes[i].type)) bounded = true; // Loop Over Items ends with its input
      if (isGate[i]) comparisons(nodes[i].parameters).forEach((c) => { if (COUNTER_WORD.test(c.left) && c.right !== null) { bounded = true; bump(c.right); } });
      if (cls[i].category === "code") {
        const src = codeOf(nodes[i].parameters);
        const m = CODE_COUNTER_RE.exec(src) ?? null;
        const r = m ? null : CODE_COUNTER_REV_RE.exec(src);
        if (m) { bounded = true; bump(Number(m[3])); } else if (r) { bounded = true; bump(Number(r[1])); }
      }
    });
    return bounded;
  });
  const nodeRetries = enabledIdx.filter((i) => nodes[i].retryOnFail);
  nodeRetries.forEach((i) => bump(nodes[i].maxTries ?? 3));
  const usesRetry = loops.length > 0 || nodeRetries.length > 0;

  // Validation gate: an enabled IF/Switch/Filter fed by code or AI output, with an action or AI step after it.
  const downstreamOf = (i: number) => reachable(flow, [i]);
  const validationGates = enabledIdx.filter((i) => isGate[i]
    && preds[i].some((p) => cls[p].category === "code" || isAI(p))
    && [...downstreamOf(i)].some((d) => ACTION_CATEGORIES.has(cls[d].baseCategory) || isAI(d) || cls[d].category === "human_review"));
  const codeValidators = enabledIdx.filter((i) => cls[i].category === "code" && flow[i].some((t) => validationGates.includes(t)));
  // An explicitly named validator Code node that feeds any gate also counts as a code validation step.
  enabledIdx.forEach((i) => { if (cls[i].category === "code" && VALIDATOR_NAME_RE.test(nodes[i].name) && flow[i].some((t) => isGate[t]) && !codeValidators.includes(i)) codeValidators.push(i); });

  // LLM judge: an AI node whose output reaches a validation gate directly or through one code step, with another AI node upstream.
  const judges = enabledIdx.filter((i) => isAI(i)
    && flow[i].some((t) => validationGates.includes(t) || (cls[t].category === "code" && flow[t].some((u) => validationGates.includes(u))))
    && enabledIdx.some((j) => j !== i && isAI(j) && reachable(flow, [j]).has(i)));

  // Human approval: a structural human-in-the-loop node whose decision continues the flow.
  const humanNodes = enabledIdx.filter((i) => cls[i].category === "human_review" && flow[i].length > 0);

  // Failure handling: error outputs, Error Trigger / Stop and Error, an error workflow, or a gate branch into a failure-named step.
  const errorEdges = g.edges.filter((e) => e.kind === "error" && enabled[e.source] && enabled[e.target]);
  const gateFailure = enabledIdx.some((i) => isGate[i] && flow[i].some((t) => FAILURE_NAME_RE.test(nodes[t].name)));
  const hasExplicitFailureHandling = errorEdges.length > 0 || has(["error_handling"]) || wf.hasErrorWorkflow || gateFailure;
  // Fallback: an error output that continues the flow through an alternative step.
  const hasFallback = errorEdges.some((e) => cls[e.target].category !== "error_handling" && flow[e.target].length > 0);

  let scoreThreshold: { value: number } | null = null;
  for (const i of [...validationGates, ...codeValidators]) {
    if (scoreThreshold) break;
    if (isGate[i]) { const c = comparisons(nodes[i].parameters).find((x) => SCORE_WORD.test(x.left) && x.right !== null); if (c) scoreThreshold = { value: c.right! }; }
    else { const m = CODE_SCORE_RE.exec(codeOf(nodes[i].parameters)); if (m) scoreThreshold = { value: Number(m[3]) }; }
  }

  const capabilities: Record<CapabilityKey, boolean> = {
    usesAI: enabledIdx.some(isAI),
    usesMultipleAgents: enabledIdx.filter((i) => cls[i].category === "ai_agent").length >= 2,
    usesCode: has(["code"]),
    usesHumanApproval: humanNodes.length > 0,
    usesExternalAPI: has(["http_api"], true),
    usesEmail: has(["email"], true),
    usesDataStore: has(["database", "data_store", "spreadsheet"], true),
    usesRetry,
    hasBoundedRetry: usesRetry && loopBounded.every(Boolean),
    hasExplicitFailureHandling,
    hasValidationGate: validationGates.length > 0,
    hasCodeValidation: codeValidators.length > 0,
    usesLLMJudge: judges.length > 0,
    hasFallback,
    usesRAG: enabledIdx.some((i) => /\.(vectorStore|retriever)/.test(nodes[i].type)),
    usesMemory: enabledIdx.some((i) => /\.memory/.test(nodes[i].type)),
  };

  // Final per-node categories: Code nodes that act as validators are shown as "validation".
  const category = cls.map((c, i) => (codeValidators.includes(i) ? "validation" : c.category) as NodeCategory);
  const label = (i: number) => nodes[i].name.slice(0, ASSET_LIMITS.maxLabelLength);

  const typeCounts = new Map<string, number>();
  nodes.forEach((x) => typeCounts.set(x.type, (typeCounts.get(x.type) ?? 0) + 1));
  const catCounts = new Map<NodeCategory, number>();
  category.forEach((c) => catCounts.set(c, (catCounts.get(c) ?? 0) + 1));
  const uniqSorted = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => !!x))].sort();

  // Chips: breadth-first along main edges from the first enabled trigger; AI components are skipped.
  const mainAdj = adjacency(n, g.edges, ["main"], enabled);
  const start = enabledIdx.find((i) => category[i] === "trigger") ?? enabledIdx[0];
  const order: number[] = [];
  if (start !== undefined) {
    const seen = new Set([start]);
    const q = [start];
    for (let qi = 0; qi < q.length; qi++) { order.push(q[qi]); mainAdj[q[qi]].forEach((t) => { if (!seen.has(t)) { seen.add(t); q.push(t); } }); }
  }
  const role = (i: number): (typeof CATEGORIES)[number] => {
    const c = category[i];
    if (c === "trigger") return "trigger";
    if (judges.includes(i)) return "judge";
    if (c === "ai_agent" || c === "ai_model") return "ai";
    if (c === "validation") return "validator";
    if (c === "code") return "code";
    if (isGate[i]) return "gate";
    if (c === "human_review") return "approval";
    if (["email", "messaging", "http_api", "calendar", "file"].includes(c)) return "action";
    if (["database", "data_store", "spreadsheet"].includes(c)) return "storage";
    if (c === "search_rss") return "tool";
    if (c === "error_handling") return "errorPath";
    return "other";
  };
  const chips = order.filter((i) => category[i] !== "ai_component").slice(0, 7).map((i) => ({ category: role(i), label: nodes[i].name.slice(0, 40) }));

  const profile: WorkflowProfile = {
    schemaVersion: "2.0",
    profileId: "wf_" + input.sha256.slice(0, 12),
    assetId: input.assetId,
    postRef: input.postRef,
    workflowName: wf.name,
    nodeCount: n,
    edgeCount: g.edges.length,
    triggerCount: enabledIdx.filter((i) => category[i] === "trigger").length,
    disabledNodeCount: n - enabledIdx.length,
    danglingEdgeCount: g.dangling,
    nodeTypes: [...typeCounts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([type, count]) => ({ type, count })),
    nodeCategories: NODE_CATEGORIES.filter((c) => catCounts.has(c)).map((c) => ({ category: c, count: catCounts.get(c)! })),
    capabilities,
    retry: { cycles: loops.length, boundedCycles: loopBounded.filter(Boolean).length, nodeRetries: nodeRetries.length, maxAttempts },
    scoreThreshold,
    integrations: uniqSorted(enabledIdx.map((i) => cls[i].integration)),
    aiProviders: uniqSorted(enabledIdx.map((i) => cls[i].aiProvider)),
    graph: {
      nodes: nodes.map((x, i) => ({ id: "n" + i, label: label(i), type: x.type, category: category[i], disabled: x.disabled })),
      edges: g.edges.map((e: Edge) => ({ source: "n" + e.source, target: "n" + e.target, sourceOutput: e.sourceOutput, targetInput: e.targetInput, kind: e.kind })),
    },
    chips,
    security: input.security,
    source: { profileMethod: "deterministic-static-analysis", executed: false, profilerVersion: PROFILER_VERSION },
  };
  return { ok: true, profile };
}
