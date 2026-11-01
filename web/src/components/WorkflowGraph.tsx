"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_GROUPS, NODE_H, NODE_W, type Layout } from "@/lib/graph/layout";

/** Static, read-only workflow diagram. It never runs anything; it draws the sanitized profile graph. */
export function WorkflowGraph({ layout, title }: { layout: Layout; title: string }) {
  // view.s is pixels per graph unit; view.x / view.y is the graph point at the frame's top-left corner.
  const [view, setView] = useState({ x: 0, y: 0, s: 1 });
  const [frameW, setFrameW] = useState(800);
  const [active, setActive] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  // Fit the whole graph when it is readable (scale ≥ 0.7); otherwise open at 0.7 anchored left and let it pan.
  const fitScale = Math.min(1, Math.max(0.7, frameW / layout.width));
  const frameH = Math.round(Math.min(560, Math.max(240, layout.height * fitScale + 24)));
  const initial = useCallback((w: number) => {
    const s = Math.min(1, Math.max(0.7, w / layout.width));
    const h = Math.min(560, Math.max(240, layout.height * s + 24));
    return { x: 0, y: -((h / s - layout.height) / 2), s };
  }, [layout]);
  useEffect(() => {
    const w = frame.current?.clientWidth ?? 800;
    setFrameW(w);
    setView(initial(w));
  }, [initial]);

  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const related = useMemo(() => {
    if (!active) return null;
    // Highlight everything upstream and downstream of the focused node.
    const set = new Set([active]);
    const walk = (dir: "up" | "down") => {
      const q = [active];
      for (let i = 0; i < q.length; i++) {
        for (const e of layout.edges) {
          const [from, to] = dir === "down" ? [e.source, e.target] : [e.target, e.source];
          if (from === q[i] && !set.has(to)) { set.add(to); q.push(to); }
        }
      }
    };
    walk("down"); walk("up");
    return set;
  }, [active, layout]);

  // Zoom around the frame centre.
  const zoom = useCallback((f: number) => setView((v) => {
    const s = Math.min(2.5, Math.max(0.25, v.s * f));
    const cx = v.x + frameW / 2 / v.s, cy = v.y + frameH / 2 / v.s;
    return { s, x: cx - frameW / 2 / s, y: cy - frameH / 2 / s };
  }), [frameW, frameH]);
  const reset = () => setView(initial(frameW));

  const edgePath = (s: { x: number; y: number }, t: { x: number; y: number }, back: boolean, ai: boolean) => {
    if (ai) return "M " + (s.x + NODE_W / 2) + " " + s.y + " L " + (t.x + NODE_W / 2) + " " + (t.y + NODE_H);
    const x1 = s.x + NODE_W, y1 = s.y + NODE_H / 2, x2 = t.x, y2 = t.y + NODE_H / 2;
    if (back) {
      const low = Math.max(s.y, t.y) + NODE_H + 22;
      return "M " + (s.x + NODE_W / 2) + " " + (s.y + NODE_H) + " C " + (s.x + NODE_W / 2) + " " + low + ", " + (t.x + NODE_W / 2) + " " + low + ", " + (t.x + NODE_W / 2) + " " + (t.y + NODE_H);
    }
    const mx = (x1 + x2) / 2;
    return "M " + x1 + " " + y1 + " C " + mx + " " + y1 + ", " + mx + " " + y2 + ", " + x2 + " " + y2;
  };

  const vbW = frameW / view.s, vbH = frameH / view.s;
  return (
    <div>
      <div className="graph-frame" ref={frame} style={{ height: frameH }}>
        <div className="graph-controls no-print">
          <button type="button" className="icon-btn" onClick={() => zoom(1.25)} aria-label="Zoom in">+</button>
          <button type="button" className="icon-btn" onClick={() => zoom(0.8)} aria-label="Zoom out">−</button>
          <button type="button" className="icon-btn" onClick={reset} aria-label="Reset view">⟲</button>
        </div>
        <svg
          role="group"
          aria-label={"Workflow diagram: " + title + ". Use Tab to move between steps; the text list below describes the same graph."}
          viewBox={view.x + " " + view.y + " " + vbW + " " + vbH}
          preserveAspectRatio="xMinYMin meet"
          onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 0.9); } }}
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const d = drag.current;
            setView((v) => ({ ...v, x: d.vx - (e.clientX - d.x) / v.s, y: d.vy - (e.clientY - d.y) / v.s }));
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerLeave={() => { drag.current = null; }}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--muted)" /></marker>
          </defs>
          {layout.edges.map((e, i) => {
            const s = byId.get(e.source)!, t = byId.get(e.target)!;
            const dim = related && !(related.has(e.source) && related.has(e.target));
            return <path key={i} d={edgePath(s, t, e.back, e.kind === "ai")} className={"gedge " + e.kind + (e.back ? " back" : "") + (dim ? " dim" : "")} markerEnd={e.kind === "ai" ? undefined : "url(#arrow)"} />;
          })}
          {layout.nodes.map((n) => {
            const g = CATEGORY_GROUPS[n.category] ?? CATEGORY_GROUPS.other;
            const dim = related && !related.has(n.id);
            const label = n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label;
            return (
              <g
                key={n.id}
                className={"gnode gtone-" + g.tone + (n.disabled ? " disabled" : "") + (dim ? " dim" : "") + (active === n.id ? " active" : "")}
                transform={"translate(" + n.x + " " + n.y + ")"}
                tabIndex={0}
                role="button"
                aria-pressed={active === n.id}
                aria-label={n.label + ", " + g.label + (n.disabled ? ", disabled" : "") + ". Press to highlight its path."}
                onClick={() => setActive(active === n.id ? null : n.id)}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setActive(active === n.id ? null : n.id); } if (ev.key === "Escape") setActive(null); }}
              >
                <title>{n.label + " — " + g.label}</title>
                <rect width={NODE_W} height={NODE_H} rx="8" />
                <text className="gcat" x="10" y="17">{g.label}{n.disabled ? " · off" : ""}</text>
                <text className="glabel" x="10" y="36">{label}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="legend" aria-label="Legend">
        <li><span className="sw" style={{ borderColor: "var(--gold-muted)" }} />Trigger</li>
        <li><span className="sw" style={{ borderColor: "var(--maroon)" }} />AI</li>
        <li><span className="sw" style={{ borderColor: "var(--blue)" }} />Code / validation</li>
        <li><span className="sw" style={{ borderColor: "var(--teal)" }} />Human review / storage</li>
        <li><span className="sw" style={{ borderColor: "var(--ink-2)" }} />Action / control flow</li>
        <li><span className="sw" style={{ borderColor: "var(--red)" }} />Error handling</li>
        <li>Amber line: loop back · red line: error output · dotted: AI connection</li>
      </ul>
      <p className="small muted graph-mobile-note">Drag to pan. Use the buttons to zoom. The text list below has every step.</p>
    </div>
  );
}
