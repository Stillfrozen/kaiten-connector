import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as kaiten from "../../kaiten-api.js";
import { textResult } from "../shape.js";

function shapeSprint(s: kaiten.Sprint) {
  return {
    id: s.id,
    title: s.title,
    board_id: s.board_id,
    active: s.active,
    goal: s.goal,
    start_date: s.start_date,
    finish_date: s.finish_date,
    actual_finish_date: s.actual_finish_date,
    committed: s.committed,
    velocity: s.velocity,
  };
}

function shapeSprintCardRow(c: kaiten.Card) {
  return {
    id: c.id,
    title: c.title,
    column: c.column?.title ?? c.column_id,
    members: c.members?.map((m) => m.full_name) ?? [],
    size: c.size,
  };
}

function registerListSprints(server: McpServer): void {
  server.registerTool(
    "list-sprints",
    {
      title: "List Sprints",
      description: "List sprints from Kaiten. Optionally filter by active status.",
      inputSchema: z.object({
        active: z.boolean().optional().describe("Filter: true=active only, false=inactive only"),
        limit: z.coerce.number().int().min(1).max(100).optional().default(100).describe("Max sprints (max 100)"),
        offset: z.coerce.number().int().min(0).max(100_000).optional().default(0).describe("Offset for pagination"),
      }),
    },
    async ({ active, limit, offset }) => {
      const sprints = await kaiten.getSprints({ active, limit, offset });
      return textResult(sprints.map(shapeSprint));
    }
  );
}

function registerGetSprintCards(server: McpServer): void {
  server.registerTool(
    "get-sprint-cards",
    {
      title: "Get Sprint Cards",
      description: "Get all cards in a specific sprint.",
      inputSchema: z.object({
        sprint_id: z.coerce.number().int().positive().describe("Sprint ID"),
        limit: z.coerce.number().int().min(1).max(200).optional().default(100),
      }),
    },
    async ({ sprint_id, limit }) => {
      const cards = await kaiten.getCards({ sprint_id, limit });
      const rows = cards.map(shapeSprintCardRow);
      return textResult({ sprint_id, total: rows.length, cards: rows });
    }
  );
}

export function registerSprintTools(server: McpServer): void {
  registerListSprints(server);
  registerGetSprintCards(server);
}
