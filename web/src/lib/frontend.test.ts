// Frontend data boundary: week states, newsletter rendering and graph layout.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { issueSchema, type Issue } from "./contracts";
import { DISPLAYABLE, entryFromRaw, loadAllWeeks, loadProfiles, loadWeek } from "./issues/catalog";
import { directoryRows } from "./issues/directory";
import { layoutGraph } from "./graph/layout";
import { esc, renderNewsletter } from "./render/newsletter";

const fixture = () => JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "issues", "week-02", "issue.json"), "utf8")) as Issue;
const files = { newsletter: true, pdf: false };

describe("issue catalog", () => {
  it("weeks 1–5: only the synthetic Week 2 issue exists, as a reference issue; Week 4 is not generated", () => {
    expect(loadAllWeeks().map((w) => [w.week, w.kind])).toEqual([[1, "not-generated"], [2, "reference"], [3, "not-generated"], [4, "not-generated"], [5, "not-generated"]]);
    expect(loadWeek(4).issue).toBeNull();
  });
  it("a synthetic or unverified issue is never treated as real class data", () => {
    expect(entryFromRaw(2, fixture(), files).kind).toBe("reference");
    const real = { ...fixture(), provenance: { ...fixture().provenance, synthetic: false }, sourceSummary: { ...fixture().sourceSummary, verified: true, provider: "yellowdig-api" } };
    expect(entryFromRaw(2, real, files).kind).toBe("approved");
    expect(entryFromRaw(2, { ...real, status: "published" }, files).kind).toBe("published");
    expect(entryFromRaw(2, { ...real, provenance: { ...real.provenance, synthetic: false }, sourceSummary: { ...real.sourceSummary, verified: false } }, files).kind).toBe("reference");
  });
  it("unapproved issues are never displayed", () => {
    for (const [status, kind] of [["review", "in-review"], ["revision_requested", "in-review"], ["draft", "draft"], ["failed", "failed"]] as const) {
      const e = entryFromRaw(2, { ...fixture(), status, approvedAt: null, approvedBy: null }, files);
      expect(e.kind).toBe(kind);
      expect(e.issue).toBeNull();
      expect(DISPLAYABLE.has(e.kind)).toBe(false);
    }
  });
  it("an invalid file or a week mismatch is unavailable, and errors carry paths not values", () => {
    const bad = entryFromRaw(2, { ...fixture(), metrics: { ...fixture().metrics, posts: "eight" } }, files);
    expect(bad.kind).toBe("invalid");
    expect(bad.issue).toBeNull();
    expect(bad.errors.join(" ")).toContain("metrics/posts");
    expect(bad.errors.join(" ")).not.toContain("eight");
    expect(entryFromRaw(3, fixture(), files).kind).toBe("invalid");
    expect(entryFromRaw(2, null, files).kind).toBe("invalid");
  });
  it("PDF is available only when the file exists", () => {
    expect(loadWeek(2).pdfAvailable).toBe(false);
    expect(entryFromRaw(2, fixture(), { newsletter: true, pdf: true }).pdfAvailable).toBe(true);
  });
  it("only profiles referenced by the approved issue are loaded, and they hold no parameters", () => {
    const profiles = loadProfiles(loadWeek(2));
    const ids = new Set(fixture().allBuilds.map((b) => b.workflowProfileId).filter(Boolean));
    expect(profiles.length).toBe(ids.size);
    profiles.forEach((p) => expect(ids.has(p.profileId)).toBe(true));
    expect(JSON.stringify(profiles)).not.toMatch(/parameters|jsCode|credentials|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });
  it("directory rows come only from displayable weeks and carry the issue's own values", () => {
    const rows = directoryRows();
    expect(rows.length).toBe(fixture().allBuilds.length);
    expect(rows.every((r) => r.week === 2 && r.kind === "reference")).toBe(true);
    expect(rows.map((r) => r.title)).toEqual(fixture().allBuilds.map((b) => b.title));
  });
});

describe("newsletter renderer", () => {
  it("the committed newsletter.html equals a fresh render of the committed issue.json", () => {
    const committed = readFileSync(join(__dirname, "..", "..", "public", "issues", "week-02", "newsletter.html"), "utf8");
    expect(committed).toBe(renderNewsletter(issueSchema.parse(fixture())));
  });
  it("has no scripts, handlers or external resources, and labels synthetic data", () => {
    const html = renderNewsletter(fixture());
    expect(html).not.toMatch(/<script|\son[a-z]+=|<iframe|<link|src="http/i);
    expect(html).toContain("Reference issue — synthetic data");
    expect(html).toContain("default-src 'none'");
  });
  it("escapes hostile text from the issue", () => {
    const evil = fixture();
    evil.hero = { ...evil.hero, headline: '<img src=x onerror=alert(1)>"', intro: "<script>alert(1)</script>" };
    const html = renderNewsletter(evil);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(esc(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });
  it("shows the code-counted metrics exactly as stored and 'Unavailable' for null counts", () => {
    const i = fixture();
    const html = renderNewsletter({ ...i, metrics: { ...i.metrics, reactions: null } });
    expect(html).toContain("<b>" + i.metrics.posts + "</b><span>Workflow posts");
    expect(html).toContain("<b>Unavailable</b><span>Reactions");
  });
  it("is deterministic", () => {
    expect(renderNewsletter(fixture())).toBe(renderNewsletter(fixture()));
  });
});

describe("graph layout", () => {
  it("places every node once, deterministically, with triggers in the first column", () => {
    for (const p of loadProfiles(loadWeek(2))) {
      const a = layoutGraph(p.graph), b = layoutGraph(p.graph);
      expect(a).toEqual(b);
      expect(a.nodes).toHaveLength(p.graph.nodes.length);
      a.nodes.filter((n) => n.category === "trigger").forEach((n) => expect(n.layer).toBe(0));
      const spots = new Set(a.nodes.map((n) => n.x + ":" + n.y));
      expect(spots.size).toBe(a.nodes.length);
      a.edges.filter((e) => e.back).forEach((e) => expect(e.kind).not.toBe("ai"));
    }
  });
});
