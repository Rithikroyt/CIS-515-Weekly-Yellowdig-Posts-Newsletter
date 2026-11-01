"use client";
import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container section">
      <div className="card" role="alert" style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: "2rem" }}>Something went wrong on this page</h1>
        <p className="ink2">Nothing was changed or regenerated. The approved issues are still intact.</p>
        <div className="btn-row"><button type="button" className="btn btn-primary" onClick={reset}>Try again</button><Link className="btn" href="/">Home</Link></div>
      </div>
    </div>
  );
}
