// Connections → a bounded, safe edge list, plus iterative graph helpers (no recursion).
import { ASSET_LIMITS } from "./limits";
import { redactLabel } from "./sanitize";
import type { AssetReason, SanitizedWorkflow } from "./types";

export type EdgeKind = "main" | "ai" | "error";
export type Edge = { source: number; target: number; sourceOutput: number; targetInput: number; kind: EdgeKind };
export type GraphResult = { ok: true; edges: Edge[]; dangling: number } | { ok: false; reason: AssetReason };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * n8n connections: { [sourceName]: { [connectionType]: Array<null | Array<{ node, type, index }>> } }.
 * The error output of a node with onError "continueErrorOutput" is its last main output.
 * Edges to or from unknown nodes are counted as dangling and dropped.
 */
export function extractEdges(wf: SanitizedWorkflow): GraphResult {
  const byName = new Map(wf.nodes.map((n, i) => [n.name, i]));
  const seen = new Set<string>();
  const edges: Edge[] = [];
  let dangling = 0;
  let count = 0;
  for (const [sourceName, types] of Object.entries(wf.connections)) {
    if (!isObj(types)) return { ok: false, reason: "UNSUPPORTED_STRUCTURE" };
    const source = byName.get(redactLabel(sourceName));
    for (const [connType, outputs] of Object.entries(types)) {
      if (!Array.isArray(outputs)) return { ok: false, reason: "UNSUPPORTED_STRUCTURE" };
      const errorOutput = source !== undefined && wf.nodes[source].onError === "continueErrorOutput" && connType === "main" ? outputs.length - 1 : -1;
      for (let out = 0; out < outputs.length; out++) {
        const list = outputs[out];
        if (list === null || list === undefined) continue;
        if (!Array.isArray(list)) return { ok: false, reason: "UNSUPPORTED_STRUCTURE" };
        for (const conn of list) {
          if (++count > ASSET_LIMITS.maxEdges) return { ok: false, reason: "TOO_MANY_EDGES" };
          if (!isObj(conn) || typeof conn.node !== "string") return { ok: false, reason: "UNSUPPORTED_STRUCTURE" };
          const target = byName.get(redactLabel(conn.node));
          if (source === undefined || target === undefined) { dangling++; continue; }
          const targetInput = typeof conn.index === "number" && Number.isInteger(conn.index) && conn.index >= 0 ? conn.index : 0;
          const kind: EdgeKind = connType.startsWith("ai_") ? "ai" : out === errorOutput && errorOutput > 0 ? "error" : "main";
          const key = source + ">" + target + ":" + out + ":" + targetInput + ":" + kind;
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push({ source, target, sourceOutput: out, targetInput, kind });
        }
      }
    }
  }
  edges.sort((a, b) => a.source - b.source || a.sourceOutput - b.sourceOutput || a.target - b.target || a.targetInput - b.targetInput || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  return { ok: true, edges, dangling };
}

/** Successor lists over the given edges, restricted to enabled nodes. */
export function adjacency(n: number, edges: Edge[], kinds: EdgeKind[], enabled: boolean[]): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  edges.forEach((e) => { if (kinds.includes(e.kind) && enabled[e.source] && enabled[e.target]) adj[e.source].push(e.target); });
  return adj;
}

/** Nodes reachable from `from` (excluding the start nodes unless revisited). Iterative BFS. */
export function reachable(adj: number[][], from: number[]): Set<number> {
  const seen = new Set<number>();
  const queue = [...from];
  for (let qi = 0; qi < queue.length; qi++) {
    for (const t of adj[queue[qi]]) if (!seen.has(t)) { seen.add(t); queue.push(t); }
  }
  return seen;
}

/** Strongly connected components that form cycles (size > 1, or a self-loop). Iterative Tarjan. */
export function cycles(adj: number[][]): number[][] {
  const n = adj.length;
  const index = new Array<number>(n).fill(-1), low = new Array<number>(n).fill(0), onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  const result: number[][] = [];
  let next = 0;
  for (let root = 0; root < n; root++) {
    if (index[root] !== -1) continue;
    const work: Array<[number, number]> = [[root, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, i] = frame;
      if (i === 0) { index[v] = low[v] = next++; stack.push(v); onStack[v] = true; }
      if (i < adj[v].length) {
        frame[1]++;
        const w = adj[v][i];
        if (index[w] === -1) work.push([w, 0]);
        else if (onStack[w]) low[v] = Math.min(low[v], index[w]);
        continue;
      }
      work.pop();
      if (work.length) { const p = work[work.length - 1][0]; low[p] = Math.min(low[p], low[v]); }
      if (low[v] === index[v]) {
        const comp: number[] = [];
        let w: number;
        do { w = stack.pop()!; onStack[w] = false; comp.push(w); } while (w !== v);
        if (comp.length > 1 || adj[v].includes(v)) result.push(comp.sort((a, b) => a - b));
      }
    }
  }
  return result.sort((a, b) => a[0] - b[0]);
}
