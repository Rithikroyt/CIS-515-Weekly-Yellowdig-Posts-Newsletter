import Link from "next/link";
import { EmptyFigure } from "@/components/Illustrations";

export default function NotFound() {
  return (
    <div className="container section">
      <div className="card empty">
        <EmptyFigure />
        <div>
          <h1 style={{ fontSize: "2rem" }}>Page not found</h1>
          <p className="ink2">The Observatory covers Weeks 1–5 of CIS 515, Fall B 2026. This address doesn&apos;t match any of its pages.</p>
          <div className="btn-row"><Link className="btn btn-primary" href="/issues/4">Week 4 issue</Link><Link className="btn" href="/">Home</Link></div>
        </div>
      </div>
    </div>
  );
}
