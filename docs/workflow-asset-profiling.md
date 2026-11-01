# Workflow asset profiling (Phase 3)

How manually supplied n8n workflow files and screenshots become an **asset manifest** and **workflow profiles**. The code is in [`web/src/lib/assets/`](../web/src/lib/assets), and n8n runs it as workflow **03 - Profile Workflow Assets**.

Uploaded workflow JSON is **data only**. It is parsed statically and never executed, imported into n8n, evaluated or followed. Nothing in it is treated as an instruction.

## Input

One batch per run:

```json
{ "week": 4, "knownPostRefs": ["<postId>", "..."], "assets": [
  { "postRef": "<postId>|null", "originalFilename": "my-flow.json", "mimeType": "application/json",
    "contentText": "<workflow JSON>", "uploadedAt": "2026-11-01T14:00:00Z" },
  { "postRef": "<postId>", "originalFilename": "canvas.png", "mimeType": "image/png", "contentBase64": "..." }
] }
```

`knownPostRefs` lists the post ids in that week's dataset. A file is linked to a post only when its `postRef` is in that list.

## Stages

Each stage is one n8n Code node and one exported function in `lib/assets/batch.ts`. `processAssetBatch` composes all four.

| Stage | Function | Does |
|---|---|---|
| Check Files | `stageCheckFiles` | Batch limit, metadata, extension + MIME + magic bytes, size before decoding, SHA-256, duplicates, explicit post matching, per-post limits. No JSON parsing. |
| Parse and Sanitize | `stageSanitize` | Bounded JSON parse (depth scan first), n8n shape check, structure checks, removal and redaction, final re-scan. Raw text is dropped here. |
| Profile Workflows | `stageProfile` | Node classification, safe graph, capabilities, retry analysis, chips. |
| Assemble and Validate | `stageAssemble` + schema checks | Manifest summary, then every profile and the manifest against `/schemas`. |

## Accepted files and limits

Configured in `lib/assets/limits.ts`.

| Kind | Extensions | MIME | Content check | Max size |
|---|---|---|---|---|
| Workflow | `.json` | `application/json`, `text/json`, `text/plain`, `application/octet-stream` or empty | Starts with `{` | 5 MB |
| Screenshot | `.png`, `.jpg`, `.jpeg`, `.webp` | Must match the extension | PNG, JPEG or WebP magic bytes | 10 MB |

Anything else is `UNSUPPORTED_FILE_TYPE`, including `.exe`, `.js`, `.ts`, `.py`, `.sh`, `.bat`, `.ps1`, `.html`, `.svg` and `.zip`.

Other limits: 10 workflows and 10 screenshots per post, 100 assets per batch, 500 nodes, 2000 edges, JSON depth 64, 250,000 inspected values, 20,000 characters inspected per string (100,000 for code). Every traversal is iterative.

## Statuses and reasons

| Status | Meaning |
|---|---|
| `PROFILED` | Workflow passed every check and has a profile. |
| `VALIDATED` | Screenshot passed every check. Screenshots are never interpreted (no OCR, no AI). |
| `REJECTED` | See `reason`. |
| `DUPLICATE` | Same kind and SHA-256 as an earlier asset; `duplicateOf` points at it. |
| `UNMATCHED_ASSET` | Valid file without a usable `postRef` (`NO_POST_REFERENCE` or `UNKNOWN_POST_REFERENCE`). A workflow is still profiled, with `postRef: null`. |

Rejection reasons: `INVALID_ASSET_METADATA`, `UNSUPPORTED_FILE_TYPE`, `MIME_MISMATCH`, `CONTENT_MISMATCH`, `EMPTY_FILE`, `WORKFLOW_TOO_LARGE`, `IMAGE_TOO_LARGE`, `TOO_MANY_FILES_FOR_POST`, `BATCH_LIMIT_EXCEEDED`, `INVALID_JSON`, `JSON_TOO_DEEP`, `NOT_N8N_WORKFLOW`, `TOO_MANY_NODES`, `TOO_MANY_EDGES`, `UNSUPPORTED_STRUCTURE`, `SECRET_POLICY_FAILURE`.

## Sanitization

- **Removed:** credentials (ids and names), `pinData`, `staticData`, execution data, webhook ids, and every node parameter. Profiles keep only labels, types, categories and the disabled flag.
- **Redacted and counted:** vendor-shaped tokens (OpenAI, GitHub, Slack, AWS, Google, JWT, Bearer/Basic, private keys), secret-named keys (`password`, `apiKey`, `token`, …), secret headers in `{name, value}` pairs, secrets in query strings and URL userinfo, quoted secret assignments in Code-node source, webhook URLs and paths, emails, and embedded base64 data.
- **Fail closed:** after sanitizing, the kept workflow is scanned again. Anything secret- or email-shaped that survives rejects the file with `SECRET_POLICY_FAILURE`.
- **Diagnostics are counts:** `profile.security` holds counts and flags only, never the values found.

## Classification

`lib/assets/classify.ts` holds the only node classifier. It maps every node type to one of 22 categories, plus an integration name (Gmail, Telegram, Google Sheets, …) and an AI provider for LangChain model nodes. Human-review nodes are recognised from structure: a `sendAndWait` operation, the Form node, or a Wait node that resumes on a webhook or form. Unknown types, including community nodes, are `other` and contribute no capabilities.

## Capabilities

Every capability needs structural evidence. Names alone never set one, and disabled nodes are ignored.

| Capability | Requires |
|---|---|
| `usesAI` | An enabled AI model or agent node |
| `usesMultipleAgents` | Two or more agent nodes |
| `usesCode` | A Code node |
| `hasValidationGate` | An IF/Switch/Filter fed by Code or AI, with an action, AI or human-review node downstream. A Code node alone is not a gate. |
| `hasCodeValidation` | A Code node feeding a validation gate, or a validator-named Code node feeding a gate |
| `usesLLMJudge` | An AI node feeding a validation gate (directly or through one Code node) with another AI node upstream of it |
| `usesHumanApproval` | A human-review node with outgoing connections |
| `usesRetry` / `hasBoundedRetry` | A graph cycle or node-level `retryOnFail`. Bounded only if every cycle has a Split In Batches node, a gate comparing a counter (attempt, retry, revision, `$runIndex`, …) with a number, or Code comparing a counter with a number. One unbounded cycle makes the workflow unbounded. |
| `hasExplicitFailureHandling` | An error output, an error-handling node, an error workflow setting, or a gate branch into a failure-named node |
| `hasFallback` | An error output into a non-error node that continues |
| `usesExternalAPI`, `usesEmail`, `usesDataStore` | Enabled nodes in those categories |
| `usesRAG`, `usesMemory` | Vector store or retriever nodes; memory nodes |

## Fixtures and tests

[`fixtures/synthetic/workflows/`](../fixtures/synthetic/workflows) holds 18 invented edge-case workflows plus the 7 Week 2 builds. They are generated by `npm run fixtures:synthetic` from `lib/assets/synthetic-workflows.ts`. Fake secrets read `SYNTHETIC-FAKE-…` and are built at runtime so no literal key assignment exists in source or bundles. Emails use `example.edu`. The 501-node workflow is built only in memory.

`lib/assets/assets.test.ts` covers acceptance and rejection, stripping and counting, exact capabilities per fixture, bounded vs unbounded retry, the "no inference from names" rule, determinism, schema agreement (Ajv, Zod, lite validator) and the publication policy. `src/n8n/bundles.test.ts` runs the 03 bundles in a simulated Code node and requires the same output as the shared code.

## Workflow 03

`03 - Profile Workflow Assets` (`L2fnEPtg0te7KTbG`). It is started by **When Called by Another Workflow** (callers limited to the owner's workflows; no public webhook) or by the manual trigger, which runs the synthetic batch. It contains only Code nodes: no AI, no HTTP, no credentials. Production executions save no data. `npm run validate` enforces those rules on the export.
