// A reference-sized synthetic week for tests and visual checks: 27 invented posts, comments, 14 workflow files
// (profiled by the real intake code) and 18 images, with mock model steps that answer from each request's source
// data. Every name, title and sentence is invented; nothing comes from real students. Not bundled into n8n.
import { processAssetBatch, type AssetInput } from "../assets";
import * as W from "../assets/synthetic-workflows";
import type { CanonicalImage } from "../assets/intake";
import type { AssetManifest, WorkflowProfile } from "../contracts";
import type { WeekDataset } from "../source/normalize";
import type { MockScenario } from "./mock";
import { buildEditorialInput } from "./input";
import { SYNTHETIC_COURSE } from "./synthetic";
import type { Claim, EditorialInput, ImageClass } from "./types";
import week2 from "../../../../fixtures/synthetic/week-02/week-dataset.json";

type Spec = {
  name: string; title: string; summary: string; group: number;
  workflow?: () => Record<string, unknown>; images?: ImageClass[];
  purpose?: string; test?: string; lesson?: string; control?: string; comments?: string[]; insight?: string;
};

const GROUPS = ["Customer support and replies", "Money and receipts", "Food and fitness", "Planning and scheduling", "News and research", "Meetings and teamwork"];

// Six spotlight candidates (p01, p05, p09, p13, p17, p21) carry a workflow file, two images, a test and a thread.
const POSTS: Spec[] = [
  { name: "Noor Halvorsen", title: "Refund Reply Desk", group: 0, workflow: W.supportDesk, images: ["workflow_canvas", "application_output"],
    summary: "A support desk that drafts a reply to each refund ticket, scores the draft and holds risky refunds for a person before anything is sent.",
    purpose: "Each refund ticket arrives through a form. A writer step drafts the reply, a scoring step rates it, a rule marks refunds above the store limit, and a person sees every reply before it goes out, so a confident draft can still be stopped.",
    test: "In a test, a reply that promised a refund above the limit still scored well, and the limit rule held it for the person to rewrite.",
    lesson: "Keep hard business limits outside the scoring step.", control: "Nothing is sent until the person on duty has looked at it.",
    comments: ["Did you try a refund exactly at the limit? Edge values are where these rules usually slip.", "I like that the limit lives in its own step instead of inside the prompt for the writer.", "Could the person see the score next to the draft? That might speed up the review a lot."],
    insight: "Classmates suggested testing refunds that sit exactly at the limit, where rules most often slip." },
  { name: "Ilan Okafor", title: "Lecture Notes Q&A", group: 4, workflow: W.notesQa, summary: "A question-and-answer helper that searches a folder of lecture notes and answers in two or three sentences with the matching note title." },
  { name: "Mira Castellanos", title: "Gym Check-in Bot", group: 2, images: ["irrelevant"], summary: "A chat bot that logs gym check-ins from a message and replies with the week's visit count for the member." },
  { name: "Tobias Ferreira", title: "Bounded API Retry", group: 3, workflow: W.boundedRetry, summary: "A small workflow that calls a class schedule API and tries again a limited number of times before sending a short notice." },
  { name: "Priya Lindqvist", title: "Receipt Logger with Code Checks", group: 1, workflow: W.expenseLogger, images: ["workflow_canvas", "execution_result"],
    summary: "An expense logger that reads emailed receipts, checks the amount and date before saving a row, and sets aside anything that does not add up.",
    purpose: "A new receipt email starts the run. A model pulls out the store, amount and date, a logic step compares them with simple rules, and only clean rows reach the spreadsheet; the rest land on a review list for the author.",
    test: "A receipt dated in the wrong year was caught by the date rule and moved to the review list instead of the sheet.",
    lesson: "Compare extracted dates and amounts with plain rules before saving them.", control: "Rows that fail the rules wait on a review list.",
    comments: ["What happens to receipts in another currency? The amount rule might pass the wrong value there.", "The review list is a nice touch, much better than silently dropping the strange receipts.", "You could log which rule failed so the review list explains itself to the reader."],
    insight: "Peers asked how receipts in other currencies would pass the amount rule." },
  { name: "Kenji Abernathy", title: "Webhook Intake Checker", group: 0, workflow: W.codeValidator, summary: "A webhook that accepts a support form, checks the fields with a short script and answers with a clear message when something is missing." },
  { name: "Lucia Varga", title: "Smoothie Planner", group: 2, images: ["application_output"], summary: "A planner that suggests a smoothie for each weekday from the fruit a student already has and sends the list as a message." },
  { name: "Omar Sundqvist", title: "Explicit Failure Branch", group: 5, workflow: W.failureBranch, summary: "A meeting reminder flow with a separate path that sends a short note to the organizer when the reminder cannot be delivered." },
  { name: "Hana Delacroix", title: "Meal Prep Scaler", group: 2, workflow: W.recipeScaler, images: ["execution_result", "workflow_canvas"],
    summary: "A meal prep helper that scales a recipe to a new number of servings, checks the units and sends the plan back for another try when something looks off.",
    purpose: "A form takes the recipe and the target servings. A model rescales the ingredients, a scoring step rates the result, and a logic step checks the units; a plan that fails goes back for another try and reaches the author after the last attempt.",
    test: "Raising the pass mark for one run showed the plan going back for another try and then reaching the author unchanged.",
    lesson: "Test the path a draft takes when it fails, on purpose.", control: "After the last try, the plan goes to the author.",
    comments: ["Raising the bar for one run to watch the failure path is a clever way to test it.", "Units are tricky, maybe convert everything to grams before the check runs?", "Does the author see why the plan failed, or only the final version of the plan?"],
    insight: "One reply suggested converting every unit to grams before the unit check." },
  { name: "Felix Mwangi", title: "Grade Export to Sheet", group: 1, workflow: W.externalApi, summary: "A scheduled flow that pulls practice quiz scores from a course tool and writes them to a sheet the student can sort." },
  { name: "Ada Rasmussen", title: "Reading Tracker", group: 4, images: ["chart"], summary: "A tracker that counts pages read each day from a short form and draws the week as a simple bar chart." },
  { name: "Ravi Montoya", title: "Inbox Labeler", group: 0, workflow: W.gmailFlow, summary: "An email flow that reads new course emails and adds a label for each class so the inbox is easier to scan." },
  { name: "Sofia Brennan", title: "Calendar Planner with Approval", group: 3, workflow: W.studyPlanner, images: ["workflow_canvas", "application_output"],
    summary: "A weekly study planner that reads the course calendar, drafts study blocks and waits for the student's go-ahead before writing anything to the calendar.",
    purpose: "Every Monday the workflow reads the course calendar, a model drafts study blocks around deadlines, and the plan is sent to the student by email; events are created only after the student answers yes.",
    test: "When the calendar call failed in a test, the student received a short notice instead of a half-written week.",
    lesson: "Put the go-ahead right before the step that writes to a personal calendar.", control: "Nothing is written to the calendar without the student's go-ahead.",
    comments: ["Waiting for a yes before touching the calendar feels right, I have lost events to scripts before.", "Maybe let the student edit a block in the email instead of only saying yes or no.", "What happens if the student never answers? Does the plan expire after a few days?"],
    insight: "A classmate asked what should happen when the student never answers the email." },
  { name: "Mateo Kowalski", title: "Draft Checker Email", group: 1, workflow: W.aiValidatorEmail, summary: "A flow that drafts a short budget note with a model, checks the note with a second step and emails it to the student." },
  { name: "Elena Nakamura", title: "Team Kanban Snapshot", group: 5, images: ["supporting_visual"], summary: "A snapshot of a team board that posts the cards moved this week to the team chat every Friday afternoon." },
  { name: "Samir Holloway", title: "Approval Before Calendar", group: 3, workflow: W.humanApproval, summary: "A planning flow that asks the student to confirm each new event by email before it is added to the calendar." },
  { name: "Greta Achebe", title: "Morning Market Brief", group: 4, workflow: W.newsBrief, images: ["application_output", "workflow_canvas"],
    summary: "A daily brief that reads market news feeds, writes a short summary and sends a plain list of headlines when the summary step does not answer in time.",
    purpose: "A schedule starts the run at seven. The workflow reads three news feeds, a model writes a short brief, and the brief is sent by email; if the model does not answer in time, the plain list of headlines goes out instead.",
    test: "A forced time-out in the summary step sent the plain headline list, and the brief arrived on time.",
    lesson: "Give a model step a simple path that works without the model.", control: "The plain headline list is always ready to send.",
    comments: ["The plain list backup is smart, a late brief is worse than a short one most mornings.", "Could you mark which headlines repeat from yesterday so the reader can skip them?", "How do you pick the three feeds? A finance student might want different sources entirely."],
    insight: "Several replies agreed that a short brief on time beats a long brief that arrives late." },
  { name: "Theo Lindgren", title: "Study Group Poll", group: 5, summary: "A poll sender that asks the study group for a meeting time and posts the most popular slot back to the group." },
  { name: "Ines Petrov", title: "Invoice Due Reminder", group: 1, images: ["workflow_canvas"], summary: "A reminder that checks a sheet of invoices each morning and emails the student about bills due within the week." },
  { name: "Caleb Osei", title: "Club Event Digest", group: 5, summary: "A weekly digest that collects club events from a shared sheet and sends one tidy email to members on Sunday." },
  { name: "Yara Feldman", title: "Standup Notes to Action Items", group: 5, workflow: W.meetingSummarizer, images: ["workflow_canvas", "chart"],
    summary: "A meeting helper that turns rough standup notes into action items with owners and dates and emails them to the team.",
    purpose: "A form takes the pasted notes. A model turns them into action items with an owner and a date, and the list is emailed to the team the same morning so nothing from standup is lost.",
    test: "Notes without names produced items with no owner, which showed the author where the summary needed a rule.",
    lesson: "Check the fields that matter most, such as owners and dates, before sending.", control: "The author reads the list before the team does.",
    comments: ["Items without an owner are the classic failure, good catch in your own test of the notes.", "Maybe ask for a default owner when nobody is named in the notes at all.", "Do you keep the original notes next to the items so the team can check context?"],
    insight: "Peers proposed a default owner when the notes name nobody." },
  { name: "Jonah Sato", title: "Running Log Coach", group: 2, summary: "A running log that reads weekly distances from a form and replies with a short note on rest days." },
  { name: "Leila Draper", title: "Exam Countdown", group: 3, summary: "A countdown that emails the student each Monday with the days left before every exam on the course calendar." },
  { name: "Arjun Whitfield", title: "Research Paper Finder", group: 4, summary: "A finder that searches an open paper index for a topic and sends the five newest abstracts as a reading list." },
  { name: "Clara Nwosu", title: "Ticket Triage Board", group: 0, images: ["execution_result"], summary: "A triage flow that sorts new help tickets into three queues by topic and shows the result of each run in a log." },
  { name: "Dario Engstrom", title: "Assignment Tracker", group: 3, summary: "A tracker that collects assignment due dates from course emails and keeps one sorted list for the semester." },
  { name: "Maya Lindberg", title: "Podcast Notes Summary", group: 4, summary: "A summarizer that turns a podcast transcript into five short takeaways and saves them to a notes page." },
];

const id = (i: number) => "ref-w2-p" + String(i + 1).padStart(2, "0");
const ref = (i: number) => "post:" + id(i);
const hex = (n: number) => ("00000000000" + n.toString(16)).slice(-12);
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const claim = (text: string, refs: string[]): Claim => ({ text, evidenceRefs: refs });

export type ReferenceImageSpec = { assetRef: string; postRef: string; cls: ImageClass; title: string; steps: string[] };
export type ReferenceWeek = {
  dataset: WeekDataset; manifest: AssetManifest; profiles: WorkflowProfile[]; images: CanonicalImage[];
  imageSpecs: ReferenceImageSpec[]; input: EditorialInput; scenario: MockScenario;
};

/** Builds the week. Image bytes are not included: callers supply a bank (tests: tiny PNGs; scripts: drawn screenshots). */
export function referenceWeek(): ReferenceWeek {
  const base = JSON.parse(JSON.stringify(week2)) as WeekDataset;
  const commenters = POSTS.map((p, i) => ({ id: "u_" + hex(i + 1), displayName: p.name }));
  const posts = POSTS.map((p, i) => {
    const day = 23 + (i % 6);
    const comments = (p.comments ?? (i % 3 === 0 ? ["Nice idea, I would use this every week.", "Short and useful."] : [])).map((body, k) => ({
      commentId: id(i) + "-c" + (k + 1), parentId: id(i), author: commenters[(i + 3 + k * 5) % commenters.length], createdAt: "2026-10-" + day + "T18:" + String(10 + k) + ":00Z", body,
    }));
    const body = [p.summary, p.purpose, p.test, p.control, p.lesson].filter(Boolean).join(" ");
    return {
      schemaVersion: "1.1", postId: id(i), week: 2, topic: base.posts[0].topic, title: p.title, author: commenters[i], createdAt: "2026-10-" + day + "T16:00:00Z",
      body, sourceUrl: null, source: { ...base.posts[0].source, sourcePostId: id(i) }, comments,
      metrics: { commentCount: comments.length, uniqueCommenters: new Set(comments.map((c) => c.author.id)).size, reactionCount: 0, viewCount: 0 },
      assets: { screenshots: [], workflowJson: null }, sourceRefs: [ref(i), ...comments.map((c) => "comment:" + c.commentId)],
    };
  });
  const dataset = { ...base, posts } as unknown as WeekDataset;

  // Workflow files and images go through the real intake checks and profiler; each image gets distinct bytes.
  const inputs: AssetInput[] = [];
  const imageSlots: Array<{ i: number; k: number; cls: ImageClass; at: number }> = [];
  POSTS.forEach((p, i) => {
    if (p.workflow) inputs.push({ postRef: id(i), originalFilename: id(i) + ".json", mimeType: "application/json", contentText: JSON.stringify(p.workflow()) });
    (p.images ?? []).forEach((cls, k) => {
      imageSlots.push({ i, k, cls, at: inputs.length });
      inputs.push({ postRef: id(i), originalFilename: id(i) + "-" + (k + 1) + ".png", mimeType: "image/png", contentBase64: Buffer.concat([Buffer.from(PNG, "base64"), Buffer.from("img-" + i + "-" + k)]).toString("base64") });
    });
  });
  const { manifest, profiles } = processAssetBatch({ week: 2, knownPostRefs: POSTS.map((_, i) => id(i)), assets: inputs });
  const images: CanonicalImage[] = imageSlots.map((s) => ({
    assetRef: "asset:" + manifest.assets[s.at].asset.assetId, postRef: ref(s.i), kind: "image", source: "private_asset_store", mimeType: "image/png",
    width: s.cls === "irrelevant" ? 400 : 1600, height: s.cls === "irrelevant" ? 400 : 900, role: "supporting", altText: "Synthetic screenshot for " + POSTS[s.i].title,
  }));
  const imageSpecs = imageSlots.map((s, n) => ({ assetRef: images[n].assetRef, postRef: ref(s.i), cls: s.cls, title: POSTS[s.i].title, steps: STEPS[s.cls] }));
  const input = buildEditorialInput({ dataset, manifest, profiles, images, course: { ...SYNTHETIC_COURSE } });
  return { dataset, manifest, profiles, images, imageSpecs, input, scenario: scenario(input, imageSpecs) };
}

const STEPS: Record<ImageClass, string[]> = {
  workflow_canvas: ["Trigger", "Model", "Score", "Rule", "Send"], execution_result: ["Run 1 passed", "Run 2 held", "Run 3 passed"],
  application_output: ["Subject", "Greeting", "Body", "Signature"], chart: ["Mon", "Tue", "Wed", "Thu", "Fri"], supporting_visual: ["To do", "Doing", "Done"], irrelevant: [],
};

const SCORES: Record<ImageClass, [number, number, number]> = {
  workflow_canvas: [5, 4, 5], execution_result: [4, 4, 4], application_output: [4, 5, 4], chart: [3, 4, 3], supporting_visual: [3, 3, 2], irrelevant: [0, 3, 0],
};

type Src = Record<string, unknown>;
const author = (i: number) => POSTS[i].name;
const idxOf = (postRef: string) => Number(postRef.slice(-2)) - 1;

/** Mock model steps that read each request's source data, like a model would. */
function scenario(input: EditorialInput, specs: ReferenceImageSpec[]): MockScenario {
  const commentRef = (i: number, k: number) => "comment:" + id(i) + "-c" + (k + 1);
  const note = (postRef: string) => {
    const i = idxOf(postRef), p = POSTS[i], r = [postRef];
    return {
      postRef, summary: claim(p.summary, r), workflowPurpose: p.purpose ? claim(p.purpose, r) : null, testPerformed: p.test ? claim(p.test, r) : null,
      interestingPattern: null, failureOrLimitation: null, humanControl: p.control ? claim(p.control, r) : null, reusableLesson: p.lesson ? claim(p.lesson, r) : null, capabilityClaims: [],
    };
  };
  const spotlights = POSTS.map((p, i) => (p.purpose ? i : -1)).filter((i) => i >= 0);
  return {
    "post-extractor": [{ build: (d) => ({ notes: ((d as Src).posts as Array<{ postRef: string }>).map((p) => note(p.postRef)) }) }],
    "theme-analyst": [{ json: { themes: [] } }],
    "build-categorizer": [{ json: { groups: GROUPS.map((title, g) => ({ title, postRefs: POSTS.map((p, i) => (p.group === g ? ref(i) : "")).filter(Boolean) })) } }],
    "image-curator": [{ build: (d) => ({ posts: ((d as Src).posts as Array<{ postRef: string; images: Array<{ assetRef: string }> }>).map((p) => {
      const evaluations = p.images.map((im) => {
        const s = specs.find((x) => x.assetRef === im.assetRef)!;
        const [rel, read, suit] = SCORES[s.cls];
        return { assetRef: im.assetRef, classification: s.cls, relevanceScore: rel, readabilityScore: read, spotlightSuitability: suit, reason: "Synthetic image of class " + s.cls,
          altText: s.cls === "irrelevant" ? "A round profile picture." : "Synthetic " + s.cls.replace("_", " ") + " for " + s.title + ".", caption: "", evidenceRefs: [p.postRef, im.assetRef] };
      });
      const best = [...evaluations].sort((a, b) => b.spotlightSuitability - a.spotlightSuitability)[0];
      return { postRef: p.postRef, evaluations, recommendedAssetRef: best && best.spotlightSuitability >= 3 ? best.assetRef : null, recommendationReason: "highest suitability" };
    }) }) }],
    "spotlight-pattern-selector": [{ json: { spotlights: spotlights.map((i) => ({ postRef: ref(i), label: "Useful Testing Pattern", reason: claim(POSTS[i].summary, [ref(i)]) })), failurePath: null, patterns: [] } }],
    "discussion-analyst": [{ json: { insights: spotlights.map((i) => ({ kind: "peer-suggestion", insight: claim(POSTS[i].insight!, [commentRef(i, 0), commentRef(i, 1)]) })) } }],
    "newsletter-editor": [{ build: (d) => editor(d as Src, input) }],
    "evidence-reviewer": [{ review: "all-supported" }],
    "newsletter-reviser": [{ build: (d) => (d as Src).newsletter }],
  };
}

function editor(d: Src, input: EditorialInput) {
  const sel = (d.selection as { spotlights: Array<{ postRef: string; label: string }> }).spotlights;
  const insights = (d.discussion as { insights: Array<{ insight: Claim }> }).insights;
  const notes = d.notes as Array<{ postRef: string; workflowPurpose: Claim | null; summary: Claim; testPerformed: Claim | null; reusableLesson: Claim | null }>;
  const P = (i: number) => ref(i);
  const commentsOf = (postRef: string) => new Set(input.posts.find((p) => p.postRef === postRef)!.comments.map((c) => c.commentRef));
  return {
    hero: {
      title: claim("Builders put a second look between the draft and the send", [P(0), P(4), P(8)]),
      dek: claim("This week's posts added a step that looks at a draft before anything leaves the workflow, from refund replies to receipt logs and meal plans, and several authors tested that step on purpose to see what it would hold back.", [P(0), P(4), P(8)]),
    },
    executiveSummary: [
      claim(author(0) + "'s Refund Reply Desk drafts a reply to each ticket and holds risky refunds before a customer sees them. " + author(4) + "'s Receipt Logger reads a receipt and compares the amount and date with plain rules before saving a row. " + author(8) + "'s Meal Prep Scaler rescales a recipe and sends a doubtful plan back for another try.", [P(0), P(4), P(8)]),
      claim(author(12) + " keeps the student in charge of the calendar, " + author(16) + " turns market headlines into a short morning brief, and " + author(20) + " turns standup notes into owners and dates. Across these posts the same shape keeps returning: draft something, look at the draft, then decide what happens next.", [P(12), P(16), P(20)]),
    ],
    themes: [],
    spotlights: sel.map((s) => {
      const n = notes.find((x) => x.postRef === s.postRef)!;
      const own = commentsOf(s.postRef);
      const thread = insights.find((x) => x.insight.evidenceRefs.some((r) => own.has(r)))?.insight ?? null;
      return { postRef: s.postRef, label: s.label, text: n.workflowPurpose ?? n.summary, testResult: n.testPerformed, threadInsight: thread, worthBorrowing: n.reusableLesson ?? n.summary };
    }),
    failurePath: null, borrowThisPattern: [], discussionHighlights: [],
    takeaways: [
      { title: "A good score is not a pass", text: claim("A refund reply that broke the store limit still scored well, and only the separate limit rule held it back. Hard limits belong in their own step.", [P(0)]) },
      { title: "Test the path a draft fails on", text: claim("Raising the pass mark for one run showed exactly where a failing meal plan goes, and a forced time-out showed the headline list going out on time.", [P(8), P(16)]) },
      { title: "Put the go-ahead before the write", text: claim("Waiting for the student's answer before touching the calendar kept a half-written week out of it when the calendar call failed in a test.", [P(12)]) },
    ],
    nextSteps: [
      claim("Feed your workflow one input that should fail and watch where it goes.", [P(8)]),
      claim("Move business limits such as refund caps out of the writer's prompt and into their own step.", [P(0)]),
      claim("Compare extracted dates and amounts with plain rules before anything is saved.", [P(4)]),
      claim("Decide what happens when nobody answers a request for a go-ahead.", [P(12)]),
    ],
  };
}

/** The six posts written as spotlight candidates. */
export const REFERENCE_CANDIDATES = POSTS.map((p, i) => (p.purpose ? ref(i) : "")).filter(Boolean);
