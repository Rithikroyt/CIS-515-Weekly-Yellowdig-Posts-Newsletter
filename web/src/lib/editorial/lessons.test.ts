// "What to carry into Week N+1": strict review unchanged → keep and repair → deterministic fallback from validated
// evidence. Synthetic data only.
import { describe, expect, it } from "vitest";
import * as E from ".";
import { checkClaim, indexInput } from "./checks";
import { deterministicLessons } from "./lessons";
import { renderNewsletter } from "../render/newsletter";

const NOW = () => "2026-11-01T12:00:00Z";
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const F = E.MOCK_FIXTURE;
const BAD = { text: "13 workflows used human approval this week.", evidenceRefs: ["metric:capabilities.usesHumanApproval"] };

async function run(edit: (nl: typeof F.newsletterClean) => void, notesEdit?: (n: typeof F.postNotes) => void) {
  const nl = copy(F.newsletterClean);
  edit(nl);
  const notes = copy(F.postNotes);
  notesEdit?.(notes);
  const input = E.syntheticEditorialInput();
  const draft = await E.runEditorial({ input, provider: E.createMockProvider({ ...E.NAMED_SCENARIOS.clean, "post-extractor": [{ json: notes }], "newsletter-editor": [{ json: nl }], "newsletter-reviser": [{ json: nl }] }), now: NOW });
  return { input, draft, idx: indexInput(input) };
}
const allSupported = (idx: ReturnType<typeof indexInput>, d: E.EditorialDraft) => {
  d.newsletter!.takeaways.forEach((t, i) => expect(checkClaim(idx, "t" + i, t.text).status, t.text.text).toMatch(/^(supported|partially-supported)$/));
  (d.newsletter!.nextSteps ?? []).forEach((c, i) => expect(checkClaim(idx, "s" + i, c).status, c.text).toMatch(/^(supported|partially-supported)$/));
};

describe("closing lessons", () => {
  it("keeps valid AI lessons as written", async () => {
    const { draft } = await run(() => {});
    expect(draft.lessonsSource).toBe("ai");
    expect(draft.newsletter!.takeaways).toEqual(F.newsletterClean.takeaways);
    expect(draft.newsletter!.nextSteps).toEqual(F.newsletterClean.nextSteps);
  });

  it("drops a rejected lesson and keeps the rest when enough remain", async () => {
    const { draft, idx } = await run((nl) => { nl.takeaways[0].text = copy(BAD); });
    expect(draft.lessonsSource).toBe("validated_ai");
    expect(draft.newsletter!.takeaways.map((t) => t.title)).toEqual(F.newsletterClean.takeaways.slice(1).map((t) => t.title));
    expect(draft.review.unresolved.map((u) => u.claimId)).toContain("takeaways[0].text");
    allSupported(idx, draft);
  });

  it("builds lessons and steps from validated spotlight evidence when all AI items are rejected", async () => {
    const { draft, idx, input } = await run((nl) => { nl.takeaways.forEach((t) => (t.text = copy(BAD))); nl.nextSteps = [copy(BAD), copy(BAD)]; });
    expect(draft.lessonsSource).toBe("deterministic_fallback");
    const t = draft.newsletter!.takeaways, s = draft.newsletter!.nextSteps!;
    expect(t.length).toBeGreaterThanOrEqual(2);
    expect(t.length).toBeLessThanOrEqual(3);
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s.length).toBeLessThanOrEqual(3);
    // Every item cites a spotlight post and quotes or acts on validated evidence from it.
    const spots = new Set(draft.selection.spotlights.map((x) => x.postRef));
    [...t.map((x) => x.text), ...s].forEach((c) => expect(c.evidenceRefs.some((r) => spots.has(r))).toBe(true));
    // Validated evidence: screened notes and the editor's spotlight lines that passed review.
    const reviewedSpot = draft.newsletter!.spotlights.flatMap((x) => [x.worthBorrowing, x.testResult, x.threadInsight]);
    const validated = [...draft.postNotes.flatMap((n) => [n.reusableLesson, n.testPerformed, n.interestingPattern, n.humanControl, n.summary]), ...reviewedSpot].filter(Boolean).map((c) => c!.text.replace(/[.!?]+$/, ""));
    t.forEach((x) => expect(validated.some((v) => x.text.text.startsWith(v)), x.text.text).toBe(true));
    // No numbers, names or capabilities beyond the evidence: every item passes the same checks, fully supported.
    [...t.map((x) => x.text), ...s].forEach((c, i) => expect(checkClaim(idx, "f" + i, c)).toMatchObject({ status: "supported", codes: [] }));
    t.forEach((x) => expect(x.title).not.toMatch(/\d/));
    [...t.map((x) => x.text), ...s].forEach((c) => input.posts.forEach((p) => { if (c.text.includes(p.authorName)) expect(c.evidenceRefs).toContain(p.postRef); }));
    expect(draft.review.claims.filter((c) => /^(takeaways|nextSteps)/.test(c.claimId)).every((c) => c.method === "code-generated" && c.reviewStatus === "supported")).toBe(true);
    // The section renders, and the footer says code assembled it.
    const r = renderNewsletter({ input, draft });
    expect(r.html).toContain("03 — What to carry into Week 3");
    expect(r.quality.takeaways).toBe(t.length);
    expect(r.html).toContain("Some closing lessons were assembled by code");
  });

  it("renders fewer items, or none, when validated evidence is thin", async () => {
    const thin = (n: typeof F.postNotes) => n.notes.forEach((x) => { x.reusableLesson = null; x.testPerformed = null; x.interestingPattern = null; x.humanControl = null; x.summary = { text: "A small project.", evidenceRefs: [x.postRef] }; });
    const { draft, input } = await run((nl) => { nl.takeaways.forEach((t) => (t.text = copy(BAD))); nl.nextSteps = [copy(BAD)]; nl.spotlights = []; }, thin);
    expect(draft.newsletter!.takeaways.length + draft.newsletter!.nextSteps!.length).toBeLessThanOrEqual(2);
    const r = renderNewsletter({ input, draft });
    if (!draft.newsletter!.takeaways.length && !draft.newsletter!.nextSteps!.length) expect(r.html).not.toContain("03 — What to carry");
  });

  it("deterministicLessons never invents: no evidence, no lessons", () => {
    const input = E.syntheticEditorialInput();
    const idx = indexInput(input);
    const out = deterministicLessons(idx, copy(F.newsletterClean) as E.Newsletter, [], { spotlights: [], failurePath: null, patterns: [] }, new Map());
    expect(out).toEqual({ lessons: [], steps: [] });
  });
});
