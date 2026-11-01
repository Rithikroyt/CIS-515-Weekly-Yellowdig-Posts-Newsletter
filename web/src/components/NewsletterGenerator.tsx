"use client";
// Select a week, generate, read, download. Polls the real run state until it is terminal.
import { useEffect, useRef, useState } from "react";
import { DownloadActions } from "./DownloadActions";
import { GenerationStatus } from "./GenerationStatus";
import { NewsletterPreview } from "./NewsletterPreview";
import { WeekSelector } from "./WeekSelector";
import styles from "./generator.module.css";

const FAILED = "Newsletter generation failed. Please try again.";
const POLL_MS = 3000;
const MAX_POLL_ERRORS = 3;
type Done = { runId: string; week: number; omitted: number };
// Only the server's fixed safe codes (or the HTTP status) are shown, so failures can be diagnosed without dev tools.
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const NEEDS_ASSETS = "This week's newsletter needs post screenshots/workflow files before it can be generated at publication quality.";
const failed = (code: unknown, httpStatus?: number) =>
  code === "NEEDS_ASSETS" || code === "NEWSLETTER_QUALITY_INCOMPLETE" ? NEEDS_ASSETS + " (Error code: " + code + ")" :
  FAILED + (typeof code === "string" && SAFE_CODE.test(code) ? " (Error code: " + code + ")" : httpStatus ? " (HTTP " + httpStatus + ")" : "");

export function NewsletterGenerator({ defaultWeek }: { defaultWeek: number }) {
  const [week, setWeek] = useState(defaultWeek);
  const [running, setRunning] = useState<{ runId: string; week: number } | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const busy = useRef(false);

  async function generate() {
    if (busy.current) return; // a second click while a run is starting or running does nothing
    busy.current = true;
    setError(null);
    setDone(null);
    setStage("queued");
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ week }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.runId !== "string") {
        throw new Error(body.error === "WEEK_NOT_CONFIGURED" ? "Week " + week + " is not available yet. Its Yellowdig topic has not been set up." : failed(body.error, res.status));
      }
      setRunning({ runId: body.runId, week });
      setStage(typeof body.status === "string" ? body.status : "queued");
    } catch (e) {
      busy.current = false;
      setStage(null);
      setError(e instanceof Error && e.message ? e.message : FAILED);
    }
  }

  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let errors = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (err: string | null, ok?: Done) => {
      stopped = true;
      busy.current = false;
      setRunning(null);
      setStage(null);
      setError(err);
      if (ok) setDone(ok);
    };
    const poll = async () => {
      try {
        const res = await fetch("/api/generate/" + running.runId, { cache: "no-store" });
        if (res.status === 404) return finish(failed("RUN_NOT_FOUND"));
        if (!res.ok) throw new Error("poll");
        const s = await res.json();
        errors = 0;
        if (s.status === "ready" || s.status === "ready_with_omissions") return finish(null, { runId: running.runId, week: running.week, omitted: s.omittedClaims ?? 0 });
        if (s.status === "failed") return finish(failed(s.errorCode));
        if (!stopped) setStage(s.status);
      } catch {
        if (++errors >= MAX_POLL_ERRORS) return finish(FAILED);
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [running]);

  const shownWeek = running?.week ?? week;
  return (
    <>
      <section className={styles.card} aria-label="Generate a newsletter">
        <WeekSelector value={week} onChange={setWeek} disabled={!!running} />
        <button type="button" className={styles.primary} onClick={generate} disabled={!!running}>
          Generate Newsletter
        </button>
        <GenerationStatus week={shownWeek} stage={stage} error={error} onRetry={generate} />
      </section>
      {done ? (
        <section className={styles.result} aria-labelledby="result-heading">
          <div className={styles.resultHead}>
            <h2 id="result-heading" className={styles.resultTitle}>Week {done.week} Newsletter</h2>
            <DownloadActions runId={done.runId} week={done.week} />
          </div>
          {done.omitted > 0 ? (
            <p className={styles.note}>
              {done.omitted === 1 ? "1 statement" : done.omitted + " statements"} that did not pass evidence review {done.omitted === 1 ? "was" : "were"} left out.
            </p>
          ) : null}
          <NewsletterPreview runId={done.runId} week={done.week} />
        </section>
      ) : null}
    </>
  );
}
