# Yellowdig API capability report

> **Live verification: LIVE VERIFIED for authentication, community access and post/view event structure** (one capability probe, 10 events, 2026-11-01, run locally with `web/scripts/probe-yellowdig.ts`). Comments and reactions were **NOT OBSERVED** in that sample. The raw response was analysed in memory only: it was never written to disk, Git, fixtures, docs or n8n. No live student content, names or ids appear in this report.

## Status legend

- **DOCUMENTED**: stated in Yellowdig's public API spec (`https://data.yellowdig.app/swagger.json`, Engage API v0.6.0, read 2026-10-31 without credentials).
- **IMPLEMENTED**: code exists and passes unit tests with synthetic data or mocks.
- **TESTED WITH FIXTURE**: ran end to end in n8n Cloud on the synthetic fixture, or on pinned synthetic HTTP pages.
- **LIVE VERIFIED**: confirmed by a real, authorized request (the probe of 2026-11-01).
- **NOT OBSERVED**: documented, but absent from the 10-event probe sample.
- **NOT VERIFIED**: an assumption that must be checked against a real response.


## Live probe results (2026-11-01)

`GET /network/<configured>/community/<configured>/events?limit=10` with the `apikey` header from `.env.local`, in `yellowdig` mode with no fallback.

- **Response:** HTTP 200. 10 events: **3 post, 7 view**.
- **Page keys:** `data`, `limit`, `offset`, `record-count`, `cursor`, `at-end`. In this response `at-end` was false and a `cursor` was present.
- **Not followed:** the cursor was not followed, by design. This was not a full fetch.

| Capability | Status | Live structure (shapes only) |
|---|---|---|
| API authentication (`apikey` header) | LIVE VERIFIED | HTTP 200 |
| CIS 515 community access | LIVE VERIFIED | configured network and community accepted |
| Event id | LIVE VERIFIED | `event/squuid`: string (uuid). Every event also has `db/id`: integer. |
| Event type | LIVE VERIFIED | `event/type`: string (`post`, `view` observed) |
| ISO timestamp | LIVE VERIFIED | `date/iso`: ISO-8601 string with offset |
| System timestamp | LIVE VERIFIED | `system/created-at`: integer, epoch ms |
| Community reference | LIVE VERIFIED | `event/community`: object (`community/squuid`, `community/title`, `community/created-at`, `db/id`, plus sensitive LTI and Canvas fields) |
| Actor | LIVE VERIFIED | `event/actor`: object (`user/squuid` uuid, `user/firstname`, `user/lastname`, `user/community-role`, `db/id`, plus sensitive `user/username`, `user/primary-email`, `user/sis-ids`). There is no display-name field, so the display name is first + last. |
| Receiver | LIVE VERIFIED | `event/receiver`: same shape as the actor. Dropped by the privacy layer. |
| Post shape | LIVE VERIFIED | **Flat**: post fields sit on the event itself. The post's id is the post event's own `event/squuid`. |
| Post title | LIVE VERIFIED | `post/title`: string |
| Body text | LIVE VERIFIED | `post/body-text`: plain-text string |
| Post status, visibility, word count | LIVE VERIFIED | `post/status`: string; `post/visibility`: string; `post/word-count`: integer. Not used yet. Whether to exclude non-published or private posts is an open item. |
| Topics | LIVE VERIFIED | `post/topics`: array of `{ db/id: integer, topic/label: string }`. Present on 1 of the 3 sampled posts. Filter on `topic/label` (normalized), or pin the integer `db/id` once the Week 4 topic is identified. Whether `db/id` is stable over time is NOT VERIFIED. |
| View relationship | LIVE VERIFIED | `view/post`: array of `{ db/id, event/squuid }`. Its `event/squuid` is the target post's event id. |
| Comment and parent relationship | NOT OBSERVED | `post/parent` is documented but did not appear in the sample. The adapter treats it as the target post (candidate). |
| Reaction relationship | NOT OBSERVED | `reaction/post` is assumed by analogy with `view/post` (candidate). |
| Sensitive-field stripping | LIVE VERIFIED (detection) | The probe detected SIS-id, primary-email, username, Canvas course id and saved LTI 1.3 fields. They never pass the allowlist. |
| Attachments | NOT AVAILABLE THROUGH API | Handled through the protected upload (Phase 3) |

**Phase 2 adapter result.** The Phase 2 assumptions failed on live data. They expected nested `event/post` / `event/user` objects and `event/created-at`.

The minimization layer stopped the run with `UNEXPECTED_RESPONSE_SHAPE` ("no valid timestamp"). It failed loudly rather than passing bad data through, which is the intended behaviour. The probe saw the first gap; the adapter then also corrected the user, post, topic and view-target paths.

The centralized adapter (`lib/source/fields.ts`) now maps the live names listed above. Tests in the live shape use invented values only. The two affected n8n Code nodes (Check Capability, Collect Pages and Minimize) were rebuilt and reloaded, and the export was refreshed.

The corrected adapter has **not** been re-run against live data, because this task allowed exactly one request. The next live run (a capability probe or a Week 4 fetch) is its first live check.

## Endpoint and access

| Item | Status | Detail |
|---|---|---|
| `GET /network/{network}/community/{community}/events` | DOCUMENTED, IMPLEMENTED | "All events in a community. Sorted chronologically." Built in `lib/source/config.ts → eventsUrl`. |
| Header `apikey` | DOCUMENTED, IMPLEMENTED | Production: the n8n credential **`Yellowdig CIS 515`** (type Header Auth, header name `apikey`), attached to **Capability Probe** and **Fetch Event Pages**. It is **not created yet**. Create it by hand in the n8n UI: the MCP builder warns `PLAIN_GENERIC_AUTH` because its automated setup won't create plain Header Auth credentials, but the UI can. Local scripts read `YELLOWDIG_API_KEY` from `.env.local`. The key is never put in a node parameter, workflow JSON, pinned data, logs or docs. |
| OAuth `Bearer` token with `public-api` scope | DOCUMENTED | Not used. |
| Base URL `https://data.yellowdig.app` | DOCUMENTED | `YELLOWDIG_API_BASE_URL`. The API is read-only. |
| Network `carey-school-of-business`, community `6acd2896-…-cfd657470859` | NOT VERIFIED | Configuration values (`YELLOWDIG_NETWORK`, `YELLOWDIG_COMMUNITY_ID`, or the run config), not constants. |
| Responses 400, 401, 403, 404, 503 | DOCUMENTED | 401 means an invalid key. 403 means an OAuth token without `public-api`. |
| 429 and other 5xx | NOT VERIFIED | Not documented, but handled defensively. |

## Pagination

| Item | Status | Detail |
|---|---|---|
| Body `{ data, limit, offset, record-count, cursor, at-end }` | DOCUMENTED, IMPLEMENTED | `parsePage` checks the shape and fails on a `record-count` mismatch. |
| `limit` hard maximum 250 | DOCUMENTED, IMPLEMENTED | Config allows 1–250. |
| `cursor` preferred over `offset` | DOCUMENTED, IMPLEMENTED | Pages are followed by cursor only. A page that is not `at-end` and has no cursor fails with `UNEXPECTED_RESPONSE_SHAPE`. |
| `start`, `reverse` query params | DOCUMENTED | Not used, because the unit of `start` is not documented. The full community history is read and filtered by date. |
| Loop protection | IMPLEMENTED | Fails on a repeated cursor, a repeated page fingerprint, more than 2 empty pages in a row, or the page limit (`maxPages`, default 400). |
| Duplicates across pages | IMPLEMENTED | Removed by event id. A later copy with different content is counted as `conflictingDuplicates`. |

## Event fields (Phase 2 assumptions, superseded)

> Superseded by **Live probe results** above. Kept to show what was assumed before the live probe. The adapter keeps these names only as fallbacks for the synthetic fixture.

The spec documents the event **types** (`post`, `comment`, `reaction`, `view`, `badge`, `points-granted`) but not the fields inside an event. Every field name below is an assumption, kept in one place (`lib/source/fields.ts → FIELD_MAP`) with fallbacks.

| Need | Assumed field (first candidate) | Status |
|---|---|---|
| Event id | `event/squuid` | LIVE VERIFIED |
| Event type | `event/type` | NOT VERIFIED |
| Created timestamp | `event/created-at` (ISO with offset, or epoch) | NOT VERIFIED |
| Actor / display name | `event/user` → `user/squuid`, `user/display-name` (or first + last name) | NOT VERIFIED |
| Community | `event/community` | NOT VERIFIED, not used downstream |
| Post id, title, body | `event/post` → `post/squuid`, `post/title`, `post/body` (HTML) | NOT VERIFIED |
| Topics | `post/topics[]` → `topic/squuid`, `topic/name` | NOT VERIFIED |
| Parent post of a comment, reaction or view | `event/post` → `post/squuid` | NOT VERIFIED |
| Comment id, body, parent comment | `event/comment` → `comment/squuid`, `comment/body`, `comment/parent` | NOT VERIFIED |
| Receiver | `event/receiver` | NOT VERIFIED, dropped |
| Reaction and view counts | One event per reaction or view; counted by code | NOT VERIFIED |
| Multimedia attachments | Not assumed to be available | Handled in Phase 3 through the protected asset upload |

**Safeguard:** in live mode the capability probe fetches 10 events and records only field names and value types, never values. If an event id, type or timestamp cannot be found, the run stops with `FIELD_MAPPING_UNVERIFIED` before any full fetch.

## Sensitive fields

| Field kind | Status | Handling |
|---|---|---|
| `user/sis-ids` | NOT VERIFIED that it appears; detection IMPLEMENTED | Allowlist mapping drops it; counted in `privacyFieldsRemoved`; flagged by the probe. |
| Saved LTI fields (`saved-lti-fields`, `saved-lti-3-fields`) | Exist in the community filter spec; on events NOT VERIFIED | Same. The probe never descends into LTI maps, so custom key names aren't recorded. |
| Email-like fields and values | IMPLEMENTED | Fields dropped. Email addresses inside post or comment text are replaced with `[email removed]`. |
| Other identifiers (phone, login, canvas, external, token, …) | IMPLEMENTED | Dropped by the allowlist; key names matching a sensitive pattern are counted. |
| Raw user ids | IMPLEMENTED | Replaced with `u_` + 12 hex characters (salted SHA-256, the Phase 1 `pseudonymousId`). Live mode requires a `pseudonymSalt` of 32+ characters from a server-side secret. |

## Error handling

| Case | Behaviour | Status |
|---|---|---|
| 401 / 403 | No retry. `yellowdig` mode fails; `auto` falls back to the fixture with `YELLOWDIG_UNAUTHORIZED` / `YELLOWDIG_FORBIDDEN`. | IMPLEMENTED (unit and bundle tests) |
| 429, 500/502/503/504, network timeout | Exponential backoff (1 s, 2 s, 4 s, capped at 30 s; `Retry-After` wins), up to `maxRetries` (default 3). Then fail, or fall back in `auto`. | IMPLEMENTED (unit tests). In n8n, the retry loop (Classify → Wait → probe) is built but **not executed**, because pinned HTTP data cannot simulate errors. |
| Malformed JSON, unexpected shape, missing event id, field mapping | Fail loudly in every mode. Never falls back. | IMPLEMENTED |
| Page limit exceeded, pagination loop | `PAGINATION_LIMIT_EXCEEDED` / `PAGINATION_LOOP_DETECTED` | IMPLEMENTED |
| No matching posts | `NO_MATCHING_POSTS` unless `allowEmpty: true` | IMPLEMENTED |

## What was actually executed

| Run | What it proves | What it does not prove |
|---|---|---|
| n8n 02, execution 78 (fixture, after the Header Auth change and the dependency upgrades) | 01 → 02 still succeed. | Anything about Yellowdig. |
| n8n 01, execution 74 (fixture) | The fixture path in n8n produces a bundle byte-identical to the local pipeline. | Anything about Yellowdig. |
| n8n 01, execution 75 (`yellowdig` mode, **pinned synthetic HTTP pages**) | The Yellowdig branch wiring, capability probe, pagination assessment, privacy and filter work inside n8n. | That the real API returns this shape. The bundle says `liveSourceVerified: true` only because the workflow cannot tell pinned data from real data. No request left n8n. |
| n8n 02, execution 76 (calls 01 as sub-execution 77) | 01 → 02 hand-off and normalization match the committed fixture dataset exactly. | Same as above. |

## To verify live access

The first live step is a **capability probe of at most 10 events**, not a full download.

- **Never persisted:** the raw response is never written to Git, a fixture, documentation, n8n pinned data or a data table, and live student content is never pasted into docs.
- **Minimized immediately:** the privacy layer runs on it straight away.
- **Recorded instead:** only the sanitized field inventory and the sensitive-field flags.

1. Create the n8n credential `Yellowdig CIS 515` (Header Auth, header name `apikey`) and attach it to **Capability Probe** and **Fetch Event Pages**.
2. Run 01 with `sourceMode: "yellowdig"`, `yellowdigCredentialConfigured: true` and a server-side `pseudonymSalt`.
3. Review the `capability` report in the result (field names and types only). If live field names differ, change only the central adapter `lib/source/fields.ts → FIELD_MAP`. Then update the field-mapping and normalization tests, rebuild the n8n code (`npm run build:n8n`), reload the affected Code nodes and re-export.
4. Check whether reaction and view events exist, and confirm the post URL format before setting `POST_URL_FORMAT_VERIFIED`.
5. Only then mark rows **LIVE VERIFIED**.
