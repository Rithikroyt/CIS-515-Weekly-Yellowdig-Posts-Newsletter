"use client";
import { useState } from "react";

/**
 * Newsletter preview and downloads. The preview is a sandboxed iframe with no permissions (no scripts, no
 * same-origin access), and the file itself carries a CSP that blocks scripts and external loads.
 */
export function NewsletterPanel({ week, base, newsletter, pdf }: { week: number; base: string; newsletter: boolean; pdf: boolean }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const href = base + "newsletter.html";
  const name = "cis515-community-dispatch-week-" + String(week).padStart(2, "0");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/issues/" + week);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  };
  return (
    <div className="stack">
      <div className="btn-row no-print">
        {newsletter ? (
          <>
            <a className="btn btn-primary" href={href} target="_blank" rel="noopener">Open full screen</a>
            <a className="btn" href={href} download={name + ".html"}>Download HTML (Week {week})</a>
          </>
        ) : (
          <span className="btn" aria-disabled="true">Newsletter HTML not available</span>
        )}
        {pdf ? (
          <a className="btn" href={base + "newsletter.pdf"} download={name + ".pdf"}>Download PDF (Week {week})</a>
        ) : (
          <span className="btn" aria-disabled="true" title="No approved PDF has been produced for this week">PDF not available</span>
        )}
        <a className="btn" href={base + "issue.json"} download={name + ".json"}>Download issue data (JSON)</a>
        <button type="button" className="btn" onClick={copy}>Copy issue link</button>
        <span role="status" className="small muted" style={{ alignSelf: "center" }}>
          {copied === "ok" ? "Link copied." : copied === "fail" ? "Copy failed — use the address bar." : ""}
        </span>
      </div>
      {!pdf && <p className="small muted">No PDF has been produced for this week. To print or save as PDF, open the newsletter full screen and use your browser&apos;s Print command.</p>}
      {newsletter ? (
        <iframe className="preview-frame" src={href} sandbox="" title={"CIS 515 Community Dispatch, Week " + week + " (preview)"} loading="lazy" />
      ) : (
        <p className="notice">The standalone newsletter file for this week is missing. The issue on this page is still the approved source.</p>
      )}
    </div>
  );
}
