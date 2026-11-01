import type { Metadata } from "next";
import Link from "next/link";
import { AdminLocked } from "@/components/AdminLocked";
import { KindBadge } from "@/components/Badges";
import { RUN_STAGES, WORKFLOWS, adminEnabled } from "@/lib/admin";
import { loadAllWeeks } from "@/lib/issues/catalog";
import { PRODUCTION_WEEK } from "@/lib/issues/labels";

export const metadata: Metadata = { title: "Editorial console", robots: { index: false, follow: false } };

export default function AdminPage() {
  if (!adminEnabled()) return <AdminLocked />;
  const weeks = loadAllWeeks();
  return (
    <div className="container">
      <header className="masthead">
        <div className="title-row"><span className="kicker">Editorial console</span><span className="badge badge-review">Development only · no authentication</span></div>
        <h1>Week status and pipeline readiness</h1>
        <p className="dek">Read-only. Generation, upload, approval and publishing controls appear here once their protected server routes and n8n webhooks exist.</p>
      </header>
      <section className="section">
        <h2>Weeks</h2>
        <div className="table-wrap"><table className="data">
          <thead><tr><th scope="col">Week</th><th scope="col">Status</th><th scope="col">Run</th><th scope="col">Checks</th></tr></thead>
          <tbody>{weeks.map((w) => (
            <tr key={w.week}>
              <td><Link href={"/issues/" + w.week}>Week {w.week}</Link>{w.week === PRODUCTION_WEEK && <> <span className="badge badge-ai">Production</span></>}</td>
              <td><KindBadge kind={w.kind} />{w.errors.length > 0 && <ul className="small">{w.errors.map((e) => <li key={e}><code>{e}</code></li>)}</ul>}</td>
              <td>{w.issue ? <Link href={"/admin/runs/" + w.issue.provenance.runId}><code>{w.issue.provenance.runId}</code></Link> : <span className="muted">—</span>}</td>
              <td className="small">{w.issue ? w.issue.methodology.codeChecks.filter((c) => c.passed).length + "/" + w.issue.methodology.codeChecks.length + " passed" : "—"}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
      <section className="section grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2 style={{ fontSize: "1.4rem" }}>Generate Week {PRODUCTION_WEEK}</h2>
          <p className="ink2">Not connected. This needs a protected Next.js server route that calls an authenticated n8n production webhook (Phase 5). The browser will never hold Yellowdig, n8n, LLM, GitHub or Gmail credentials.</p>
          <button type="button" className="btn" disabled>Generate draft (not available)</button>
          <h3 style={{ marginTop: 20 }}>Run stages</h3>
          <ol className="stages">{RUN_STAGES.map((s) => <li key={s}><span>{s}</span><span className="badge badge-none">No run</span></li>)}</ol>
        </div>
        <div className="card">
          <h2 style={{ fontSize: "1.4rem" }}>n8n workflows</h2>
          <p className="small muted">As recorded in the repository; this page does not query n8n.</p>
          <ul className="ink2">{WORKFLOWS.map((w) => <li key={w.name}><strong>{w.name}</strong>{w.id && <> · <code>{w.id}</code></>} — {w.state}</li>)}</ul>
          <h3>Asset upload</h3>
          <p className="ink2 small">Workflow files and screenshots are validated by n8n workflow 03. The upload endpoint isn&apos;t built yet.</p>
          <button type="button" className="btn" disabled>Upload assets (not available)</button>
        </div>
      </section>
    </div>
  );
}
