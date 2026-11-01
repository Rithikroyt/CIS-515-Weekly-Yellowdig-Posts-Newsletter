import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AtlasExplorer, type AtlasItem } from "@/components/AtlasExplorer";
import { layoutGraph } from "@/lib/graph/layout";
import { DISPLAYABLE, loadAllWeeks, loadProfiles } from "@/lib/issues/catalog";

export const metadata: Metadata = { title: "Workflow Atlas", description: "Interactive, read-only diagrams of approved CIS 515 workflow builds." };

function atlasItems(): AtlasItem[] {
  const items: AtlasItem[] = [];
  for (const entry of loadAllWeeks()) {
    if (!entry.issue || !DISPLAYABLE.has(entry.kind)) continue;
    const profiles = new Map(loadProfiles(entry).map((p) => [p.profileId, p]));
    for (const b of entry.issue.allBuilds) {
      const p = b.workflowProfileId ? profiles.get(b.workflowProfileId) : undefined;
      if (!p) continue;
      items.push({
        profileId: p.profileId, week: entry.week, reference: entry.kind === "reference", title: b.title, author: b.author,
        workflowName: p.workflowName, nodeCount: p.nodeCount, edgeCount: p.edgeCount, capabilities: p.capabilities,
        retry: p.retry, integrations: p.integrations, aiProviders: p.aiProviders, layout: layoutGraph(p.graph),
      });
    }
  }
  return items;
}

export default function AtlasPage() {
  const items = atlasItems();
  return (
    <div className="container">
      <header className="masthead">
        <div className="kicker">Workflow Atlas</div>
        <h1>See how each build is wired</h1>
        <p className="dek">Read-only diagrams of profiled workflows. Click or press Enter on a step to trace its path. Nothing here runs a workflow.</p>
        {items.some((i) => i.reference) && <p className="notice" style={{ marginTop: 12 }}>Workflows marked <strong>synthetic</strong> come from the reference issue and are invented examples.</p>}
      </header>
      <div className="section">
        {items.length === 0 ? (
          <p className="notice">No approved workflow profiles yet. <Link href="/methodology">How workflows are profiled</Link>.</p>
        ) : (
          <Suspense fallback={<p className="muted">Loading the Atlas…</p>}><AtlasExplorer items={items} /></Suspense>
        )}
      </div>
    </div>
  );
}
