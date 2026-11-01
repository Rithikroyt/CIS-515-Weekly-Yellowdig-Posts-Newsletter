# Yellowdig API capability report

> **Live verification: NOT VERIFIED.** No authorized request to the Yellowdig API has been made. The n8n credential does not exist yet, and `.env.local` has no key yet. Everything below marked IMPLEMENTED or TESTED WITH FIXTURE used synthetic data and mocks only. A pinned synthetic HTTP page in n8n is **not** a live run.

## Status legend

- **DOCUMENTED**: stated in Yellowdig's public API spec (`https://data.yellowdig.app/swagger.json`, Engage API v0.6.0, read 2026-10-31 without credentials).
- **IMPLEMENTED**: code exists and passes unit tests with synthetic data or mocks.
- **TESTED WITH FIXTURE**: ran end to end in n8n Cloud on the synthetic fixture, or on pinned synthetic HTTP pages.
- **LIVE VERIFIED**: confirmed by a real, authorized request. Nothing is in this state yet.
- **NOT VERIFIED**: an assumption that must be checked against a real response.

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

## Event fields

The spec documents the event **types** (`post`, `comment`, `reaction`, `view`, `badge`, `points-granted`) but not the fields inside an event. Every field name below is an assumption, kept in one place (`lib/source/fields.ts → FIELD_MAP`) with fallbacks.

| Need | Assumed field (first candidate) | Status |
|---|---|---|
| Event id | `event/squuid` | NOT VERIFIED |
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
