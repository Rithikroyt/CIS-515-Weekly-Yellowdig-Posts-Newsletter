# CIS 515 Weekly Yellowdig Newsletter

n8n workflows that turn weekly Yellowdig activity into a reviewed newsletter, plus a Next.js site that publishes each issue.

## Layout

```
.vscode/mcp.json                  # n8n MCP servers for VS Code
n8n/docker-compose.yml            # local n8n
n8n/workflows/newsletter.json     # exported workflow, credentials stripped
web/                              # Next.js app
web/public/issues/week-N/         # newsletter.html + issue.json per week
.env.example                      # copy to .env
```

## Run n8n

```bash
cp .env.example .env
docker volume create n8n_data
docker compose -f n8n/docker-compose.yml up -d
```

Open http://localhost:5678, then import `n8n/workflows/newsletter.json` and reattach the Gmail credential. Set the reviewer email in the **Approval Settings** node.

## Run the site

```bash
cd web
npm install
npm run dev
```

Issues are listed at http://localhost:3515.

## MCP

`.vscode/mcp.json` registers two servers. Click **Start** above each one and enter:

- **n8n**: the access token from Settings > Instance-level MCP
- **n8n-mcp**: an API key from Settings > n8n API

Each workflow must have MCP access enabled before clients can see it.

## Data handling

Raw Yellowdig exports contain student posts. Keep them in `data/raw/` (gitignored) and never commit them. Before committing a workflow export, remove credentials, pinned data, and personal email addresses.
