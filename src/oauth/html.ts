import { OWNER_PASSWORD } from "./config.js";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface AuthorizePageOpts {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  csrf_token: string;
  error?: string;
}

const PAGE_STYLE = `
  body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
  .card { background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 400px; text-align: center; }
  h1 { font-size: 1.3rem; margin: 0 0 0.5rem; }
  p { color: #666; margin: 0 0 1.5rem; }
  input[type=password] { width: 100%; padding: 0.6rem; border: 1px solid #ddd; border-radius: 6px; font-size: 1rem; margin-bottom: 1rem; box-sizing: border-box; }
  button { background: #2563eb; color: white; border: none; padding: 0.75rem 2rem; border-radius: 8px; font-size: 1rem; cursor: pointer; width: 100%; }
  button:hover { background: #1d4ed8; }
  .err { color: #b91c1c; background: #fee2e2; padding: 0.5rem; border-radius: 6px; margin-bottom: 1rem; }
`;

export function renderAuthorizePage(opts: AuthorizePageOpts): string {
  const e = escapeHtml;
  const errorBlock = opts.error ? `<p class="err">${e(opts.error)}</p>` : "";
  const passwordField = OWNER_PASSWORD
    ? `<input type="password" name="owner_password" placeholder="Owner password" required autofocus>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize Kaiten MCP</title>
<style>${PAGE_STYLE}</style></head>
<body><div class="card">
  <h1>Kaiten MCP Server</h1>
  <p>Claude wants to access your Kaiten data.</p>
  ${errorBlock}
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="client_id" value="${e(opts.client_id)}">
    <input type="hidden" name="redirect_uri" value="${e(opts.redirect_uri)}">
    <input type="hidden" name="state" value="${e(opts.state)}">
    <input type="hidden" name="code_challenge" value="${e(opts.code_challenge)}">
    <input type="hidden" name="code_challenge_method" value="${e(opts.code_challenge_method)}">
    <input type="hidden" name="csrf_token" value="${e(opts.csrf_token)}">
    ${passwordField}
    <button type="submit">Authorize</button>
  </form>
</div></body></html>`;
}
