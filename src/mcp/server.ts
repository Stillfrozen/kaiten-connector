import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerBoardTools } from "./tools/boards.js";
import { registerCardDetailTools } from "./tools/card-details.js";
import { registerCardTools } from "./tools/cards.js";
import { registerSprintTools } from "./tools/sprints.js";
import { registerUserTools } from "./tools/user.js";

/** Build a fresh McpServer with all tools registered. */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "kaiten-mcp-server",
    version: "1.0.0",
  });

  registerBoardTools(server);
  registerCardTools(server);
  registerCardDetailTools(server);
  registerSprintTools(server);
  registerUserTools(server);
  registerAnalyticsTools(server);

  return server;
}
