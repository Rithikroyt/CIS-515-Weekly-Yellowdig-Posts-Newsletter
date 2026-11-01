import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadValidators, readJson, REPO_ROOT } from "../../../scripts/schemas";
import { applyAssetManifest } from "../assets";
import { SCHEMA_IDS, assertWeekDataset, bundleLite, datasetLite } from "../contracts/registry";
import { pseudonymousId } from "../ids";
import type { NormalizedPost } from "../contracts";
import {
  SYNTHETIC_SALT, SYNTHETIC_WEEK2_RUN, SourceError, assessPages, buildSourceBundle, capabilityProbe,
  classifyFailure, decideOnFailure, dedupeEvents, eventsUrl, fetchAllPages, filterEvents, htmlToText, minimizeEvent,
  normalizeBundle, resolveSourceMode, syntheticWeek2Events, syntheticWeek2Pages, validateRunConfig, yellowdigPostUrl,
  YELLOWDIG_BASE_URL, type FetchPage, type RunConfig, type SourceEvent, type SourceMeta,
} from ".";

const FIX = join(REPO_ROOT, "fixtures", "synthetic", "week-02");
const ajv = loadValidators();
const cfg = (over: Record<string, unknown> = {}) => validateRunConfig({ ...SYNTHETIC_WEEK2_RUN, ...over });
const meta = (over: Partial<SourceMeta> = {}): SourceMeta => ({
  sourceModeRequested: "fixture", sourceModeUsed: "fixture", fallbackReason: "FIXTURE_FORCED",
  fetchedAt: "2026-10-29T15:00:00Z", capability: null, retries: 0, ...over,
});
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof SourceError ? e.code : "NOT_SOURCE_ERROR:" + String(e); }
  return "NO_ERROR";
};
const codeAsync = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e instanceof SourceError ? e.code : "NOT_SOURCE_ERROR:" + String(e); }
  return "NO_ERROR";
};
const fixtureRun = (config: RunConfig = cfg(), m = meta()) => {
  const f = assessPages(syntheticWeek2Pages(config.pageSize), config.maxPages);
  return buildSourceBundle(config, m, f.events, f.pagesFetched, SYNTHETIC_SALT);
};

// Raw-event builders for focused cases.
const U = (id: string, extra: Record<string, unknown> = {}) => ({ "user/squuid": id, "user/display-name": "Test " + id, ...extra });
const rawPost = (id: string, at: string, topic = SYNTHETIC_WEEK2_RUN.topic, extra: Record<string, unknown> = {}) => ({
  "event/squuid": "ev-" + id, "event/type": "post", "event/created-at": at, "event/user": U("a"),
  "event/post": { "post/squuid": id, "post/title": "T " + id, "post/body": "<p>Body " + id + "</p>", "post/topics": [{ "topic/squuid": "t2", "topic/name": topic }] }, ...extra,
});
const rawComment = (id: string, postId: string, at: string, user = "b", parent?: string) => ({
  "event/squuid": "ev-" + id, "event/type": "comment", "event/created-at": at, "event/user": U(user),
  "event/post": { "post/squuid": postId }, "event/comment": { "comment/squuid": id, "comment/body": "c " + id, ...(parent ? { "comment/parent": parent } : {}) },
});
const rawSimple = (type: string, id: string, postId: string | null, at: string) => ({
  "event/squuid": "ev-" + id, "event/type": type, "event/created-at": at, "event/user": U("c"), ...(postId ? { "event/post": { "post/squuid": postId } } : {}),
});
const page = (data: unknown[], atEnd: boolean, cursor: string | null) => ({ data, limit: 250, "record-count": data.length, cursor, "at-end": atEnd });
const bundleFrom = (raw: unknown[], config = cfg({ allowEmpty: true }), m = meta()) => buildSourceBundle(config, m, raw, 1, "salt-for-tests");

describe("run configuration", () => {
  it("accepts the synthetic Week 2 run and builds a Phoenix window", () => {
    const c = cfg();
    expect(c.window).toEqual({ start: "2026-10-23", end: "2026-10-28", timezone: "America/Phoenix", startUtc: "2026-10-23T07:00:00Z", endUtcExclusive: "2026-10-29T07:00:00Z" });
    expect(c.pageSize).toBe(250);
  });
  it.each([
    [{ week: 0 }, "INVALID_WEEK"], [{ week: 17 }, "INVALID_WEEK"], [{ week: 2.5 }, "INVALID_WEEK"],
    [{ startDate: "2026-10-29", endDate: "2026-10-28" }, "INVALID_DATE_RANGE"], [{ startDate: "2026-02-30" }, "INVALID_DATE_RANGE"],
    [{ startDate: "2026-09-01", endDate: "2026-10-28" }, "INVALID_DATE_RANGE"],
    [{ network: undefined }, "CONFIG_INVALID"], [{ communityId: "../etc" }, "CONFIG_INVALID"], [{ topic: "  " }, "CONFIG_INVALID"],
    [{ sourceMode: "live" }, "CONFIG_INVALID"], [{ pageSize: 251 }, "CONFIG_INVALID"], [{ timezone: "Mars/Olympus" }, "CONFIG_INVALID"],
    [{ yellowdigCredentialConfigured: "yes" }, "CONFIG_INVALID"],
  ])("rejects %j with %s", (over, expected) => {
    expect(code(() => cfg(over))).toBe(expected);
  });
  it("rejects a non-object config", () => expect(code(() => validateRunConfig(null))).toBe("CONFIG_INVALID"));
  it("builds the documented events URL with encoded path parts", () => {
    expect(eventsUrl(cfg(), YELLOWDIG_BASE_URL)).toBe("https://data.yellowdig.app/network/carey-school-of-business/community/6acd2896-76e7-400f-9a00-cfd657470859/events");
  });
});

describe("source mode resolution", () => {
  it("forced fixture mode", () => expect(resolveSourceMode(cfg({ sourceMode: "fixture", yellowdigCredentialConfigured: true }))).toEqual({ route: "fixture", fallbackReason: "FIXTURE_FORCED" }));
  it("auto mode without a credential falls back with an explicit reason", () => {
    expect(resolveSourceMode(cfg({ sourceMode: "auto" }))).toEqual({ route: "fixture", fallbackReason: "YELLOWDIG_CREDENTIAL_NOT_CONFIGURED" });
  });
  it("auto mode with a credential uses Yellowdig", () => expect(resolveSourceMode(cfg({ sourceMode: "auto", yellowdigCredentialConfigured: true }))).toEqual({ route: "yellowdig", fallbackReason: "NONE" }));
  it("yellowdig mode without a credential fails", () => expect(code(() => resolveSourceMode(cfg({ sourceMode: "yellowdig" })))).toBe("YELLOWDIG_CREDENTIAL_NOT_CONFIGURED"));
});

describe("fixture provider", () => {
  it("produces a valid bundle marked as fixture data, never as live", () => {
    const b = fixtureRun();
    expect(b.sourceModeUsed).toBe("fixture");
    expect(b.liveSourceVerified).toBe(false);
    expect(b.provider).toBe("synthetic-fixture");
    expect(bundleLite().errors(SCHEMA_IDS.sourceBundle, b)).toEqual([]);
    expect(ajv["source-bundle"](b), JSON.stringify(ajv["source-bundle"].errors)).toBe(true);
  });
  it("auto-mode fallback keeps the reason in the bundle", () => {
    const b = fixtureRun(cfg({ sourceMode: "auto" }), meta({ sourceModeRequested: "auto", fallbackReason: "YELLOWDIG_CREDENTIAL_NOT_CONFIGURED" }));
    expect(b.sourceModeRequested).toBe("auto");
    expect(b.sourceModeUsed).toBe("fixture");
    expect(b.fallbackReason).toBe("YELLOWDIG_CREDENTIAL_NOT_CONFIGURED");
  });
  it("matches the committed week dataset exactly (parity with the Phase 1 posts)", () => {
    const ds = normalizeBundle(fixtureRun());
    expect(ds).toEqual(readJson(join(FIX, "week-dataset.json")));
    const committed = readJson(join(FIX, "normalized-posts.json")) as NormalizedPost[];
    const manifest = readJson(join(FIX, "asset-manifest.json")) as Parameters<typeof applyAssetManifest>[1];
    expect(applyAssetManifest(ds.posts, manifest)).toEqual(committed);
  });
  it("derives the Week 2 counts from events, not constants", () => {
    const ds = normalizeBundle(fixtureRun());
    expect(ds.metrics.posts).toBe(8);
    expect(ds.metrics.comments).toBe(13);
    expect(ds.metrics.reactions).toBe(32);
    expect(ds.metrics.views).toBe(212);
    expect(ds.diagnostics).toMatchObject({ duplicateEventsRemoved: 1, filteredByTopic: 1, filteredByDate: 1, filteredWithParent: 1, missingParents: 1, unknownEventTypes: 1, otherKnownEvents: 1, emailsRedacted: 1 });
  });
  it("gives the same result for any page size (pagination over 250 events)", () => {
    const at250 = normalizeBundle(fixtureRun(cfg({ pageSize: 250 })));
    const at7 = fixtureRun(cfg({ pageSize: 7 }));
    expect(at7.diagnostics.pagesFetched).toBeGreaterThan(40);
    expect(at7.diagnostics.duplicateEventsRemoved).toBe(at7.diagnostics.pagesFetched - 1);
    const ds7 = normalizeBundle(at7);
    expect(ds7.posts).toEqual(at250.posts);
    expect(ds7.metrics).toEqual(at250.metrics);
  });
});

describe("privacy boundary", () => {
  const raw = {
    "event/squuid": "ev1", "event/type": "post", "event/created-at": "2026-10-24T16:00:00Z",
    "event/user": U("real-user-123", { "user/display-name": "Pat Example", "user/email": "student@example.edu", "user/sis-ids": ["1234567890"], "user/saved-lti-fields": { custom_canvas_user_id: "999" }, "user/saved-lti-3-fields": { sub: "x" }, "user/phone": "555" }),
    "event/receiver": U("r", { "user/email": "receiver@example.edu" }),
    "event/community": { "community/squuid": "c", "community/network": "n", "community/lti-context": "ctx" },
    "event/post": { "post/squuid": "p1", "post/title": "Hi a.b@example.edu", "post/body": "<p>mail me: x.y@example.edu</p>", "post/topics": [{ "topic/name": "W" }] },
  };
  const m = minimizeEvent(raw, "salt");
  const out = JSON.stringify(m.event);
  it("strips SIS ids, LTI fields, emails, phone and receiver data", () => {
    expect(out).not.toMatch(/1234567890|custom_canvas|999|lti|sis|phone|555|receiver|@example.edu|real-user-123|network/i);
    expect(Object.keys(m.event).sort()).toEqual(["actor", "body", "commentId", "createdAt", "eventId", "parentCommentId", "postId", "title", "topics", "type"]);
  });
  it("replaces the user id with the Phase 1 pseudonymous id", () => {
    expect(m.event.actor).toEqual({ id: pseudonymousId("real-user-123", "salt"), displayName: "Pat Example" });
  });
  it("redacts email addresses inside title and body text and counts them", () => {
    expect(m.event.title).toBe("Hi [email removed]");
    expect(m.event.body).toBe("mail me: [email removed]");
    expect(m.emailsRedacted).toBe(2);
  });
  it("counts the sensitive fields it removed", () => {
    // user/email, user/sis-ids, user/saved-lti-fields, user/saved-lti-3-fields, user/phone, receiver email, community lti-context
    expect(m.sensitiveFieldsRemoved).toBe(7);
  });
  it("the whole fixture bundle has no fake SIS ids, LTI values or emails left", () => {
    const s = JSON.stringify(fixtureRun());
    expect(s).not.toMatch(/SYN-SIS|syn-canvas|lis_person|@example\.edu|user\/|event\//);
  });
  it("fails loudly on an event without an id, type or timestamp", () => {
    expect(code(() => minimizeEvent({ "event/type": "post", "event/created-at": "2026-10-24T16:00:00Z" }, "s"))).toBe("UNEXPECTED_RESPONSE_SHAPE");
    expect(code(() => minimizeEvent({ "event/squuid": "e", "event/created-at": "2026-10-24T16:00:00Z" }, "s"))).toBe("UNEXPECTED_RESPONSE_SHAPE");
    expect(code(() => minimizeEvent({ "event/squuid": "e", "event/type": "post", "event/created-at": "2026-10-24 16:00" }, "s"))).toBe("UNEXPECTED_RESPONSE_SHAPE");
    expect(code(() => minimizeEvent("not an object", "s"))).toBe("UNEXPECTED_RESPONSE_SHAPE");
  });
  it("keeps paragraphs when stripping HTML", () => {
    expect(htmlToText("<p>One &amp; two</p><p>Three<br>four</p>")).toBe("One & two\n\nThree\nfour");
  });
});

describe("capability probe", () => {
  it("records field names and types, flags sensitive fields, and never records values", () => {
    const sample = syntheticWeek2Events().slice(0, 10);
    const r = capabilityProbe(sample);
    expect(r.sampleSize).toBe(10);
    expect(r.missingRequired).toEqual([]);
    expect(r.mapping.eventId).toBe("event/squuid");
    expect(r.mapping.postTopics).toBe("post/topics");
    expect(r.detected.sisIdFields).toBeGreaterThan(0);
    expect(r.detected.ltiFields).toBeGreaterThan(0);
    expect(r.detected.emailLikeFields).toBeGreaterThan(0);
    const s = JSON.stringify(r);
    expect(s).not.toMatch(/Avery|SYN-SIS|@example\.edu|syn-canvas|custom_canvas|Recipe/);
  });
  it("reports missing required fields for an unfamiliar shape", () => {
    expect(capabilityProbe([{ foo: 1 }]).missingRequired).toEqual(["eventId", "type", "createdAt"]);
  });
});

describe("deduplication", () => {
  const e = (id: string, body = "x"): SourceEvent => ({ eventId: id, type: "comment", createdAt: "2026-10-24T16:00:00Z", actor: null, postId: "p", commentId: id, parentCommentId: null, title: null, body, topics: [] });
  it("removes repeats by event id, not by timestamp", () => {
    const r = dedupeEvents([e("1"), e("2"), e("1"), e("3")]);
    expect(r.events.map((x) => x.eventId)).toEqual(["1", "2", "3"]);
    expect(r.duplicateEventsRemoved).toBe(1);
    expect(r.conflictingDuplicates).toBe(0);
  });
  it("keeps the first copy and counts a conflicting duplicate", () => {
    const r = dedupeEvents([e("1", "a"), e("1", "b")]);
    expect(r.events[0].body).toBe("a");
    expect(r.conflictingDuplicates).toBe(1);
  });
  it("keeps distinct events with the same timestamp", () => expect(dedupeEvents([e("1"), e("2")]).events).toHaveLength(2));
});

describe("topic and Phoenix date filtering", () => {
  const ev = (raw: unknown[]) => raw.map((r) => minimizeEvent(r, "s").event);
  it("matches the structured topic case- and whitespace-insensitively, not the body text", () => {
    const r = filterEvents(ev([
      rawPost("a", "2026-10-24T16:00:00Z", "  week 2 -   weekly workflow show-and-tell on yellowdig "),
      rawPost("b", "2026-10-24T16:00:00Z", "WEEK 1 - INTRODUCTIONS", { "event/post": { "post/squuid": "b", "post/body": "This is my Week 2 WEEKLY WORKFLOW SHOW-AND-TELL ON YELLOWDIG post", "post/topics": [{ "topic/name": "WEEK 1 - INTRODUCTIONS" }] } }),
      rawPost("c", "2026-10-24T16:00:00Z", "WEEK 2 – WEEKLY WORKFLOW SHOW-AND-TELL ON YELLOWDIG"),
    ]), cfg());
    expect(r.events.map((e) => e.postId)).toEqual(["a", "c"]);
    expect(r.diagnostics.filteredByTopic).toBe(1);
  });
  it("can match by topic id instead of name", () => {
    const r = filterEvents(ev([rawPost("a", "2026-10-24T16:00:00Z", "renamed topic")]), cfg({ topicId: "t2" }));
    expect(r.events).toHaveLength(1);
  });
  it("uses Phoenix midnight, not UTC midnight, at both ends", () => {
    const r = filterEvents(ev([
      rawPost("utc-day-but-phoenix-previous-day", "2026-10-23T06:59:59Z"),
      rawPost("phoenix-start", "2026-10-23T07:00:00Z"),
      rawPost("phoenix-last-minute", "2026-10-29T06:59:00Z"),
      rawPost("phoenix-next-day", "2026-10-29T07:00:00Z"),
      rawPost("offset-input", "2026-10-28T23:30:00-07:00"),
    ]), cfg());
    expect(r.events.map((e) => e.postId).sort()).toEqual(["offset-input", "phoenix-last-minute", "phoenix-start"]);
    expect(r.diagnostics.filteredByDate).toBe(2);
    expect(r.events.find((e) => e.postId === "offset-input")!.createdAt).toBe("2026-10-29T06:30:00Z");
  });
});

describe("normalization and joins", () => {
  const T = "2026-10-24T16:00:00Z";
  const T2 = "2026-10-24T17:00:00Z";
  it("joins comments, reactions and views; reports missing parents without inventing one", () => {
    const ds = normalizeBundle(bundleFrom([
      rawPost("p1", T),
      rawComment("c1", "p1", T2),
      rawComment("c2", "p1", T2, "b", "c1"),
      rawComment("c3", "p1", T2, "b", "c-missing"),
      rawComment("c4", "deleted-post", T2),
      rawSimple("reaction", "r1", "p1", T2),
      rawSimple("view", "v1", "p1", T2),
      rawSimple("view", "v2", "deleted-post", T2),
      rawSimple("reaction", "r-nopost", null, T2),
    ]));
    const p = ds.posts[0];
    expect(p.comments.map((c) => [c.commentId, c.parentId])).toEqual([["c1", "p1"], ["c2", "c1"], ["c3", "p1"]]);
    expect(p.metrics).toEqual({ commentCount: 3, uniqueCommenters: 1, reactionCount: 1, viewCount: 1 });
    expect(ds.diagnostics.missingParents).toBe(3);
    expect(ds.diagnostics.missingParentComments).toBe(1);
    expect(ds.orphans.map((o) => o.reason).sort()).toEqual(["MISSING_PARENT_POST", "MISSING_PARENT_POST", "MISSING_POST_ID"]);
    expect(datasetLite().errors(SCHEMA_IDS.weekDataset, ds)).toEqual([]);
    expect(ajv["week-dataset"](ds), JSON.stringify(ajv["week-dataset"].errors)).toBe(true);
  });
  it("counts a self-comment on the post but not as generosity", () => {
    const ds = normalizeBundle(bundleFrom([rawPost("p1", T), rawComment("c1", "p1", T2, "a"), rawComment("c2", "p1", T2, "b")]));
    expect(ds.posts[0].metrics.commentCount).toBe(2);
    expect(ds.discussion.generousCommenters).toEqual([{ name: "Test b", commentsOnOthers: 1 }]);
  });
  it("leaves reactions and views null when the source provides none", () => {
    const ds = normalizeBundle(bundleFrom([rawPost("p1", T), rawComment("c1", "p1", T2)]));
    expect(ds.posts[0].metrics.reactionCount).toBeNull();
    expect(ds.posts[0].metrics.viewCount).toBeNull();
    expect(ds.metrics.reactions).toBeNull();
  });
  it("counts unknown event types in diagnostics and does not crash", () => {
    const b = bundleFrom([rawPost("p1", T), rawSimple("poll-vote", "x1", "p1", T2), rawSimple("future-thing", "x2", null, T2), rawSimple("badge", "x3", null, T2)]);
    expect(b.diagnostics.unknownEventTypes).toBe(2);
    expect(b.diagnostics.unknownEventTypeNames).toEqual(["future-thing", "poll-vote"]);
    expect(b.diagnostics.otherKnownEvents).toBe(1);
    const ds = normalizeBundle(b);
    expect(ds.posts).toHaveLength(1);
    // A bundle that somehow carries an unknown type is also tolerated by workflow 02.
    const odd = { ...b, events: [...b.events, { ...b.events[0], eventId: "zz", type: "mystery" as "post" }] };
    expect(normalizeBundle(odd).diagnostics.unknownEventTypes).toBe(3);
  });
  it("builds post links in the verified ?postId= format, and never for synthetic data", () => {
    expect(yellowdigPostUrl("carey-school-of-business", "c-1", "p 1")).toBe("https://yellowdig.app/n/carey-school-of-business/community/c-1?postId=p%201");
    const ds = normalizeBundle(fixtureRun());
    ds.posts.forEach((p) => {
      expect(p.sourceUrl).toBeNull();
      expect(p.source).toEqual({ provider: "synthetic-fixture", sourcePostId: p.postId, communityId: SYNTHETIC_WEEK2_RUN.communityId, sourceUrlVerified: false });
    });
  });
  it("rejects a bundle whose metadata claims live data from the fixture", () => {
    const b = fixtureRun();
    expect(code(() => normalizeBundle({ ...b, liveSourceVerified: true }))).toBe("CONTRACT_VIOLATION");
    expect(code(() => normalizeBundle({ ...b, provider: "yellowdig-api" }))).toBe("CONTRACT_VIOLATION");
  });
  it("is deterministic regardless of event order", () => {
    const raw = syntheticWeek2Events();
    const a = normalizeBundle(bundleFrom(raw, cfg()));
    const b = normalizeBundle(bundleFrom([...raw].reverse(), cfg()));
    expect(b.posts).toEqual(a.posts);
    expect(b.metrics).toEqual(a.metrics);
    expect(b.inputHash).toBe(a.inputHash);
  });
});

describe("no matching posts", () => {
  it("fails with NO_MATCHING_POSTS by default", () => {
    expect(code(() => buildSourceBundle(cfg(), meta(), [rawPost("p", "2026-10-24T16:00:00Z", "OTHER")], 1, "s"))).toBe("NO_MATCHING_POSTS");
  });
  it("returns an empty, valid dataset when allowEmpty is set", () => {
    const ds = normalizeBundle(bundleFrom([]));
    expect(ds.posts).toEqual([]);
    expect(ds.metrics.posts).toBe(0);
    expect(datasetLite().errors(SCHEMA_IDS.weekDataset, ds)).toEqual([]);
  });
});

describe("pagination", () => {
  const evs = (from: number, n: number) => Array.from({ length: n }, (_, i) => rawSimple("view", "e" + (from + i), "p", "2026-10-24T16:00:00Z"));
  it("follows cursors until at-end across more than 250 events", () => {
    const r = assessPages([page(evs(0, 250), false, "c1"), page(evs(250, 250), false, "c2"), page(evs(500, 37), true, null)], 10);
    expect(r.pagesFetched).toBe(3);
    expect(r.events).toHaveLength(537);
  });
  it("keeps a duplicate that appears on two pages until deduplication removes it", () => {
    const p1 = evs(0, 3);
    const r = assessPages([page(p1, false, "c1"), page([p1[2], ...evs(3, 2)], true, null)], 10);
    expect(r.events).toHaveLength(6);
    const b = bundleFrom(r.events);
    expect(b.diagnostics.duplicateEventsRemoved).toBe(1);
  });
  it("detects a repeated cursor", () => {
    expect(code(() => assessPages([page(evs(0, 2), false, "c1"), page(evs(2, 2), false, "c1"), page([], true, null)], 10))).toBe("PAGINATION_LOOP_DETECTED");
  });
  it("detects a repeated page", () => {
    const p = page(evs(0, 2), false, "c1");
    expect(code(() => assessPages([p, { ...p, cursor: "c2" }], 10))).toBe("PAGINATION_LOOP_DETECTED");
  });
  it("detects a run of empty pages that never ends", () => {
    expect(code(() => assessPages([page([], false, "a"), page([], false, "b"), page([], false, "c")], 10))).toBe("PAGINATION_LOOP_DETECTED");
  });
  it("stops at the page safety limit with a structured failure", () => {
    expect(code(() => assessPages([page(evs(0, 1), false, "a"), page(evs(1, 1), false, "b")], 2))).toBe("PAGINATION_LIMIT_EXCEEDED");
  });
  it("fails when pages stop before at-end", () => {
    expect(code(() => assessPages([page(evs(0, 1), false, "a")], 10))).toBe("UNEXPECTED_RESPONSE_SHAPE");
  });
  it.each([
    ["malformed JSON", "{not json", "MALFORMED_RESPONSE"],
    ["no data array", { "at-end": true }, "UNEXPECTED_RESPONSE_SHAPE"],
    ["no at-end flag", { data: [] }, "UNEXPECTED_RESPONSE_SHAPE"],
    ["record-count mismatch", { data: [1], "record-count": 2, "at-end": true }, "UNEXPECTED_RESPONSE_SHAPE"],
    ["not at-end without cursor", { data: [], "at-end": false }, "UNEXPECTED_RESPONSE_SHAPE"],
    ["over 250 records", { data: Array(251).fill({}), "at-end": true }, "UNEXPECTED_RESPONSE_SHAPE"],
  ])("rejects a page with %s", (_n, body, expected) => {
    expect(code(() => assessPages([body], 10))).toBe(expected);
  });
});

describe("HTTP failures, retries and fallback", () => {
  const ok = (data: unknown[], atEnd: boolean, cursor: string | null) => ({ status: 200, body: page(data, atEnd, cursor) });
  const run = (responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> } | Error>) => {
    const waits: number[] = [];
    const calls: Array<Record<string, string>> = [];
    const fetchPage: FetchPage = async (req) => {
      calls.push(req.query);
      const r = responses.shift();
      if (!r) throw new Error("no more responses");
      if (r instanceof Error) throw r;
      return { status: r.status, body: r.body ?? "", headers: r.headers };
    };
    const p = fetchAllPages("https://example.test/events", { pageSize: 250, maxPages: 10, maxRetries: 3 }, fetchPage, async (ms) => { waits.push(ms); });
    return { p, waits, calls };
  };
  const one = [rawSimple("view", "e1", "p", "2026-10-24T16:00:00Z")];

  it("401 fails immediately without retrying", async () => {
    const r = run([{ status: 401 }, ok(one, true, null)]);
    expect(await codeAsync(r.p)).toBe("YELLOWDIG_UNAUTHORIZED");
    expect(r.calls).toHaveLength(1);
  });
  it("403 fails immediately without retrying", async () => {
    const r = run([{ status: 403 }]);
    expect(await codeAsync(r.p)).toBe("YELLOWDIG_FORBIDDEN");
    expect(r.waits).toEqual([]);
  });
  it("429 retries with exponential backoff, then succeeds", async () => {
    const r = run([{ status: 429 }, { status: 429 }, ok(one, true, null)]);
    const out = (await r.p) as { retries: number; events: unknown[] };
    expect(out.retries).toBe(2);
    expect(r.waits).toEqual([1000, 2000]);
  });
  it("429 honours Retry-After", async () => {
    const r = run([{ status: 429, headers: { "retry-after": "7" } }, ok(one, true, null)]);
    await r.p;
    expect(r.waits).toEqual([7000]);
  });
  it("temporary 5xx retries a bounded number of times, then fails", async () => {
    const r = run([{ status: 503 }, { status: 502 }, { status: 500 }, { status: 504 }, ok(one, true, null)]);
    expect(await codeAsync(r.p)).toBe("YELLOWDIG_TEMPORARY_FAILURE");
    expect(r.waits).toEqual([1000, 2000, 4000]);
    expect(r.calls).toHaveLength(4);
  });
  it("a network timeout is retried", async () => {
    const r = run([new Error("connect ETIMEDOUT 1.2.3.4:443"), ok(one, true, null)]);
    await r.p;
    expect(r.waits).toEqual([1000]);
  });
  it("retries resume at the same cursor", async () => {
    const r = run([ok(one, false, "cur-1"), { status: 503 }, ok([rawSimple("view", "e2", "p", "2026-10-24T16:00:00Z")], true, null)]);
    await r.p;
    expect(r.calls.map((q) => q.cursor ?? null)).toEqual([null, "cur-1", "cur-1"]);
  });
  it("a malformed body is not retried", async () => {
    const r = run([{ status: 200, body: "<html>oops" }]);
    expect(await codeAsync(r.p)).toBe("MALFORMED_RESPONSE");
    expect(r.calls).toHaveLength(1);
  });

  it("classifies statuses and n8n-style error messages", () => {
    expect(classifyFailure({ status: 401 }).code).toBe("YELLOWDIG_UNAUTHORIZED");
    expect(classifyFailure({ message: "403 - Forbidden" }).code).toBe("YELLOWDIG_FORBIDDEN");
    expect(classifyFailure({ message: "The service is receiving too many requests from you (429)" }).code).toBe("YELLOWDIG_RATE_LIMITED");
    expect(classifyFailure({ message: "Node does not have any credentials set" }).code).toBe("YELLOWDIG_CREDENTIAL_NOT_CONFIGURED");
    expect(classifyFailure({ message: "timeout of 30000ms exceeded" }).code).toBe("YELLOWDIG_NETWORK_ERROR");
    expect(classifyFailure({ message: "Unexpected token < in JSON at position 0" }).code).toBe("MALFORMED_RESPONSE");
  });
  it("auto mode falls back on access failures; yellowdig mode fails; corrupt data always fails", () => {
    const c401 = classifyFailure({ status: 401 });
    expect(decideOnFailure("auto", c401, 1, 3)).toMatchObject({ action: "fallback", fallbackReason: "YELLOWDIG_UNAUTHORIZED" });
    const d = decideOnFailure("yellowdig", c401, 1, 3);
    expect(d.action).toBe("fail");
    const c429 = classifyFailure({ status: 429 });
    expect(decideOnFailure("yellowdig", c429, 1, 3)).toMatchObject({ action: "retry", waitMs: 1000 });
    expect(decideOnFailure("auto", c429, 4, 3)).toMatchObject({ action: "fallback", fallbackReason: "YELLOWDIG_RATE_LIMITED" });
    expect(decideOnFailure("auto", classifyFailure({ message: "Unexpected token in JSON" }), 1, 3).action).toBe("fail");
    expect(decideOnFailure("auto", classifyFailure({ status: 404 }), 1, 3).action).toBe("fail");
  });
});

describe("lite validator agrees with Ajv", () => {
  const ds = readJson(join(FIX, "week-dataset.json"));
  const posts = readJson(join(FIX, "normalized-posts.json")) as unknown[];
  const mutations: Array<[string, (d: Record<string, unknown>) => void]> = [
    ["extra field", (d) => { d.extra = 1; }],
    ["bad version", (d) => { d.schemaVersion = "9"; }],
    ["bad hash", (d) => { d.inputHash = "xyz"; }],
    ["negative metric", (d) => { (d.metrics as Record<string, number>).posts = -1; }],
    ["bad actor id", (d) => { ((d.posts as Array<{ author: { id: string } }>)[0]).author.id = "student@example.edu"; }],
    ["post email field", (d) => { ((d.posts as Array<{ author: Record<string, string> }>)[0]).author.email = "x@example.edu"; }],
    ["bad date-time", (d) => { ((d.posts as Array<{ createdAt: string }>)[0]).createdAt = "2026-13-40T99:00:00Z"; }],
    ["bad orphan reason", (d) => { d.orphans = [{ eventId: "x", type: "comment", reason: "GUESSED" }]; }],
    ["fake source url", (d) => { ((d.posts as Array<{ sourceUrl: string }>)[0]).sourceUrl = "https://evil.example/"; }],
  ];
  it("both accept the fixture", () => {
    expect(datasetLite().errors(SCHEMA_IDS.weekDataset, ds)).toEqual([]);
    expect(ajv["week-dataset"](ds)).toBe(true);
    posts.forEach((p) => {
      expect(datasetLite().errors(SCHEMA_IDS.normalizedPost, p)).toEqual([]);
      expect(ajv["normalized-post"](p)).toBe(true);
    });
  });
  it.each(mutations)("both reject: %s", (_n, mutate) => {
    const bad = JSON.parse(JSON.stringify(ds));
    mutate(bad);
    expect(ajv["week-dataset"](bad)).toBe(false);
    expect(datasetLite().errors(SCHEMA_IDS.weekDataset, bad).length).toBeGreaterThan(0);
  });
  it("assertWeekDataset throws CONTRACT_VIOLATION without echoing values", () => {
    const bad = JSON.parse(JSON.stringify(ds));
    bad.posts[0].author.id = "secret-value@example.edu";
    try {
      assertWeekDataset(bad);
      throw new Error("expected failure");
    } catch (e) {
      expect((e as SourceError).code).toBe("CONTRACT_VIOLATION");
      expect((e as Error).message).not.toContain("secret-value");
    }
  });
});

// Shape observed in the live 10-event probe (2026-11-01). All values here are invented.
describe("live Yellowdig event shape (flat events)", () => {
  const W4 = "WEEK 4 - WEEKLY WORKFLOW SHOW-AND-TELL ON YELLOWDIG";
  const person = (id: string, first: string, last: string) => ({
    "db/id": 17592186000000 + id.length, "user/squuid": id, "user/username": first.toLowerCase() + "x99",
    "user/firstname": first, "user/lastname": last, "user/primary-email": first.toLowerCase() + "@example.edu",
    "user/community-role": "learner", "user/sis-ids": ["SIS-INVENTED-1"],
  });
  const community = {
    "db/id": 1, "community/squuid": "c0000000-0000-4000-8000-000000000001", "community/title": "Invented course",
    "community/canvas-course-id": "999", "community/created-at": "2026-08-01T00:00:00.000-07:00", "community/saved-lti-3-fields": { k: "v" },
  };
  const livePost = {
    "db/id": 101, "event/squuid": "e0000000-0000-4000-8000-0000000000a1", "event/type": "post",
    "date/iso": "2026-11-10T09:15:00.000-07:00", "system/created-at": 1794327300000,
    "event/actor": person("u-invented-1", "Pat", "Example"), "event/receiver": person("u-invented-1", "Pat", "Example"), "event/community": community,
    "post/title": "Invented title", "post/body-text": "Invented body. Contact pat@example.edu.", "post/status": "published",
    "post/visibility": "public", "post/word-count": 4, "post/topics": [{ "db/id": 123456, "topic/label": W4 }],
  };
  const liveView = {
    "db/id": 102, "event/squuid": "e0000000-0000-4000-8000-0000000000b2", "event/type": "view",
    "date/iso": "2026-11-10T10:00:00.000-07:00", "system/created-at": 1794330000000,
    "event/actor": person("u-invented-2", "Sam", "Sample"), "event/receiver": person("u-invented-1", "Pat", "Example"), "event/community": community,
    "view/post": [{ "db/id": 101, "event/squuid": "e0000000-0000-4000-8000-0000000000a1" }],
  };

  it("maps a flat post: own event id as post id, date/iso, first + last name, body-text, topic label and db/id", () => {
    const m = minimizeEvent(livePost, "salt");
    expect(m.event).toMatchObject({
      eventId: livePost["event/squuid"], type: "post", postId: livePost["event/squuid"], createdAt: "2026-11-10T16:15:00Z",
      title: "Invented title", body: "Invented body. Contact [email removed].", topics: [{ id: "123456", name: W4 }],
    });
    expect(m.event.actor).toEqual({ id: pseudonymousId("u-invented-1", "salt"), displayName: "Pat Example" });
    // username, primary-email, sis-ids on actor and receiver (6) + canvas-course-id, saved-lti-3-fields (2)
    expect(m.sensitiveFieldsRemoved).toBe(8);
    expect(m.emailsRedacted).toBe(1);
    expect(JSON.stringify(m.event)).not.toMatch(/x99|@example\.edu|SIS-INVENTED|999|learner|Invented course/);
  });
  it("maps a view to its post through view/post[].event/squuid", () => {
    const m = minimizeEvent(liveView, "salt");
    expect(m.event).toMatchObject({ type: "view", postId: livePost["event/squuid"], commentId: null, title: null, body: null });
    expect(m.event.actor?.displayName).toBe("Sam Sample");
  });
  it("accepts system/created-at (epoch ms) when date/iso is absent", () => {
    const { ["date/iso"]: _iso, ...noIso } = livePost;
    void _iso;
    expect(minimizeEvent(noIso, "s").event.createdAt).toBe("2026-11-10T16:15:00Z");
  });
  it("capability probe resolves the live field names", () => {
    const r = capabilityProbe([livePost, liveView]);
    expect(r.missingRequired).toEqual([]);
    expect(r.mapping).toMatchObject({
      eventId: "event/squuid", type: "event/type", createdAt: "date/iso", user: "event/actor", userId: "user/squuid",
      userFirstName: "user/firstname", userLastName: "user/lastname", postTitle: "post/title", postBody: "post/body-text",
      postTopics: "post/topics", topicName: "topic/label", topicId: "db/id", target: "view/post", targetRef: "event/squuid",
    });
    expect(r.detected.sisIdFields).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toMatch(/Pat|Sam|@example\.edu|SIS-INVENTED|Invented/);
  });
  it("runs the whole pipeline: Week 4 structured-topic filter, view joined, reactions null when absent", () => {
    const cfg4 = validateRunConfig({ ...SYNTHETIC_WEEK2_RUN, week: 4, startDate: "2026-11-06", endDate: "2026-11-12", topic: W4 });
    const ds = normalizeBundle(buildSourceBundle(cfg4, meta(), [livePost, liveView], 1, "salt"));
    expect(ds.posts).toHaveLength(1);
    expect(ds.posts[0].metrics).toEqual({ commentCount: 0, uniqueCommenters: 0, reactionCount: null, viewCount: 1 });
    expect(ds.posts[0].topic).toEqual({ id: "123456", name: W4 });
    expect(ds.orphans).toEqual([]);
  });
});
