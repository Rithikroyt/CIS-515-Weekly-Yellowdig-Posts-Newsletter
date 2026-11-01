import { NewsletterGenerator } from "@/components/NewsletterGenerator";
import { DEFAULT_WEEK } from "@/lib/weeks";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <p className={styles.kicker}>CIS 515</p>
        <h1 className={styles.title}>Yellowdig Weekly Posts Newsletter</h1>
        <p className={styles.lede}>Generate a newsletter from the weekly CIS 515 Yellowdig workflow discussions.</p>
      </header>
      <NewsletterGenerator defaultWeek={DEFAULT_WEEK} />
    </main>
  );
}
