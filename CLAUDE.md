# Project Instructions

## Tech stack & preferences

- Runtime: Node.js 20+ with TypeScript (strict mode)
- Package manager: npm
- Build: `tsc` -> `dist/`, run with `node dist/index.js`, dev with `tsx src/index.ts`
- Deployment target: Railway (auto-deploy from GitHub `main` branch)
- In Railway Raw Editor: NEVER wrap env var values in quotes — Railway treats them literally

## Security — apply from the start

When building any HTTP-facing service, address these vectors immediately (not as a follow-up):

- **XSS**: HTML-escape all user-controlled values interpolated into HTML templates (`escapeHtml()`)
- **Open Redirect**: validate `redirect_uri` against a whitelist of registered URIs; require HTTPS (allow HTTP only for localhost)
- **OAuth**: verify `redirect_uri` match at both authorization and token exchange; restrict dynamic client registration in production; use PKCE S256
- **CORS**: restrict `origin` to specific allowed domains (not `*`); make configurable via env var
- **Input validation**: use Zod schemas for all external input
- **Secrets**: never log full error objects (may contain request bodies with tokens); only log `error.message`
- **Health endpoints**: expose only `status`, never internal state (env var names, lengths, flags)
- **`.gitignore`**: always include `.env`, `.env.*`, `node_modules/`, `dist/`
- **Rate limiting**: add throttling on public endpoints (OAuth register, token) to prevent brute-force
- **In-memory stores**: document that tokens are lost on restart; extend TTLs and implement refresh token rotation

## API integrations

- Always verify API endpoint paths against official documentation before committing
- If API calls fail with 404, check plural vs singular in paths (e.g. `/boards/` not `/board/`)
- Request documentation URL from user if you can't find it yourself
- Implement rate limiting (throttle between requests) and auto-retry on 429 with `Retry-After` header
- Check if parent API responses already include nested data (e.g. columns endpoint returns subcolumns) before making extra calls

## Testing

- Write tests alongside the code, not after the fact
- Use Node.js built-in test runner (`node:test`) or vitest
- Cover: API response parsing, input validation (Zod schemas), OAuth flow (PKCE verification, token exchange, redirect_uri validation), error handling
- Mock external API calls in tests
- Run tests before committing: `npm test`

## Documentation

- Always keep README.md in sync with actual code after any change to features, security, env vars, or deployment
- After security fixes: update the Security section (token TTLs, protection measures, restrictions)
- After adding/removing env vars: update the Environment variables table
- After changing deploy flow: update Quick start steps
- Don't leave stale info (e.g. wrong token TTLs, missing reconnection notes)

## Git & GitHub workflow

1. Check `git status` and `git diff` before every commit
2. Stage specific files by name (not `git add -A`) to avoid committing secrets
3. Write concise commit messages: what changed and why, not just "update files"
4. Always end commit messages with: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
5. Push to `main` — Railway auto-deploys from there
6. After Railway deploys (usually ~1-2 min), verify with health endpoint
7. After deploy with OAuth changes, user needs to re-authorize the connector in Claude (in-memory tokens are reset)

## MCP Server specifics

- Use `@modelcontextprotocol/sdk` v1.29+ (stable, single package — NOT v2 alpha separate packages)
- Imports: `@modelcontextprotocol/sdk/server/mcp.js`, `@modelcontextprotocol/sdk/server/streamableHttp.js`, `@modelcontextprotocol/sdk/types.js`
- Transport: Streamable HTTP (POST/GET/DELETE on `/mcp`)
- Auth: OAuth 2.1 (Authorization Code + PKCE) required for Claude custom connectors — there is no custom header field in Claude's connector UI
- OAuth metadata endpoints: `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`
