// Issue sections. Each one renders values from the approved issue.json only; nothing is recomputed here.
import Link from "next/link";
import type { Issue, SignalKey } from "@/lib/contracts";
import { METRIC_LABELS, SIGNAL_LABELS } from "@/lib/issues/labels";
import { Prov } from "../Badges";
import { FailureFigure } from "../Illustrations";

type Builds = Issue["allBuilds"];

/** Human-readable evidence references. Unknown ids are shown as identifiers, never guessed. */
function evidenceText(ref: string, builds: Builds): string {
  const [kind, id] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  if (kind === "post") return "Post: " + (builds.find((b) => b.postId === id)?.title ?? id);
  if (kind === "comment") return "Comment " + id;
  if (kind === "metric") return "Code-counted metric: " + id;
  if (kind === "workflow") return "Workflow profile " + id;
  return ref;
}

export function Evidence({ refs, builds }: { refs: string[]; builds: Builds }) {
  return (
    <details className="evidence">
      <summary>Evidence ({refs.length})</summary>
      <ul>{refs.map((r) => <li key={r}>{evidenceText(r, builds)} <code className="muted">{r}</code></li>)}</ul>
      <p className="small muted" style={{ margin: "6px 0 0" }}>Code checked that every reference resolves to a source before approval.</p>
    </details>
  );
}

export function SectionHead({ id, kicker, title, children }: { id: string; kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <div className="kicker">{kicker}</div>
        <h2 id={id + "-h"}>{title}</h2>
      </div>
      {children && <div className="badges">{children}</div>}
    </div>
  );
}

export function Numbers({ m }: { m: Issue["metrics"] }) {
  return (
    <section id="numbers" className="section" aria-labelledby="numbers-h">
      <SectionHead id="numbers" kicker="This week by the numbers" title="What the class shared"><Prov label="CODE-COUNTED" /></SectionHead>
      <div className="metrics">
        {METRIC_LABELS.map((d) => {
          const v = m[d.key];
          return (
            <div className="metric" key={d.key}>
              <span className={"value" + (v === null ? " na" : "")}>{v === null ? "Unavailable" : v}</span>
              <span className="label">{d.label}</span>
              <span className="def">{d.definition}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Patterns({ m }: { m: Issue["metrics"] }) {
  const total = m.signals.profiledBuilds;
  const rows = (Object.keys(SIGNAL_LABELS) as SignalKey[])
    .map((k) => ({ k, n: (m.signals as Record<string, number>)[k] }))
    .filter((r) => r.n !== undefined)
    .sort((a, b) => b.n - a.n);
  const maxSvc = Math.max(1, ...m.externalServices.map((s) => s.builds));
  return (
    <section id="patterns" className="section" aria-labelledby="patterns-h">
      <SectionHead id="patterns" kicker="Workflow pattern distribution" title="Which safeguards did builds use?"><Prov label="CODE-COUNTED" /></SectionHead>
      <p className="ink2 reading">Detected from the structure of {total} profiled workflow file{total === 1 ? "" : "s"}, not from post text. A build can show several patterns.</p>
      {total === 0 ? (
        <p className="notice">No workflow files were profiled for this week, so no patterns are shown.</p>
      ) : (
        <div className="grid grid-2">
          <div className="card">
            <h3>Reliability signals</h3>
            <div className="bars" aria-hidden="true">
              {rows.map((r) => (
                <div className="bar-row" key={r.k}>
                  <span className="name">{SIGNAL_LABELS[r.k].label}</span>
                  <span className="bar-track"><span className="bar-fill" style={{ display: "block", width: (r.n / total) * 100 + "%" }} /></span>
                  <span className="n">{r.n}</span>
                </div>
              ))}
            </div>
            <table className="sr-only">
              <caption>Builds showing each reliability signal, out of {total} profiled</caption>
              <thead><tr><th>Signal</th><th>Builds</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.k}><td>{SIGNAL_LABELS[r.k].label}</td><td>{r.n}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="card">
            <h3>External services</h3>
            {m.externalServices.length === 0 ? <p className="muted">No external services detected.</p> : (
              <>
                <div className="bars" aria-hidden="true">
                  {m.externalServices.map((s) => (
                    <div className="bar-row" key={s.name}>
                      <span className="name">{s.name}</span>
                      <span className="bar-track"><span className="bar-fill blue" style={{ display: "block", width: (s.builds / maxSvc) * 100 + "%" }} /></span>
                      <span className="n">{s.builds}</span>
                    </div>
                  ))}
                </div>
                <table className="sr-only">
                  <caption>Builds using each external service</caption>
                  <thead><tr><th>Service</th><th>Builds</th></tr></thead>
                  <tbody>{m.externalServices.map((s) => <tr key={s.name}><td>{s.name}</td><td>{s.builds}</td></tr>)}</tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function Themes({ issue }: { issue: Issue }) {
  if (!issue.themes.length) return null;
  const title = (id: string) => issue.allBuilds.find((b) => b.postId === id)?.title ?? id;
  return (
    <section id="themes" className="section" aria-labelledby="themes-h">
      <SectionHead id="themes" kicker="Theme map" title="What patterns defined the week?"><Prov label="AI-DRAFTED" /><Prov label="HUMAN-APPROVED" /></SectionHead>
      <div className="theme-map">
        {issue.themes.map((t) => (
          <article className="card theme" key={t.themeId}>
            <span className="count">{t.postIds.length} build{t.postIds.length === 1 ? "" : "s"}</span>
            <h3>{t.title}</h3>
            <p className="ink2">{t.description}</p>
            <ul>{t.postIds.map((p) => <li key={p}>{title(p)}</li>)}</ul>
            <Evidence refs={t.evidence} builds={issue.allBuilds} />
          </article>
        ))}
      </div>
    </section>
  );
}

export function Path({ chips }: { chips: { category: string; label: string }[] }) {
  if (!chips.length) return null;
  return (
    <ol className="path" aria-label="Main workflow path">
      {chips.map((c, i) => <li key={i}><span className={"chip tone-" + c.category}><span className="cat">{c.category}</span>{c.label}</span></li>)}
    </ol>
  );
}

export function Spotlights({ issue, screenshots }: { issue: Issue; screenshots: Record<string, boolean> }) {
  if (!issue.spotlights.length) return null;
  return (
    <section id="spotlights" className="section" aria-labelledby="spotlights-h">
      <SectionHead id="spotlights" kicker="Spotlight workflows" title="Builds worth learning from"><Prov label="AI-DRAFTED" /><Prov label="HUMAN-APPROVED" /></SectionHead>
      <p className="ink2 reading">Chosen to surface a design idea, not to rank people.</p>
      <div className="grid">
        {issue.spotlights.map((s) => {
          const shots = s.screenshots.filter((x) => screenshots[x.src]);
          return (
            <article className="card spotlight" key={s.postId} id={"spot-" + s.postId}>
              <div className="kicker">{s.category}</div>
              <h3>{s.title}</h3>
              <p className="byline">{s.author} · {s.commentCount} comment{s.commentCount === 1 ? "" : "s"}</p>
              <p style={{ fontFamily: "var(--font-serif)", fontSize: "1.08rem" }}>{s.narrative}</p>
              <Path chips={s.chips} />
              <dl>
                {s.testResult && <div><dt>Test result</dt><dd>{s.testResult}</dd></div>}
                {s.fromTheThread && <div><dt>From the thread</dt><dd>{s.fromTheThread}</dd></div>}
                <div><dt>Worth borrowing</dt><dd>{s.worthBorrowing}</dd></div>
              </dl>
              {shots.map((x) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={x.src} src={"/issues/week-" + String(issue.week).padStart(2, "0") + "/" + x.src} alt={x.alt} loading="lazy" style={{ borderRadius: 8, border: "1px solid var(--border)" }} />
              ))}
              {s.screenshots.length > shots.length && <p className="small muted">{s.screenshots.length - shots.length} screenshot{s.screenshots.length - shots.length === 1 ? " was" : "s were"} referenced but not published with this issue.</p>}
              <div className="btn-row">
                {s.workflowProfileId && <Link className="btn" href={"/atlas?w=" + s.workflowProfileId}>View workflow in the Atlas</Link>}
                {s.sourceUrl ? <a className="btn" href={s.sourceUrl}>Open Yellowdig post</a> : <span className="small muted" style={{ alignSelf: "center" }}>Source link not verified yet</span>}
              </div>
              <Evidence refs={s.evidence} builds={issue.allBuilds} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function FailurePathSection({ issue }: { issue: Issue }) {
  const f = issue.failurePath;
  return (
    <section id="failure" className="section" aria-labelledby="failure-h">
      <SectionHead id="failure" kicker="Failure path of the week" title={f ? "What a safeguard caught" : "No failure path this week"}>{f && <><Prov label="AI-DRAFTED" /><Prov label="HUMAN-APPROVED" /></>}</SectionHead>
      {!f ? <p className="muted">The approved issue does not include a failure path for this week.</p> : (
        <div className="card failure">
          <div>
            <h3>{f.title}</h3>
            <p className="byline muted">{f.author}</p>
            <FailureFigure />
            <p className="small muted">Failures are how safeguards prove themselves. This is about the system design, not the student.</p>
          </div>
          <div>
            <ol className="fsteps">
              <li><span className="mark m-fail" aria-hidden="true">!</span><b>What failed</b>{f.whatFailed}</li>
              <li><span className="mark m-catch" aria-hidden="true">✓</span><b>What caught it</b>{f.whatCaughtIt}</li>
              <li><span className="mark m-lesson" aria-hidden="true">→</span><b>Reusable lesson</b>{f.lesson}</li>
            </ol>
            <Evidence refs={f.evidence} builds={issue.allBuilds} />
          </div>
        </div>
      )}
    </section>
  );
}

export function Discussion({ issue }: { issue: Issue }) {
  const d = issue.discussionHighlights;
  return (
    <section id="discussion" className="section" aria-labelledby="discussion-h">
      <SectionHead id="discussion" kicker="Discussion pulse" title="What the threads talked about" />
      <div className="grid grid-2">
        <div className="card">
          <div className="badges" style={{ marginBottom: 10 }}><Prov label="AI-DRAFTED" /><Prov label="HUMAN-APPROVED" /></div>
          {d.synthesis.length === 0 ? <p className="muted">No discussion synthesis in this issue.</p> : d.synthesis.map((s, i) => (
            <div key={i} style={{ marginBottom: 12 }}><p style={{ fontFamily: "var(--font-serif)", fontSize: "1.05rem", marginBottom: 4 }}>{s.text}</p><Evidence refs={s.evidence} builds={issue.allBuilds} /></div>
          ))}
        </div>
        <div className="stack">
          <div>
            <div className="section-head" style={{ marginBottom: 8 }}><h3 style={{ margin: 0 }}>Most discussed</h3><Prov label="CODE-COUNTED" /></div>
            {d.mostDiscussed.length === 0 ? <p className="muted">No comments yet.</p> : (
              <div className="table-wrap"><table className="data">
                <thead><tr><th scope="col">Post</th><th scope="col">Author</th><th scope="col">Comments</th></tr></thead>
                <tbody>{d.mostDiscussed.map((p) => <tr key={p.postId}><td>{p.title}</td><td>{p.author}</td><td className="num">{p.commentCount}</td></tr>)}</tbody>
              </table></div>
            )}
          </div>
          <div>
            <div className="section-head" style={{ marginBottom: 8 }}><h3 style={{ margin: 0 }}>Generous commenters</h3><Prov label="CODE-COUNTED" /></div>
            <p className="small muted">Comments on other people&apos;s posts. A count of participation, not a grade or a ranking of quality.</p>
            {d.generousCommenters.length === 0 ? <p className="muted">No comments on others&apos; posts yet.</p> : (
              <div className="table-wrap"><table className="data">
                <thead><tr><th scope="col">Name</th><th scope="col">Comments on others</th></tr></thead>
                <tbody>{d.generousCommenters.map((c) => <tr key={c.name}><td>{c.name}</td><td className="num">{c.commentsOnOthers}</td></tr>)}</tbody>
              </table></div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function BuildTable({ issue }: { issue: Issue }) {
  return (
    <section id="builds" className="section" aria-labelledby="builds-h">
      <SectionHead id="builds" kicker="Full build directory" title={"All " + issue.allBuilds.length + " builds this week"}><Prov label="CODE-COUNTED" /></SectionHead>
      <div className="table-wrap"><table className="data">
        <thead><tr><th scope="col">Build</th><th scope="col">Author</th><th scope="col">Signals</th><th scope="col">Comments</th></tr></thead>
        <tbody>{issue.allBuilds.map((b) => (
          <tr key={b.postId}>
            <td><strong>{b.title}</strong>{b.isSpotlight && <> <span className="badge badge-ai">Spotlight</span></>}<br /><span className="ink2 small">{b.oneLine}</span>
              {b.workflowProfileId ? <><br /><Link className="small" href={"/atlas?w=" + b.workflowProfileId}>Open in Atlas</Link></> : <><br /><span className="small muted">No workflow file</span></>}</td>
            <td>{b.author}</td>
            <td><span className="small">{b.signals.map((k) => SIGNAL_LABELS[k].label).join(", ") || "—"}</span></td>
            <td className="num">{b.commentCount}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="small" style={{ marginTop: 10 }}><Link href={"/explore?week=" + issue.week}>Filter and search these builds in Explore →</Link></p>
    </section>
  );
}

export function Takeaways({ issue }: { issue: Issue }) {
  if (!issue.takeaways.length) return null;
  return (
    <section id="takeaways" className="section" aria-labelledby="takeaways-h">
      <SectionHead id="takeaways" kicker="What to carry forward" title="Lessons for next week"><Prov label="AI-DRAFTED" /><Prov label="HUMAN-APPROVED" /></SectionHead>
      <div className="grid grid-3">
        {issue.takeaways.map((t) => (
          <article className="card" key={t.title}><h3>{t.title}</h3><p className="ink2">{t.text}</p><Evidence refs={t.evidence} builds={issue.allBuilds} /></article>
        ))}
      </div>
    </section>
  );
}

export function MethodologySection({ issue }: { issue: Issue }) {
  const meth = issue.methodology;
  const src = issue.sourceSummary;
  return (
    <section id="methodology" className="section" aria-labelledby="methodology-h">
      <SectionHead id="methodology" kicker="Methodology and provenance" title="How this issue was made">
        {issue.provenance.labels.map((l) => <Prov key={l} label={l} />)}
        <Prov label={src.verified ? "LIVE VERIFIED" : "FIXTURE TESTED"} />
      </SectionHead>
      <div className="grid grid-2">
        <div className="card">
          <h3>Sources</h3>
          <ul className="ink2">
            <li>Yellowdig: {src.provider === "yellowdig-api" ? "Yellowdig API" : src.provider === "synthetic-fixture" ? "synthetic fixture (invented data)" : "manual export"}{src.verified ? ", verified request" : ", not a verified live request"}. {src.eventCount} events, topic “{src.topic}”.</li>
            <li>Workflow files: parsed as data and profiled by code; never executed.</li>
            <li>Numbers: counted by code. Prose: drafted by AI ({meth.llmProvider}), with every evidence reference checked by code.</li>
            <li>Review: {issue.approvedAt ? "approved " + issue.approvedAt.slice(0, 10) + (issue.approvedBy ? " by " + issue.approvedBy : "") : "not approved"}. Revisions used: {meth.revisionCount} of 2.</li>
            <li>Privacy: emails, SIS and LTI identifiers, credentials and raw workflow files are excluded.</li>
          </ul>
        </div>
        <div className="card">
          <h3>Checks</h3>
          <ul className="ink2">
            {meth.codeChecks.map((c) => <li key={c.name}>{c.passed ? "Passed" : "Failed"}: {c.name}{c.detail ? " — " + c.detail : ""}</li>)}
            {meth.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
          <p className="small muted">Run <code>{issue.provenance.runId}</code> · pipeline {meth.pipelineVersion} · input hash <code>{issue.provenance.inputHash.slice(0, 16)}</code></p>
        </div>
      </div>
    </section>
  );
}
