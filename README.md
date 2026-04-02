# Kaiten MCP Server

Remote [MCP](https://modelcontextprotocol.io/) server for [Kaiten](https://kaiten.ru/) project management. Provides tools for accessing boards, cards, sprints, users, and backlog analytics via the Kaiten API.

## Tools

| Tool | Description |
|------|-------------|
| `list-boards` | List all spaces and boards, optionally filter by name |
| `get-board` | Board structure: columns, subcolumns, lanes, WIP limits |
| `list-cards` | Cards on a board with filters (column, member, condition) |
| `get-card` | Full card details: description, comments, checklists, blockers, children, location history |
| `list-sprints` | All sprints |
| `get-sprint-cards` | Cards in a specific sprint |
| `list-users` | All users, optionally filter by name |
| `get-current-user` | Currently authenticated user |
| `backlog-analytics` | Board analytics: distribution by column, blockers, workload, aging, due dates |

## Setup

### Environment variables

| Variable | Description |
|----------|-------------|
| `KAITEN_HOST` | Kaiten domain, e.g. `mycompany.kaiten.ru` |
| `KAITEN_TOKEN` | API bearer token ([get it here](https://kaiten.ru/profile/api-key)) |
| `OAUTH_CLIENT_ID` | OAuth client ID for MCP auth (optional, recommended in production) |
| `OAUTH_CLIENT_SECRET` | OAuth client secret (generate with `openssl rand -hex 32`) |
| `PORT` | Server port (default: `3000`) |

### Authentication

The server implements OAuth 2.1 (Authorization Code + PKCE) compliant with the MCP specification.

**How it works:**
1. Client sends unauthenticated request to `/mcp`
2. Server returns 401 with discovery metadata
3. Client discovers authorization server via `/.well-known/oauth-protected-resource`
4. User authorizes via consent page
5. Client exchanges authorization code for access token (with PKCE verification)
6. Access tokens are valid for 1 hour

**Supported features:**
- Protected Resource Metadata (RFC 9728)
- Authorization Server Metadata (RFC 8414)
- Dynamic Client Registration (RFC 7591)
- PKCE with S256 challenge method

If `OAUTH_CLIENT_ID` is not set, auth is disabled (convenient for local development).

### Run locally

```bash
npm install
npm run build

KAITEN_HOST=mycompany.kaiten.ru KAITEN_TOKEN=your-token npm start
```

Or in dev mode with auto-reload:

```bash
KAITEN_HOST=mycompany.kaiten.ru KAITEN_TOKEN=your-token npm run dev
```

### Deploy to Railway

1. Create a new project on [railway.app](https://railway.app/)
2. Connect the GitHub repo
3. Set environment variables: `KAITEN_HOST`, `KAITEN_TOKEN`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`
4. Generate a domain in Settings → Networking → Generate Domain
5. Railway will auto-detect Node.js and run `npm install && npm run build && npm start`

### Deploy to Render

The repo includes `render.yaml` for one-click deploy on [Render](https://render.com/).

## Connecting to Claude

1. In Claude → Settings → Integrations → Add Custom Connector
2. **Name**: `Kaiten`
3. **URL**: `https://your-service.up.railway.app/mcp`
4. **OAuth Client ID**: value of `OAUTH_CLIENT_ID`
5. **OAuth Client Secret**: value of `OAUTH_CLIENT_SECRET`
6. Click Add, then authorize when prompted

The server uses Streamable HTTP transport (MCP spec compliant) with session management and OAuth 2.1 authentication.

## Tech stack

- TypeScript, Node.js
- `@modelcontextprotocol/sdk` — MCP protocol implementation
- Express — HTTP server
- Zod — input schema validation
