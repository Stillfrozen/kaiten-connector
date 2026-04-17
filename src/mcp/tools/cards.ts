import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as kaiten from "../../kaiten-api.js";
import { textResult } from "../shape.js";

// Flat card row used by list-cards. Keeps each response row compact enough
// for Claude to browse without blowing through the MCP text budget.
function shapeCardRow(c: kaiten.Card) {
  return {
    id: c.id,
    title: c.title,
    column: c.column?.title ?? c.column_id,
    lane: c.lane?.title ?? c.lane_id,
    board_id: c.board_id,
    state: c.state, // 1=queued, 2=inProgress, 3=done
    condition: c.condition, // 1=active, 2=archived
    // PRIVACY: full names stripped; stable ids only.
    members:
      c.members?.map((m) => ({ id: m.id, type: m.type })) ?? [],
    tags: c.tags?.map((t) => t.name) ?? [],
    size: c.size,
    asap: c.asap,
    blocked: c.blocked,
    created: c.created,
    updated: c.updated,
    due_date: c.due_date,
    planned_start: c.planned_start,
    planned_end: c.planned_end,
    completed_at: c.completed_at,
    external_id: c.external_id,
    children_count: c.children_count,
    children_done: c.children_done,
    time_spent_sum: c.time_spent_sum,
  };
}

function shapeSearchRow(c: kaiten.Card) {
  return {
    id: c.id,
    title: c.title,
    board: c.board?.title ?? c.board_id,
    column: c.column?.title ?? c.column_id,
    state: c.state,
    // PRIVACY: full names stripped; stable ids only.
    members: c.members?.map((m) => m.id) ?? [],
    due_date: c.due_date,
    updated: c.updated,
  };
}

// z.coerce.number() used everywhere because the MCP harness serializes
// numeric arguments as strings (JSON arguments are string-typed by the
// cowork transport). Plain z.number() would reject "45230" with
// `expected number, received string`.
const listCardsSchema = z.object({
  board_id: z.coerce.number().int().positive().optional().describe("Filter by board ID"),
  column_id: z.coerce.number().int().positive().optional().describe("Filter by column ID"),
  lane_id: z.coerce.number().int().positive().optional().describe("Filter by lane ID"),
  member_id: z.coerce.number().int().positive().optional().describe("Filter by member ID"),
  owner_id: z.coerce.number().int().positive().optional().describe("Filter by owner (creator) ID"),
  sprint_id: z.coerce.number().int().positive().optional().describe("Filter by sprint ID"),
  condition: z.coerce.number().int().min(1).max(2).optional().describe("1=on board, 2=archived"),
  states: z.string().max(50).optional().describe("Comma-separated states: 1=queued, 2=inProgress, 3=done"),
  tag_ids: z.string().max(500).optional().describe("Comma-separated tag IDs"),
  query: z.string().max(500).optional().describe("Search cards by text"),
  overdue: z.boolean().optional().describe("Only overdue cards"),
  asap: z.boolean().optional().describe("Only ASAP cards"),
  due_date_before: z.string().max(64).optional().describe("Due date before (ISO 8601)"),
  due_date_after: z.string().max(64).optional().describe("Due date after (ISO 8601)"),
  created_after: z.string().max(64).optional().describe("Created after (ISO 8601)"),
  updated_after: z.string().max(64).optional().describe("Updated after (ISO 8601)"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50).describe("Max cards (max 100)"),
  offset: z.coerce.number().int().min(0).max(100_000).optional().default(0).describe("Offset for pagination"),
});

const searchCardsSchema = z.object({
  query: z.string().min(1).max(500).describe("Search text (matches title and description)"),
  overdue: z.boolean().optional().describe("Only overdue cards"),
  asap: z.boolean().optional().describe("Only ASAP cards"),
  states: z.string().max(50).optional().describe("Comma-separated states: 1=queued, 2=inProgress, 3=done"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50).describe("Max cards (max 100)"),
});

function registerListCards(server: McpServer): void {
  server.registerTool(
    "list-cards",
    {
      title: "List Cards",
      description:
        "List cards with flexible filters. Can filter by board, column, lane, member, owner, sprint, tags, state, dates, overdue, text search. Returns id, title, column, lane, members, tags, size, state, dates.",
      inputSchema: listCardsSchema,
    },
    async (params) => {
      const cards = await kaiten.getCards(params);
      const rows = cards.map(shapeCardRow);
      return textResult({ total: rows.length, cards: rows });
    }
  );
}

function registerSearchCards(server: McpServer): void {
  server.registerTool(
    "search-cards",
    {
      title: "Search Cards",
      description:
        "Search cards across all boards by text query. Can also filter by overdue, ASAP, date ranges.",
      inputSchema: searchCardsSchema,
    },
    async ({ query, overdue, asap, states, limit }) => {
      const cards = await kaiten.getCards({ query, overdue, asap, states, limit });
      return textResult({
        total: cards.length,
        cards: cards.map(shapeSearchRow),
      });
    }
  );
}

export function registerCardTools(server: McpServer): void {
  registerListCards(server);
  registerSearchCards(server);
}
