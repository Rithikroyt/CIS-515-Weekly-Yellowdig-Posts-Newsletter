// Original SVG illustrations. Decorative ones are aria-hidden; informative ones carry a title and description.

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="none" stroke="var(--maroon)" strokeWidth="2" />
      <path d="M9 26 L17 14 L24 22 L31 11" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="9" cy="26" r="2.6" fill="var(--blue)" />
      <circle cx="17" cy="14" r="2.6" fill="var(--maroon)" />
      <circle cx="24" cy="22" r="2.6" fill="var(--teal)" />
      <circle cx="31" cy="11" r="3.2" fill="var(--gold)" />
    </svg>
  );
}

const STEPS = [
  { t: "Yellowdig post", s: "weekly workflow show-and-tell", dot: "dot-gold" },
  { t: "Workflow analysis", s: "parsed as data, never run", dot: "dot-code" },
  { t: "Code-counted metrics", s: "every number from code", dot: "dot-code" },
  { t: "AI editorial draft", s: "prose with evidence refs", dot: "dot-ai" },
  { t: "Human approval", s: "nothing ships without it", dot: "dot-human" },
  { t: "Community Dispatch", s: "web issue · HTML", dot: "dot-gold" },
];

/** Hero pipeline: from a Yellowdig post to a published, approved issue. */
export function PipelineFigure() {
  const y = (i: number) => 18 + i * 66;
  return (
    <svg className="pipeline-figure" viewBox="0 0 420 420" role="img" aria-labelledby="pf-t pf-d">
      <title id="pf-t">How a weekly issue is made</title>
      <desc id="pf-d">Six steps: Yellowdig post, workflow analysis, code-counted metrics, AI editorial draft, human approval, Community Dispatch.</desc>
      {[[350, 30], [392, 92], [372, 170], [404, 250], [356, 318], [390, 388], [330, 128]].map(([cx, cy], i) => (
        <circle key={i} className="star" cx={cx} cy={cy} r={i % 3 === 0 ? 3 : 2} />
      ))}
      <path className="rail" d={"M 40 " + y(0) + " V " + (y(5) + 24)} />
      <path className="trace" d={"M 40 " + y(0) + " V " + (y(5) + 24)} />
      {STEPS.map((st, i) => (
        <g key={st.t} className="step" transform={"translate(0 " + y(i) + ")"}>
          <circle className={st.dot} cx="40" cy="24" r="9" />
          <rect x="62" y="2" width="258" height="46" rx="8" />
          <text x="78" y="22">{st.t}</text>
          <text className="sub" x="78" y="38">{st.s}</text>
        </g>
      ))}
    </svg>
  );
}

/** Empty-state constellation: unconnected stars waiting for an issue. */
export function EmptyFigure() {
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" aria-hidden="true">
      <path d="M20 90 L60 40 L100 70" fill="none" stroke="var(--border)" strokeWidth="2" strokeDasharray="5 6" />
      <path d="M100 70 L140 30" fill="none" stroke="var(--border)" strokeWidth="2" strokeDasharray="2 6" />
      <circle cx="20" cy="90" r="7" fill="var(--surface)" stroke="var(--muted)" strokeWidth="2" />
      <circle cx="60" cy="40" r="7" fill="var(--surface)" stroke="var(--muted)" strokeWidth="2" />
      <circle cx="100" cy="70" r="7" fill="var(--surface)" stroke="var(--muted)" strokeWidth="2" />
      <circle cx="140" cy="30" r="9" fill="none" stroke="var(--gold-muted)" strokeWidth="2" strokeDasharray="3 3" />
    </svg>
  );
}

/** Failure path diagram: draft → gate → failed → caught → recovered. */
export function FailureFigure() {
  const nodes = [
    { x: 10, label: "Draft", c: "var(--ink-2)" },
    { x: 92, label: "Gate", c: "var(--blue)" },
    { x: 174, label: "Failed", c: "var(--red)" },
    { x: 256, label: "Caught", c: "var(--blue)" },
    { x: 338, label: "Recovered", c: "var(--teal)" },
  ];
  return (
    <svg viewBox="0 0 420 70" width="100%" aria-hidden="true">
      <path d="M40 30 H 370" stroke="var(--border)" strokeWidth="2" />
      {nodes.map((n) => (
        <g key={n.label}>
          <circle cx={n.x + 30} cy="30" r="10" fill="var(--surface)" stroke={n.c} strokeWidth="3" />
          <text x={n.x + 30} y="62" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink-2)" fontFamily="var(--font-sans)">{n.label}</text>
        </g>
      ))}
    </svg>
  );
}
