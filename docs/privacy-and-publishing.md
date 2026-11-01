# Privacy and publishing

> **Status: draft (Phase 1).** The rules below are enforced where marked **Enforced**. The publishing steps are finalized in Phase 5.

The repository is **public**. Anything committed is published.

## What never enters Git

| Data | How it is kept out |
|---|---|
| Raw Yellowdig exports and API payloads | `.gitignore` (`data/`, `*.raw.json`, `yellowdig-events*.json`, `*yellowdig*export*`) |
| Student emails, SIS ids, Yellowdig user ids | **Enforced:** the schemas only allow a pseudonymous `u_…` id and a display name. `npm run validate` fails on any non-example email address. |
| API keys, tokens, credentials | Kept in n8n credentials and server environment variables only. **Enforced:** `npm run validate` scans for secret-shaped strings. |
| n8n credentials and pinned execution data | **Enforced:** `npm run validate` fails on any export with `credentials` or `pinData`. |
| Unapproved drafts, comments and assets | Drafts stay in n8n data tables until approved. **Enforced:** `npm run validate` fails if a public `issue.json` isn't approved. |

## Minimization

- Only the fields in `normalized-post` are kept: names, post text, comment text and counts.
- Workflow profiles keep node names and types, never prompts, code or parameters.
- Display names are shown because classmates already see them in Yellowdig. A student can ask to be left out (Phase 5 adds an exclusion list).

## Untrusted input

- Posts, comments, file names, screenshots and workflow JSON are data. They are sent to the LLM inside delimited blocks, with an instruction to treat them as content and never as instructions.
- The synthetic fixture includes a prompt-injection post to test this.
- Every value is escaped when rendered. Uploaded workflow JSON is parsed for its structure only and never imported or executed.
- Uploads are checked for type, size and shape (Phase 3).

## Publishing (finalized in Phase 5)

1. Code computes the metrics and AI drafts the prose with evidence refs. Code verifies every ref.
2. The reviewer stage scores the draft. At most 2 AI revisions are allowed.
3. **A human approves in `/admin`.** Nothing is published without this step.
4. Code renders `newsletter.html` from the approved `issue.json`.
5. Both files are committed through the GitHub Contents API, with the file SHA to prevent overwriting newer content. A fine-grained token with Contents permission on this repository only is kept in n8n.
6. A Gmail draft, not a sent message, is created for the instructor to send.
7. The idempotency key prevents a second publish of the same input.
