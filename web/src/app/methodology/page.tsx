import type { Metadata } from "next";
import Link from "next/link";
import { Prov } from "@/components/Badges";
import { PipelineFigure } from "@/components/Illustrations";

export const metadata: Metadata = { title: "Methodology", description: "How the CIS 515 Workflow Observatory collects, counts, drafts, verifies and approves each weekly issue." };

const STATUS: Array<[string, string, string]> = [
  ["Yellowdig API authentication and community access", "Live verified", "badge-ok"],
  ["Post and view fields", "Partly live verified", "badge-review"],
  ["Comment and reaction mapping", "Not live verified", "badge-fail"],
  ["Full Week 4 data fetch", "Not run yet", "badge-none"],
  ["Workflow file profiling (n8n workflow 03)", "Fixture tested", "badge-ref"],
  ["AI editorial drafting and evidence review", "Not built yet", "badge-none"],
  ["Publishing (GitHub, Gmail draft)", "Not built yet", "badge-none"],
  ["Post status and visibility rules for publication", "Not verified — every post needs review", "badge-review"],
];

export default function MethodologyPage() {
  return (
    <div className="container">
      <header className="masthead">
        <div className="kicker">Methodology</div>
        <h1>How an issue is made, and what you can trust</h1>
        <p className="dek">Code counts. AI drafts. A person approves. Every claim points back to its source.</p>
      </header>
      <div className="section grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack reading">
          <h2>The pipeline</h2>
          <ol className="ink2">
            <li><strong>Collect.</strong> n8n workflow 01 reads the week&apos;s Yellowdig topic through the Yellowdig API. Private fields — emails, SIS and LTI identifiers, profile data — are dropped in the first step, and people get pseudonymous IDs.</li>
            <li><strong>Normalize.</strong> Workflow 02 joins comments, reactions and views to posts and counts everything in code.</li>
            <li><strong>Profile workflow files.</strong> Workflow 03 checks each uploaded n8n file, strips credentials and secrets, and maps its structure. Files are parsed as data and never executed.</li>
            <li><strong>Draft.</strong> AI writes the headline, themes, spotlights and takeaways. Each claim carries evidence references, and code rejects any that don&apos;t resolve.</li>
            <li><strong>Review.</strong> A reviewer stage scores the draft; at most two revisions are allowed. A person then approves, requests a revision or rejects.</li>
            <li><strong>Publish.</strong> The approved <code>issue.json</code> is frozen. The web issue and the standalone newsletter both render from it.</li>
          </ol>
        </div>
        <div className="card"><PipelineFigure /></div>
      </div>
      <section className="section">
        <h2>Provenance labels</h2>
        <div className="grid grid-3">
          <div className="panel"><Prov label="CODE-COUNTED" /><p className="ink2" style={{ marginTop: 10 }}>Computed by deterministic code. Re-running on the same data gives the same number.</p></div>
          <div className="panel"><Prov label="AI-DRAFTED" /><p className="ink2" style={{ marginTop: 10 }}>Written by AI from the week&apos;s posts, with evidence references checked by code.</p></div>
          <div className="panel"><Prov label="HUMAN-APPROVED" /><p className="ink2" style={{ marginTop: 10 }}>A person approved the issue before publication.</p></div>
          <div className="panel"><Prov label="LIVE VERIFIED" /><p className="ink2" style={{ marginTop: 10 }}>The data came from a real, authorized Yellowdig request.</p></div>
          <div className="panel"><Prov label="FIXTURE TESTED" /><p className="ink2" style={{ marginTop: 10 }}>Tested with synthetic data only. Not evidence about the real class.</p></div>
          <div className="panel"><Prov label="REFERENCE ISSUE" /><p className="ink2" style={{ marginTop: 10 }}>A synthetic issue that shows the format. Every name and number is invented.</p></div>
        </div>
      </section>
      <section className="section">
        <h2>What is verified today</h2>
        <p className="ink2 reading">This list is kept honest on purpose. Anything not live verified is labelled that way across the site.</p>
        <div className="table-wrap"><table className="data">
          <thead><tr><th scope="col">Capability</th><th scope="col">Status</th></tr></thead>
          <tbody>{STATUS.map(([c, s, cls]) => <tr key={c}><td>{c}</td><td><span className={"badge " + cls}>{s}</span></td></tr>)}</tbody>
        </table></div>
      </section>
      <section className="section grid grid-2">
        <div className="card">
          <h2 style={{ fontSize: "1.4rem" }}>Privacy</h2>
          <ul className="ink2">
            <li>Only fields in the approved issue are shown. Emails, SIS IDs, LTI fields and credentials never reach this site.</li>
            <li>Raw workflow files are never published. The Atlas shows step names, types and connections only.</li>
            <li>Unclear publication status defaults to not public.</li>
            <li>Comment counts measure participation. They are never grades or rankings.</li>
          </ul>
        </div>
        <div className="card">
          <h2 style={{ fontSize: "1.4rem" }}>Untrusted content</h2>
          <ul className="ink2">
            <li>Posts, comments and workflow files are treated as data, never as instructions, including text that tries to give the AI orders.</li>
            <li>Every value is escaped when shown. The newsletter preview runs in a sandbox with scripts disabled.</li>
          </ul>
          <Link href="/issues/4">Go to the Week 4 issue →</Link>
        </div>
      </section>
    </div>
  );
}
