import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as kaiten from "../../kaiten-api.js";
import { textResult } from "../shape.js";

export function registerUserTools(server: McpServer): void {
  server.registerTool(
    "get-current-user",
    {
      title: "Get Current User",
      description: "Get info about the currently authenticated Kaiten user.",
      inputSchema: z.object({}),
    },
    async () => {
      const user = await kaiten.getCurrentUser();
      return textResult({
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role,
      });
    }
  );
}
