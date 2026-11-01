import fs from "node:fs";
import path from "node:path";
import styles from "./page.module.css";

type Issue = {
  slug: string;
  week: number;
  title: string;
  generatedAt: string;
  html: string;
  summary?: { uniqueCases?: number; aiReviewed?: number; needsClarification?: number };
};

function loadIssues(): Issue[] {
  const dir = path.join(process.cwd(), "public", "issues");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "issue.json")))
    .map((d) => ({
      slug: d.name,
      ...JSON.parse(fs.readFileSync(path.join(dir, d.name, "issue.json"), "utf8")),
    }))
    .sort((a, b) => b.week - a.week);
}

export default function Home() {
  const issues = loadIssues();
  return (
    <main className={styles.main}>
      <h1>CIS 515 Weekly Newsletter</h1>
      <p className={styles.lede}>Weekly Yellowdig issues, generated and reviewed in n8n.</p>
      {issues.length === 0 ? (
        <p>No issues published yet.</p>
      ) : (
        <ul className={styles.list}>
          {issues.map((issue) => (
            <li key={issue.slug} className={styles.card}>
              <a href={`/issues/${issue.slug}/${issue.html}`}>
                <span className={styles.week}>Week {issue.week}</span>
                <span className={styles.title}>{issue.title}</span>
              </a>
              <span className={styles.meta}>
                Generated {issue.generatedAt.slice(0, 10)}
                {issue.summary?.uniqueCases !== undefined &&
                  ` · ${issue.summary.uniqueCases} cases · ${issue.summary.aiReviewed ?? 0} AI-reviewed · ${issue.summary.needsClarification ?? 0} need clarification`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
