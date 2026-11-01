"use client";
// Labelled week dropdown, Weeks 1 to 5.
import styles from "./generator.module.css";

export function WeekSelector({ value, onChange, disabled }: { value: number; onChange: (w: number) => void; disabled: boolean }) {
  return (
    <div className={styles.field}>
      <label htmlFor="week" className={styles.label}>Select Week</label>
      <select id="week" className={styles.select} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
        {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>Week {w}</option>)}
      </select>
    </div>
  );
}
