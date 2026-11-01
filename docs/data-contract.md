# Data contract

JSON Schemas (draft 2020-12) in [`/schemas`](../schemas) define every object that moves through the pipeline. [`web/src/lib/contracts`](../web/src/lib/contracts/index.ts) holds Zod copies of them and the TypeScript types. Tests check that both validators accept the fixture and reject the same bad inputs.

| Schema | Produced by | Consumed by |
|---|---|---|
| `source-bundle` | 01 - Yellowdig Fetch Events | 02 |
| `week-dataset` | 02 - Yellowdig Normalize and Join | Phases 3–4 |
| `normalized-post` | 02 (inside `week-dataset.posts`) | metrics, editorial pipeline |
| `metrics` | shared definitions | `issue`, `week-dataset` |
| `workflow-asset` | 03 - Profile Workflow Assets (inside `asset-manifest.assets`) | manifest |
| `workflow-profile` | 03 - Profile Workflow Assets | metrics, spotlights, atlas |
| `asset-manifest` | 03 - Profile Workflow Assets | metrics (`applyAssetManifest`), renderer |
| `editorial-input` | `lib/editorial/input.ts` (from week dataset + manifest + profiles) | workflow 04 |
| `editorial-draft` | 04 - Editorial Intelligence (status `human_review`) | Phase 5 human review |
| `issue` | 04 + 05, after human approval | web issue, `newsletter.html` |

All objects use `additionalProperties: false`. A field that isn't listed is rejected rather than ignored.

## normalized-post (version 1.1)

Version 1.1 adds a required `source` object: `{ provider, sourcePostId, communityId, sourceUrlVerified }`. `sourceUrl` stays null until the public Yellowdig post URL format is verified, and only `lib/source/urls.ts` may build a link. The Phase 1 fixture had invented `?postId=` links; Phase 2 removed them.


One Yellowdig post with its comments joined.

- **Pseudonymous people.** `author.id` and each comment's author id are `u_` followed by 12 hex characters: a salted SHA-256 of the source user id (`pseudonymousId` in [`ids.ts`](../web/src/lib/ids.ts)). Only `id` and `displayName` are allowed, so emails and SIS ids cannot pass validation.
- **`body` is plain text.** HTML is stripped during normalization and escaped again when rendered.
- **Nullable counts.** `reactionCount` and `viewCount` are `null` when the source doesn't provide them. They are never `0` by default.
- **Source refs.** `sourceRefs` lists the evidence references this post can support, such as `post:<id>` and `comment:<id>`.

## workflow-asset (version 1.0)

Metadata for one manually supplied file: `postRef`, `assetId` (`asset_` + 16 hex), `kind` (`n8n_workflow_json` or `workflow_screenshot`), the sanitized `originalFilename`, `mimeType`, `sizeBytes`, `sha256` and `uploadedAt`. It never holds file content, local paths or student identity fields.

## workflow-profile (version 2.0)

Computed by deterministic static analysis of a workflow's JSON. The workflow is never executed (`source.executed` is the constant `false`).

- **Counts:** nodes, edges, triggers, disabled nodes and dangling edges, plus `nodeTypes` and `nodeCategories` (22 categories; unknown node types are `other`).
- **`capabilities`:** 16 booleans, such as `usesAI`, `usesMultipleAgents`, `hasValidationGate`, `hasBoundedRetry` and `usesLLMJudge`. Each is detected from graph structure, never from names alone. `retry`, `scoreThreshold`, `integrations` and `aiProviders` add detail.
- **`graph`:** nodes `{id n0…nN, label, type, category, disabled}` and edges `{source, target, sourceOutput, targetInput, kind main|ai|error}`. Parameters, prompts, code, credentials and emails are not stored.
- **`security`:** counts and flags only (credential references, pinned/static/execution/binary data, webhook ids and URLs, possible secrets, emails, truncated strings). Detected values are never recorded.
- `chips` is the main path from the first trigger, at most 7 steps, in the issue's chip vocabulary.

Rules and examples: [workflow-asset-profiling.md](workflow-asset-profiling.md).

## asset-manifest (version 2.0)

One deterministic manifest per week of the files attached to posts.

- Each entry has an `asset`, a `status` (`PROFILED`, `VALIDATED`, `REJECTED`, `DUPLICATE`, `UNMATCHED_ASSET`), a `reason` code or null, `duplicateOf`, `profileRef` and `approval`.
- Files are matched to posts only by an explicit `postRef` that exists in the week. Anything else is `UNMATCHED_ASSET` with `postRef: null`. Matches are never guessed.
- Duplicates are found by SHA-256 of the content. The first copy is kept and later copies point at it.
- Each asset starts with `approval.status: "pending"`. Only `approved` assets may be copied into a public issue.

## issue

The single source of truth for one newsletter issue. The web page and the downloadable HTML both render from it, and AI never writes the final HTML.

| Part | Provenance | Rule |
|---|---|---|
| `metrics`, `discussionHighlights.mostDiscussed`, `generousCommenters` | CODE-COUNTED | Computed by [`metrics.ts`](../web/src/lib/metrics.ts). Tests recompute them from the posts and require an exact match. |
| `hero`, `themes`, `spotlights`, `failurePath`, `takeaways`, `synthesis` | AI-DRAFTED | Each item carries `evidence` refs. Code checks that every ref resolves. |
| `sourceUrl` fields | SOURCE-LINKED | Must start with `https://yellowdig.app/`. |
| `approvedAt`, `approvedBy` | HUMAN-APPROVED | Required before `approved` or `published`. |

**Status values:** `draft → review → (revision_requested → review)* → approved → published`, or `failed`. `methodology.revisionCount` is capped at 2 by the schema.

**Evidence refs** match `^(post|comment|workflow|metric):[A-Za-z0-9._:-]+$`. No URLs or free text are allowed.

**Idempotency.** `provenance.inputHash` is the SHA-256 of the canonical (key-sorted) source content. `provenance.idempotencyKey` is `course:term:week-NN:hash16`. The same input produces the same key, and publishing checks the key before writing.

**Downloads.** These are fixed paths: `/issues/week-NN/issue.json` and `/issues/week-NN/newsletter.html`.

**Screenshots.** `src` must be `assets/<file>.<png|jpg|jpeg|gif|webp>`. `javascript:` and external URLs are rejected.

## source-bundle (Phase 2)

Output of workflow 01. It holds:

- **Run metadata:** `sourceModeRequested`, `sourceModeUsed`, `liveSourceVerified` (true only for data from an authorized Yellowdig request), `fallbackReason` (enum) and `provider`.
- **Window:** the Phoenix-local window, as dates plus the UTC instants `startUtc` and `endUtcExclusive`.
- **Events:** minimized events with only the allowlisted fields.
- **Diagnostics:** pages, duplicates, filters, privacy fields removed, emails redacted and retries.

The bundle holds no SIS ids, LTI fields, emails or raw user ids.

## week-dataset (Phase 2)

Output of workflow 02. It holds:

- **Posts:** normalized posts with comments joined; reactions and views are counted per post.
- **Metrics:** code-counted, from `metrics.ts`.
- **Discussion:** most discussed posts and generous commenters.
- **Orphans:** `{ eventId, type, reason }` for missing parents and missing authors. A parent is never invented.
- **Diagnostics:** every bundle diagnostic plus the join counts.
- **inputHash:** SHA-256 over the canonical events, window and topic. `fetchedAt` is excluded so re-runs hash the same.

Reaction and view counts are `null` when the stream has no events of that type at all, and `0` otherwise. Assets stay empty here; `applyAssetManifest` (in `lib/assets/apply.ts`) attaches validated screenshots and the first profiled workflow per post.

## Validation in n8n

n8n Code nodes cannot load Ajv or Zod, so `lib/contracts/validate-lite.ts` validates against the same `/schemas` files. It supports exactly the keywords the schemas use and throws on any other keyword. Tests require it to agree with Ajv on the fixtures and on 9 kinds of bad input.

## Synthetic fixture

`fixtures/synthetic/week-02/` is built by `npm run fixtures:synthetic`. Since Phase 2 its posts come from Yellowdig-shaped synthetic API pages (`lib/source/synthetic-week2.ts`), run through the same pagination, privacy, filter and normalization code as live data, and `week-dataset.json` is committed as the expected output. The generator is [`web/scripts/make-synthetic-week2.ts`](../web/scripts/make-synthetic-week2.ts). The fixture has 8 invented posts, 13 comments and 7 workflow profiles. Since Phase 3 the profiles and `asset-manifest.json` are produced by the real profiler from synthetic workflow files in `fixtures/synthetic/workflows/`. It deliberately includes:

- a post without a workflow file
- a post with no reactions or views (counted as 0; `null` is reserved for a stream with no reaction or view events)
- source-level edge cases that must never reach the posts: fake SIS ids, LTI fields and @example.edu emails, a duplicate event across pages, an off-topic post (with an email in its body) and a comment on it, a post just before Phoenix midnight, a comment on a deleted post, a `badge` event and an unknown `poll-vote` event
- a self-reply
- a prompt-injection attempt (post `syn-w2-p07`)

Its `issue.json` has `provenance.synthetic: true` and `sourceSummary.verified: false`. The script validates everything with Zod before writing.

## Checks

| Command (from `web/`) | Checks |
|---|---|
| `npm test` | (Phase 1) Ajv and Zod agree on the fixture; both reject 8 kinds of bad issue and personal fields on posts; metrics are deterministic and match the issue; edge cases (no posts, null counts, self-replies, stray profiles); every evidence ref resolves. |
| `npm run validate` | All schemas compile. Every `issue.json` and fixture validates. Public issues are approved. n8n exports have no credentials, `pinData`, `staticData` or webhook ids, and their Code nodes equal the generated bundles. The 03 export may contain only triggers, Code nodes and notes, and must save no production execution data. Tracked files contain no secret-shaped strings or non-example email addresses. |
| `npm test` (Phase 3, `lib/assets/assets.test.ts`) | Accept/reject for every file and structure case; stripping and counting of credentials, pinned, static and execution data, secrets, emails and webhooks; exact capabilities for 11 synthetic workflows; bounded vs unbounded retry; no inference from names; determinism; Ajv, Zod and the lite validator agree on manifests and profiles. `bundles.test.ts` runs the 03 bundles and requires the same output as the shared code. |
