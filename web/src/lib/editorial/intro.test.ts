// The introduction fallback: strict review unchanged → sentence removal with re-check → deterministic fallback.
// Synthetic data only.
import { describe, expect, it } from "vitest";
import * as E from ".";
import { checkClaim, indexInput } from "./checks";
import { deterministicIntroduction, finalizeIntroduction, repairClaim, sentences } from "./intro";
import { renderNewsletter } from "../render/newsletter";

const NOW = () => "2026-11-01T12:00:00Z";
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const F = E.MOCK_FIXTURE;
const INVENTED = "13 workflows used human approval this week.";

async function runWithIntro(intro: Array<{ text: string; evidenceRefs: string[] }>, review: E.MockScenario["evidence-reviewer"] = [{ review: "all-supported" }]) {
  const nl = copy(F.newsletterClean);
  nl.executiveSummary = intro;
  const input = E.syntheticEditorialInput();
  const draft = await E.runEditorial({ input, provider: E.createMockProvider({ ...E.NAMED_SCENARIOS.clean, "newsletter-editor": [{ json: nl }], "newsletter-reviser": [{ json: nl }], "evidence-reviewer": review }), now: NOW });
  return { input, draft, idx: indexInput(input) };
}
const introText = (d: E.EditorialDraft) => d.newsletter!.executiveSummary.map((c) => c.text).join(" ");

describe("introduction", () => {
  it("keeps a valid AI introduction as written", async () => {
    const { draft } = await runWithIntro(F.newsletterClean.executiveSummary);
    expect(draft.introSource).toBe("ai");
    expect(draft.newsletter!.executiveSummary).toEqual(F.newsletterClean.executiveSummary);
  });

  it("removes only the unsupported sentence of a partly unsupported claim, then re-checks", async () => {
    const good = F.newsletterClean.executiveSummary;
    const mixed = { text: good[1].text + " " + INVENTED, evidenceRefs: [...good[1].evidenceRefs] };
    const { draft, idx } = await runWithIntro([good[0], mixed, good[2]]);
    expect(draft.introSource).toBe("repaired");
    expect(introText(draft)).toContain(good[1].text);
    expect(introText(draft)).not.toContain(INVENTED);
    draft.newsletter!.executiveSummary.forEach((c, i) => expect(["supported", "partially-supported"]).toContain(checkClaim(idx, "i" + i, c).status));
    expect(draft.review.unresolved.map((u) => u.originalText)).toContain(mixed.text);
  });

  it("falls back to a deterministic introduction when nothing usable remains", async () => {
    const { draft, idx, input } = await runWithIntro([{ text: INVENTED, evidenceRefs: ["metric:capabilities.usesHumanApproval"] }]);
    expect(draft.introSource).toBe("deterministic");
    const text = introText(draft);
    expect(text).toContain("Week 2 brought 8 workflow posts and 13 comments.");
    expect(text).not.toContain(INVENTED);
    // Every fallback sentence passes the same strict checks, as fully supported.
    draft.newsletter!.executiveSummary.forEach((c, i) => expect(checkClaim(idx, "f" + i, c)).toMatchObject({ status: "supported", codes: [] }));
    expect(draft.review.claims.filter((c) => c.claimId.startsWith("executiveSummary")).every((c) => c.method === "code-generated" && c.reviewStatus === "supported")).toBe(true);
    // Names appear only with their own post cited.
    draft.newsletter!.executiveSummary.forEach((c) => input.posts.forEach((p) => { if (c.text.includes(p.authorName)) expect(c.evidenceRefs).toContain(p.postRef); }));
    const r = renderNewsletter({ input, draft });
    expect(r.quality.introWords).toBeGreaterThan(30);
    expect(r.html).toContain("The introduction was assembled by code from checked facts");
  });

  it("does not repair a claim the model reviewer flagged; that goes to the fallback", async () => {
    const { draft } = await runWithIntro(F.newsletterClean.executiveSummary, [{ review: { "executiveSummary[0]": "UNSUPPORTED", "executiveSummary[1]": "UNSUPPORTED", "executiveSummary[2]": "UNSUPPORTED" } }]);
    expect(draft.introSource).toBe("deterministic");
    F.newsletterClean.executiveSummary.forEach((c) => expect(introText(draft)).not.toContain(c.text));
  });

  it("the fallback states no unsupported numbers, names or capabilities", () => {
    const input = E.syntheticEditorialInput();
    const idx = indexInput(input);
    const notes = copy(F.postNotes.notes) as E.PostNote[];
    notes[0].summary = { text: "Avery Quinn's judge rejected 99 drafts and used RAG.", evidenceRefs: [notes[0].postRef] };
    const sel = { spotlights: [{ postRef: notes[0].postRef, label: "Useful Testing Pattern" as const, reason: notes[0].summary }], failurePath: null, patterns: [] };
    const intro = deterministicIntroduction(idx, notes, sel, []);
    expect(intro.map((c) => c.text).join(" ")).not.toMatch(/99|RAG/);
    intro.forEach((c, i) => expect(checkClaim(idx, "d" + i, c).status).toBe("supported"));
    // Capability sentence only from a cited capability metric.
    const cap = intro.find((c) => /workflow files profiled/.test(c.text));
    expect(cap?.evidenceRefs.some((r) => r.startsWith("metric:capabilities."))).toBe(true);
  });

  it("repairClaim and finalizeIntroduction on their own", () => {
    const input = E.syntheticEditorialInput();
    const idx = indexInput(input);
    const good = F.newsletterClean.executiveSummary[0];
    const bad = { text: good.text + " " + INVENTED, evidenceRefs: good.evidenceRefs };
    const r = checkClaim(idx, "executiveSummary[0]", bad);
    expect(r.status).toBe("conflict");
    expect(repairClaim(idx, "executiveSummary[0]", bad, r)).toEqual(good);
    expect(repairClaim(idx, "x", bad, { ...r, codes: [...r.codes, "REVIEWER_FLAGGED"] })).toBeNull();
    expect(sentences("A judge scored it 9.5 out of 10. Then code stopped it.")).toEqual(["A judge scored it 9.5 out of 10.", "Then code stopped it."]);
    const res = finalizeIntroduction(idx, [bad], new Map([["executiveSummary[0]", r]]), { notes: [], selection: { spotlights: [], failurePath: null, patterns: [] }, themes: [] });
    expect(res.source).toBe("deterministic");
    expect(res.claims.length).toBeGreaterThan(0);
  });
});
