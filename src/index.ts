import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import * as kaiten from "./kaiten-api.js";
import * as oauth from "./oauth.js";

// --- MCP Server factory ---

function createServer(): McpServer {
  const server = new McpServer({
    name: "kaiten-mcp-server",
    version: "1.0.0",
  });

  // 1. List spaces and boards
  server.registerTool(
    "list-boards",
    {
      title: "List Boards",
      description:
        "List all spaces and boards from Kaiten. Optionally filter by name.",
      inputSchema: z.object({
        search: z.string().optional().describe("Filter boards by name"),
      }),
    },
    async ({ search }) => {
      const spaces = await kaiten.getSpaces();
      const results: Array<{
        space: string;
        space_id: number;
        board: string;
        board_id: number;
      }> = [];

      for (const space of spaces) {
        const boards = await kaiten.getSpaceBoards(space.id);
        for (const board of boards) {
          if (
            search &&
            !board.title.toLowerCase().includes(search.toLowerCase()) &&
            !space.title.toLowerCase().includes(search.toLowerCase())
          ) {
            continue;
          }
          results.push({
            space: space.title,
            space_id: space.id,
            board: board.title,
            board_id: board.id,
          });
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    }
  );

  // 2. Get board details (columns, lanes, WIP limits)
  server.registerTool(
    "get-board",
    {
      title: "Get Board Details",
      description:
        "Get board structure: columns, subcolumns, lanes, and WIP limits.",
      inputSchema: z.object({
        board_id: z.number().describe("Board ID"),
      }),
    },
    async ({ board_id }) => {
      const [board, columns, lanes] = await Promise.all([
        kaiten.getBoard(board_id),
        kaiten.getBoardColumns(board_id),
        kaiten.getBoardLanes(board_id).catch(() => [] as kaiten.Lane[]),
      ]);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                board: { id: board.id, title: board.title },
                columns: columns.map((c) => ({
                  id: c.id,
                  title: c.title,
                  wip_limit: c.wip_limit,
                  subcolumns: c.subcolumns?.map((s) => ({
                    id: s.id,
                    title: s.title,
                  })),
                })),
                lanes: lanes.map((l) => ({ id: l.id, title: l.title })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 3. List cards
  server.registerTool(
    "list-cards",
    {
      title: "List Cards",
      description:
        "List cards on a board with optional filters. Returns id, title, column, members, tags, size, dates.",
      inputSchema: z.object({
        board_id: z.number().describe("Board ID"),
        column_id: z.number().optional().describe("Filter by column ID"),
        member_id: z.number().optional().describe("Filter by member ID"),
        condition: z
          .number()
          .optional()
          .describe("Card state: 1=active, 2=archived, 3=draft"),
        limit: z
          .number()
          .optional()
          .default(50)
          .describe("Max cards to return"),
        offset: z.number().optional().default(0).describe("Offset for pagination"),
      }),
    },
    async ({ board_id, column_id, member_id, condition, limit, offset }) => {
      const cards = await kaiten.getCards({
        board_id,
        column_id,
        member_id,
        condition,
        limit,
        offset,
      });

      const result = cards.map((c) => ({
        id: c.id,
        title: c.title,
        column: c.column?.title ?? c.column_id,
        members: c.members?.map((m) => m.full_name) ?? [],
        tags: c.tags?.map((t) => t.name) ?? [],
        size: c.size,
        created: c.created,
        updated: c.updated,
        due_date: c.due_date,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { total: result.length, cards: result },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 4. Get card details
  server.registerTool(
    "get-card",
    {
      title: "Get Card Details",
      description:
        "Get full card details: description, comments, checklists, blockers, children, location history.",
      inputSchema: z.object({
        card_id: z.number().describe("Card ID"),
      }),
    },
    async ({ card_id }) => {
      const [card, comments, children, history] = await Promise.all([
        kaiten.getCard(card_id),
        kaiten.getCardComments(card_id).catch(() => []),
        kaiten.getCardChildren(card_id).catch(() => []),
        kaiten.getCardLocationHistory(card_id).catch(() => []),
      ]);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: card.id,
                title: card.title,
                description: card.description,
                column: card.column?.title ?? card.column_id,
                members: card.members?.map((m) => ({
                  id: m.id,
                  name: m.full_name,
                })),
                tags: card.tags?.map((t) => t.name),
                size: card.size,
                created: card.created,
                updated: card.updated,
                due_date: card.due_date,
                checklists: card.checklists?.map((cl) => ({
                  title: cl.title,
                  items: cl.items?.map((i) => ({
                    text: i.text,
                    checked: i.checked,
                  })),
                })),
                blockers: card.blockers?.map((b) => ({
                  reason: b.reason,
                  type: b.blocker_type,
                })),
                comments: comments.map((c) => ({
                  author: c.author?.full_name,
                  date: c.created,
                  text: c.text,
                })),
                children: children.map((c) => ({
                  id: c.id,
                  title: c.title,
                })),
                location_history: history.map((h) => ({
                  column: h.column_title,
                  date: h.created,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 5. List sprints
  server.registerTool(
    "list-sprints",
    {
      title: "List Sprints",
      description: "List all sprints from Kaiten.",
      inputSchema: z.object({}),
    },
    async () => {
      const sprints = await kaiten.getSprints();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              sprints.map((s) => ({
                id: s.id,
                title: s.title,
                start: s.started_at,
                end: s.finished_at,
                status: s.status,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 6. Get sprint cards
  server.registerTool(
    "get-sprint-cards",
    {
      title: "Get Sprint Cards",
      description: "Get all cards in a specific sprint.",
      inputSchema: z.object({
        sprint_id: z.number().describe("Sprint ID"),
        limit: z.number().optional().default(100),
      }),
    },
    async ({ sprint_id, limit }) => {
      const cards = await kaiten.getCards({ sprint_id, limit });
      const result = cards.map((c) => ({
        id: c.id,
        title: c.title,
        column: c.column?.title ?? c.column_id,
        members: c.members?.map((m) => m.full_name) ?? [],
        size: c.size,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { sprint_id, total: result.length, cards: result },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 7. List users
  server.registerTool(
    "list-users",
    {
      title: "List Users",
      description:
        "List all users from Kaiten. Optionally filter by name.",
      inputSchema: z.object({
        search: z.string().optional().describe("Filter users by name"),
      }),
    },
    async ({ search }) => {
      const users = await kaiten.getUsers();
      const filtered = search
        ? users.filter((u) =>
            u.full_name.toLowerCase().includes(search.toLowerCase())
          )
        : users;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              filtered.map((u) => ({
                id: u.id,
                name: u.full_name,
                email: u.email,
                role: u.role,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 8. Current user
  server.registerTool(
    "get-current-user",
    {
      title: "Get Current User",
      description: "Get info about the currently authenticated Kaiten user.",
      inputSchema: z.object({}),
    },
    async () => {
      const user = await kaiten.getCurrentUser();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: user.id,
                name: user.full_name,
                email: user.email,
                role: user.role,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 9. Backlog analytics
  server.registerTool(
    "backlog-analytics",
    {
      title: "Backlog Analytics",
      description:
        "Analyze backlog on a board: card distribution by column, blockers, workload by member, aging, due dates.",
      inputSchema: z.object({
        board_id: z.number().describe("Board ID"),
      }),
    },
    async ({ board_id }) => {
      const columns = await kaiten.getBoardColumns(board_id);

      // Fetch all active cards (paginate)
      let allCards: kaiten.Card[] = [];
      let offset = 0;
      const pageSize = 200;
      while (true) {
        const page = await kaiten.getCards({
          board_id,
          condition: 1,
          limit: pageSize,
          offset,
        });
        allCards = allCards.concat(page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }

      const now = new Date();

      // Distribution by column
      const byColumn = columns.map((col) => {
        const count = allCards.filter((c) => c.column_id === col.id).length;
        return {
          column: col.title,
          column_id: col.id,
          cards: count,
          wip_limit: col.wip_limit,
          over_limit: col.wip_limit ? count > col.wip_limit : false,
        };
      });

      // Blockers
      const blocked = allCards
        .filter((c) => c.blockers && c.blockers.length > 0)
        .map((c) => ({
          card_id: c.id,
          title: c.title,
          blockers: c.blockers!.map((b) => b.reason),
        }));

      // Workload by member
      const memberMap = new Map<string, number>();
      let unassigned = 0;
      for (const card of allCards) {
        if (!card.members || card.members.length === 0) {
          unassigned++;
        } else {
          for (const m of card.members) {
            memberMap.set(m.full_name, (memberMap.get(m.full_name) ?? 0) + 1);
          }
        }
      }
      const workload = [...memberMap.entries()]
        .map(([name, count]) => ({
          member: name,
          cards: count,
          overloaded: count > 10,
        }))
        .sort((a, b) => b.cards - a.cards);

      // Aging
      const stale7 = allCards.filter((c) => {
        const diff = now.getTime() - new Date(c.updated).getTime();
        return diff > 7 * 24 * 60 * 60 * 1000;
      }).length;
      const stale30 = allCards.filter((c) => {
        const diff = now.getTime() - new Date(c.updated).getTime();
        return diff > 30 * 24 * 60 * 60 * 1000;
      }).length;

      // Due dates
      const overdue = allCards.filter(
        (c) => c.due_date && new Date(c.due_date) < now
      ).length;
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const dueThisWeek = allCards.filter(
        (c) =>
          c.due_date &&
          new Date(c.due_date) >= now &&
          new Date(c.due_date) <= weekFromNow
      ).length;
      const noDueDate = allCards.filter((c) => !c.due_date).length;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total_active_cards: allCards.length,
                distribution_by_column: byColumn,
                blockers: { count: blocked.length, items: blocked },
                workload: { members: workload, unassigned },
                aging: { stale_7_days: stale7, stale_30_days: stale30 },
                due_dates: {
                  overdue,
                  due_this_week: dueThisWeek,
                  no_due_date: noDueDate,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  return server;
}

// --- HTTP Transport setup ---

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const app = express();
app.use(express.json());
app.use(
  cors({
    exposedHeaders: ["Mcp-Session-Id", "Last-Event-Id", "Mcp-Protocol-Version"],
    origin: "*",
  })
);

// Parse URL-encoded bodies (for OAuth form POST)
app.use(express.urlencoded({ extended: false }));

// --- OAuth endpoints (no auth) ---
app.get("/.well-known/oauth-protected-resource", oauth.protectedResourceMetadata);
app.get("/.well-known/oauth-authorization-server", oauth.authServerMetadata);
app.post("/oauth/register", oauth.registerClient);
app.get("/oauth/authorize", oauth.authorize);
app.post("/oauth/authorize", oauth.authorizeApprove);
app.post("/oauth/token", oauth.token);

// Health check (no auth)
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    has_kaiten_host: !!process.env.KAITEN_HOST,
    has_kaiten_token: !!process.env.KAITEN_TOKEN,
    kaiten_host_length: process.env.KAITEN_HOST?.length ?? 0,
  });
});

// Session store
const transports: Record<string, StreamableHTTPServerTransport> = {};

// POST /mcp — main MCP endpoint
app.post("/mcp", oauth.requireBearerAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
        }
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else if (sessionId) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found" },
        id: null,
      });
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no session ID" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// GET /mcp — SSE stream
app.get("/mcp", oauth.requireBearerAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(404).send("Session not found");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

// DELETE /mcp — session termination
app.delete("/mcp", oauth.requireBearerAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(404).send("Session not found");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

app.listen(PORT, () => {
  console.log(`Kaiten MCP server listening on port ${PORT}`);
});

process.on("SIGINT", async () => {
  for (const sid in transports) {
    await transports[sid].close();
    delete transports[sid];
  }
  process.exit(0);
});
