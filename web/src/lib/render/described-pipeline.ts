// A spotlight's pipeline reconstructed by code from the post's own words, for posts without a workflow file (the
// Week 1 reference does the same by hand: "editorial reconstructions from the students' written descriptions").
// Deterministic and conservative: only a fixed vocabulary is recognized, sentences about plans or future work are
// ignored, and fewer than three recognized steps gives no pipeline at all. Labels are fixed words, except a named
// API ("TMDB API"), which is taken from the post and escaped by the renderer like any other student text.
import type { StepCategory } from "../editorial/types";

export type DescribedStep = { category: StepCategory; label: string };

type Rule = { re: RegExp; category: StepCategory; label: string; role: "trigger" | "channel" | "middle" | "approval" | "action" };

const RULES: Rule[] = [
  // Starts: always first.
  { re: /\bweb ?hooks?\b/i, category: "trigger", label: "Webhook", role: "trigger" },
  { re: /\b(?:n8n )?forms?\b(?! of)/i, category: "trigger", label: "Form", role: "trigger" },
  { re: /\b(?:schedule[ds]?|cron|every (?:morning|day|week|hour|monday|sunday)|daily|weekly)\b/i, category: "trigger", label: "Schedule", role: "trigger" },
  { re: /\b(?:upload(?:s|ed)?|pdf)\b/i, category: "trigger", label: "Upload", role: "trigger" },
  { re: /\b(?:incoming|new|receives?) (?:an? )?(?:\w+ )?e-?mails?\b|\be-?mailed\b|\bgmail trigger\b/i, category: "trigger", label: "Email in", role: "trigger" },
  // Conversation channels: the start when nothing else starts the run.
  { re: /\btelegram\b/i, category: "trigger", label: "Telegram", role: "channel" },
  { re: /\bslack\b/i, category: "trigger", label: "Slack", role: "channel" },
  { re: /\b(?:chat ?bot|chat (?:trigger|interface|window|message)s?)\b/i, category: "trigger", label: "Chat", role: "channel" },
  // Middle steps, in the order the post first mentions them.
  { re: /\b(?:vector (?:store|database|db)|embeddings?|semantic search|pinecone)\b/i, category: "storage", label: "Vector search", role: "middle" },
  { re: /\bsupabase\b/i, category: "storage", label: "Supabase", role: "middle" },
  { re: /\bpostgre(?:s|sql)\b/i, category: "storage", label: "Postgres", role: "middle" },
  { re: /\bgoogle sheets?\b/i, category: "storage", label: "Google Sheets", role: "middle" },
  { re: /\bdata ?tables?\b/i, category: "storage", label: "Data table", role: "middle" },
  { re: /\bnotion\b/i, category: "storage", label: "Notion", role: "middle" },
  { re: /\bknowledge (?:tool|base|source)s?\b|\bretriev(?:al|es?|ing)\b/i, category: "tool", label: "Knowledge search", role: "middle" },
  { re: /\bserp ?api\b/i, category: "tool", label: "SerpAPI", role: "middle" },
  { re: /\bweather (?:api|forecasts?|data)\b|\bopen-meteo\b/i, category: "tool", label: "Weather API", role: "middle" },
  { re: /\bcalculator\b/i, category: "tool", label: "Calculator", role: "middle" },
  { re: /\b(?:ai agent|agent)s?\b/i, category: "ai", label: "AI agent", role: "middle" },
  { re: /\b(?:llm|gemini|gpt-?\d*|openai|(?:language )?model)\b/i, category: "ai", label: "Model", role: "middle" },
  { re: /\b(?:writer|drafts?|drafted|drafting)\b/i, category: "ai", label: "Draft", role: "middle" },
  { re: /\b(?:scor(?:e|es|ed|ing)|rates?|rating)\b/i, category: "judge", label: "Score", role: "middle" },
  { re: /\b(?:spreadsheets?|rows?)\b/i, category: "storage", label: "Sheet", role: "middle" },
  { re: /\b(?:rules?|logic step|scripts?)\b/i, category: "code", label: "Rule", role: "middle" },
  { re: /\b(?:checks?|compares?)\b/i, category: "validator", label: "Check", role: "middle" },
  { re: /\btries again\b/i, category: "errorPath", label: "Retry", role: "middle" },
  { re: /\bsentiment\b/i, category: "ai", label: "Sentiment", role: "middle" },
  { re: /\bclassif(?:y|ies|ied|ication|ier)\b/i, category: "ai", label: "Classify", role: "middle" },
  { re: /\bsummar(?:y|ies|ize[sd]?|ise[sd]?)\b/i, category: "ai", label: "Summarize", role: "middle" },
  { re: /\b(?:judge|critic)s?\b/i, category: "judge", label: "Judge", role: "middle" },
  { re: /\b(?:code (?:node|tool|step)s?|javascript|python)\b/i, category: "code", label: "Code", role: "middle" },
  { re: /\b(?:guardrails?|claim[- ]check|validat(?:e|es|ed|ion|or)|verif(?:y|ies|ied|ication))\b/i, category: "validator", label: "Check", role: "middle" },
  { re: /\b(?:if node|switch node|rout(?:e|es|ed|ing)|priorit(?:y|ies|ize[sd]?))\b/i, category: "gate", label: "Route", role: "middle" },
  { re: /\b(?:fallback|backup (?:api|source)|retr(?:y|ies))\b/i, category: "errorPath", label: "Fallback", role: "middle" },
  // A person before the result goes out.
  { re: /\b(?:human (?:approval|review|in the loop)|manual review|manager review|approv(?:e|es|ed|al)|for a person|go-ahead)\b/i, category: "approval", label: "Human review", role: "approval" },
  // Results: always last.
  { re: /\b(?:e-?mails?|gmail)\b/i, category: "action", label: "Email", role: "action" },
  { re: /\b(?:google )?calendar\b/i, category: "action", label: "Calendar", role: "action" },
  { re: /\bsend(?:s|ing)? (?:a |the |an )?(?:short |plain |daily |weekly )?(?:note|notice|list|message|summary|brief|digest|alert|reply)\b/i, category: "action", label: "Notify", role: "action" },
];

/** A named API in the post ("TMDB API", "Open Library API"), as a tool step. */
const NAMED_API = /\b((?:[A-Z][A-Za-z0-9.&-]*\s){0,2}[A-Z][A-Za-z0-9.&-]*)\s+API\b/g;
const NOT_A_NAME = new Set(["The", "A", "An", "This", "That", "Each", "Our", "My", "His", "Her", "Their", "External", "New", "One", "Its", "Public", "Free", "Second", "Primary", "Backup"]);
/** Sentences about plans or other people's suggestions describe steps that are not built. */
const NOT_BUILT = /\b(?:next|future|plan(?:s|ning|ned)? to|would|could|might|want(?:s|ed)? to|hope|later|eventually|suggest(?:s|ed|ion)?|instead of)\b/i;

const MIN_STEPS = 3, MAX_STEPS = 6;

export function describedPipeline(body: string): DescribedStep[] {
  const sentences = body.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter((s) => s && !NOT_BUILT.test(s));
  const text = sentences.join(" ");
  if (!text) return [];
  type Hit = { at: number; step: DescribedStep; role: Rule["role"] };
  const hits: Hit[] = [];
  const startRules = RULES.filter((r) => r.role === "trigger" || r.role === "channel");
  for (const r of RULES) {
    // A result is only found after where the run starts, so "new email … emails a summary" is two steps, not one.
    let m = r.re.exec(text);
    if (m && r.role === "action") {
      const starts = startRules.map((s) => s.re.exec(text)).filter((x): x is RegExpExecArray => !!x && x.index <= m!.index);
      const overlap = starts.find((s) => s.index + s[0].length > m!.index);
      if (overlap) { const later = new RegExp(r.re.source, "gi"); later.lastIndex = overlap.index + overlap[0].length; m = later.exec(text); }
    }
    if (m) hits.push({ at: m.index, step: { category: r.category, label: r.label }, role: r.role });
  }
  for (const m of text.matchAll(NAMED_API)) {
    const words = m[1].split(/\s+/);
    while (words.length && NOT_A_NAME.has(words[0])) words.shift();
    if (words.length) hits.push({ at: m.index ?? 0, step: { category: "tool", label: (words.join(" ") + " API").slice(0, 28) }, role: "middle" });
  }
  hits.sort((a, b) => a.at - b.at);
  const first = <R extends Rule["role"]>(role: R) => hits.find((h) => h.role === role);
  const start = first("trigger") ?? first("channel");
  // A channel closes the run with a reply: the one that started it, or another one the post names.
  const channelOut = start?.role === "channel" ? start : first("channel");
  const middle = hits.filter((h) => h.role === "middle");
  // Repeated mentions collapse into the first of each label; a generic Model step is dropped beside a named model step.
  const seen = new Set<string>();
  const keep = middle.filter((h) => !seen.has(h.step.label) && (seen.add(h.step.label), true))
    .filter((h) => !(h.step.label === "Model" && middle.some((x) => x.step.category === "ai" && x.step.label !== "Model")));
  const approval = first("approval");
  const action = first("action") ?? (channelOut ? { ...channelOut, step: { category: "action" as const, label: channelOut.step.label + " reply" } } : undefined);
  const tail = [approval, action].filter((h): h is Hit => !!h).map((h) => h.step);
  const room = MAX_STEPS - (start ? 1 : 0) - tail.length;
  const steps = [...(start ? [start.step] : []), ...keep.slice(0, Math.max(room, 0)).map((h) => h.step), ...tail];
  return steps.length >= MIN_STEPS && new Set(steps.map((s) => s.category)).size >= 2 ? steps : [];
}
