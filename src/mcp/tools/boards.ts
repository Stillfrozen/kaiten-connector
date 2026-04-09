import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as kaiten from "../../kaiten-api.js";
import { textResult } from "../shape.js";

interface BoardRow {
  space: string;
  space_id: number;
  board: string;
  board_id: number;
}

function matches(search: string, space: string, board: string): boolean {
  const q = search.toLowerCase();
  return (
    space.toLowerCase().includes(q) || board.toLowerCase().includes(q)
  );
}

async function collectBoards(
  spaces: kaiten.Space[],
  search: string | undefined
): Promise<BoardRow[]> {
  const results: BoardRow[] = [];
  for (const space of spaces) {
    const boards = await kaiten.getSpaceBoards(space.id);
    for (const board of boards) {
      if (search && !matches(search, space.title, board.title)) continue;
      results.push({
        space: space.title,
        space_id: space.id,
        board: board.title,
        board_id: board.id,
      });
    }
  }
  return results;
}

function registerListBoards(server: McpServer): void {
  server.registerTool(
    "list-boards",
    {
      title: "List Boards",
      description:
        "List all spaces and boards from Kaiten. Optionally filter by name.",
      inputSchema: z.object({
        search: z.string().max(200).optional().describe("Filter boards by name"),
      }),
    },
    async ({ search }) => {
      const spaces = await kaiten.getSpaces();
      const results = await collectBoards(spaces, search);
      return textResult(results);
    }
  );
}

function shapeBoardDetails(
  board: kaiten.Board,
  columns: kaiten.Column[],
  lanes: kaiten.Lane[]
) {
  return {
    board: {
      id: board.id,
      title: board.title,
      description: board.description,
      external_id: board.external_id,
    },
    columns: columns.map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type, // 1=queue, 2=in progress, 3=done
      wip_limit: c.wip_limit,
      wip_limit_type: c.wip_limit_type, // 1=count, 2=size
      sort_order: c.sort_order,
      subcolumns: c.subcolumns?.map((s) => ({
        id: s.id,
        title: s.title,
        sort_order: s.sort_order,
      })),
    })),
    lanes: lanes.map((l) => ({
      id: l.id,
      title: l.title,
      wip_limit: l.wip_limit,
      sort_order: l.sort_order,
      condition: l.condition,
    })),
  };
}

function registerGetBoard(server: McpServer): void {
  server.registerTool(
    "get-board",
    {
      title: "Get Board Details",
      description:
        "Get full board structure: columns with types and WIP limits, subcolumns, lanes.",
      inputSchema: z.object({
        board_id: z.number().int().positive().describe("Board ID"),
      }),
    },
    async ({ board_id }) => {
      const [board, columns, lanes] = await Promise.all([
        kaiten.getBoard(board_id),
        kaiten.getBoardColumns(board_id),
        kaiten.getBoardLanes(board_id).catch(() => [] as kaiten.Lane[]),
      ]);
      return textResult(shapeBoardDetails(board, columns, lanes));
    }
  );
}

export function registerBoardTools(server: McpServer): void {
  registerListBoards(server);
  registerGetBoard(server);
}
