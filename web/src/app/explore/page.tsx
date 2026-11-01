import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BuildDirectory } from "@/components/BuildDirectory";
import { directoryRows } from "@/lib/issues/directory";

export const metadata: Metadata = { title: "Explore builds", description: "Search and filter every approved workflow build by week and design pattern." };

export default function ExplorePage() {
  const rows = directoryRows();
  const hasReference = rows.some((r) => r.kind === "reference");
  return (
    <div className="container">
      <header className="masthead">
        <div className="kicker">Explore</div>
        <h1>Every build, by design pattern</h1>
        <p className="dek">Filter approved builds by week, safeguards and services. Patterns are detected from each workflow file&apos;s structure; nothing is run.</p>
        {hasReference && <p className="notice" style={{ marginTop: 12 }}>Builds marked <strong>Synthetic reference</strong> are invented examples from the reference issue, not real class work.</p>}
      </header>
      <div className="section">
        {rows.length === 0 ? (
          <p className="notice">No approved issues yet, so there are no builds to explore. <Link href="/methodology">How issues are made</Link>.</p>
        ) : (
          <Suspense fallback={<p className="muted">Loading filters…</p>}><BuildDirectory rows={rows} /></Suspense>
        )}
      </div>
    </div>
  );
}
