import type { Metadata } from "next";
import Link from "next/link";
import { KindBadge } from "@/components/Badges";
import { DISPLAYABLE, loadAllWeeks } from "@/lib/issues/catalog";
import { SIGNAL_LABELS } from "@/lib/issues/labels";

export const metadata: Metadata = { title: "Trends", description: "How workflow-design practices change across CIS 515 weeks, using approved issues only." };

type Series = { key: string; label: string; get: (m: NonNullable<ReturnType<typeof loadAllWeeks>[number]["issue"]>["metrics"]) => number | null };
const SERIES: Series[] = [
  { key: "posts", label: "Workflow posts", get: (m) => m.posts },
  { key: "profiled", label: "Profiled workflow files", get: (m) => m.signals.profiledBuilds },
  { key: "comments", label: "Comments", get: (m) => m.comments },
  { key: "codeChecks", label: SIGNAL_LABELS.codeChecks.label, get: (m) => m.signals.codeChecks },
  { key: "humanReview", label: SIGNAL_LABELS.humanReview.label, get: (m) => m.signals.humanReview },
  { key: "boundedRetry", label: SIGNAL_LABELS.boundedRetry.label, get: (m) => m.signals.boundedRetry },
  { key: "errorHandling", label: SIGNAL_LABELS.errorHandling.label, get: (m) => m.signals.errorHandling },
  { key: "multiAgent", label: SIGNAL_LABELS.multiAgent.label, get: (m) => m.signals.multiAgent },
];

export default function TrendsPage() {
  const weeks = loadAllWeeks();
  const shown = weeks.filter((w) => w.issue && DISPLAYABLE.has(w.kind));
  const real = shown.filter((w) => w.kind !== "reference");
  return (
    <div className="container">
      <header className="masthead">
        <div className="kicker">Cross-week trends</div>
        <h1>How workflow design changes over the term</h1>
        <p className="dek">Counts from approved issues only. Weeks without an approved issue are shown as gaps, never as zero, and no line is drawn across them.</p>
      </header>
      <div className="section stack">
        {real.length < 2 && (
          <div className="notice">
            <p><strong>Not enough approved weeks for a trend yet.</strong> {real.length === 0 ? "No week has an approved issue built from real class data." : "Only one week has an approved issue from real class data."} Trends appear once two or more weeks are approved.</p>
            {shown.some((w) => w.kind === "reference") && <p>The hatched bar below is the synthetic reference issue. It shows how a week will appear; it is not class data.</p>}
          </div>
        )}
        <div className="trend-grid">
          {SERIES.map((s) => {
            const vals = weeks.map((w) => (w.issue && DISPLAYABLE.has(w.kind) ? s.get(w.issue.metrics) : null));
            const max = Math.max(1, ...vals.map((v) => v ?? 0));
            return (
              <figure className="card" key={s.key} style={{ margin: 0 }}>
                <figcaption><h3 style={{ fontSize: "1.05rem" }}>{s.label}</h3></figcaption>
                <div className="spark" aria-hidden="true">
                  {weeks.map((w, i) => {
                    const v = vals[i];
                    const cls = v === null ? "none" : w.kind === "reference" ? "ref" : "";
                    return <div key={w.week} className={"col " + cls}><span>{v ?? "–"}</span><i style={v === null ? undefined : { height: Math.max(4, (v / max) * 64) + "px" }} /><span>W{w.week}</span></div>;
                  })}
                </div>
                <table className="sr-only">
                  <caption>{s.label} by week</caption>
                  <thead><tr><th>Week</th><th>Value</th></tr></thead>
                  <tbody>{weeks.map((w, i) => <tr key={w.week}><td>Week {w.week}</td><td>{vals[i] ?? "no approved issue"}{w.kind === "reference" ? " (synthetic reference)" : ""}</td></tr>)}</tbody>
                </table>
              </figure>
            );
          })}
        </div>
        <div className="table-wrap">
          <table className="data">
            <caption className="sr-only">Status of each week</caption>
            <thead><tr><th scope="col">Week</th><th scope="col">Status</th><th scope="col">Data</th></tr></thead>
            <tbody>{weeks.map((w) => (
              <tr key={w.week}><td><Link href={"/issues/" + w.week}>Week {w.week}</Link></td><td><KindBadge kind={w.kind} /></td>
                <td className="small">{w.kind === "reference" ? "Synthetic fixture — excluded from real trends" : w.issue ? "Approved class data" : "None"}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="small muted">Trends describe what workflows contained, not how well students did. They are not grades.</p>
      </div>
    </div>
  );
}
