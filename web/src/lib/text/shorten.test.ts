import { describe, expect, it } from "vitest";
import { shortenProse, shortenWords } from "./shorten";

const P = "First builds added a judge. Second builds kept a person in the loop! Did anyone test the failure path? Most did, on purpose, by raising the bar for one run.";

describe("shortenProse", () => {
  it("leaves text within the limit unchanged, including an exact fit", () => {
    expect(shortenProse(P, 500)).toBe(P);
    expect(shortenProse(P, P.length)).toBe(P);
  });

  it("cuts at the last complete sentence that fits, never mid-sentence", () => {
    const out = shortenProse(P, 100);
    expect(out).toBe("First builds added a judge. Second builds kept a person in the loop!");
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out).not.toMatch(/…$/);
    expect(out).toMatch(/[.!?]$/);
  });

  it("does not treat decimals or a cut-off word as a sentence end", () => {
    const t = "The judge scored it 9.5 out of 10 and code stopped it. Then a person checked the reply before it went out to the customer.";
    expect(shortenProse(t, 60)).toBe("The judge scored it 9.5 out of 10 and code stopped it.");
  });

  it("keeps closing quotes with their sentence", () => {
    expect(shortenProse("She called it “safe enough.” Then the test failed badly and loudly.", 35)).toBe("She called it “safe enough.”");
  });

  it("falls back to a word boundary only when no sentence fits, and never splits an entity", () => {
    const title = "A very long single sentence with no full stop that keeps going well past the limit";
    const out = shortenProse(title, 30);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(title.startsWith(out.slice(0, -1).trimEnd())).toBe(true);
    expect(shortenProse("Planning &amp; scheduling tools for the whole class this term", 14)).not.toMatch(/&[a-z]*…$/);
  });

  it("shortens one-liners by words, at a sentence where possible", () => {
    expect(shortenWords("One. Two three four five six.", 3)).toBe("One.");
    expect(shortenWords("Short line.", 45)).toBe("Short line.");
  });
});
