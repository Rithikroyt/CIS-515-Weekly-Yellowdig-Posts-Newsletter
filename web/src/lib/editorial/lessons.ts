// "What to carry into Week N+1" must not disappear because every AI-written lesson failed evidence review. Order:
//   AI lessons → strict review (unchanged) → keep what passed, repair failing sentences → deterministic fallback.
// Fallback lessons quote claims that already passed the same checks (spotlight notes and reviewed spotlight copy),
// credited to their post. Fallback next steps are short actions tied to a pattern that validated evidence shows,
// each citing the post that shows it. Everything is re-checked; anything that fails is dropped, never softened.
import { WITHHELD_TEXT, checkClaim, type ClaimResult, type RefIndex } from "./checks";
import { repairClaim } from "./intro";
import type { Claim, Newsletter, PostNote, Selection } from "./types";

export type LessonsSource = "ai" | "validated_ai" | "deterministic_fallback";
export const LESSON_LIMITS = { min: 2, lessons: 3, steps: 4 } as const;

type Takeaway = { title: string; text: Claim };
type Pattern = { key: string; re: RegExp; title: string; step: string };

/**
 * Patterns recognized in validated evidence. A pattern only names what the evidence text itself says (matched by
 * these words); titles and steps contain no numbers, names or capability assertions of their own.
 */
const PATTERNS: Pattern[] = [
  { key: "gate", re: /\b(hard (gates?|rules?|checks?|limits?)|validat\w*|deterministic|in code|code (checks?|nodes?|rules?|flags?)|plain rules?)\b/i,
    title: "Make critical checks hard rules", step: "Turn the most critical check in your workflow into a hard rule instead of part of a score" },
  { key: "evaluate", re: /\b(judge|evaluat\w*|critic|reviewer|scor\w*|rubric)\b/i,
    title: "Separate the draft from the check", step: "Add a separate evaluation step after the draft instead of trusting the first answer" },
  { key: "loop", re: /\b(loops?|revisions?|revise\w*|retr(y|ies)|attempts?|bound\w*)\b/i,
    title: "Put a limit on revision loops", step: "Give every revision loop a fixed number of tries and a clear place to stop" },
  { key: "approval", re: /\b(approv\w*|human|person|confirm\w*|sign[- ]off)\b/i,
    title: "Keep a person before the action", step: "Put a person's go-ahead before any step that sends, books or writes something" },
  { key: "test", re: /\b(test\w*|tried|forced|edge case|on purpose)\b/i,
    title: "Test the path a draft fails on", step: "Feed your workflow one input that should fail and watch where it goes" },
];

const live = (c: Claim | null | undefined): c is Claim => !!c && c.text !== WITHHELD_TEXT && !!c.text.trim();
const ok = (r: ClaimResult | undefined) => !!r && (r.status === "supported" || r.status === "partially-supported");
const supported = (idx: RefIndex, id: string, c: Claim) => checkClaim(idx, id, c).status === "supported";

/** Validated claims per spotlight post: its screened note fields and the reviewed spotlight copy that passed. */
function spotlightEvidence(nl: Newsletter, notes: PostNote[], selection: Selection, review: Map<string, ClaimResult>) {
  const noteOf = new Map(notes.map((n) => [n.postRef, n]));
  return selection.spotlights.map((s) => {
    const n = noteOf.get(s.postRef);
    const i = nl.spotlights.findIndex((x) => x.postRef === s.postRef);
    const reviewed = (field: "worthBorrowing" | "testResult" | "threadInsight", c: Claim | null | undefined) =>
      i >= 0 && live(c) && review.get("spotlights[" + i + "]." + field)?.status === "supported" ? c : null;
    const e = i >= 0 ? nl.spotlights[i] : null;
    // Lesson-like claims first: they make the best quoted lessons.
    const lessons = [n?.reusableLesson, reviewed("worthBorrowing", e?.worthBorrowing)].filter(live);
    const other = [n?.testPerformed, reviewed("testResult", e?.testResult), n?.interestingPattern, n?.humanControl, reviewed("threadInsight", e?.threadInsight), n?.summary].filter(live);
    return { postRef: s.postRef, lessons, all: [...lessons, ...other] };
  });
}

/** Each claim belongs to one pattern only, in this priority, so a lesson's title always matches its text. */
const PRIORITY = ["test", "approval", "loop", "gate", "evaluate"];
const primary = (text: string) => PRIORITY.map((k) => PATTERNS.find((p) => p.key === k)!).find((p) => p.re.test(text)) ?? null;

/** Patterns that validated evidence shows, most widespread first (counted over every post's screened notes). */
function patternsInEvidence(notes: PostNote[], spot: ReturnType<typeof spotlightEvidence>) {
  const text = (n: PostNote) => [n.reusableLesson, n.testPerformed, n.interestingPattern, n.humanControl, n.summary].filter(live).map((c) => c.text).join(" ");
  return PATTERNS.map((p) => ({ p, posts: notes.filter((n) => p.re.test(text(n))).length, spot: spot.filter((s) => s.all.some((c) => primary(c.text) === p)) }))
    .filter((x) => x.spot.length > 0).sort((a, b) => b.posts - a.posts);
}

/** Deterministic lessons and next steps from validated evidence. Fewer, or none, when the evidence is thin. */
export function deterministicLessons(idx: RefIndex, nl: Newsletter, notes: PostNote[], selection: Selection, review: Map<string, ClaimResult>, avoidTitles: string[] = []) {
  const spot = spotlightEvidence(nl, notes, selection, review);
  const found = patternsInEvidence(notes, spot);
  const post = (postRef: string) => idx.posts.get(postRef)!;
  const credit = (postRef: string) => post(postRef).authorName + ", “" + post(postRef).title.trim() + "”";
  const possessive = (postRef: string) => post(postRef).authorName + "'s “" + post(postRef).title.trim() + "”";
  const usedPosts = new Set<string>();
  const lessons: Takeaway[] = [];
  const steps: Claim[] = [];
  const usedClaims = new Set<string>();
  for (const { p, spot: posts } of found) {
    if (lessons.length >= LESSON_LIMITS.lessons) break;
    if (avoidTitles.includes(p.title)) continue;
    // Quote a validated claim whose pattern this is, preferring lesson-like claims and a post not yet quoted.
    const options = posts.flatMap((s) => [...s.lessons, ...s.all].filter((c) => primary(c.text) === p && !usedClaims.has(c.text)).map((c) => ({ s, c })));
    const pick = options.find(({ s }) => !usedPosts.has(s.postRef)) ?? options[0];
    if (!pick) continue;
    const body = pick.c.text.trim().replace(/[.!?]+$/, "");
    const text: Claim = { text: body + ". (" + credit(pick.s.postRef) + ")", evidenceRefs: [...new Set([pick.s.postRef, ...pick.c.evidenceRefs])].slice(0, 12) };
    if (text.text.length > 700 || !supported(idx, "takeaways.fallback", text) || !supported(idx, "takeaways.fallback.title", { text: p.title, evidenceRefs: [] })) continue;
    usedClaims.add(pick.c.text);
    usedPosts.add(pick.s.postRef);
    lessons.push({ title: p.title, text });
  }
  for (const { p, spot: posts } of found) {
    if (steps.length >= LESSON_LIMITS.steps) break;
    const s = posts[steps.length % posts.length];
    const c: Claim = { text: p.step + ", as in " + possessive(s.postRef) + ".", evidenceRefs: [s.postRef] };
    if (c.text.length <= 700 && supported(idx, "nextSteps.fallback", c)) steps.push(c);
  }
  return { lessons, steps };
}

export type LessonsResult = { takeaways: Takeaway[]; nextSteps: Claim[]; source: LessonsSource | null; fallbackTakeaways: number; fallbackSteps: number };

/**
 * Final lessons and next steps. AI items that passed review stay as written; rejected ones are repaired sentence by
 * sentence where possible; if fewer than LESSON_LIMITS.min remain in either list, the deterministic items fill it.
 * `original` is the newsletter before withholding; `review` the final claim results.
 */
export function finalizeLessons(idx: RefIndex, original: Newsletter, review: Map<string, ClaimResult>, ctx: { notes: PostNote[]; selection: Selection }): LessonsResult {
  let changed = false;
  const takeaways: Takeaway[] = [];
  (original.takeaways ?? []).forEach((t, i) => {
    const id = "takeaways[" + i + "]";
    const title = review.get(id + ".title");
    if (title && title.status !== "supported") { changed = true; return; }
    const r = review.get(id + ".text");
    if (ok(r)) { takeaways.push(t); return; }
    changed = true;
    const fixed = repairClaim(idx, id + ".text", t.text, r);
    if (fixed) takeaways.push({ title: t.title, text: fixed });
  });
  const nextSteps: Claim[] = [];
  (original.nextSteps ?? []).forEach((c, i) => {
    const id = "nextSteps[" + i + "]";
    const r = review.get(id);
    if (ok(r)) { nextSteps.push(c); return; }
    changed = true;
    const fixed = repairClaim(idx, id, c, r);
    if (fixed) nextSteps.push(fixed);
  });
  let fallbackTakeaways = 0, fallbackSteps = 0;
  if (takeaways.length < LESSON_LIMITS.min || nextSteps.length < LESSON_LIMITS.min) {
    const d = deterministicLessons(idx, original, ctx.notes, ctx.selection, review, takeaways.map((t) => t.title));
    // Each list is filled only when it is short, up to three items; it is never padded past what evidence supports.
    if (takeaways.length < LESSON_LIMITS.min) for (const l of d.lessons) { if (takeaways.length >= LESSON_LIMITS.lessons) break; takeaways.push(l); fallbackTakeaways++; }
    if (nextSteps.length < LESSON_LIMITS.min) for (const s of d.steps) { if (nextSteps.length >= LESSON_LIMITS.steps - 1) break; if (!nextSteps.some((x) => x.text === s.text)) { nextSteps.push(s); fallbackSteps++; } }
  }
  const any = (original.takeaways ?? []).length + (original.nextSteps ?? []).length > 0 || takeaways.length + nextSteps.length > 0;
  const source: LessonsSource | null = !any ? null : fallbackTakeaways + fallbackSteps > 0 ? "deterministic_fallback" : changed ? "validated_ai" : "ai";
  return { takeaways, nextSteps, source, fallbackTakeaways, fallbackSteps };
}
