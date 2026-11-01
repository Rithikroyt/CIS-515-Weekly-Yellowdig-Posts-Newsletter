# Frontend test report (2026-11-01)

## Automated

| Check | Result |
|---|---|
| `npm test` | 193 passed (13 new in `src/lib/frontend.test.ts`) |
| `npm run validate` | OK |
| `npm run lint` | Clean |
| `npm run build` | Passes; all public routes static |

`frontend.test.ts` covers:

- week states for Weeks 1–5
- synthetic or unverified data is always classed as a reference issue
- review, draft and failed issues are never displayed
- invalid files and week mismatches report paths but not values
- PDF availability follows whether the file exists
- only referenced profiles are loaded, and they contain no parameters or emails
- directory rows match the issue
- the committed `newsletter.html` equals a fresh render
- the renderer has no scripts, handlers or external resources, and escapes hostile input
- null metrics show as "Unavailable"
- the renderer and the graph layout are deterministic

## Browser checks (production server, headless Microsoft Edge)

Direct navigation returned HTTP 200 for `/`, `/issues/1`, `/issues/2`, `/issues/4`, `/explore`, `/explore?week=2`, `/atlas`, `/trends`, `/methodology`, `/issues/week-02/newsletter.html` and `/issues/week-02/issue.json`. `/issues/9` returned 404.

| Check | Observed |
|---|---|
| `/issues/4` | "Week 4 has not been generated yet", with the production note and a link to the reference issue |
| `/issues/2` | Synthetic-data notice, headline, metrics, sandboxed preview (`sandbox=""`), "PDF not available" |
| `/admin`, `/admin/runs/…` on the production build | "Not available on this deployment" |
| `newsletter.html` response | Served with the CSP and `sandbox` header |
| Desktop at 1440px | Home, Week 2 issue and Atlas reviewed |
| Mobile at 390px | Week 2 issue, Week 4 and Atlas reviewed (rendered in a 390px frame because headless Edge has a larger minimum window). A grid overflow and an unreadable graph scale were found and fixed. |
| Dark mode | Home reviewed with forced dark mode; a low-contrast badge was found and fixed |

Screenshots were taken locally for review and are not committed.

## Not tested

- Real screen readers.
- Automated end-to-end tests (no Playwright in the project; adding it was not approved).
- Reduced motion in a browser (implemented with a CSS media query only).
- A JavaScript-disabled run. Static pages render their content without JavaScript; filters, the Atlas and the mobile week select need it.
- Admin journeys: generate, upload, review, approve and publish have no backend yet.
