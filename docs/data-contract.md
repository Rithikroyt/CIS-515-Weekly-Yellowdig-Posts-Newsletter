# Data contract

Four JSON Schemas (draft 2020-12) in [`/schemas`](../schemas) define every object that moves through the pipeline. [`web/src/lib/contracts`](../web/src/lib/contracts/index.ts) holds Zod copies of them and the TypeScript types. Tests check that both validators accept the fixture and reject the same bad inputs.

| Schema | Produced by | Consumed by |
|---|---|---|
| `normalized-post` | 02-normalize-and-join | metrics, editorial pipeline |
| `workflow-profile` | 03-parse-workflow-assets | metrics, spotlights, atlas |
| `asset-manifest` | admin upload | 03, renderer |
| `issue` | 04 + 05, after human approval | web issue, `newsletter.html` |

All objects use `additionalProperties: false`. A field that isn't listed is rejected rather than ignored.

## normalized-post

One Yellowdig post with its comments joined.

- **Pseudonymous people.** `author.id` and each comment's author id are `u_` followed by 12 hex characters: a salted SHA-256 of the source user id (`pseudonymousId` in [`ids.ts`](../web/src/lib/ids.ts)). Only `id` and `displayName` are allowed, so emails and SIS ids cannot pass validation.
- **`body` is plain text.** HTML is stripped during normalization and escaped again when rendered.
- **Nullable counts.** `reactionCount` and `viewCount` are `null` when the source doesn't provide them. They are never `0` by default.
- **Source refs.** `sourceRefs` lists the evidence references this post can support, such as `post:<id>` and `comment:<id>`.

## workflow-profile

Computed by code from a workflow's JSON. The workflow itself is never executed.

- Credentials and `pinData` are removed before profiling. `sanitization` records how many were removed, plus any flags.
- Node ids are re-labelled `n0…nN` and only `name`, `type`, `category` and `position` are kept. Node parameters, including prompts and code, are not stored.
- `signals` holds the reliability patterns found: code checks, human review, a bounded retry with its maximum, fallback, error handling, an LLM judge with its score threshold, multiple agents, RAG and memory.
- `chips` is the main path shown as at most 7 labelled steps.

## asset-manifest

Screenshots and workflow files an admin attaches to posts for one week.

- File names are checked against image and `.json` patterns.
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

## Synthetic fixture

`fixtures/synthetic/week-02/` is built by `npm run fixtures:synthetic`, from [`web/scripts/make-synthetic-week2.ts`](../web/scripts/make-synthetic-week2.ts). It has 8 invented posts, 13 comments and 7 workflow profiles. It deliberately includes:

- a post without a workflow file
- a post with null reactions and views
- a self-reply
- a prompt-injection attempt (post `syn-w2-p07`)

Its `issue.json` has `provenance.synthetic: true` and `sourceSummary.verified: false`. The script validates everything with Zod before writing.

## Checks

| Command (from `web/`) | Checks |
|---|---|
| `npm test` | Ajv and Zod agree on the fixture; both reject 8 kinds of bad issue and personal fields on posts; metrics are deterministic and match the issue; edge cases (no posts, null counts, self-replies, stray profiles); every evidence ref resolves. |
| `npm run validate` | All schemas compile. Every `issue.json` and fixture validates. Public issues are approved. n8n exports have no credentials or `pinData`. Tracked files contain no secret-shaped strings or non-example email addresses. |
