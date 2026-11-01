// Deterministic layered layout for a workflow-profile graph. Pure: same profile → same coordinates.
// Columns follow the main/error flow from the triggers (breadth-first, so loops don't push nodes right
// forever). AI components (models, memory, tools) sit under the node they serve.
import type { WorkflowProfile } from "../contracts";

export type LaidNode = WorkflowProfile["graph"]["nodes"][number] & { x: number; y: number; layer: number };
export type LaidEdge = WorkflowProfile["graph"]["edges"][number] & { back: boolean };
export type Layout = { nodes: LaidNode[]; edges: LaidEdge[]; width: number; height: number };

export const NODE_W = 168;
export const NODE_H = 52;
const GAP_X = 64;
const GAP_Y = 28;
const PAD = 24;

export function layoutGraph(graph: WorkflowProfile["graph"]): Layout {
  const ids = graph.nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const flow = graph.edges.filter((e) => e.kind !== "ai");
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  flow.forEach((e) => {
    out.get(e.source)?.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  });
  const isComponent = (id: string) => graph.nodes[index.get(id)!].category === "ai_component";

  // Breadth-first layers from triggers, then from any node not yet reached.
  const layer = new Map<string, number>();
  const starts = graph.nodes.filter((n) => n.category === "trigger").map((n) => n.id);
  const seed = (s: string) => {
    if (layer.has(s)) return;
    layer.set(s, 0);
    const q = [s];
    for (let i = 0; i < q.length; i++) {
      for (const t of out.get(q[i]) ?? []) {
        if (!layer.has(t)) { layer.set(t, layer.get(q[i])! + 1); q.push(t); }
      }
    }
  };
  starts.forEach(seed);
  ids.filter((id) => !isComponent(id) && (indeg.get(id) ?? 0) === 0).forEach(seed);
  ids.filter((id) => !isComponent(id)).forEach(seed);

  // AI components go under the first node they connect to.
  const hostOf = new Map<string, string>();
  graph.edges.filter((e) => e.kind === "ai").forEach((e) => { if (!hostOf.has(e.source)) hostOf.set(e.source, e.target); });
  ids.filter(isComponent).forEach((id) => layer.set(id, layer.get(hostOf.get(id) ?? "") ?? 0));

  const rows = new Map<number, string[]>();
  ids.filter((id) => !isComponent(id)).forEach((id) => {
    const l = layer.get(id)!;
    rows.set(l, [...(rows.get(l) ?? []), id]);
  });
  const mainRows = Math.max(1, ...[...rows.values()].map((r) => r.length));
  const compRow = new Map<number, number>();
  const pos = new Map<string, { x: number; y: number }>();
  rows.forEach((r, l) => r.forEach((id, i) => pos.set(id, { x: PAD + l * (NODE_W + GAP_X), y: PAD + i * (NODE_H + GAP_Y) })));
  ids.filter(isComponent).forEach((id) => {
    const l = layer.get(id)!;
    const k = compRow.get(l) ?? 0;
    compRow.set(l, k + 1);
    pos.set(id, { x: PAD + l * (NODE_W + GAP_X), y: PAD + (mainRows + k) * (NODE_H + GAP_Y) + 16 });
  });

  const nodes = graph.nodes.map((n) => ({ ...n, ...pos.get(n.id)!, layer: layer.get(n.id)! }));
  const edges = graph.edges.map((e) => ({ ...e, back: e.kind !== "ai" && (layer.get(e.target)! <= layer.get(e.source)!) }));
  const width = Math.max(...nodes.map((n) => n.x)) + NODE_W + PAD;
  const height = Math.max(...nodes.map((n) => n.y)) + NODE_H + PAD;
  return { nodes, edges, width, height };
}

export const CATEGORY_GROUPS: Record<string, { label: string; tone: string }> = {
  trigger: { label: "Trigger", tone: "trigger" },
  ai_agent: { label: "AI agent", tone: "ai" },
  ai_model: { label: "AI model", tone: "ai" },
  ai_component: { label: "AI component", tone: "aicomp" },
  code: { label: "Code", tone: "code" },
  validation: { label: "Validation", tone: "validation" },
  human_review: { label: "Human review", tone: "human" },
  control_flow: { label: "Control flow", tone: "control" },
  merge: { label: "Control flow", tone: "control" },
  http_api: { label: "External API", tone: "action" },
  email: { label: "Email", tone: "action" },
  messaging: { label: "Messaging", tone: "action" },
  calendar: { label: "Action", tone: "action" },
  file: { label: "Action", tone: "action" },
  database: { label: "Storage", tone: "storage" },
  data_store: { label: "Storage", tone: "storage" },
  spreadsheet: { label: "Storage", tone: "storage" },
  search_rss: { label: "Search / RSS", tone: "action" },
  transform: { label: "Transform", tone: "other" },
  wait: { label: "Wait", tone: "control" },
  error_handling: { label: "Error handling", tone: "error" },
  other: { label: "Other", tone: "other" },
};
