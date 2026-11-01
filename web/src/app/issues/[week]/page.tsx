import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KindBadge, Prov } from "@/components/Badges";
import { EmptyFigure } from "@/components/Illustrations";
import { WeekNav } from "@/components/WeekNav";
import { NewsletterPanel } from "@/components/issue/NewsletterPanel";
import {
  BuildTable, Discussion, FailurePathSection, MethodologySection, Numbers, Patterns, SectionHead, Spotlights, Takeaways, Themes,
} from "@/components/issue/Sections";
import { DISPLAYABLE, issueBasePath, loadAllWeeks, loadWeek, screenshotExists, type WeekEntry } from "@/lib/issues/catalog";
import { COURSE_WEEKS, PRODUCTION_WEEK, STATUS_TEXT } from "@/lib/issues/labels";

// Every week page is built once from the frozen files. Changing weeks never calls Yellowdig, n8n or an LLM.
export const dynamicParams = false;
export function generateStaticParams() {
  return COURSE_WEEKS.map((w) => ({ week: String(w) }));
}

type Props = { params: Promise<{ week: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { week } = await params;
  const e = loadWeek(Number(week));
  return {
    title: e.issue ? "Week " + week + ": " + e.issue.hero.headline : "Week " + week,
    description: e.issue ? e.issue.hero.dek : "CIS 515 Community Dispatch, Week " + week + ".",
  };
}

const SECTIONS = [
  ["summary", "Summary"], ["numbers", "By the numbers"], ["patterns", "Patterns"], ["themes", "Themes"], ["spotlights", "Spotlights"],
  ["failure", "Failure path"], ["discussion", "Discussion"], ["builds", "All builds"], ["takeaways", "Carry forward"],
  ["methodology", "Methodology"], ["newsletter", "Newsletter"],
] as const;

function Unavailable({ entry, reference }: { entry: WeekEntry; reference: WeekEntry | undefined }) {
  const w = entry.week;
  const msg: Record<string, { h: string; p: string }> = {
    "not-generated": { h: "Week " + w + " has not been generated yet.", p: "No issue exists for this week. Nothing is shown until an editor runs the pipeline and a person approves the result." },
    "in-review": { h: "Week " + w + " is in review.", p: "A draft exists but has not been approved, so it is not shown publicly." },
    draft: { h: "Week " + w + " is a draft.", p: "Drafts are not shown publicly until a person approves them." },
    failed: { h: "The Week " + w + " run failed.", p: "No content from a failed run is shown. An editor can retry from the admin console." },
    invalid: { h: "Week " + w + " is unavailable.", p: "The issue file does not match the issue contract, so it is not shown. An editor needs to republish it." },
  };
  const m = msg[entry.kind] ?? msg["not-generated"];
  return (
    <div className="card empty" style={{ marginTop: 32 }}>
      <EmptyFigure />
      <div>
        <h2>{m.h}</h2>
        <p className="ink2">{m.p}</p>
        {w === PRODUCTION_WEEK && <p className="ink2">Week 4 is the assigned production issue. It will appear here once the live Yellowdig data for Week 4 has been processed and approved.</p>}
        {reference && <p className="ink2">Meanwhile, the <Link href={"/issues/" + reference.week}>Week {reference.week} reference issue</Link> shows the full format using clearly labelled synthetic data.</p>}
        <div className="btn-row"><Link className="btn" href="/methodology">How issues are made</Link><Link className="btn" href="/">Back to the Observatory</Link></div>
      </div>
    </div>
  );
}

export default async function IssuePage({ params }: Props) {
  const { week: raw } = await params;
  const week = Number(raw);
  if (!COURSE_WEEKS.includes(week as (typeof COURSE_WEEKS)[number])) notFound();
  const weeks = loadAllWeeks();
  const entry = loadWeek(week);
  const reference = weeks.find((w) => w.kind === "reference");
  const issue = entry.issue;

  return (
    <div className="container">
      <div style={{ paddingTop: 24 }}><WeekNav weeks={weeks} current={week} /></div>
      {!issue || !DISPLAYABLE.has(entry.kind) ? <Unavailable entry={entry} reference={reference} /> : (
        <>
          <header className="masthead reveal">
            <div className="title-row">
              <span className="kicker">CIS 515 Community Dispatch · Week {issue.week} · {issue.dateRange.label}</span>
              <KindBadge kind={entry.kind} />
              {week === PRODUCTION_WEEK && <span className="badge badge-ai">Production issue</span>}
            </div>
            <h1>{issue.hero.headline}</h1>
            <p className="dek">{issue.hero.dek}</p>
            <p className="small muted">{STATUS_TEXT[issue.status]}{issue.approvedAt ? " " + issue.approvedAt.slice(0, 10) + (issue.approvedBy ? " by " + issue.approvedBy : "") : ""} · {issue.term}</p>
            {entry.kind === "reference" && (
              <div className="notice" role="note">
                <p><strong>Reference issue — synthetic data.</strong> Every name, post and number in this issue is invented to demonstrate the format and test the pipeline. It is not real CIS 515 class data and is not the Week {issue.week} class record.</p>
              </div>
            )}
            <div className="btn-row no-print" style={{ marginTop: 16 }}>
              <a className="btn btn-primary" href="#newsletter">Newsletter and downloads</a>
              <a className="btn" href="#spotlights">Spotlights</a>
              <a className="btn" href="#failure">Failure path</a>
            </div>
            <details className="toc-mobile">
              <summary>Sections in this issue</summary>
              <ol>{SECTIONS.map(([id, label]) => <li key={id}><a href={"#" + id}>{label}</a></li>)}</ol>
            </details>
          </header>
          <div className="issue-layout">
            <nav className="toc" aria-label="Sections in this issue">
              <ol>{SECTIONS.map(([id, label]) => <li key={id}><a href={"#" + id}>{label}</a></li>)}</ol>
            </nav>
            <div>
              <section id="summary" className="section" aria-labelledby="summary-h">
                <SectionHead id="summary" kicker="Executive summary" title="This week in brief"><Prov label="AI-DRAFTED" /><Prov label="HUMAN-APPROVED" /></SectionHead>
                <p className="intro">{issue.hero.intro}</p>
              </section>
              <Numbers m={issue.metrics} />
              <Patterns m={issue.metrics} />
              <Themes issue={issue} />
              <Spotlights issue={issue} screenshots={Object.fromEntries(issue.spotlights.flatMap((s) => s.screenshots).map((x) => [x.src, screenshotExists(week, x.src)]))} />
              <FailurePathSection issue={issue} />
              <Discussion issue={issue} />
              <BuildTable issue={issue} />
              <Takeaways issue={issue} />
              <MethodologySection issue={issue} />
              <section id="newsletter" className="section" aria-labelledby="newsletter-h">
                <SectionHead id="newsletter" kicker="CIS 515 Community Dispatch" title="Read or download the newsletter" />
                <p className="ink2 reading">The standalone newsletter is rendered by code from the same approved issue data shown on this page.</p>
                <NewsletterPanel week={week} base={issueBasePath(week)} newsletter={entry.newsletterAvailable} pdf={entry.pdfAvailable} />
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
