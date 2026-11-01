"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Layout } from "@/lib/graph/layout";
import { CATEGORY_GROUPS } from "@/lib/graph/layout";
import { WorkflowGraph } from "./WorkflowGraph";

export type AtlasItem = {
  profileId: string;
  week: number;
  reference: boolean;
  title: string;
  author: string;
  workflowName: string;
  nodeCount: number;
  edgeCount: number;
  capabilities: Record<string, boolean>;
  retry: { cycles: number; boundedCycles: number; maxAttempts: number | null };
  integrations: string[];
  aiProviders: string[];
  layout: Layout;
};

const CAP_TEXT: Record<string, string> = {
  usesAI: "Uses AI", usesMultipleAgents: "Multiple agents", usesCode: "Code node", hasValidationGate: "Validation gate",
  hasCodeValidation: "Code validation", usesLLMJudge: "LLM judge", usesHumanApproval: "Human approval", usesRetry: "Retry",
  hasBoundedRetry: "Bounded retry", hasExplicitFailureHandling: "Failure handling", hasFallback: "Fallback",
  usesExternalAPI: "External API", usesEmail: "Email", usesDataStore: "Data store", usesRAG: "Retrieval (RAG)", usesMemory: "Memory",
};

export function AtlasExplorer({ items }: { items: AtlasItem[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const selectedId = params.get("w");
  const item = items.find((i) => i.profileId === selectedId) ?? items[0];
  const select = (id: string) => router.replace("/atlas?w=" + id, { scroll: false });
  const byId = new Map(item.layout.nodes.map((n) => [n.id, n]));

  return (
    <div className="atlas">
      <div>
        <h2 className="kicker" style={{ fontFamily: "var(--font-sans)" }}>Workflows ({items.length})</h2>
        <ul className="atlas-list">
          {items.map((i) => (
            <li key={i.profileId}>
              <button type="button" aria-pressed={i.profileId === item.profileId} onClick={() => select(i.profileId)}>
                {i.title}<br /><span className="small muted">Week {i.week}{i.reference ? " · synthetic" : ""} · {i.nodeCount} steps</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="stack">
        <div>
          <div className="badges"><span className="badge">Week {item.week}</span>{item.reference && <span className="badge badge-ref">Synthetic reference</span>}<span className="badge badge-code">Code-profiled · never executed</span></div>
          <h2 style={{ marginTop: 10 }}>{item.title}</h2>
          <p className="muted small">{item.author} · {item.nodeCount} steps · {item.edgeCount} connections{item.aiProviders.length ? " · AI: " + item.aiProviders.join(", ") : ""}{item.integrations.length ? " · Services: " + item.integrations.join(", ") : ""}</p>
        </div>
        <WorkflowGraph key={item.profileId} layout={item.layout} title={item.title} />
        <div className="grid grid-2">
          <div className="card">
            <h3>Reliability signals</h3>
            <ul className="badges" style={{ listStyle: "none", padding: 0 }}>
              {Object.entries(item.capabilities).filter(([, v]) => v).map(([k]) => <li key={k}><span className="badge badge-ok">{CAP_TEXT[k] ?? k}</span></li>)}
              {!Object.values(item.capabilities).some(Boolean) && <li className="muted small">No safeguards detected.</li>}
            </ul>
            {item.retry.cycles > 0 && <p className="small ink2">{item.retry.cycles} loop{item.retry.cycles === 1 ? "" : "s"}, {item.retry.boundedCycles} with a detected limit{item.retry.maxAttempts ? " (max " + item.retry.maxAttempts + ")" : ""}.</p>}
          </div>
          <div className="card">
            <h3>About this view</h3>
            <p className="small ink2">Drawn from the sanitized workflow profile: step names, types and connections only. Prompts, code, credentials and parameters are never stored or shown.</p>
            <Link className="small" href={"/issues/" + item.week + "#builds"}>Back to the Week {item.week} issue</Link>
          </div>
        </div>
        <details className="card">
          <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", fontWeight: 600 }}>Text version of this workflow ({item.nodeCount} steps)</summary>
          <ol>
            {item.layout.nodes.map((n) => {
              const outs = item.layout.edges.filter((e) => e.source === n.id).map((e) => byId.get(e.target)!.label + (e.kind === "error" ? " (on error)" : e.kind === "ai" ? " (AI connection)" : e.back ? " (loops back)" : ""));
              return <li key={n.id}><strong>{n.label}</strong> — {(CATEGORY_GROUPS[n.category] ?? CATEGORY_GROUPS.other).label}{n.disabled ? ", disabled" : ""}{outs.length ? ". Next: " + outs.join(", ") + "." : ". End of path."}</li>;
            })}
          </ol>
        </details>
      </div>
    </div>
  );
}
