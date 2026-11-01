"use client";
// Announces the real backend stage. Only stages reported by workflow 05 are shown; no timers or percentages.
import styles from "./generator.module.css";

const STAGE_TEXT: Record<string, string> = {
  queued: "Starting...",
  fetching_yellowdig: "Fetching Yellowdig posts...",
  normalizing: "Preparing weekly analysis...",
  profiling_assets: "Preparing weekly analysis...",
  generating_editorial: "Writing newsletter...",
  evidence_review: "Checking evidence...",
  rendering: "Rendering newsletter...",
};

export function GenerationStatus({ week, stage, error, onRetry }: { week: number; stage: string | null; error: string | null; onRetry: () => void }) {
  return (
    <div aria-live="polite">
      {error ? (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button type="button" className={styles.secondary} onClick={onRetry}>Try Again</button>
        </div>
      ) : stage ? (
        <div className={styles.status} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.statusMain}>Generating Week {week} Newsletter...</p>
            {STAGE_TEXT[stage] ? <p className={styles.statusStage}>{STAGE_TEXT[stage]}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
