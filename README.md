# Kaiten MCP Server

Remote [MCP](https://modelcontextprotocol.io/) server that connects [Claude](https://claude.ai/) to [Kaiten](https://kaiten.ru/) project management. Deploy your own instance, add it as a custom connector in Claude, and work with your boards, cards, sprints, and backlog directly from chat.

## What you can do

| Tool | Description |
|------|-------------|
| `list-boards` | List all spaces and boards, optionally filter by name |
| `get-board` | Board structure: columns with types and WIP limits, subcolumns, lanes |
| `list-cards` | Cards with flexible filters: board, column, lane, member, owner, sprint, tags, state, dates, overdue, ASAP, text search |
| `search-cards` | Search cards across all boards by text query |
| `get-card` | Full card details: description, comments, checklists, blockers, children, parents, external links, files, time logs, custom properties, location history |
| `get-card-blockers` | Detailed blocker info: reason, blocking card, released status, due date |
| `get-card-time-logs` | Time tracking logs: who spent how much time, on which date, with what role |
| `get-card-external-links` | External links attached to a card |
| `list-sprints` | Sprints with filtering by active status, velocity, committed points |
| `get-sprint-cards` | Cards in a specific sprint |
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
OWNER_PASSWORD=set-a-strong-password
OAUTH_REDIRECT_URIS=https://claude.ai/api/mcp/auth_callback
PORT=3000
```

> Generate `OAUTH_CLIENT_SECRET` with: `openssl rand -hex 32`
>
> Generate `OWNER_PASSWORD` with: `openssl rand -base64 24` (or pick a long passphrase you can remember — you'll type it each time you reconnect Claude).
>
> `OAUTH_REDIRECT_URIS` is a comma-separated whitelist of allowed OAuth callback URIs. For Claude custom connectors, use `https://claude.ai/api/mcp/auth_callback`. If Claude shows a different URI during the authorize flow, add it here and redeploy.
>
> **Raw Editor quirk:** Railway stores values literally, including any surrounding quotes you paste. The server defensively strips a matching pair of outer single/double quotes from every env var, so both `KAITEN_HOST=mycompany.kaiten.ru` and `KAITEN_HOST="mycompany.kaiten.ru"` work. Unquoted form is still recommended (fewer surprises in downstream tooling).
>
> **The server will refuse to start** if any of `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OWNER_PASSWORD`, `OAUTH_REDIRECT_URIS`, `KAITEN_HOST`, or `KAITEN_TOKEN` is missing. This is intentional — it prevents an accidentally-misconfigured instance from running with authentication disabled.

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
6. **Enter your `OWNER_PASSWORD`** on the consent page, then click **Authorize** — you'll be redirected back to Claude

Done! Now in any Claude chat, you can ask things like:
- "Show my Kaiten boards"
- "What cards are on board 123?"
- "Give me backlog analytics for board 456"
- "Who's on the team?"

### Alternative: Deploy to Render

The repo includes `render.yaml` for one-click deploy on [Render](https://render.com/). Same environment variables apply.

### Alternative: Run locally

```bash
git clone https://github.com/Stillfrozen/kaiten-connector.git
cd kaiten-connector
npm install
npm run build

# Local dev (unauthenticated — explicit opt-in)
ALLOW_UNAUTHENTICATED=1 \
KAITEN_HOST=mycompany.kaiten.ru \
KAITEN_TOKEN=your-token \
npm start
```

For development with auto-reload:

```bash
ALLOW_UNAUTHENTICATED=1 \
KAITEN_HOST=mycompany.kaiten.ru \
KAITEN_TOKEN=your-token \
npm run dev
```

The server runs on `http://localhost:3000`. `ALLOW_UNAUTHENTICATED=1` is an **explicit opt-in** — without it the server refuses to start unless all production env vars are present. This is intentional, to prevent a deployment from silently running with auth disabled.

## Environment variables

| Variable | Required in prod | Description |
|----------|------------------|-------------|
| `KAITEN_HOST` | Yes | Kaiten domain, e.g. `mycompany.kaiten.ru` (without `https://`, no path) |
| `KAITEN_TOKEN` | Yes | Kaiten API token (get from profile > API keys) |
| `OAUTH_CLIENT_ID` | Yes | OAuth client ID — any string, e.g. `kaiten-claude` |
| `OAUTH_CLIENT_SECRET` | Yes | OAuth client secret — generate with `openssl rand -hex 32` |
| `OWNER_PASSWORD` | Yes | Password you type on the consent page to approve each OAuth flow. Without this anyone who knows the URL could mint tokens. Generate with `openssl rand -base64 24` |
| `OAUTH_REDIRECT_URIS` | Yes | Comma-separated whitelist of allowed callback URIs, e.g. `https://claude.ai/api/mcp/auth_callback` |
| `PUBLIC_HOSTNAME` | Recommended | Public hostname used to build metadata URLs (defaults to `RAILWAY_PUBLIC_DOMAIN` / `RENDER_EXTERNAL_HOSTNAME` if set by the platform). Prevents Host header injection. |
| `CORS_ORIGIN` | No | Allowed CORS origin (default: `https://claude.ai`) |
| `PORT` | No | Server port (default: `3000`) |
| `ALLOW_UNAUTHENTICATED` | No | Set to `1` to skip auth entirely. **Local dev only.** |

## Security

The server implements [OAuth 2.1](https://oauth.net/2.1/) (Authorization Code + PKCE) compliant with the [MCP authorization spec](https://modelcontextprotocol.io/specification/draft/basic/authorization):

- Protected Resource Metadata discovery (RFC 9728)
- Authorization Server Metadata discovery (RFC 8414)
- Dynamic Client Registration (RFC 7591) — **disabled in production**; operators configure pre-shared client credentials manually in Claude's connector UI
- PKCE with S256 challenge method only (server rejects `plain` and any other method — no downgrade)
- Access tokens expire after 7 days, refresh tokens after 90 days with rotation; refresh grant always requires client authentication (RFC 6749 §6)
- **Owner password gate** (`OWNER_PASSWORD`): the authorize page requires the operator to enter the password before a code is issued. This is the only thing that prevents a stranger who knows the URL from minting themselves an access token.
- **Redirect URI whitelist** (`OAUTH_REDIRECT_URIS`): only URIs from the env whitelist are accepted at both `/oauth/authorize` and `/oauth/token`. No "allow any" fallback.
- **CSRF protection** on the POST approval step: HMAC token bound to every OAuth param, 10-min expiry — blocks external pages from auto-submitting a crafted approval form.
- **Host header injection protection**: metadata URLs are built from `PUBLIC_HOSTNAME` (or `RAILWAY_PUBLIC_DOMAIN` / `RENDER_EXTERNAL_HOSTNAME`), not from the request's `Host` header.
- **Fail-closed on misconfig**: if critical env vars are missing, the server refuses to start rather than silently running with auth disabled.
- **Rate limiting**: 20 req/min/IP on all `/oauth/*` endpoints, 120 req/min/IP on `/mcp`.
- **Session cap**: max 256 concurrent MCP sessions, prevents memory exhaustion.
- **Authorization code is invalidated on any failed exchange** (PKCE failure, client mismatch, redirect_uri mismatch) — no retry attacks.
- **Constant-time comparisons** for `client_secret`, CSRF signatures, and `OWNER_PASSWORD`.
- XSS protection on all HTML-rendered pages (hidden form fields, error messages).
- **Baseline security headers** on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `x-powered-by` disabled. The OAuth consent page additionally ships `Cache-Control: no-store` and a strict Content-Security-Policy.
- CORS restricted to configured origin (default: `https://claude.ai`).
- HTTPS required for redirect URIs (HTTP allowed only for localhost).
- Error messages from the upstream Kaiten API are not forwarded to the client — only HTTP status codes, to avoid leaking any PII or tokens from upstream response bodies.

Your Kaiten API token is stored only on the server — Claude never sees it. Claude authenticates via OAuth and only gets a time-limited access token.

### Reconnection after redeploy

The in-memory token store is cleared on every restart. After any Railway redeploy, go to Claude > Settings > Integrations > Kaiten > **Connect** again and re-enter your `OWNER_PASSWORD` on the consent page.

## Tech stack

- TypeScript, Node.js 20+
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) — MCP protocol
- Express 5 — HTTP server
- Zod — input validation

## License

MIT
