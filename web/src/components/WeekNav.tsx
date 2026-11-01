import Link from "next/link";
import type { WeekEntry } from "@/lib/issues/catalog";
import { PRODUCTION_WEEK } from "@/lib/issues/labels";
import { KIND_TEXT } from "./Badges";
import { WeekSelect } from "./WeekSelect";

/** Week 1–5 timeline. Selecting a week only changes the route; the page loads the frozen issue file. */
export function WeekNav({ weeks, current }: { weeks: Pick<WeekEntry, "week" | "kind">[]; current: number | null }) {
  return (
    <nav aria-label="Weeks">
      <ol className="weeknav" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {weeks.map((w) => (
          <li key={w.week}>
            <Link href={"/issues/" + w.week} className={"kind-" + w.kind} aria-current={current === w.week ? "page" : undefined}>
              <span className="node" aria-hidden="true">{w.week}</span>
              <span className="wk-label">Week {w.week}</span>
              <span className="wk-state">{KIND_TEXT[w.kind]}</span>
              {w.week === PRODUCTION_WEEK && <span className="prod">Production issue</span>}
            </Link>
          </li>
        ))}
      </ol>
      <WeekSelect weeks={weeks.map((w) => ({ week: w.week, label: "Week " + w.week + " — " + KIND_TEXT[w.kind] + (w.week === PRODUCTION_WEEK ? " (production)" : "") }))} current={current} />
    </nav>
  );
}
