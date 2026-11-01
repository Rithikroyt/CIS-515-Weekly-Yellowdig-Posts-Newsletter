# Yellowdig attachment source: decision record

**Status: decided (2026-11-01). Class images are inserted locally into the finished HTML.**

## Professor's method — VERIFIED FROM PROFESSOR

Professor Stone, on how the Week 2 reference issue was made:

- The majority of the newsletter was automated in an n8n workflow.
- He originally planned to automate image handling as well.
- He was concerned about uploading class photos to external software, so he added the class images to the HTML
  manually at the final stage.
- He said not everything needs to be built in n8n.

**Decision.**

| Option | Status |
|---|---|
| Yellowdig internal GraphQL attachment automation (`FetchBoardPostDetail`) | **RESEARCHED BUT NOT REQUIRED.** Investigation stopped; no 01A workflow, no session handling. The temporary test workflow is archived. |
| Local image insertion into the generated HTML (`npm run newsletter:finalize-images`) | **SELECTED IMPLEMENTATION.** |

This choice is about privacy and matching the professor's method, not about technical inability. Class images are
chosen by a person and embedded on their own computer; they are never sent to an AI model, n8n, Vercel, cloud
storage or GitHub. How it works is in `docs/newsletter-generator.md` (*Images*).

---

## Earlier analysis (kept for the record)

**Status before the decision: open.** We do not yet know how the instructor's n8n workflow obtained the post images and workflow files
embedded in the Week 2 reference issue (27 posts, 21 workflow files, 115 images, images inlined as Base64). This
document lists the candidate sources so the choice can be made once that is known.

## What is fixed regardless of the source

Every source must produce the canonical asset record already used downstream
(`web/src/lib/assets/intake.ts`, `CanonicalImage` and `WeekAssets`):

- one record per image: `assetRef`, `postRef`, `source`, `mimeType`, `width`, `height`, `role`, `altText`; bytes kept
  separately in the image bank by `assetRef`;
- workflow files go through the existing static checks, sanitizer and profiler (never executed); only the manifest
  and profiles are kept;
- `coverageComplete` is true only when the source holds every file of the week (otherwise week totals show "–").

From there the Image Curator, deterministic image choice, workflow profiles, editorial stages, evidence checks and
renderer are unchanged. Each new source is one adapter beside `yellowdigAttachmentAdapter` and
`privateAssetStoreAdapter`, merged by `mergeAssetSources` (Yellowdig attachments take priority per post).

## Candidate sources

| | 1. Yellowdig attachment endpoint (structured) | 2. Instructor Yellowdig export | 3. Attachment URLs from an internal Yellowdig request | 4. n8n Form / Webhook binary upload | 5. Cloud storage (Google Drive, OneDrive, …) |
|---|---|---|---|---|---|
| **n8n nodes** | HTTP Request (JSON), HTTP Request (binary download per file), Code (normalize) | Read the export: HTTP Request or a storage node, Compression (unzip), Extract From File, Code | HTTP Request (metadata), HTTP Request (binary per URL), Code | Form Trigger or Webhook with binary data, Code | Google Drive / Microsoft OneDrive node (list + download), Code |
| **Authentication** | Unknown. If it uses the documented API key: the existing `Yellowdig CIS 515` credential. If it needs a browser session: a session cookie or token, which we should not use without permission | Instructor account to create the export; storage credential to read it | Same as the request that returns the URLs; file URLs may be signed (time-limited) or session-bound | n8n form or webhook auth (a header secret, as workflow 05 already uses) | OAuth credential for the storage account, stored in n8n |
| **Fully n8n-based** | Yes | Yes once the export is in reach of n8n; creating the export is a manual step in Yellowdig | Yes | Yes (a person uploads through n8n's own form) | Yes once the files are in the folder |
| **Post ↔ attachment association automatic** | Likely (attachment records belong to a post) — NOT VERIFIED | Depends on the export format (a folder or column per post?) — NOT VERIFIED | Likely, if the URLs arrive inside the post record — NOT VERIFIED | No: the uploader names the post id per file (as our manifest does) | No, unless folder or file names carry post ids, and names are not trusted on their own |
| **Security and privacy** | Session-based access may break Yellowdig or ASU terms; ask Yellowdig/ASU first. Student files are untrusted: keep size, type and magic-byte checks; never execute workflow JSON | Exports may include emails and SIS ids: minimize on read, as workflow 01 does for events. Keep the export private and delete it after the run | Signed URLs must not be logged or stored; download, check and discard | Upload form must be private and authenticated; same file checks as the uploader | Least-privilege folder access; the course folder is the only scope |
| **Implementation changes** | New adapter + one n8n stage after workflow 01 (fetch per post, size-capped); workflow 03 profiling inside n8n | Export reader stage + adapter; mapping rules from the export's structure | Same as 1, plus URL expiry handling | Small: a form-backed variant of the existing intake (manifest fields per file) feeding the same Data Table | Storage stage + adapter; a manifest or naming rule to map files to post ids |
| **Verification status** | **NOT VERIFIED** (no such endpoint in the documented API) | **NOT VERIFIED** | **NOT VERIFIED** | **AVAILABLE FALLBACK** (n8n supports it; not built) | NOT VERIFIED (possible; not built) |

## Current state

| Source | Status |
|---|---|
| Yellowdig Events API (API key, `data.yellowdig.app`) | **VERIFIED — no attachments.** 2026-11-01: across all 819 events the key can read, no field carries attachments, media, files or URLs; post bodies are plain text; the API spec documents only events, points, communities and stats. |
| Yellowdig internal attachment request (what the website itself calls) | **IDENTIFIED, NOT VERIFIED WITH THE API KEY.** The website calls `POST https://galactus.yellowdig.app/graphql`, operation `FetchBoardPostDetail` (variables `boardId` = the community id, `postId`), with attachments at `data.findBoard.boardPost.attachmentsV2` (`assetUrl, description, id, mimetype, size, title, type, __typename`; images are `ImageAttachment`, e.g. `IMG`, `image/png`). In the browser it authenticates with the Yellowdig **session cookie and a CSRF token**; no API-key header is sent. Asset URLs open logged out (they redirect to `cdn-v2.yellowdig.app`). |
| Instructor export | **NOT VERIFIED.** Unknown whether Yellowdig offers one with images and files. |
| n8n binary upload (Form Trigger / Webhook) | **AVAILABLE FALLBACK.** Not built. |
| Private asset uploader (`npm run assets:upload` → `newsletter_assets`) | **IMPLEMENTED FALLBACK.** Paused for real Week 2 data; kept as is. |

## One-post test (2026-11-01)

Temporary workflow **TEST - Yellowdig Attachments** (`6A0bD9b4kVactaek`, inactive): Manual Trigger → test values →
HTTP Request (`FetchBoardPostDetail`, minimal attachment fields only, `Yellowdig CIS 515` credential, no cookies,
redirects off) → safe summary (types, MIME types, sizes, asset host; no URLs, text or names).

**Result: REQUEST_FAILED — blocked before sending.** n8n refused to attach the credential: *"This credential is
restricted from accessing galactus.yellowdig.app. Only the following domains are allowed: data.yellowdig.app."*
No request reached Yellowdig, so whether the API key works on the GraphQL endpoint is still unknown. Widening the
credential's allowed domains would send the API key to a second Yellowdig host; that needs the owner's explicit
approval. No-auth and session-cookie attempts were not made. Workflows 01–05 were not changed.

## What would settle it

Either of:

1. **The instructor's method:** the node or endpoint that retrieved attachments, whether authentication was an API
   key or a Yellowdig login, and ideally a sanitized workflow JSON or a screenshot of those nodes.
2. **Browser Network details** for one Week 2 post with an image and a JSON file: the request that returns the
   attachment information (method, host, path with ids replaced, response field names, whether it uses cookies or an
   API-key header) and the image URL's host. No cookie, token or key values.

Then: pick the source, confirm it is permitted, build its adapter, and verify one post end to end before any live run.
