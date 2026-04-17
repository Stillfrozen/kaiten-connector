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
      // PRIVACY: full_name and email are PII; role (object or string) is
      // kept because it's a permission tier, not identity. This endpoint
      // exists mainly as an auth smoke-test — the id is enough for that.
      return textResult({
        id: user.id,
        role: user.role,
      });
    }
  );
}
