# CIS 515 Workflow Observatory

Weekly CIS 515 Yellowdig workflow posts become a reviewed class-wide dashboard and a weekly newsletter, the **CIS 515 Community Dispatch**. n8n does the collection and profiling; a Next.js site shows the approved issues.

> See what the class built, what failed, and what to carry forward.

## Feature status

| Area | Status |
|---|---|
| Web app: landing, weekly issues (Weeks 1–5), Explore, Workflow Atlas, Trends, Methodology | **Built.** Reads frozen `issue.json` files only. |
| Week 4 (assigned production issue) | **Not generated yet.** The site says so truthfully. |
| Week 2 | **Synthetic reference issue** — invented data, labelled on every page, used to show the format. |
| Standalone newsletter HTML, preview, download | **Built.** Rendered by code from `issue.json`; sandboxed preview. |
| Newsletter PDF | **Not produced.** The button shows "PDF not available". |
| n8n 01 Fetch, 02 Normalize, 03 Profile workflow assets | **Built**, fixture tested. Yellowdig API access is live verified; a full-week live run has not happened. |
| AI editorial drafting, evidence review, approval, publishing | **Not built** (Phases 4–5). |
| Admin console | **Development only** (no authentication yet); production builds show a locked page. |

Details: [docs/architecture.md](docs/architecture.md), [docs/frontend-architecture.md](docs/frontend-architecture.md), [docs/route-and-state-map.md](docs/route-and-state-map.md).

## Layout

```
web/                         Next.js app (deploy this folder)
web/public/issues/week-NN/   issue.json + newsletter.html per approved week
web/content/week-NN/         workflow profiles referenced by an approved issue (server-only)
web/src/lib/                 shared, tested logic (contracts, metrics, source, assets, issues, render)
n8n/                         generated Code-node bundles, SDK templates, sanitized workflow exports
schemas/                     JSON Schemas for every pipeline object
fixtures/synthetic/          synthetic test data (invented)
docs/                        architecture, contracts, privacy, frontend docs
```

## Run the site

```bash
cd web
npm install
npm run dev          # http://localhost:3515
npm test && npm run validate && npm run lint && npm run build
```

`npm run issues:render` re-renders each `newsletter.html` from its `issue.json` (a test fails if they drift).

## Deploy on Vercel

1. Import the repository in Vercel.
2. Set **Root Directory** to `web`. The framework preset is detected as Next.js; keep the default build command.
3. No environment variables are needed for the public site. Never add Yellowdig, n8n, LLM or GitHub keys as `NEXT_PUBLIC_*`.

The admin console stays locked on Vercel until authentication is built.

## Data handling

The repository is public. Never commit raw Yellowdig exports, student emails or SIS IDs, credentials, `.env.local`, or pinned execution data. `npm run validate` scans tracked files for secrets and emails. See [docs/privacy-and-publishing.md](docs/privacy-and-publishing.md).
