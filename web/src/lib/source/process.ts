// Workflow 01 steps after fetching: minimize → deduplicate → date and topic filter → bundle.
import { KNOWN_EVENT_TYPES, SourceError, USED_EVENT_TYPES, type FallbackReason, type SourceMode } from "./constants";
import type { RunConfig } from "./config";
import { minimizeEvent, type CapabilityReport, type SourceEvent } from "./fields";
import { stableStringify } from "../ids";

export const SOURCE_BUNDLE_VERSION = "1.0";

export function minimizeAll(raw: unknown[], salt: string) {
  let sensitiveFieldsRemoved = 0;
  let emailsRedacted = 0;
  const events = raw.map((r) => {
    const m = minimizeEvent(r, salt);
    sensitiveFieldsRemoved += m.sensitiveFieldsRemoved;
    emailsRedacted += m.emailsRedacted;
    return m.event;
  });
  return { events, sensitiveFieldsRemoved, emailsRedacted };
}

/** Keeps the first event per eventId. A later copy with different content is counted as a conflict. */
export function dedupeEvents(events: SourceEvent[]) {
  const seen = new Map<string, string>();
  const out: SourceEvent[] = [];
  let conflictingDuplicates = 0;
  events.forEach((e) => {
    const key = stableStringify(e);
    const prev = seen.get(e.eventId);
    if (prev === undefined) {
      seen.set(e.eventId, key);
      out.push(e);
    } else if (prev !== key) conflictingDuplicates += 1;
  });
  return { events: out, duplicateEventsRemoved: events.length - out.length, conflictingDuplicates };
}

/** Case-, whitespace- and dash-insensitive comparison key. The original topic string is kept elsewhere. */
export function topicKey(s: string): string {
  return s.normalize("NFKC").replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
}

export function postMatchesTopic(e: SourceEvent, topic: string, topicId: string | null): boolean {
  if (topicId) return e.topics.some((t) => t.id === topicId);
  const want = topicKey(topic);
  return e.topics.some((t) => topicKey(t.name) === want);
}

export type FilterDiagnostics = {
  posts: number; comments: number; reactions: number; views: number;
  otherKnownEvents: number; unknownEventTypes: number; unknownEventTypeNames: string[];
  filteredByDate: number; filteredByTopic: number; filteredWithParent: number;
};

/**
 * Posts: kept when created inside the window and tagged with the weekly topic (structured topic, not body text).
 * Comments, reactions, views: kept when inside the window and not attached to a post that was filtered out.
 *   Interactions on posts never seen are kept so workflow 02 can report them as missing parents.
 * Other event types are counted and dropped.
 */
export function filterEvents(events: SourceEvent[], config: Pick<RunConfig, "topic" | "topicId" | "window">) {
  const start = Date.parse(config.window.startUtc);
  const end = Date.parse(config.window.endUtcExclusive);
  const inWindow = (e: SourceEvent) => { const t = Date.parse(e.createdAt); return t >= start && t < end; };
  const d: FilterDiagnostics = { posts: 0, comments: 0, reactions: 0, views: 0, otherKnownEvents: 0, unknownEventTypes: 0, unknownEventTypeNames: [], filteredByDate: 0, filteredByTopic: 0, filteredWithParent: 0 };
  const dropped = new Set<string>();
  const kept: SourceEvent[] = [];
  const unknownNames = new Set<string>();

  events.forEach((e) => {
    if (e.type !== "post") return;
    if (!inWindow(e)) { d.filteredByDate += 1; if (e.postId) dropped.add(e.postId); return; }
    if (!postMatchesTopic(e, config.topic, config.topicId)) { d.filteredByTopic += 1; if (e.postId) dropped.add(e.postId); return; }
    kept.push(e);
    d.posts += 1;
  });
  // A post can be kept by one event and dropped by another (e.g. an edit). Kept wins.
  kept.forEach((e) => e.postId && dropped.delete(e.postId));

  events.forEach((e) => {
    if (e.type === "post") return;
    if (!(USED_EVENT_TYPES as readonly string[]).includes(e.type)) {
      if ((KNOWN_EVENT_TYPES as readonly string[]).includes(e.type)) d.otherKnownEvents += 1;
      else { d.unknownEventTypes += 1; unknownNames.add(e.type.slice(0, 40)); }
      return;
    }
    if (e.postId && dropped.has(e.postId)) { d.filteredWithParent += 1; return; }
    if (!inWindow(e)) { d.filteredByDate += 1; return; }
    kept.push(e);
    if (e.type === "comment") d.comments += 1;
    else if (e.type === "reaction") d.reactions += 1;
    else d.views += 1;
  });
  d.unknownEventTypeNames = [...unknownNames].sort();
  kept.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
  return { events: kept, diagnostics: d };
}

export type SourceMeta = {
  sourceModeRequested: SourceMode;
  sourceModeUsed: "fixture" | "yellowdig";
  fallbackReason: FallbackReason;
  fetchedAt: string;
  capability: CapabilityReport | null;
  retries: number;
};

// ---------- Stages ----------
// Each stage takes and returns plain JSON, so workflow 01 can run one stage per Code node.
// buildSourceBundle composes the same stages in the same order; tests exercise that composition.

export type StageState = {
  config: RunConfig;
  meta: SourceMeta;
  events: SourceEvent[];
  capabilities: { reactionEvents: boolean; viewEvents: boolean };
  diagnostics: Record<string, number | string[]>;
};

/** Stage 1 (privacy boundary): raw events → minimized events. Raw data does not leave this stage. */
export function stageMinimize(config: RunConfig, meta: SourceMeta, rawEvents: unknown[], pagesFetched: number, salt: string): StageState {
  const min = minimizeAll(rawEvents, salt);
  return {
    config, meta, events: min.events,
    capabilities: { reactionEvents: false, viewEvents: false },
    diagnostics: { pagesFetched, eventsFetched: rawEvents.length, privacyFieldsRemoved: min.sensitiveFieldsRemoved, emailsRedacted: min.emailsRedacted },
  };
}

/** Stage 2: deduplicate by event id. Reactions and views count as provided if the stream has any, before filtering. */
export function stageDedupe(s: StageState): StageState {
  const dd = dedupeEvents(s.events);
  return {
    ...s,
    events: dd.events,
    capabilities: { reactionEvents: dd.events.some((e) => e.type === "reaction"), viewEvents: dd.events.some((e) => e.type === "view") },
    diagnostics: { ...s.diagnostics, eventsAfterDeduplication: dd.events.length, duplicateEventsRemoved: dd.duplicateEventsRemoved, conflictingDuplicates: dd.conflictingDuplicates },
  };
}

/** Stage 3: date and topic filter. Fails with NO_MATCHING_POSTS unless allowEmpty is set. */
export function stageFilter(s: StageState): StageState {
  const f = filterEvents(s.events, s.config);
  if (f.diagnostics.posts === 0 && !s.config.allowEmpty) {
    throw new SourceError("NO_MATCHING_POSTS", "no posts matched topic '" + s.config.topic + "' between " + s.config.window.start + " and " + s.config.window.end);
  }
  return { ...s, events: f.events, diagnostics: { ...s.diagnostics, ...f.diagnostics } };
}

/** Stage 4: the bundle handed to workflow 02. */
export function assembleBundle(s: StageState) {
  const { config, meta } = s;
  const d = s.diagnostics as Record<string, number> & { unknownEventTypeNames: string[] };
  return {
    schemaVersion: SOURCE_BUNDLE_VERSION,
    sourceModeRequested: meta.sourceModeRequested,
    sourceModeUsed: meta.sourceModeUsed,
    liveSourceVerified: meta.sourceModeUsed === "yellowdig",
    fallbackReason: meta.fallbackReason,
    provider: meta.sourceModeUsed === "yellowdig" ? ("yellowdig-api" as const) : ("synthetic-fixture" as const),
    fetchedAt: meta.fetchedAt,
    network: config.network,
    communityId: config.communityId,
    week: config.week,
    topic: config.topic,
    topicId: config.topicId,
    window: config.window,
    capabilities: s.capabilities,
    capability: meta.capability,
    events: s.events,
    diagnostics: {
      pagesFetched: d.pagesFetched,
      eventsFetched: d.eventsFetched,
      eventsAfterDeduplication: d.eventsAfterDeduplication,
      duplicateEventsRemoved: d.duplicateEventsRemoved,
      conflictingDuplicates: d.conflictingDuplicates,
      posts: d.posts,
      comments: d.comments,
      reactions: d.reactions,
      views: d.views,
      otherKnownEvents: d.otherKnownEvents,
      unknownEventTypes: d.unknownEventTypes,
      unknownEventTypeNames: d.unknownEventTypeNames,
      filteredByDate: d.filteredByDate,
      filteredByTopic: d.filteredByTopic,
      filteredWithParent: d.filteredWithParent,
      privacyFieldsRemoved: d.privacyFieldsRemoved,
      emailsRedacted: d.emailsRedacted,
      retries: meta.retries,
    },
  };
}

export type SourceBundle = ReturnType<typeof assembleBundle>;

/** Runs every post-fetch stage and returns the bundle workflow 01 hands to workflow 02. */
export function buildSourceBundle(config: RunConfig, meta: SourceMeta, rawEvents: unknown[], pagesFetched: number, salt: string): SourceBundle {
  return assembleBundle(stageFilter(stageDedupe(stageMinimize(config, meta, rawEvents, pagesFetched, salt))));
}
