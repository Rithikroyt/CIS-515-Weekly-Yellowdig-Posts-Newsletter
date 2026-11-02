// Every-build grouping on the 27-post synthetic week: every post once, meaningful named groups, "Other builds"
// as a last resort, second-pass and similarity reassignment, diagnostics, spotlight labels. Invented data only.
import { describe, expect, it } from "vitest";
import * as E from ".";
import { indexInput } from "./checks";
import { OTHER_BUILDS, OTHER_MAX, acceptProposal, normalizeTitle, titleKey, validateBuildGroups } from "./groups";
import { referenceWeek } from "./synthetic-reference";
import { renderNewsletter } from "../render/newsletter";

const NOW = () => "2026-11-01T12:00:00Z";
type Groups = E.BuildGroups["groups"];

function fullGroups(week: ReturnType<typeof referenceWeek>): Groups {
  return (week.scenario["build-categorizer"]![0] as { json: E.BuildGroups }).json.groups;
}
async function run(categorizer: E.MockScenario["build-categorizer"]) {
  const week = referenceWeek();
  const provider = E.createMockProvider({ ...week.scenario, "build-categorizer": categorizer });
  const draft = await E.runEditorial({ input: week.input, provider, now: NOW });
  return { week, draft, provider };
}
const everyPostOnce = (week: ReturnType<typeof referenceWeek>, groups: Groups) => {
  const all = groups.flatMap((g) => g.postRefs);
  expect(all).toHaveLength(27);
  expect(new Set(all).size).toBe(27);
  expect([...all].sort()).toEqual(week.input.posts.map((p) => p.postRef).sort());
};
const otherCount = (groups: Groups) => groups.find((g) => g.title === OTHER_BUILDS)?.postRefs.length ?? 0;

describe("every-build grouping", () => {
  it("places all 27 posts exactly once in meaningful named groups", async () => {
    const { week, draft } = await run(undefined);
    everyPostOnce(week, draft.buildGroups.groups);
    expect(otherCount(draft.buildGroups.groups)).toBeLessThanOrEqual(OTHER_MAX);
    const named = draft.buildGroups.groups.filter((g) => g.title !== OTHER_BUILDS);
    expect(named.length).toBeGreaterThanOrEqual(5);
    named.forEach((g) => expect(g.title).not.toMatch(/\d|\b(misc|various|general|other)\b/i));
  });

  it("runs a second pass for posts left without a group, and can create a new category", async () => {
    const full = (w: ReturnType<typeof referenceWeek>) => fullGroups(w);
    const first = { json: { groups: full(referenceWeek()).slice(0, 4) } };
    // Second pass: assigns the leftovers it is given, inventing one new category for the news posts.
    const second = { build: (d: unknown) => {
      const posts = (d as { posts: Array<{ postRef: string }> }).posts.map((p) => p.postRef);
      const g = full(referenceWeek());
      return { groups: [
        { title: g[4].title, postRefs: posts.filter((r) => g[4].postRefs.includes(r)) },
        { title: g[5].title, postRefs: posts.filter((r) => g[5].postRefs.includes(r)) },
      ] };
    } };
    const { week, draft, provider } = await run([first, second]);
    expect(provider.calls.filter((c) => c.promptId === "build-categorizer")).toHaveLength(2);
    expect(provider.calls[provider.calls.findIndex((c) => c.promptId === "build-categorizer") + 1].stage).toBe("build-categorizer-second-pass");
    everyPostOnce(week, draft.buildGroups.groups);
    expect(otherCount(draft.buildGroups.groups)).toBeLessThanOrEqual(OTHER_MAX);
    const diag = draft.buildGroupDiagnostics;
    expect(diag.fellThrough.length).toBeGreaterThan(OTHER_MAX);
    expect(diag.reassigned.filter((r) => r.method === "second-pass").length).toBe(diag.fellThrough.length);
    expect(diag.titles.filter((t) => t.pass === 2 && t.accepted).map((t) => t.normalized)).toEqual([fullGroups(week)[4].title, fullGroups(week)[5].title]);
  });

  it("reassigns by similarity and domain when the second pass fails", async () => {
    const first = { json: { groups: fullGroups(referenceWeek()).slice(0, 4) } };
    const { week, draft } = await run([first, { error: "provider" }]);
    everyPostOnce(week, draft.buildGroups.groups);
    expect(otherCount(draft.buildGroups.groups)).toBeLessThanOrEqual(OTHER_MAX);
    expect(draft.buildGroupDiagnostics.reassigned.some((r) => r.method === "similarity" || r.method === "domain-group")).toBe(true);
  });

  it("records why titles were rejected or merged, without publishing it", async () => {
    const g = fullGroups(referenceWeek());
    const proposal = { groups: [
      { title: "Misc tools", postRefs: g[0].postRefs.slice(0, 2) },
      { title: "Tools", postRefs: g[0].postRefs.slice(2) },
      { title: "Money and receipts", postRefs: g[1].postRefs.slice(0, 2) },
      { title: "money & Receipts.", postRefs: g[1].postRefs.slice(2) },
      ...g.slice(2),
    ] };
    const { week, draft, provider } = await run([{ json: proposal }, { error: "provider" }]);
    void provider;
    const byTitle = new Map(draft.buildGroupDiagnostics.titles.map((t) => [t.proposed, t]));
    expect(byTitle.get("Misc tools")).toMatchObject({ accepted: false, reason: "catch-all wording" });
    expect(byTitle.get("Tools")).toMatchObject({ accepted: false, reason: "overly vague" });
    expect(byTitle.get("money & Receipts.")).toMatchObject({ accepted: false, reason: expect.stringMatching(/duplicate of “Money and receipts” \(merged\)/) });
    expect(draft.buildGroups.groups.find((x) => x.title === "Money and receipts")!.postRefs.length).toBe(g[1].postRefs.length);
    everyPostOnce(week, draft.buildGroups.groups);
    const html = renderNewsletter({ input: week.input, draft }).html;
    expect(html).not.toMatch(/Misc tools|catch-all wording|overly vague|fellThrough/);
  });

  it("gives a spotlight the category of its final group, even when the first pass missed it", async () => {
    const g = fullGroups(referenceWeek());
    // First pass leaves the customer-support group out, so the Refund Reply Desk spotlight falls through.
    const first = { json: { groups: g.slice(1) } };
    const second = { build: (d: unknown) => ({ groups: [{ title: g[0].title, postRefs: (d as { posts: Array<{ postRef: string }> }).posts.map((p) => p.postRef).filter((r) => g[0].postRefs.includes(r)) }] }) };
    const { week, draft } = await run([first, second]);
    const ref = g[0].postRefs[0];
    expect(draft.buildGroupDiagnostics.fellThrough).toContain(ref);
    expect(draft.buildGroups.groups.find((x) => x.postRefs.includes(ref))!.title).toBe(g[0].title);
    if (draft.selection.spotlights.some((s) => s.postRef === ref)) {
      expect(renderNewsletter({ input: week.input, draft }).html).toContain(g[0].title + " &middot; ");
    }
  });

  it("falls back to domain vocabulary when the model grouping fails completely", async () => {
    const { week, draft } = await run([{ error: "provider" }]);
    expect(draft.buildGroupDiagnostics.fallback).toBe("domain-vocabulary");
    everyPostOnce(week, draft.buildGroups.groups);
    expect(otherCount(draft.buildGroups.groups)).toBeLessThanOrEqual(OTHER_MAX);
    expect(draft.buildGroups.groups.filter((x) => x.title !== OTHER_BUILDS).length).toBeGreaterThanOrEqual(5);
  });
});

describe("title rules", () => {
  it("normalizes and keys near-duplicate titles", () => {
    expect(normalizeTitle("  money &   receipts. ")).toBe("Money & receipts");
    expect(titleKey("Money and Receipts")).toBe(titleKey("receipts & money"));
    expect(titleKey("Meeting Assistants")).toBe(titleKey("meeting assistant"));
  });

  it("never moves a post already placed, and only takes posts it was asked about", () => {
    const week = referenceWeek();
    const idx = indexInput(week.input);
    const g = fullGroups(week);
    const r = acceptProposal(idx, { groups: [{ title: "New things", postRefs: [...g[0].postRefs, ...g[1].postRefs] }] }, 2, [g[0]], new Set(g[1].postRefs));
    expect(r.groups[0].postRefs).toEqual(g[0].postRefs);
    expect(r.groups[1]).toEqual({ title: "New things", postRefs: g[1].postRefs });
  });

  it("validateBuildGroups keeps working as a one-step check", () => {
    const week = referenceWeek();
    const r = validateBuildGroups(indexInput(week.input), { groups: fullGroups(week) });
    expect(r.buildGroups.groups.flatMap((x) => x.postRefs)).toHaveLength(27);
    expect(r.diagnostics.titles.every((t) => t.accepted)).toBe(true);
  });
});
