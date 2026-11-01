// Workflow 01 · Yellowdig Fetch Events. One exported entry per Code node.
import { FIXTURE_MARK, NODE, type NodeEntry } from "../runtime";
import {
  PROBE_PAGE_SIZE, SYNTHETIC_SALT, SYNTHETIC_WEEK2_RUN, SourceError, YELLOWDIG_BASE_URL, assembleBundle, assessPages,
  capabilityProbe, classifyFailure, decideOnFailure, eventsUrl, parsePage, resolveSourceMode, stageDedupe, stageFilter,
  stageMinimize, syntheticWeek2Pages, validateRunConfig, type RunConfig, type SourceMeta, type StageState,
} from "../../lib/source";
import { assertSourceBundle } from "../../lib/contracts/registry";

const MIN_SALT_LENGTH = 32;
const configOf = (ctx: Parameters<NodeEntry>[0]) => (ctx.node(NODE.validateConfig) as { config: RunConfig }).config;

/** Manual runs only: the synthetic Week 2 config, overridable by the manual trigger's (pinned) fields. */
export const devRunConfig: NodeEntry = (ctx) => [{ ...SYNTHETIC_WEEK2_RUN, ...(ctx.items[0] ?? {}) }];

/** Validates the untrusted run input. The pseudonym salt is checked here and never copied forward. */
export const validateConfig: NodeEntry = (ctx) => {
  const input = ctx.items[0] ?? {};
  const config = validateRunConfig(input);
  const route = resolveSourceMode(config);
  const salt = (input as { pseudonymSalt?: unknown }).pseudonymSalt;
  if (route.route === "yellowdig" && (typeof salt !== "string" || salt.length < MIN_SALT_LENGTH)) {
    throw new SourceError("CONFIG_INVALID", "live mode needs pseudonymSalt (at least " + MIN_SALT_LENGTH + " characters) from a server-side secret");
  }
  return [{ config }];
};

/** fixture | yellowdig, with an explicit fallback reason. Also prepares the request URL. */
export const resolveMode: NodeEntry = (ctx) => {
  const config = configOf(ctx);
  const r = resolveSourceMode(config);
  return [{
    route: r.route, fallbackReason: r.fallbackReason, sourceModeRequested: config.sourceMode,
    request: { url: eventsUrl(config, YELLOWDIG_BASE_URL), probeLimit: PROBE_PAGE_SIZE, pageSize: config.pageSize, maxPages: config.maxPages },
  }];
};

/** FixtureProvider: synthetic Yellowdig-shaped pages, marked so they can never pass as live data. */
export const loadFixture: NodeEntry = (ctx) => {
  const config = configOf(ctx);
  const fallbackReason = String(ctx.items[0]?.fallbackReason ?? "FIXTURE_FORCED");
  return syntheticWeek2Pages(config.pageSize).map((p) => ({ ...p, [FIXTURE_MARK]: { sourceModeUsed: "fixture", fallbackReason } }));
};

/** Capability probe on a 10-event page: field names and types only. Stops a live run if required fields are missing. */
export const checkCapability: NodeEntry = (ctx) => {
  const page = parsePage(ctx.items[0] ?? null);
  const capability = capabilityProbe(page.data);
  if (capability.missingRequired.length) {
    throw new SourceError("FIELD_MAPPING_UNVERIFIED", "Yellowdig events lack expected fields: " + capability.missingRequired.join(", ") + ". Update FIELD_MAP after reviewing the capability report.");
  }
  return [{ capability }];
};

/** Turns an HTTP Request error output into retry, fallback or a thrown, classified failure. */
export const classifyFetchFailure: NodeEntry = (ctx) => {
  const config = configOf(ctx);
  const raw = (ctx.items[0] ?? {}) as Record<string, unknown>;
  const err = (typeof raw.error === "object" && raw.error ? raw.error : {}) as Record<string, unknown>;
  const status = Number(err.httpCode ?? err.status ?? err.statusCode ?? raw.statusCode ?? NaN);
  const message = [typeof raw.error === "string" ? raw.error : "", err.message, err.description].filter((x) => typeof x === "string").join(" ");
  const c = classifyFailure({ status: Number.isFinite(status) ? status : null, message, retryAfter: null });
  const attempt = ctx.runIndex + 1;
  const d = decideOnFailure(config.sourceMode, c, attempt, config.maxRetries);
  if (d.action === "fail") throw d.error;
  if (d.action === "retry") return [{ action: "retry", code: d.code, attempt, waitSeconds: Math.ceil(d.waitMs / 1000) }];
  return [{ action: "fallback", code: d.code, attempt, fallbackReason: d.fallbackReason }];
};

/** Collect pages (fixture or live) → pagination checks → privacy minimization. Raw events stop here. */
export const collectAndMinimize: NodeEntry = (ctx) => {
  const config = configOf(ctx);
  const resolved = ctx.node(NODE.resolveMode) as { sourceModeRequested: RunConfig["sourceMode"] };
  const mark = ctx.items[0]?.[FIXTURE_MARK] as { fallbackReason: SourceMeta["fallbackReason"] } | undefined;
  const pages = ctx.items.map((p) => { const { [FIXTURE_MARK]: _drop, ...page } = p; void _drop; return page; });
  const fetched = assessPages(pages, config.maxPages);
  const failure = ctx.node(NODE.classifyFailure) as { attempt?: number } | null;
  const meta: SourceMeta = {
    sourceModeRequested: resolved.sourceModeRequested,
    sourceModeUsed: mark ? "fixture" : "yellowdig",
    fallbackReason: mark ? mark.fallbackReason : "NONE",
    fetchedAt: ctx.now,
    capability: mark ? null : ((ctx.node(NODE.checkCapability) as { capability: SourceMeta["capability"] } | null)?.capability ?? null),
    retries: mark ? 0 : failure?.attempt ?? 0,
  };
  let salt = SYNTHETIC_SALT;
  if (!mark) {
    const input = ctx.node(NODE.calledByWorkflow) ?? ctx.node(NODE.devRunConfig) ?? {};
    salt = String((input as { pseudonymSalt?: unknown }).pseudonymSalt ?? "");
    if (salt.length < MIN_SALT_LENGTH) throw new SourceError("CONFIG_INVALID", "pseudonymSalt is missing for live data");
  }
  return [stageMinimize(config, meta, fetched.events, fetched.pagesFetched, salt) as unknown as Record<string, unknown>];
};

export const dedupe: NodeEntry = (ctx) => [stageDedupe(ctx.items[0] as unknown as StageState) as unknown as Record<string, unknown>];

export const filterDateTopic: NodeEntry = (ctx) => [stageFilter(ctx.items[0] as unknown as StageState) as unknown as Record<string, unknown>];

/** Assemble the bundle and validate it against schemas/source-bundle.schema.json before returning it. */
export const assembleAndValidate: NodeEntry = (ctx) => {
  const bundle = assembleBundle(ctx.items[0] as unknown as StageState);
  assertSourceBundle(bundle);
  return [bundle as unknown as Record<string, unknown>];
};
