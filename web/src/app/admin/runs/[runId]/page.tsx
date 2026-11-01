import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLocked } from "@/components/AdminLocked";
import { KindBadge } from "@/components/Badges";
import { adminEnabled } from "@/lib/admin";
import { loadAllWeeks } from "@/lib/issues/catalog";

export const metadata: Metadata = { title: "Run details", robots: { index: false, follow: false } };

type Props = { params: Promise<{ runId: string }> };

export default async function RunPage({ params }: Props) {
  if (!adminEnabled()) return <AdminLocked />;
  const { runId } = await params;
  // Only runs recorded in a frozen issue are known; there is no run-history backend yet.
  const entry = loadAllWeeks().find((w) => w.issue?.provenance.runId === runId);
  if (!entry || !entry.issue) notFound();
  const issue = entry.issue;
  return (
    <div className="container">
      <header className="masthead">
        <div className="title-row"><span className="kicker">Run</span><KindBadge kind={entry.kind} /><span className="badge badge-review">Development only</span></div>
        <h1 style={{ fontSize: "2rem" }}><code>{runId}</code></h1>
        <p className="dek">Recorded in the Week {entry.week} issue. Live run tracking needs the run-history backend (Phase 5).</p>
      </header>
      <section className="section grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2 style={{ fontSize: "1.3rem" }}>Provenance</h2>
          <ul className="ink2 small">
            <li>Input hash <code>{issue.provenance.inputHash}</code></li>
            <li>Idempotency key <code>{issue.provenance.idempotencyKey}</code></li>
            <li>Synthetic: {issue.provenance.synthetic ? "yes" : "no"} · Source verified: {issue.sourceSummary.verified ? "yes" : "no"}</li>
            <li>Generated {issue.generatedAt} · Approved {issue.approvedAt ?? "—"}</li>
            <li>Pipeline {issue.methodology.pipelineVersion} · prompts {issue.methodology.promptVersion} · LLM {issue.methodology.llmProvider}</li>
          </ul>
        </div>
        <div className="card">
          <h2 style={{ fontSize: "1.3rem" }}>Code checks</h2>
          <ul className="ink2">{issue.methodology.codeChecks.map((c) => <li key={c.name}><span className={"badge " + (c.passed ? "badge-ok" : "badge-fail")}>{c.passed ? "Passed" : "Failed"}</span> {c.name}</li>)}</ul>
        </div>
      </section>
      <Link href="/admin">← Editorial console</Link>
    </div>
  );
}
