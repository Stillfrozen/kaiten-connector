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
| `MCP_AUTH_TOKEN` | Shared secret for MCP client auth (optional, recommended in production) |
| `PORT` | Server port (default: `3000`) |

### Authentication

When `MCP_AUTH_TOKEN` is set, all `/mcp` requests must include `Authorization: Bearer <token>` header. Without a valid token the server returns 401. If the variable is not set, auth is disabled (convenient for local development).

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
3. Set environment variables: `KAITEN_HOST`, `KAITEN_TOKEN`
4. Railway will auto-detect Node.js and run `npm install && npm run build && npm start`

### Deploy to Render

The repo includes `render.yaml` for one-click deploy on [Render](https://render.com/).

## Connecting to Claude

Once deployed, use the server URL as a Custom MCP connector:

```
https://your-service.up.railway.app/mcp
```

The server uses Streamable HTTP transport (MCP spec compliant) with session management.

## Tech stack

- TypeScript, Node.js
- `@modelcontextprotocol/sdk` — MCP protocol implementation
- Express — HTTP server
- Zod — input schema validation
