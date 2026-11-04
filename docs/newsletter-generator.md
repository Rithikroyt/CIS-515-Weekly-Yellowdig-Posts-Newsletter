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
- Production source mode is `yellowdig`: no fixture fallback. A dataset from the fixture is refused (`SOURCE_FALLBACK`).
- **Find Week Assets** (read-only) and **Collect Assets** gather the week's real assets in one canonical form (see *Images* below). The manifest and workflow profiles go into the editorial input, image metadata goes onto each post, and the image bytes travel beside the input as an image bank. No rows means coverage is unknown: workflow files and images show "–", not 0, and there are no profile-based claims. The synthetic test path uses the synthetic fixture's manifest and profiles instead.
- **Render Artifact** links posts only through the verified URL format, then applies the publication gate: every post must appear once in the every-build list, and a week with 4 or more posts needs at least 4 spotlights. Otherwise the run fails with `NEEDS_ASSETS` (no workflow files or screenshots for the week) or `NEWSLETTER_QUALITY_INCOMPLETE`, and the page says the week needs screenshots or workflow files.
- Provider is `gemini` for real data; the mock runs only on synthetic input from the manual trigger.
- Failures from the source config, 01, 02, editorial input, 04 or render go to **Fail Run**, which stores `failed` with a bracketed safe code or `GENERATION_FAILED`.
- Settings: `callerPolicy: none`, production execution data not saved. `validate-repo` enforces node types, the single header-auth webhook, sub-workflow targets (01, 02, 04 only) and the tables (`newsletter_runs`; `newsletter_assets` read-only).

## Issue structure (`web/src/lib/render/newsletter.ts`)

Matches the instructor's Week 2 reference (audit: [`newsletter-quality-gap.md`](newsletter-quality-gap.md)): preview text, masthead with week and dates, headline, dek, hero (one real post image, credited to its post), credibility line, four code-counted metrics (builds, comments, workflow files attached, images attached), introduction, **01 — Spotlights** (4–6), **02 — In brief: every build this week** (every post once, in 4–7 groups, with a one-line summary, comment count and "See the spotlight above"), most discussed and most generous, **03 — What to carry into Week N+1** ("What to carry forward" for Week 5: three titled lessons and 3–5 numbered actions), footer.

- Spotlights are chosen by code (`web/src/lib/editorial/curate.ts`). Score: suitable real image +5, workflow file +4, test result +3, two or more substantive comments +2, a control or fallback +2, verified link +1, and +1 for adding a new build group or label. When at least 4 posts have a suitable image, a spotlight must have one. At most 2 per group and per label while enough candidates remain. Comment counts and views never count. Labels must be supported by the workflow profile; otherwise "Useful Testing Pattern". The model's picks are suggestions.
- Each spotlight: group and label, title, author, comment count, "pipeline read from the workflow file" or "as described in the post", screenshot (max 340 px tall, linked to the post), architecture text, pipeline chips (only from a workflow file), control note, What the test showed, From the thread, Worth borrowing, Read the post link. Missing editor copy falls back to the evidence-screened post notes and discussion insights; the section is never dropped.
- Images: only `data:image/png|jpeg|webp` URIs of real post images, each shown only for its own post, scaled to fit the 544 px column and a height cap (never cropped), with the curator's or the intake alt text. No stock, decorative or AI-generated images.

## Design additions

On top of the reference layout: a **"This week in 60 seconds"** box under the metrics (an "In this issue" line counted
from what is rendered, plus the titles of the checked closing lessons); a **lead spotlight** (the first one: a taller
image, 420px, and its checked thread insight as a pull quote); and **compact text** (spotlight descriptions about 70
words, every-build lines about 32, both cut at complete sentences).

**Review credit.** A generated issue never claims a review. The credibility line ("…checked by code against the
week's posts") and the footer change to "reviewed by <name> before sending" only when the person finalizing ticks
"I have read and reviewed this issue" on the local page (or passes `--reviewer "Name"` to the finalize command).

## Images: inserted locally after generation (selected method)

Class images never leave the user's computer. Workflow 05 generates the full issue with **image slots**: invisible
markers (`<div class="img-slot" data-slot="…" style="display:none">`) that take no space, so the issue reads as
finished without images. Slot ids are fixed: `hero`, then `spotlight-1` … `spotlight-6` in spotlight order; each
spotlight slot also carries its post ref, author, title and verified post link.

Then, locally. The simplest way is the local page:

```bash
cd web
npm run newsletter:finalize-ui        # opens on http://127.0.0.1:5175/ (this computer only)
```

1. Choose the downloaded newsletter HTML and a folder for the week's images (outside the project).
2. Every slot is listed with the student, the project title and a link to the post. For each spotlight, open the
   post, right-click the screenshot, "Copy image address", paste it (several are fine) and press Download images.
3. Pick which image each spotlight uses and which one is the hero. Each image shows its size and hero fit
   ("Poor hero fit — portrait image" for tall ones; images are never cropped, so prefer a wide one for the hero).
4. Finalize Newsletter: the HTML and PDF are written into that folder.

The page binds to 127.0.0.1 only, rejects other host names, foreign origins and requests without its per-launch
token, keeps state in memory, writes only into the folder you choose (never inside the repository), sends no
cookies or credentials, has no analytics and loads nothing from the internet. It reuses the same downloader
(`remote-download.ts`), image preparation and slot filling as the commands below.

Or with commands:

```bash
cd web
npm run newsletter:finalize-images -- --html issue.html --list            # see the slots
npm run newsletter:finalize-images -- --html issue.html --assets <folder> [--out final.html] [--pdf final.pdf]
```

`<folder>/images.json` (keep the folder outside the repository; the script refuses paths inside it):

```json
{ "hero": { "file": "hero.png", "from": "spotlight-2", "alt": "…" },
  "spotlights": { "spotlight-1": "canvas.png", "post:<id>": { "file": "run.jpg", "alt": "…" } } }
```

Keys are slot ids or a spotlight's post ref; unknown keys stop the run. Each file must really decode as PNG, JPEG or
WebP (max 15 MB, 60 MP); orientation is applied, all metadata (EXIF, GPS, ICC, XMP, IPTC) is dropped and checked,
images are only scaled down (max 1088 px wide, never cropped) and embedded as `data:image/png|jpeg;base64` using the
renderer's own image blocks. `hero.from` names the spotlight the hero comes from, for its credit line and link.
`--pdf` uses the app's PDF path (scripts off, network blocked; set `CHROME_EXECUTABLE_PATH`). Empty slots stay
invisible.

Privacy guards in code: the Image Curator runs only on synthetic test data (never on real weeks); workflow 05 ignores
any stored image rows for real weeks; `assets:upload` no longer stores images in n8n (workflow files are still
checked and profiled there); `validate-repo` fails on committed image files or HTML with embedded images.

## Images: acquisition and curation (synthetic and fallback paths)

**Acquisition** (`web/src/lib/assets/intake.ts`). Two adapters produce one canonical image record (`assetRef, postRef, source, mimeType, width, height, role, altText`; bytes kept separately by `assetRef`):

| Adapter | Status |
|---|---|
| `yellowdig_attachment` | Unavailable. VERIFIED 2026-11-01: across all 819 events the API key can read, no field carries attachments, media, files or URLs, and post bodies are plain text. The website's own attachment requests were not inspected (they need a logged-in session). |
| `private_asset_store` | The fallback: `newsletter_assets` rows from `npm run assets:upload`. |

Priority per post: Yellowdig attachments when available, else the private store. Metrics count every validated attachment in the manifest (`metric:screenshots` = images attached, `metric:workflowFiles` = workflow files attached, `metric:profiledWorkflows` = profiled); the issue reports how many it actually shows separately.

**Curation.** The `image-curator` stage in workflow 04 sends the real image bytes of the strongest posts (at most 10 posts, 2 images each, 6 per call) to the model, which returns a classification (`workflow_canvas`, `execution_result`, `application_output`, `chart`, `supporting_visual`, `irrelevant`) and relevance, readability and suitability scores on a fixed 0–5 scale (0 none, 1 poor, 2 weak, 3 adequate, 4 good, 5 excellent), plus alt text. Code then validates it (an image must belong to that post; alt text passes the claim checks or is cleared) and decides: a usable image has relevance ≥ 3 and readability ≥ 2 and is not irrelevant; preference is canvas, then test result, then product output, then chart and other visuals. The hero is a second strong image from a spotlight post (so it does not repeat a spotlight image), else the strongest image elsewhere in the week. If the curator fails, images are chosen by fixed rules (readable size, intake role, order) and the issue still renders. Live-checked once with Gemini on synthetic drawn screenshots (2026-11-01): all six classified correctly.
- PDF: the same HTML through headless Chromium with JavaScript off and the network blocked. Spotlights, every-build entries and lessons carry `break-inside: avoid`.

## Private asset intake (`npm run assets:upload`)

Yellowdig's API does not return attachments, so screenshots and workflow files are supplied privately by the instructor or TA. Keep the files **outside the repository** (the script refuses a manifest inside it).

```json
{
  "week": 2,
  "assets": [
    { "postRef": "<Yellowdig post id>", "kind": "workflow_json", "path": "workflows/alex.json" },
    { "postRef": "<Yellowdig post id>", "kind": "post_image", "path": "shots/alex-canvas.png", "role": "spotlight", "altText": "n8n canvas: schedule, model, judge, Telegram approval" }
  ]
}
```

- `postRef` is the post id from the post's Yellowdig link (`?postId=…`), with or without `post:`. Every file is mapped explicitly; nothing is matched by name.
- `kind`: `workflow_json` or `post_image`. `role` (images): `hero` (at most one), `spotlight` or `supporting` (default). `altText` is required for images (8–200 characters). Paths are relative to the manifest, without `..`.

`cd web && npm run assets:upload -- --week 2 --manifest <path> [--dry-run]` checks every post id against the week's latest finished issue, stops on ambiguous mappings (unknown post, one file on two posts, two workflow files on one post), validates and profiles every file with the same shared code as workflow 03 (type, size and magic-byte checks, sanitizing, static profiling; workflow JSON is never executed), re-encodes up to two images per post with sharp (JPEG, max 1088 px wide, orientation applied, metadata stripped and verified), prints counts only, and replaces the week's rows in the private n8n Data Table `newsletter_assets` (`IrcjvrqKzY70YB8R`): one `bundle` row (manifest and profiles; the workflow files themselves are not stored) and one `image` row per stored image with its asset id and dimensions. Workflow 05 reads them on the next Generate. The workflow 03 logic runs at intake rather than inside workflow 05, so raw student workflow files never reach n8n.

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
4. Vercel (server-side only, never `NEXT_PUBLIC_*`): `N8N_GENERATE_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `PSEUDONYMIZATION_SALT`, `CHROMIUM_PACK_URL` (see `.env.example`). The salt (32+ random characters, kept stable) is sent with each generate request; workflow 05 checks it is present and passes it only to 01, which hashes Yellowdig user ids with it. It is never stored or returned. Without it, generate returns `SALT_NOT_CONFIGURED`.
5. Add the Week 3–5 topic labels to `weeks.ts` once those topics exist, after re-running the probe.

## Local checks

```bash
cd web
npx tsx scripts/render-synthetic.ts out.html [clean|revise-once|revision-limit]   # synthetic issue, mock model
CHROME_EXECUTABLE_PATH="<path to Chrome or Edge>" npm run dev                     # PDF downloads locally
```
