// The class introduction must never be blank because the AI-written one failed evidence review. Order:
//   AI draft → strict review (unchanged) → remove failing sentences and re-check → deterministic fallback.
// The checks are never loosened: a repaired sentence must pass checkClaim as fully supported on its own, and every
// fallback sentence is built only from code-computed metrics and claims that already passed the same checks.
import { WITHHELD_TEXT, checkClaim, type ClaimResult, type RefIndex } from "./checks";
import type { CapabilityKey } from "../contracts";
import type { Claim, PostNote, Selection, Theme } from "./types";

export type IntroSource = "ai" | "repaired" | "deterministic";
/** An introduction shorter than this after repair is replaced by the deterministic one. */
export const INTRO_MIN_WORDS = 40;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const live = (c: Claim | null | undefined): c is Claim => !!c && c.text !== WITHHELD_TEXT && !!c.text.trim();
const supported = (idx: RefIndex, id: string, c: Claim) => checkClaim(idx, id, c).status === "supported";
/** Sentence split on terminal punctuation followed by a capital or a quote; decimals and initials stay intact. */
export const sentences = (t: string) => t.split(/(?<=[.!?])\s+(?=["“A-Z0-9])/).map((s) => s.trim()).filter(Boolean);

/**
 * Removes failing sentences from one rejected claim. Returns null when the claim cannot be repaired in code: the
 * model reviewer flagged it (that judgment cannot be re-run here), or no sentence passes on its own.
 */
export function repairClaim(idx: RefIndex, id: string, claim: Claim, review: ClaimResult | undefined): Claim | null {
  if (!review || review.codes.includes("REVIEWER_FLAGGED")) return null;
  const kept = sentences(claim.text).filter((s, i) => supported(idx, id + ".s" + i, { text: s, evidenceRefs: claim.evidenceRefs }));
  if (!kept.length) return null;
  const repaired = { text: kept.join(" "), evidenceRefs: [...claim.evidenceRefs] };
  return supported(idx, id, repaired) ? repaired : null;
}

const CAPABILITY_PHRASES: Array<[CapabilityKey, string]> = [
  ["usesHumanApproval", "a human approval step"], ["hasValidationGate", "a validation gate"], ["hasBoundedRetry", "a bounded retry loop"],
  ["hasFallback", "a fallback path"], ["hasCodeValidation", "validation in code"], ["usesMultipleAgents", "more than one agent"],
];

/** Past-tense verbs a post summary often opens with ("Built a…"), beyond the regular "-ed" forms. */
const IRREGULAR_PAST = new Set(["built", "made", "gave", "wrote", "set", "took", "ran", "brought", "put", "sent", "kept", "led", "found", "began", "chose", "drew", "got", "grew", "held", "let", "rebuilt", "split", "taught", "won"]);

/**
 * One introduction sentence for a spotlight, worded from its screened summary without adding facts:
 * "Built a desk that…" → "Ana Ruiz built a desk that…"; "Ana built…" → "Ana Ruiz built…";
 * "A desk that…" → "Ana Ruiz shared “Title”, a desk that…"; anything else keeps the "shared “Title”:" form.
 */
export function introSentence(authorName: string, title: string, summary: string): string {
  const name = authorName.trim();
  const body = summary.trim().replace(/[.!?]+$/, "");
  const first = name.split(/\s+/)[0];
  const lead = body.split(/\s+/)[0] ?? "";
  if (body.startsWith(name + " ")) return body + ".";
  if (first.length >= 2 && lead === first) return name + body.slice(first.length) + ".";
  const w = lead.toLowerCase();
  if (/^[A-Z][a-z]+$/.test(lead) && (IRREGULAR_PAST.has(w) || (/ed$/.test(w) && w.length > 4))) return name + " " + w + body.slice(lead.length) + ".";
  if (/^(A|An|The) /.test(body)) return name + " shared “" + title.trim() + "”, " + body[0].toLowerCase() + body.slice(1) + ".";
  return name + " shared “" + title.trim() + "”: " + body + ".";
}

/**
 * An introduction assembled only from checked evidence: the code-counted post and comment totals, the screened
 * summaries of up to three spotlights (each with its author and post ref), one multi-source theme summary, and the
 * most common control capability from the workflow profiles when files were supplied. Each sentence must pass
 * checkClaim as supported; any that does not is dropped.
 */
export function deterministicIntroduction(idx: RefIndex, notes: PostNote[], selection: Selection, themes: Theme[]): Claim[] {
  const input = idx.input;
  const m = (ref: string) => idx.metrics.get(ref) ?? null;
  const out: Claim[] = [];
  const add = (c: Claim) => { if (out.length < 5 && c.text.length <= 700 && supported(idx, "executiveSummary.fallback", c)) out.push(c); };

  const posts = m("metric:posts"), comments = m("metric:comments");
  if (posts !== null) {
    add(comments !== null
      ? { text: "Week " + input.week + " brought " + posts + " workflow posts and " + comments + " comments.", evidenceRefs: ["metric:posts", "metric:comments"] }
      : { text: "Week " + input.week + " brought " + posts + " workflow posts.", evidenceRefs: ["metric:posts"] });
  }
  const noteOf = new Map(notes.map((n) => [n.postRef, n]));
  for (const s of selection.spotlights.slice(0, 3)) {
    const p = idx.posts.get(s.postRef);
    const sum = noteOf.get(s.postRef)?.summary;
    if (!p || !live(sum)) continue;
    add({ text: introSentence(p.authorName, p.title, sum.text), evidenceRefs: [...new Set([s.postRef, ...sum.evidenceRefs])].slice(0, 12) });
  }
  const theme = themes.find((t) => t.support === "multi-source" && live(t.summary));
  if (theme) add({ text: theme.summary.text, evidenceRefs: theme.summary.evidenceRefs });
  const files = m("metric:workflowFiles");
  if (typeof files === "number" && files > 0) {
    const best = CAPABILITY_PHRASES.map(([k, phrase]) => ({ k, phrase, n: m("metric:capabilities." + k) })).filter((x) => typeof x.n === "number" && x.n > 0)
      .sort((a, b) => (b.n as number) - (a.n as number))[0];
    if (best) add({ text: "Of the " + files + " workflow files profiled, " + best.n + " include " + best.phrase + ".", evidenceRefs: ["metric:workflowFiles", "metric:capabilities." + best.k] });
  }
  return out;
}

export type IntroResult = { claims: Claim[]; source: IntroSource; repaired: string[] };

/**
 * Final introduction. Claims that passed review are kept as written; rejected ones are repaired sentence by
 * sentence where possible. If nothing usable of at least INTRO_MIN_WORDS remains, the deterministic introduction
 * replaces it. `original` is the newsletter's executiveSummary before withholding; `review` the final claim results.
 */
export function finalizeIntroduction(idx: RefIndex, original: Claim[], review: Map<string, ClaimResult>, ctx: { notes: PostNote[]; selection: Selection; themes: Theme[] }): IntroResult {
  const kept: Claim[] = [];
  const repaired: string[] = [];
  let changed = false;
  original.forEach((c, i) => {
    const id = "executiveSummary[" + i + "]";
    const r = review.get(id);
    if (r && (r.status === "supported" || r.status === "partially-supported")) { kept.push(c); return; }
    changed = true;
    const fixed = repairClaim(idx, id, c, r);
    if (fixed) { kept.push(fixed); repaired.push(id); }
  });
  if (!changed) return { claims: kept, source: "ai", repaired };
  if (kept.length && words(kept.map((c) => c.text).join(" ")) >= INTRO_MIN_WORDS) return { claims: kept, source: "repaired", repaired };
  return { claims: deterministicIntroduction(idx, ctx.notes, ctx.selection, ctx.themes), source: "deterministic", repaired: [] };
}
