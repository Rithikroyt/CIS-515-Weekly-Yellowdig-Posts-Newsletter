// Newsletter renderer: deterministic, escaped, script-free, Week 2 layout, withheld claims omitted. Synthetic data only.
import { describe, expect, it } from "vitest";
import * as E from "../editorial";
import { esc, formatRange, renderNewsletter } from "./newsletter";

const NOW = () => "2026-11-01T12:00:00Z";
async function draftFor(scenario: string) {
  const input = E.syntheticEditorialInput();
  const draft = await E.runEditorial({ input, provider: E.createMockProvider(E.NAMED_SCENARIOS[scenario]), now: NOW });
  return { input, draft };
}

describe("renderNewsletter", () => {
  it("is deterministic and keeps the reference layout", async () => {
    const { input, draft } = await draftFor("clean");
    const a = renderNewsletter({ input, draft }), b = renderNewsletter({ input, draft });
    expect(a.html).toBe(b.html);
    expect(a.status).toBe("ready");
    expect(a.omittedClaims).toBe(0);
    expect(a.html).toContain("ASU &middot; CIS 515 &middot; Community Dispatch");
    expect(a.html).toContain("max-width:640px");
    expect(a.html).toContain("background:#ECE8E1");
    expect(a.html).toContain("Week " + input.week);
    expect(a.html).toContain("In brief: every build this week");
    expect(a.html).toContain("Synthetic test issue.");
    expect(a.html).not.toMatch(/approved by|instructor-approved/i);
  });

  it("contains no scripts, handlers or external resources", async () => {
    const { input, draft } = await draftFor("clean");
    draft.images = { curation: { posts: [] }, choices: [{ postRef: input.posts[0].postRef, assetRef: "asset:evil", classification: null, altText: "x", source: "deterministic" }], hero: { postRef: input.posts[0].postRef, assetRef: "asset:evil", classification: null, altText: "", source: "deterministic" } };
    const { html } = renderNewsletter({ input, draft, postUrls: { [input.posts[0].postRef]: "javascript:alert(1)" }, imageBank: { "asset:evil": "https://evil.example.com/x.png" } });
    expect(html).not.toMatch(/<script|\son[a-z]+=|javascript:|src="http|href="http:/i);
  });

  it("escapes model and student text", async () => {
    const { input, draft } = await draftFor("clean");
    const evil = '<img src=x onerror="alert(1)">';
    input.posts[0].title = evil;
    draft.newsletter!.hero.dek.text = evil;
    const { html } = renderNewsletter({ input, draft });
    expect(html).not.toContain(evil);
    expect(html).toContain(esc(evil));
  });

  it("omits withheld claims and reports ready_with_omissions", async () => {
    const bad = JSON.parse(JSON.stringify(E.MOCK_FIXTURE.newsletterClean));
    bad.hero.dek = { text: "13 workflows used human approval this week.", evidenceRefs: ["metric:capabilities.usesHumanApproval"] };
    const input = E.syntheticEditorialInput();
    const draft = await E.runEditorial({ input, provider: E.createMockProvider({ ...E.NAMED_SCENARIOS.clean, "newsletter-editor": [{ json: bad }], "newsletter-reviser": [{ json: bad }] }), now: NOW });
    const r = renderNewsletter({ input, draft });
    expect(draft.review.unresolved.length).toBeGreaterThan(0);
    expect(r.status).toBe("ready_with_omissions");
    expect(r.omittedClaims).toBeGreaterThan(0);
    expect(r.html).not.toContain(E.WITHHELD_TEXT);
    expect(r.html).toMatch(/did not pass evidence review/);
  });

  it("only links to Yellowdig", async () => {
    const { input, draft } = await draftFor("clean");
    const ref = input.posts[0].postRef;
    const good = renderNewsletter({ input, draft, postUrls: { [ref]: "https://yellowdig.app/n/x?postId=1" } }).html;
    expect(good).toContain('href="https://yellowdig.app/n/x?postId=1"');
    const bad = renderNewsletter({ input, draft, postUrls: { [ref]: "https://example.com/" } }).html;
    expect(bad).not.toContain("example.com");
  });

  it("formats date ranges without locale", () => {
    expect(formatRange("2026-10-23", "2026-10-28")).toBe("Oct 23–28, 2026");
    expect(formatRange("2026-10-30T00:00:00Z", "2026-11-04")).toBe("Oct 30–Nov 4, 2026");
  });
});
