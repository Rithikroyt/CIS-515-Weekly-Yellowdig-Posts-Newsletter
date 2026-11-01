# Routes and states

## Routes

| Route | Purpose | Rendering |
|---|---|---|
| `/` | What the Observatory is, how issues are made, week navigator, Week 4 status | Static |
| `/issues/[week]` | Weekly issue (Weeks 1–5): masthead, summary, numbers, patterns, themes, spotlights, failure path, discussion, all builds, takeaways, methodology, newsletter | Static (SSG, 5 pages); other weeks 404 |
| `/explore` | Search and filter all builds from displayable weeks (`?week=N` preselects) | Static + client filters |
| `/atlas` | Read-only workflow diagrams (`?w=wf_…` selects) with text alternative | Static + client graph |
| `/trends` | Per-week counts; gaps for weeks without data | Static |
| `/methodology` | Pipeline, provenance labels, what is verified today, privacy | Static |
| `/admin`, `/admin/runs/[runId]` | Development-only status console | Locked in production |
| `/issues/week-NN/newsletter.html`, `issue.json` | Standalone newsletter and issue data | Static files |

## Week states

| State | When | Public page shows |
|---|---|---|
| Published | `status: published`, real verified data | Full issue |
| Approved | `status: approved`, real verified data | Full issue |
| Reference issue | Approved but `synthetic: true` or source not verified | Full issue with a synthetic-data notice; excluded from real trends |
| In review | `review` or `revision_requested` | "In review" message only |
| Draft | `draft` | "Draft" message only |
| Failed | `failed` | "Run failed" message only |
| Unavailable | File fails the issue contract or is in the wrong week folder | "Unavailable" message only |
| Not generated | No file | "Not generated yet"; Week 4 adds the production note and points to the reference issue |

The site never falls back from one week to another and never shows unapproved content. The current data: Week 2 is a reference issue, and Weeks 1, 3, 4 and 5 are not generated.

## Other states

| Situation | Behaviour |
|---|---|
| Null reactions or views | "Unavailable", never 0 |
| No profiled workflow files | Pattern section says no patterns are shown |
| Screenshot referenced but not published | Count of unpublished screenshots; no broken image |
| Source URL not verified | "Source link not verified yet" |
| No PDF | Disabled "PDF not available" with a print hint |
| Newsletter file missing | Notice; the page itself stays the source |
| Fewer than two real weeks | Trends notice; no line drawn |
| Unknown route or week | Custom 404 |
| Render error | `error.tsx` with retry; nothing is regenerated |
