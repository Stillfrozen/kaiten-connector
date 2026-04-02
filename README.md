# Kaiten MCP Server

Remote [MCP](https://modelcontextprotocol.io/) server that connects [Claude](https://claude.ai/) to [Kaiten](https://kaiten.ru/) project management. Deploy your own instance, add it as a custom connector in Claude, and work with your boards, cards, sprints, and backlog directly from chat.

## What you can do

| Tool | Description |
|------|-------------|
| `list-boards` | List all spaces and boards, optionally filter by name |
| `get-board` | Board structure: columns, subcolumns, lanes, WIP limits |
| `list-cards` | Cards on a board with filters (column, member, state) |
| `get-card` | Full card details: description, comments, checklists, blockers, children, location history |
| `list-sprints` | All sprints with dates and status |
| `get-sprint-cards` | Cards in a specific sprint |
| `list-users` | All users, optionally filter by name |
| `get-current-user` | Currently authenticated user info |
| `backlog-analytics` | Board analytics: distribution by column, blockers, workload, aging, due dates |

## Quick start

### 1. Get your Kaiten API token

Go to your Kaiten profile page **Settings** > **API keys** > create a new token.

Your Kaiten host is the full domain from your browser URL bar, e.g. `mycompany.kaiten.ru`.

### 2. Deploy to Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.app/new)

1. Create a new project on [railway.app](https://railway.app/) > **Deploy from GitHub Repo**
2. Connect this repo (fork it first if needed)
3. Go to the service > **Variables** tab > add variables via **Raw Editor**:

```
KAITEN_HOST=mycompany.kaiten.ru
KAITEN_TOKEN=your-kaiten-api-token
OAUTH_CLIENT_ID=kaiten-claude
OAUTH_CLIENT_SECRET=generate-a-long-random-string
PORT=3000
```

> Generate `OAUTH_CLIENT_SECRET` with: `openssl rand -hex 32`
>
> **Important:** do NOT wrap values in quotes in Raw Editor — Railway treats them literally. Write `KAITEN_HOST=mycompany.kaiten.ru`, not `KAITEN_HOST="mycompany.kaiten.ru"`.

4. Go to **Settings** > **Networking** > **Generate Domain**
5. Wait for the deploy to finish
6. Verify: open `https://your-domain.up.railway.app/health` — should return `{"status":"ok"}`

### 3. Connect to Claude

1. Open [claude.ai](https://claude.ai/) > bottom-left profile icon > **Settings**
2. Go to **Integrations** > **Add custom connector**
3. Fill in:
   - **Name**: `Kaiten`
   - **Remote MCP server URL**: `https://your-domain.up.railway.app/mcp`
   - Open **Advanced settings**:
     - **OAuth Client ID**: same value as your `OAUTH_CLIENT_ID` (e.g. `kaiten-claude`)
     - **OAuth Client Secret**: same value as your `OAUTH_CLIENT_SECRET`
4. Click **Add**
5. Click **Connect** next to the new connector — a consent page will open
6. Click **Authorize** — you'll be redirected back to Claude

Done! Now in any Claude chat, you can ask things like:
- "Show my Kaiten boards"
- "What cards are on board 123?"
- "Give me backlog analytics for board 456"
- "Who's on the team?"

> **Note:** after each Railway redeploy, you need to reconnect the connector in Claude (Settings > Integrations > Kaiten > Connect), because in-memory OAuth tokens are reset on restart.

### Alternative: Deploy to Render

The repo includes `render.yaml` for one-click deploy on [Render](https://render.com/). Same environment variables apply.

### Alternative: Run locally

```bash
git clone https://github.com/Stillfrozen/kaiten-connector.git
cd kaiten-connector
npm install
npm run build

KAITEN_HOST=mycompany.kaiten.ru KAITEN_TOKEN=your-token npm start
```

For development with auto-reload:

```bash
KAITEN_HOST=mycompany.kaiten.ru KAITEN_TOKEN=your-token npm run dev
```

The server runs on `http://localhost:3000`. Auth is disabled when `OAUTH_CLIENT_ID` is not set.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `KAITEN_HOST` | Yes | Kaiten domain, e.g. `mycompany.kaiten.ru` (without `https://`) |
| `KAITEN_TOKEN` | Yes | Kaiten API token (get from profile > API keys) |
| `OAUTH_CLIENT_ID` | Recommended | OAuth client ID — any string, e.g. `kaiten-claude` |
| `OAUTH_CLIENT_SECRET` | Recommended | OAuth client secret — generate with `openssl rand -hex 32` |
| `CORS_ORIGIN` | No | Allowed CORS origin (default: `https://claude.ai`) |
| `PORT` | No | Server port (default: `3000`) |

## Security

The server implements [OAuth 2.1](https://oauth.net/2.1/) (Authorization Code + PKCE) compliant with the [MCP authorization spec](https://modelcontextprotocol.io/specification/draft/basic/authorization):

- Protected Resource Metadata discovery (RFC 9728)
- Authorization Server Metadata discovery (RFC 8414)
- Dynamic Client Registration (RFC 7591) — restricted in production to the pre-configured client only
- PKCE with S256 challenge method
- Access tokens expire after 7 days, refresh tokens after 90 days with rotation
- Redirect URI validation at both authorization and token exchange
- XSS protection on all HTML-rendered pages
- CORS restricted to configured origin (default: `https://claude.ai`)
- HTTPS required for redirect URIs (HTTP allowed only for localhost)

When `OAUTH_CLIENT_ID` is not set, authentication is disabled (for local development only).

Your Kaiten API token is stored only on the server — Claude never sees it. Claude authenticates via OAuth and only gets a time-limited access token.

## Tech stack

- TypeScript, Node.js 20+
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) — MCP protocol
- Express 5 — HTTP server
- Zod — input validation

## License

MIT
