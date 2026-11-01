"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** Mobile week picker: a native select plus previous/next links. Changing it only navigates. */
export function WeekSelect({ weeks, current }: { weeks: { week: number; label: string }[]; current: number | null }) {
  const router = useRouter();
  const idx = weeks.findIndex((w) => w.week === current);
  const prev = idx > 0 ? weeks[idx - 1] : null;
  const next = idx >= 0 && idx < weeks.length - 1 ? weeks[idx + 1] : null;
  return (
    <div className="weeknav-mobile">
      {prev ? <Link className="icon-btn" href={"/issues/" + prev.week} aria-label={"Previous: week " + prev.week}>‹</Link> : <span className="icon-btn" aria-hidden="true" style={{ opacity: 0.3 }}>‹</span>}
      <label className="sr-only" htmlFor="week-select">Choose a week</label>
      <select id="week-select" value={current ?? ""} onChange={(e) => router.push("/issues/" + e.target.value)}>
        {current === null && <option value="">Choose a week</option>}
        {weeks.map((w) => <option key={w.week} value={w.week}>{w.label}</option>)}
      </select>
      {next ? <Link className="icon-btn" href={"/issues/" + next.week} aria-label={"Next: week " + next.week}>›</Link> : <span className="icon-btn" aria-hidden="true" style={{ opacity: 0.3 }}>›</span>}
    </div>
  );
}
