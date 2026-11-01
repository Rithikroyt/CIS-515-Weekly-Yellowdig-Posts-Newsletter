import Link from "next/link";

/** Shown instead of the editorial console on any production build (no authentication exists yet). */
export function AdminLocked() {
  return (
    <div className="container section">
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="kicker">Editorial console</div>
        <h1 style={{ fontSize: "2rem" }}>Not available on this deployment</h1>
        <p className="ink2">The editorial console needs authentication, which isn&apos;t built yet. Until then it only runs on a local development server, and public deployments never show it.</p>
        <Link className="btn" href="/">Back to the Observatory</Link>
      </div>
    </div>
  );
}
