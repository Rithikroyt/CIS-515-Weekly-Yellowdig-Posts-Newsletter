# Newsletter generator

One page: select a week, generate, read, download.

```text
Browser ── POST /api/generate {week} ──> Next.js server ── authenticated webhook ──> n8n 05 - Generate Newsletter
        <─ {runId, status} ──────────                                              ├─ 01 Fetch Events (Yellowdig only)
Browser ── GET /api/generate/[runId] (every 3 s, real state) ──> 05 status        ├─ 02 Normalize and Join
Browser ── iframe / download: GET /api/newsletter/[runId] ──> 05 artifact          ├─ 04 Editorial Intelligence (Gemini)
Browser ── GET /api/pdf/[runId] ──> stored HTML ──> headless Chromium ──> PDF      └─ render → newsletter_runs table
```

## Routes (`web/src/app`)

| Route | Does |
|---|---|
| `/` | `NewsletterGenerator` → `WeekSelector`, `GenerationStatus`, `NewsletterPreview`, `DownloadActions` |
| `POST /api/generate` | Body must be exactly `{week}`, an integer 1–5. Weeks without a verified topic return `WEEK_NOT_CONFIGURED`. Returns `{runId, week, status}`. |
| `GET /api/generate/[runId]` | The stored run state. Unknown or malformed ids → 404. |
| `GET /api/newsletter/[runId]` | The stored HTML (`?download=1` → attachment `CIS515-Week-N-Newsletter.html`). The preview iframe uses the same route, so preview and download are the same bytes. Served with `CSP: default-src 'none'; …; sandbox`. |
| `GET /api/pdf/[runId]` | PDF of the stored HTML (`CIS515-Week-N-Newsletter.pdf`). Never accepts HTML from the browser. JavaScript off, every non-`data:` request aborted. A PDF failure returns a safe code and leaves the run and its HTML untouched. |

The browser never sees `N8N_GENERATE_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `N8N_API_KEY`, `YELLOWDIG_API_KEY` or `GEMINI_API_KEY`. The secret travels only in the `x-cis515-webhook-secret` request header from the server to n8n.

## Run states

`queued → fetching_yellowdig → generating_editorial → rendering → ready | ready_with_omissions | failed`

These are the states workflow 05 actually writes. Normalizing (inside 02) and evidence review (inside 04) run within those steps and are not reported separately; there are no timers or percentages. A run that has not moved for 30 minutes is reported as `failed` (`RUN_STALE`). Clicking Generate twice, or a second request for a week whose run is still in progress, returns the existing run.

`ready_with_omissions`: evidence review left unsupported or conflicting statements. They are omitted from the newsletter (never shown as "withheld" text), and the footer says how many. Partially supported statements are kept. The footer says the issue is AI-drafted and evidence-checked; nothing says instructor-approved.

## Workflow 05 (`tmFCkgQ3SxeJeGxw`)

Code entries: `web/src/n8n/nodes/wf05.ts`, logic in `web/src/lib/runs.ts`, `web/src/lib/weeks.ts`, `web/src/lib/render/newsletter.ts`. SDK template: `n8n/sdk/05-generate-newsletter.template.js` (fully expanded; the SDK parser allows no helper functions). Export: `n8n/workflows/05-generate-newsletter.json`.

- One POST webhook, path `cis515-newsletter`, Header Auth, `responseMode: responseNode`. Actions: `generate {week, runId}`, `status {runId}`, `artifact {runId}`. Only the body is read.
- Production source mode is `yellowdig`: no fixture fallback. A dataset from the fixture is refused (`SOURCE_FALLBACK`). No workflow files are uploaded in this flow, so there are no workflow profiles and no profile-based claims.
- Provider is `gemini` for real data; the mock runs only on synthetic input from the manual trigger.
- Failures from the source config, 01, 02, editorial input, 04 or render go to **Fail Run**, which stores `failed` with a bracketed safe code or `GENERATION_FAILED`.
- Settings: `callerPolicy: none`, production execution data not saved. `validate-repo` enforces node types, the single header-auth webhook, sub-workflow targets (01, 02, 04 only) and the table.

## Storage: `newsletter_runs` Data Table (`uWls7HHm5Ek7u1SQ`)

Columns: `run_id, week, status, error_code, omitted_claims, html` (+ system `createdAt`, `updatedAt`). Capacity was measured before choosing this table: string cells of 64 KB, 256 KB, 1 MB and 4 MB round-tripped intact through the n8n API (probe table deleted). A rendered issue is about 30 KB without images. The project's total Data Table quota on n8n Cloud was not measured; prune old rows if it grows.

## Week mapping (`web/src/lib/weeks.ts`)

Posts are selected by the structured `post/topics` label. Labels come only from live observation (controlled probe, 2026-11-01, `web/scripts/probe-yellowdig-topics.ts`):

| Week | Topic label | Status |
|---|---|---|
| 1 | `Week 1 - Weekly Workflow Show-and-Tell on Yellowdig` | verified live (posts 2026-10-14 … 10-28) |
| 2 | `Week 2 - Weekly Workflow Show-and-Tell on Yellowdig` | verified live (posts 2026-10-24 … 10-28) |
| 3–5 | not set | the topics do not exist in Yellowdig yet → `WEEK_NOT_CONFIGURED` |

## Yellowdig verification (second controlled probe)

4 cursor pages, 819 events, analysed in memory, nothing written to disk:

- Event types: post 58, view 516, reaction 79, badge 17, comment 149.
- Privacy minimization succeeded on live data (6,036 sensitive fields removed, 1 email redacted).
- **Comments: live verified.** All 149 comments carry a `postId` that matches a post in the sample (`post/parent`). Reply threading (`post/reply-to`) is not mapped to `parentCommentId`.
- **Reactions: live verified, with a caveat.** `reaction/post` → `postId` on all 79; 53 point to posts and 26 point to comments. Reactions on comments therefore land in `postId` with a comment id.
- Topics: see the table above.

## Setup still required (owner)

1. In n8n, create a **Header Auth** credential named `CIS 515 Newsletter Webhook`: name `x-cis515-webhook-secret`, value a random string of 32+ characters. Select it on the **Newsletter Webhook** node. n8n currently auto-attaches the existing `Yellowdig CIS 515` credential there (it is the only Header Auth credential); it must be replaced before publishing.
2. Attach the Gemini (`googlePalmApi`) credential to **Gemini generateContent** in workflow 04, and confirm workflow 01's Yellowdig credential.
3. Publish workflow 05. Its production URL is `https://rithikroy18.app.n8n.cloud/webhook/cis515-newsletter`.
4. Vercel (server-side only, never `NEXT_PUBLIC_*`): `N8N_GENERATE_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `CHROMIUM_PACK_URL` (see `.env.example`).
5. Add the Week 3–5 topic labels to `weeks.ts` once those topics exist, after re-running the probe.

## Local checks

```bash
cd web
npx tsx scripts/render-synthetic.ts out.html [clean|revise-once|revision-limit]   # synthetic issue, mock model
CHROME_EXECUTABLE_PATH="<path to Chrome or Edge>" npm run dev                     # PDF downloads locally
```
