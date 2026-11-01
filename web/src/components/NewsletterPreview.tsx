"use client";
// Shows the stored newsletter HTML in a fully sandboxed iframe: no scripts, no same-origin access.
// The iframe loads the same route the HTML download uses, so preview and download are the same bytes.
import styles from "./generator.module.css";

export function NewsletterPreview({ runId, week }: { runId: string; week: number }) {
  return <iframe className={styles.preview} title={"CIS 515 Week " + week + " newsletter"} src={"/api/newsletter/" + runId} sandbox="" referrerPolicy="no-referrer" />;
}
