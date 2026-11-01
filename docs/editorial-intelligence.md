# Editorial intelligence (Phase 4)

How deterministic weekly data becomes an evidence-reviewed editorial draft, ready for a person to review. The code is in [`web/src/lib/editorial/`](../web/src/lib/editorial), and n8n runs it as workflow **04 - Editorial Intelligence**.

```text
SOURCE DATA → DETERMINISTIC FACTS → AI INTERPRETATION → EVIDENCE CHECK → BOUNDED REVISION → HUMAN REVIEW
```

The model never supplies counts, identities, capabilities, dates, URLs, comments or graphs. It writes prose claims that cite references, and code checks every claim against the input package.

## Input package (`schemas/editorial-input.schema.json`)

`buildEditorialInput()` builds it from the week dataset (Phase 2), the asset manifest and the workflow profiles (Phase 3):

- **Metrics:** computed by `lib/metrics.ts` and flattened to `metric:…` refs: posts, comments, people, signals, per-capability counts and services.
- **Posts:** each has a `post:…` ref, title, author display name with a `person:u_…` ref, body (truncated to 2,500 characters), its `workflow:…` profile ref and its comments (up to 25 per post, 600 characters each, each with a `comment:…` ref).
- **Workflow profiles:** name, counts, the 16 capabilities, the main path, integrations, retry facts and score threshold. No parameters, prompts or code.
- **Source status:** the comment and reaction mappings are marked not live verified.

It never contains emails, SIS or LTI data, credentials, pinned data or raw workflow content. All titles, bodies, comments and step labels are treated as **untrusted**.

## Stages and prompts

Prompts live in `lib/editorial/prompts.ts`. Each has a `promptId`, `promptVersion`, input and output schema versions, and the `$defs` entry its output must match. Every run records the prompt versions it used.

| Stage | Prompt | Output (`editorial-draft.schema.json#/$defs`) | Deterministic rules applied after |
|---|---|---|---|
| Post extractor (batched by size) | `post-extractor@1.0.0` | `postNotesOutput` | Unknown refs are dropped. Each capability claim gets a `deterministicStatus` (confirmed, not-confirmed or no-workflow-file); "workflow-profile" claims the profile doesn't confirm are recorded as conflicts. |
| Theme analyst | `theme-analyst@1.0.0` | `themesOutput` (0–7) | At least 2 posts per theme unless marked `notable-single-example`; unknown refs dropped |
| Spotlight, failure path and pattern selector | `spotlight-pattern-selector@1.0.0` | `selectionOutput` | Labels come from a fixed, non-ranking list and must be supported by the profile. The failure path needs this post's own workflow, a control in the profile and same-post evidence, otherwise `null`. Pattern steps must occur, in order, in a cited workflow's main path. |
| Discussion analyst (skipped when there are no comments) | `discussion-analyst@1.0.0` | `discussionOutput` | Each insight must cite a comment |
| Newsletter editor | `newsletter-editor@1.0.0` | `newsletterOutput` | Full claim review (below) |
| Evidence reviewer (model) | `evidence-reviewer@1.0.0` | `reviewOutput` | Runs only after code checks pass. It can lower a claim's status, never raise it, and never rewrites text. |
| Reviser | `newsletter-reviser@1.0.0` | `newsletterOutput` | Full claim review again |

Each prompt starts with shared guardrails. Source records may contain instructions, which must never be followed. The schema, evidence, privacy and ranking rules can't be overridden. The output must be JSON only. Source data sits inside `<source_data>` with `<` escaped as `<`, so student text can't close the fence.

## Evidence controls (`lib/editorial/checks.ts`)

Every newsletter claim (`{text, evidenceRefs}`) and every title is checked by code:

| Check | Fails when | Code | Status |
|---|---|---|---|
| References | A ref isn't in the input package | `MODEL_UNKNOWN_REFERENCE` | unsupported |
| Numbers | A number isn't a cited metric value and doesn't appear in a cited source; a count like "13 workflows" doesn't equal a cited metric | `MODEL_NUMERIC_CONFLICT` | conflict |
| Attribution | A student is named without citing their post or comment | `MODEL_ATTRIBUTION_CONFLICT` | conflict |
| Capabilities | Text asserts approval, judges, bounded retry, fallback, agents, code validation, RAG, failure handling or memory that no cited profile shows (hedged wording is partial; with no workflow file it is partial) | `MODEL_CAPABILITY_CONFLICT` / `MODEL_UNSUPPORTED_CLAIM` | conflict or partial |
| Trend | A cross-week comparison (no prior-week data is provided) | `MODEL_TREND_UNSUPPORTED` | unsupported |
| Over-broad | "every / all / most students…" without a cited metric | `MODEL_OVERBROAD_CLAIM` | unsupported |
| Style | Hype phrases; ranking language ("best workflow", "weakest") | `MODEL_STYLE_VIOLATION` | partial or conflict |
| Structure | A newsletter theme, spotlight, pattern or failure path that isn't a validated candidate | `MODEL_UNSUPPORTED_CLAIM` / `PATTERN_STRUCTURE_MISMATCH` / `FAILURE_PATH_UNSUPPORTED` | unsupported |

Model output must parse as JSON (`MODEL_INVALID_JSON`), match its schema exactly with no extra fields (`MODEL_SCHEMA_INVALID`), and stay under 200,000 characters (`MODEL_OUTPUT_TOO_LARGE`). These failures, `MODEL_TIMEOUT` and `MODEL_PROVIDER_ERROR` all **fail the run**. Nothing invalid reaches the next stage. The model has no field for metrics; the draft's `metrics` are copied by code from the input.

## Bounded revision and states

```text
draft → evidence_review ─pass→ (model review) ─pass→ human_review
                        └fail→ revision_requested → evidence_review   (at most 2 revisions)
after 2 failed revisions → human_review with REVISION_LIMIT_REACHED
any invalid output / provider failure → failed
```

- At most 2 revisions, plus a hard budget of 30 model calls (`STEP_BUDGET_EXCEEDED`).
- Unsupported or conflicting claims that survive are **withheld**: their text is replaced and the original moves to `review.unresolved` for the human reviewer. Partially supported claims are kept but listed there too.
- Nothing is ever set to `approved` or `rejected` in Phase 4. Those states belong to the human review step (Phase 5).
- Provenance: `review.claims[]` records `claimId` (its path), `method: "ai-drafted"`, `evidenceRefs`, `reviewStatus` and codes for every claim.

## Run metadata, idempotency and the run table

`draft.run` records the run id, parent run, idempotency key, status history, provider, model, prompt versions, input hash, output hash, start and finish times, revision count, post and profile counts, the model-call log (stage, prompt and version, ok or error code), evidence failures and a sanitized error. It holds no keys, no headers, no chain-of-thought and no source text. `runRow(draft)` flattens it for a future `editorial_runs` Data Table with these columns: `run_id, parent_run_id, week, status, input_hash, idempotency_key, provider, model, prompt_versions, post_count, workflow_profile_count, revision_count, model_calls, evidence_failures, started_at, completed_at, error_code, error_summary`. The table itself isn't created yet.

The idempotency key is `course:term:week-NN:inputHash16`. `startRun` refuses a second run for the same key unless the earlier run failed or was rejected, `force` is set, or it is a human-requested revision (`parentRunId` + `feedback`). That revision gets a new run id linked to its parent.

## Providers

`selectProvider(env)` reads `EDITORIAL_AI_PROVIDER` and supports exactly one provider, with no fallback:

| Value | Behaviour |
|---|---|
| `gemini` | Requires `GEMINI_API_KEY` (server-side only). Model from `EDITORIAL_AI_MODEL`, default `gemini-3.5-flash-lite` with low thinking (`gemini-2.5-flash` now returns 404 for new keys; `gemini-3.5-flash` allows only 20 free-tier requests a day, and a newsletter needs 6-10). JSON response mode. In n8n the call retries up to 3 times, 5 s apart, on HTTP errors such as 503 "high demand". A response that is not valid JSON or breaks its schema is re-requested once with the error attached. Live verified on synthetic input only (2026-11-01). |
| `mock` | Synthetic fixture responses (`fixtures/synthetic/editorial/week-02/mock-responses.json`). Refused in production. In n8n it runs only on input whose source is `synthetic-fixture`. |
| `openai`, `anthropic` | Reserved; `PROVIDER_NOT_IMPLEMENTED`. |
| unset / other | `PROVIDER_NOT_CONFIGURED` |

Keys are never `NEXT_PUBLIC_*`, never logged and never placed in URLs or bodies. Gemini receives the key only in the `x-goog-api-key` header; in n8n the key comes from the n8n credential.

## Workflow 04

`04 - Editorial Intelligence` (`U2uwnaV09NohVmjn`). It is started by another workflow or by the manual trigger with a pinned synthetic input. **Editorial Step** runs the shared state machine. Model calls go through **Mock Model (synthetic only)**, or through **Gemini generateContent** (HTTP Request with the `googlePalmApi` credential, which isn't attached in the repository export) followed by **Attach Gemini State**. A **Step Budget Left?** guard ends in Stop and Error if the 30-call cap is ever exceeded. There is no webhook, no LangChain node and no publishing node, and production executions save no data. The test-only **Synthetic Input** node builds the Week 2 synthetic input for manual runs. Synthetic execution 87 (mock, `revise-once`) reached `human_review` after one revision, with input hash, output hash and run ID identical to the local runner.

Bundles larger than the MCP tool can carry are uploaded with `npx tsx scripts/n8n-sync-code.ts wf04` (from `web/`). It replaces only Code-node `jsCode` with the generated bundles through the n8n public API, reading `N8N_API_KEY` from `.env.local` without printing it. Validation, tests and exports still go through the MCP server.

## Legacy

`n8n/src/parse-workflows.js` is the pre-Phase 3 prototype parser. It is marked legacy and is no longer used; remove it during cleanup.
