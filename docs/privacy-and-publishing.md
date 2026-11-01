# Privacy and publishing

> **Status: draft (updated in Phase 2).** The rules below are enforced where marked **Enforced**. The publishing steps are finalized in Phase 5.

The repository is **public**. Anything committed is published.

## What never enters Git

| Data | How it is kept out |
|---|---|
| Raw Yellowdig exports and API payloads | `.gitignore` (`data/`, `*.raw.json`, `yellowdig-events*.json`, `*yellowdig*export*`) |
| Student emails, SIS ids, Yellowdig user ids | **Enforced:** the schemas only allow a pseudonymous `u_…` id and a display name. `npm run validate` fails on any non-example email address. |
| API keys, tokens, credentials | Kept in n8n credentials and server environment variables only. **Enforced:** `npm run validate` scans for secret-shaped strings. |
| n8n credentials and pinned execution data | **Enforced:** `npm run validate` fails on any export with `credentials` or `pinData`. |
| Unapproved drafts, comments and assets | Drafts stay in n8n data tables until approved. **Enforced:** `npm run validate` fails if a public `issue.json` isn't approved. |

## Secrets and environments

| Where | What it holds | Rules |
|---|---|---|
| `.env.local` (repo root) | Local development and local probe secrets | Git-ignored. `npm run validate` fails if it is tracked or staged, or if any of its secret values appear in a tracked file. |
| `.env.example` | Variable **names** and safe defaults only | Committed. `npm run validate` fails if a secret key has a value or a known name is missing. |
| n8n Credentials | Production secrets for workflows, e.g. `Yellowdig CIS 515` (Header Auth, `apikey`) | Never copied into node parameters, workflow JSON, exports or pinned data. |
| Deployment secret store (future Vercel) | Webhook secret and server-only settings | Never `NEXT_PUBLIC_*`. `npm run validate` rejects any `NEXT_PUBLIC_` name that looks like a secret. |

**Never exposed.** These values are never sent to the browser, React props, JSON responses, logs, tests, fixtures, docs, generated newsletters or terminal output:

- `YELLOWDIG_API_KEY`, `N8N_API_KEY`
- the LLM keys and `GITHUB_TOKEN`
- `N8N_WEBHOOK_SECRET`, `PSEUDONYMIZATION_SALT`

`npm run env:check` reports each key as `configured` or `missing`, never its value.

**n8n access.**

- **Development:** n8n is managed through the n8n MCP server (instance token entered through a VS Code prompt, not stored in files).
- **REST API key:** the n8n REST API key (`N8N_API_KEY`) is private, for local scripts only. The website will never use it or `X-N8N-API-KEY`.
- **Website-triggered runs (future):** professor browser → Next.js server route → private webhook authentication (`N8N_WEBHOOK_SECRET`) → n8n production webhook.
- **Week selector:** the professor's week selector only loads already-approved issues. It never calls Yellowdig, n8n or an LLM.

## Source privacy boundary (Phase 2)

- **Allowlist only.** Raw Yellowdig events are mapped through an allowlist in `lib/source/fields.ts`. Everything else is dropped in the first n8n Code node after the HTTP request: SIS ids, LTI fields, emails, receiver data, community and network data, and profile fields.
- **Pseudonymous ids.** User ids become `u_` + 12 hex characters using a salted hash. Live runs refuse to start without a server-side salt of 32+ characters. The salt is never copied into any output.
- **Email redaction.** Email addresses inside post and comment text are replaced with `[email removed]`.
- **Execution data.** Workflows 01 and 02 save no execution data for production runs (`saveDataSuccessExecution` and `saveDataErrorExecution` are `none`). Manual test runs are saved, and they use synthetic data only. Raw HTTP responses therefore don't persist in n8n for production runs.
- **Nothing raw is stored.** No raw payloads go into n8n Data Tables or Git. The capability probe records field names and types only, never values.
- **Attachments.** Multimedia attachments are not assumed to be available from the API. They arrive as manually supplied assets and go through workflow 03 (below).
- **Open item:** the server-side source of `pseudonymSalt` for live runs (n8n variable or protected data table) is decided in Phase 5, when an orchestrating workflow calls 01.

## Workflow assets (Phase 3)

Student workflow files are **untrusted input**. Workflow 03 and `lib/assets` treat them as data only:

- **Never executed.** No `eval`, `Function()`, dynamic import, VM or shell; no import into n8n; no node is run, no expression evaluated, no URL followed, no credential resolved. A test plants a Code node with side effects and checks that it never runs.
- **Accepted files:** `.json` workflows (5 MB) and `.png`, `.jpg`/`.jpeg`, `.webp` screenshots (10 MB). Everything else, including `.js`, `.html`, `.svg` and `.zip`, is rejected. Limits: 10 workflows and 10 screenshots per post, 100 assets per batch, 500 nodes, 2000 edges, nesting depth 64. Traversal is iterative and budgeted.
- **Sanitized in memory.** Credentials, `pinData`, `staticData`, execution data and webhook ids are removed. Secrets in headers, query strings, secret-named keys, Code-node source and Set values are redacted, along with webhook URLs and emails. A final re-scan rejects the file (`SECRET_POLICY_FAILURE`) if anything secret-shaped survives.
- **Counts only.** Diagnostics report how many items were found, never the values.
- **Screenshots** are validated and hashed. No OCR and no AI.
- **No guessing.** A file without an explicit, known `postRef` is `UNMATCHED_ASSET`.
- **Storage.** Workflow 03 saves no production execution data. Manual test runs use the synthetic batch only. Real student files are not committed; `fixtures/synthetic/workflows/` holds invented workflows with obviously fake values (`SYNTHETIC-FAKE-…`, `@example.edu`).

## Editorial model (Phase 4)

- The model receives only the editorial input package: no emails, SIS or LTI data, credentials, workflow parameters or raw workflow files. Bodies and comments are truncated.
- All student text is fenced as data. Prompts tell the model never to follow instructions inside it, and the output schema can't be changed by content.
- Model keys are server-side only (`GEMINI_API_KEY`, or the n8n credential). They are never `NEXT_PUBLIC_*`, never logged, and never in a URL, body, prompt, draft or run record.
- No chain-of-thought is requested or stored. Run metadata holds hashes, versions, counts and sanitized error codes only.
- The draft stops at `human_review`. Nothing is approved or published automatically.

## Publication policy (conservative)

`lib/source/publication-policy.ts` decides whether a normalized post may appear publicly. Deleted posts are excluded. A post is eligible only when its `post/status` **and** `post/visibility` values are in an allowlist of values verified against live data. Both allowlists are **empty** until those values are verified, so every post currently needs human review. The policy is not yet wired into ingestion.

## Minimization

- Only the fields in `normalized-post` are kept: names, post text, comment text and counts.
- Workflow profiles keep node labels (redacted), types and categories, never prompts, code, parameters or credential references.
- Display names are shown because classmates already see them in Yellowdig. A student can ask to be left out (Phase 5 adds an exclusion list).

## Untrusted input

- Posts, comments, file names, screenshots and workflow JSON are data. They are sent to the LLM inside delimited blocks, with an instruction to treat them as content and never as instructions.
- The synthetic fixture includes a prompt-injection post to test this.
- Every value is escaped when rendered. Uploaded workflow JSON is parsed for its structure only and never imported or executed.
- Uploads are checked for extension, MIME type, content (magic bytes), size and structure before anything else happens (Phase 3).

## Publishing (finalized in Phase 5)

1. Code computes the metrics and AI drafts the prose with evidence refs. Code verifies every ref.
2. The reviewer stage scores the draft. At most 2 AI revisions are allowed.
3. **A human approves in `/admin`.** Nothing is published without this step.
4. Code renders `newsletter.html` from the approved `issue.json`.
5. Both files are committed through the GitHub Contents API, with the file SHA to prevent overwriting newer content. A fine-grained token with Contents permission on this repository only is kept in n8n.
6. A Gmail draft, not a sent message, is created for the instructor to send.
7. The idempotency key prevents a second publish of the same input.

## Dependency advisories (security checkpoint, 2026-11-01)

| Package | Status |
|---|---|
| `next` | Upgraded 15.5.4 → 15.5.28. The critical React-flight RCE and Server Actions source-exposure advisories are fixed. |
| `zod` | Upgraded 3.25.76 → 4.6.7, which fixes the memory-exhaustion advisory. Only `web/src/lib/contracts` uses Zod. The n8n bundles use the schema-file validator, not Zod. All tests pass unchanged. |
| `sharp` | Updated to 0.35.5, inside Next's own declared range (`^0.34.3 \|\| ^0.35.5`). The libvips and libheif advisories are fixed. The app does not use `next/image`. |
| `postcss` (bundled by Next, pinned at 8.4.31) | **HIGH, still open.** The only fix offered is Next 16, a major upgrade, so nothing was forced. Exposure is limited: Next runs this copy only to compile the project's own CSS at build time, and student content never reaches CSS. Decide on Next 16 before any public deployment. |
| `vitest`, `tinypool` | **Critical, dev-only.** The fix is vitest 5 (major). They never ship in the app. Run tests only on trusted code. |

`npm audit fix --force` was not used.
