"use client";
// HTML and PDF downloads. Both are produced server-side from the run's one stored HTML artifact.
import { useState } from "react";
import styles from "./generator.module.css";

export function DownloadActions({ runId, week }: { runId: string; week: number }) {
  const [pdfState, setPdfState] = useState<"idle" | "working" | "failed">("idle");
  const name = "CIS515-Week-" + week + "-Newsletter";

  async function downloadPdf() {
    setPdfState("working");
    try {
      const res = await fetch("/api/pdf/" + runId);
      if (!res.ok) throw new Error("pdf");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name + ".pdf";
      a.click();
      URL.revokeObjectURL(url);
      setPdfState("idle");
    } catch {
      setPdfState("failed");
    }
  }

  return (
    <div className={styles.actions}>
      <a className={styles.primary} href={"/api/newsletter/" + runId + "?download=1"} download={name + ".html"}>Download HTML</a>
      <button type="button" className={styles.secondary} onClick={downloadPdf} disabled={pdfState === "working"}>
        {pdfState === "working" ? "Preparing PDF..." : "Download PDF"}
      </button>
      {pdfState === "failed" ? <p className={styles.pdfError} role="alert">The PDF could not be created. The HTML version is still available.</p> : null}
    </div>
  );
}
