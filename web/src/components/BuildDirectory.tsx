"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { DirectoryRow } from "@/lib/issues/directory";
import { SIGNAL_LABELS } from "@/lib/issues/labels";

const CAPS: Array<{ key: keyof DirectoryRow["caps"]; label: string }> = [
  { key: "ai", label: "Uses AI" },
  { key: "code", label: "Code node" },
  { key: "gate", label: "Validation gate" },
  { key: "human", label: "Human approval" },
  { key: "retry", label: "Retry loop" },
  { key: "boundedRetry", label: "Bounded retry" },
  { key: "failure", label: "Failure handling" },
  { key: "api", label: "External API" },
  { key: "email", label: "Email" },
  { key: "store", label: "Data store" },
];

export function BuildDirectory({ rows }: { rows: DirectoryRow[] }) {
  const params = useSearchParams();
  const initialWeek = Number(params.get("week")) || null;
  const [q, setQ] = useState("");
  const [week, setWeek] = useState<number | null>(rows.some((r) => r.week === initialWeek) ? initialWeek : null);
  const [caps, setCaps] = useState<Set<string>>(new Set());
  const [provider, setProvider] = useState("");
  const [trigger, setTrigger] = useState("");
  const [fileOnly, setFileOnly] = useState(false);
  const [open, setOpen] = useState(false);

  const weeks = [...new Set(rows.map((r) => r.week))].sort();
  const providers = [...new Set(rows.flatMap((r) => r.aiProviders))].sort();
  const triggers = [...new Set(rows.flatMap((r) => r.triggers))].sort();

  const shown = useMemo(() => rows.filter((r) => {
    if (week !== null && r.week !== week) return false;
    if (fileOnly && !r.profileId) return false;
    if (provider && !r.aiProviders.includes(provider)) return false;
    if (trigger && !r.triggers.includes(trigger)) return false;
    for (const c of caps) if (!r.caps[c as keyof DirectoryRow["caps"]]) return false;
    const needle = q.trim().toLowerCase();
    if (needle && ![r.title, r.author, r.category, r.oneLine, ...r.integrations].join(" ").toLowerCase().includes(needle)) return false;
    return true;
  }), [rows, week, fileOnly, provider, trigger, caps, q]);

  const toggle = (k: string) => setCaps((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const reset = () => { setQ(""); setWeek(null); setCaps(new Set()); setProvider(""); setTrigger(""); setFileOnly(false); };
  const active = caps.size + (week !== null ? 1 : 0) + (provider ? 1 : 0) + (trigger ? 1 : 0) + (fileOnly ? 1 : 0);

  return (
    <div className="stack">
      <div className="btn-row" style={{ alignItems: "center" }}>
        <label htmlFor="q" className="sr-only">Search builds</label>
        <input id="q" className="search" style={{ maxWidth: 480 }} type="search" placeholder="Search title, author, category or service" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn filter-toggle" aria-expanded={open} aria-controls="filters" onClick={() => setOpen(!open)}>Filters{active ? " (" + active + ")" : ""}</button>
      </div>
      <div className="dir">
        <div className="filters" id="filters" data-open={open}>
          <fieldset>
            <legend>Week</legend>
            <label><input type="radio" name="week" checked={week === null} onChange={() => setWeek(null)} /> All available weeks</label>
            {weeks.map((w) => <label key={w}><input type="radio" name="week" checked={week === w} onChange={() => setWeek(w)} /> Week {w}</label>)}
          </fieldset>
          <fieldset>
            <legend>Workflow design</legend>
            {CAPS.map((c) => <label key={c.key}><input type="checkbox" checked={caps.has(c.key)} onChange={() => toggle(c.key)} /> {c.label}</label>)}
            <label><input type="checkbox" checked={fileOnly} onChange={() => setFileOnly(!fileOnly)} /> Workflow file available</label>
          </fieldset>
          <fieldset>
            <legend>Detected from the file</legend>
            <label htmlFor="prov" style={{ minHeight: 0 }}>AI provider</label>
            <select id="prov" className="search" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="">Any</option>{providers.map((p) => <option key={p}>{p}</option>)}
            </select>
            <label htmlFor="trig" style={{ minHeight: 0, marginTop: 8 }}>Trigger type</label>
            <select id="trig" className="search" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              <option value="">Any</option>{triggers.map((t) => <option key={t}>{t}</option>)}
            </select>
          </fieldset>
          {active > 0 && <button type="button" className="btn" onClick={reset}>Clear filters</button>}
        </div>
        <div>
          <p role="status" className="small muted" style={{ marginTop: 0 }}>{shown.length} of {rows.length} builds shown</p>
          {shown.length === 0 ? <p className="notice">No builds match these filters.</p> : (
            <ul className="build-list">
              {shown.map((r) => (
                <li key={r.week + ":" + r.postId} className="card build">
                  <div className="badges">
                    <span className="badge">Week {r.week}</span>
                    {r.kind === "reference" && <span className="badge badge-ref">Synthetic reference</span>}
                    {r.isSpotlight && <span className="badge badge-ai">Spotlight</span>}
                  </div>
                  <h3>{r.title}</h3>
                  <p className="small muted" style={{ margin: 0 }}>{r.author} · {r.category} · {r.commentCount} comment{r.commentCount === 1 ? "" : "s"}</p>
                  <p className="ink2" style={{ margin: 0 }}>{r.oneLine}</p>
                  {r.signals.length > 0 && <p className="small" style={{ margin: 0 }}><strong>Signals:</strong> {r.signals.map((k) => SIGNAL_LABELS[k].label).join(", ")}</p>}
                  {r.integrations.length > 0 && <p className="small" style={{ margin: 0 }}><strong>Services:</strong> {r.integrations.join(", ")}</p>}
                  <div className="btn-row">
                    {r.profileId ? <Link className="btn" href={"/atlas?w=" + r.profileId}>Open in Atlas</Link> : <span className="small muted">No workflow file was profiled for this build.</span>}
                    <Link className="btn" href={"/issues/" + r.week + "#builds"}>Week {r.week} issue</Link>
                    {r.sourceUrl && <a className="btn" href={r.sourceUrl}>Yellowdig post</a>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
