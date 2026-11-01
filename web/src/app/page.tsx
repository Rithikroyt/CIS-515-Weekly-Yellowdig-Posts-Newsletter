import Link from "next/link";
import { KindBadge } from "@/components/Badges";
import { PipelineFigure } from "@/components/Illustrations";
import { WeekNav } from "@/components/WeekNav";
import { loadAllWeeks } from "@/lib/issues/catalog";
import { PRODUCTION_WEEK } from "@/lib/issues/labels";

export default function Home() {
  const weeks = loadAllWeeks();
  const prod = weeks.find((w) => w.week === PRODUCTION_WEEK)!;
  const reference = weeks.find((w) => w.kind === "reference");
  return (
    <>
      <div className="container">
        <section className="hero" aria-labelledby="hero-h">
          <div className="reveal">
            <div className="kicker">CIS 515 Workflow Observatory · Fall B 2026</div>
            <h1 id="hero-h">See what the class built, <em>what failed,</em> and what to carry forward.</h1>
            <p className="lede">Every week, CIS 515 students build real AI workflows in n8n and share them on Yellowdig. The Observatory turns those experiments into a reviewed, class-wide dashboard and a weekly publication: the CIS 515 Community Dispatch.</p>
            <div className="btn-row">
              <Link className="btn btn-primary" href={"/issues/" + PRODUCTION_WEEK}>View Week {PRODUCTION_WEEK} issue</Link>
              <Link className="btn" href="/explore">Explore all weeks</Link>
              <Link className="btn" href="/methodology">Read the methodology</Link>
            </div>
            <p className="small muted" style={{ marginTop: 14 }}>
              Week {PRODUCTION_WEEK} is the assigned production issue. Status: <KindBadge kind={prod.kind} />
              {prod.kind === "not-generated" && reference && <> — the <Link href={"/issues/" + reference.week}>Week {reference.week} reference issue</Link> shows the format with synthetic data.</>}
            </p>
          </div>
          <div className="card"><PipelineFigure /></div>
        </section>

        <section className="section" aria-labelledby="weeks-h">
          <div className="section-head"><div><div className="kicker">Weekly issues</div><h2 id="weeks-h">Choose a week</h2></div></div>
          <p className="ink2 reading">Each week opens an already-approved issue. Selecting a week never re-runs the pipeline, re-counts numbers or regenerates text.</p>
          <div className="card"><WeekNav weeks={weeks} current={null} /></div>
        </section>

        <section className="section" aria-labelledby="how-h">
          <div className="section-head"><div><div className="kicker">How it works</div><h2 id="how-h">From weekly workflows to a shared learning record</h2></div></div>
          <div className="grid grid-3">
            <article className="card"><h3>What students create</h3><p className="ink2">An n8n workflow each week, posted to the Yellowdig show-and-tell topic with a description, test results and often the workflow file and screenshots.</p></article>
            <article className="card"><h3>What the Observatory reads</h3><p className="ink2">Posts and comments from Yellowdig, plus workflow files parsed as data. Workflows are never run, and private fields such as emails and student IDs are dropped.</p></article>
            <article className="card"><h3>How numbers are made</h3><p className="ink2">Code counts posts, comments and contributors, and detects safeguards such as validation gates, human approval and bounded retries from each workflow&apos;s structure.</p></article>
            <article className="card"><h3>How the story is written</h3><p className="ink2">AI drafts themes, spotlights and takeaways. Each claim carries evidence references that code checks, and the draft gets at most two revisions.</p></article>
            <article className="card"><h3>Who approves</h3><p className="ink2">A person reviews and approves every issue. Nothing is published, and nothing appears here, without that approval.</p></article>
            <article className="card"><h3>What you can do</h3><p className="ink2">Read the dashboard, open spotlights and the failure path, inspect workflow architecture in the Atlas, and download the newsletter.</p></article>
          </div>
        </section>

        <section className="section" aria-labelledby="reveal-h">
          <div className="section-head"><div><div className="kicker">What the dashboard reveals</div><h2 id="reveal-h">Patterns, controls and failures — not rankings</h2></div></div>
          <div className="grid grid-2">
            <div className="panel"><h3>Class-wide patterns</h3><p className="ink2">Which builds used AI agents, code validation, human approval, bounded retries, fallbacks and external services — counted from workflow structure.</p><Link href="/trends">See trends across weeks →</Link></div>
            <div className="panel"><h3>Failure paths</h3><p className="ink2">Each issue highlights one failure a safeguard caught, and the reusable lesson behind it. The focus is the system, never the student.</p><Link href={"/issues/" + (reference?.week ?? PRODUCTION_WEEK) + "#failure"}>Read a failure path →</Link></div>
          </div>
        </section>
      </div>
    </>
  );
}
