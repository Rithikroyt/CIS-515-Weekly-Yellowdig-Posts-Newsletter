# web — CIS 515 Workflow Observatory

The Next.js app. See the [root README](../README.md) for feature status and Vercel setup, and [docs/frontend-architecture.md](../docs/frontend-architecture.md) for how it works.

| Command | Purpose |
|---|---|
| `npm run dev` | Local site at http://localhost:3515 |
| `npm test` | Unit tests (contracts, metrics, source, assets, bundles, frontend data) |
| `npm run validate` | Schemas, fixtures, exports, secret and email scan |
| `npm run lint` / `npm run build` | ESLint / production build |
| `npm run issues:render` | Re-render `public/issues/week-NN/newsletter.html` from `issue.json` |
