import { env } from "./env.js";
import { createApp } from "./http/app.js";
import { closeAllMcpSessions } from "./http/mcp-routes.js";
import { assertRequiredEnv } from "./http/startup.js";

assertRequiredEnv();

const PORT = parseInt(env("PORT") ?? "3000", 10);
const app = createApp();

app.listen(PORT, () => {
  // stderr, not stdout — keeps stdout clean for any tooling that parses it.
  console.error(`Kaiten MCP server listening on port ${PORT}`);
});

process.on("SIGINT", () => {
  void closeAllMcpSessions().then(() => {
    process.exit(0);
  });
});
