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
        "Get full board structure: columns with types and WIP limits, subcolumns, lanes.",
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
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 3. List cards (extended filters)
  server.registerTool(
    "list-cards",
    {
      title: "List Cards",
      description:
        "List cards with flexible filters. Can filter by board, column, lane, member, owner, sprint, tags, state, dates, overdue, text search. Returns id, title, column, lane, members, tags, size, state, dates.",
      inputSchema: z.object({
        board_id: z.number().optional().describe("Filter by board ID"),
        column_id: z.number().optional().describe("Filter by column ID"),
        lane_id: z.number().optional().describe("Filter by lane ID"),
        member_id: z.number().optional().describe("Filter by member ID"),
        owner_id: z.number().optional().describe("Filter by owner (creator) ID"),
        sprint_id: z.number().optional().describe("Filter by sprint ID"),
        condition: z.number().optional().describe("1=on board, 2=archived"),
        states: z.string().optional().describe("Comma-separated states: 1=queued, 2=inProgress, 3=done"),
        tag_ids: z.string().optional().describe("Comma-separated tag IDs"),
        query: z.string().optional().describe("Search cards by text"),
        overdue: z.boolean().optional().describe("Only overdue cards"),
        asap: z.boolean().optional().describe("Only ASAP cards"),
        due_date_before: z.string().optional().describe("Due date before (ISO 8601)"),
        due_date_after: z.string().optional().describe("Due date after (ISO 8601)"),
        created_after: z.string().optional().describe("Created after (ISO 8601)"),
        updated_after: z.string().optional().describe("Updated after (ISO 8601)"),
        limit: z.number().optional().default(50).describe("Max cards (max 100)"),
        offset: z.number().optional().default(0).describe("Offset for pagination"),
      }),
    },
    async (params) => {
      const cards = await kaiten.getCards(params);

      const result = cards.map((c) => ({
        id: c.id,
        title: c.title,
        column: c.column?.title ?? c.column_id,
        lane: c.lane?.title ?? c.lane_id,
        board_id: c.board_id,
        state: c.state, // 1=queued, 2=inProgress, 3=done
        condition: c.condition, // 1=active, 2=archived
        members: c.members?.map((m) => ({ name: m.full_name, type: m.type })) ?? [],
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

  // 4. Get card details (full)
  server.registerTool(
    "get-card",
    {
      title: "Get Card Details",
      description:
        "Get full card details: description, comments, checklists, blockers, children, parents, external links, files, time logs, custom properties, location history.",
      inputSchema: z.object({
        card_id: z.number().describe("Card ID"),
      }),
    },
    async ({ card_id }) => {
      const [card, comments, children, blockers, externalLinks, timeLogs, history] =
        await Promise.all([
          kaiten.getCard(card_id),
          kaiten.getCardComments(card_id).catch(() => []),
          kaiten.getCardChildren(card_id).catch(() => []),
          kaiten.getCardBlockers(card_id).catch(() => []),
          kaiten.getCardExternalLinks(card_id).catch(() => []),
          kaiten.getCardTimeLogs(card_id).catch(() => []),
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
                board: card.board?.title ?? card.board_id,
                column: card.column?.title ?? card.column_id,
                lane: card.lane?.title ?? card.lane_id,
                owner: card.owner?.full_name ?? card.owner_id,
                type: card.type?.name ?? card.type_id,
                state: card.state,
                condition: card.condition,
                size: card.size,
                size_text: card.size_text,
                asap: card.asap,
                blocked: card.blocked,
                sprint_id: card.sprint_id,
                external_id: card.external_id,
                created: card.created,
                updated: card.updated,
                due_date: card.due_date,
                planned_start: card.planned_start,
                planned_end: card.planned_end,
                completed_at: card.completed_at,
                completed_on_time: card.completed_on_time,
                first_moved_to_in_progress_at: card.first_moved_to_in_progress_at,
                last_moved_to_done_at: card.last_moved_to_done_at,
                time_spent_sum: card.time_spent_sum,
                time_blocked_sum: card.time_blocked_sum,
                members: card.members?.map((m) => ({
                  id: m.id,
                  name: m.full_name,
                  type: m.type, // 1=member, 2=responsible
                })),
                tags: card.tags?.map((t) => ({ id: t.id, name: t.name, color: t.color })),
                properties: card.properties,
                checklists: card.checklists?.map((cl) => ({
                  id: cl.id,
                  name: cl.name ?? cl.title,
                  items: cl.items?.map((i) => ({
                    id: i.id,
                    text: i.text,
                    checked: i.checked,
                  })),
                })),
                blockers: blockers.map((b) => ({
                  id: b.id,
                  reason: b.reason,
                  released: b.released,
                  blocker_card_id: b.blocker_card_id,
                  blocker_card_title: b.blocker_card_title,
                  due_date: b.due_date,
                  created: b.created,
                })),
                external_links: externalLinks.map((l) => ({
                  id: l.id,
                  url: l.url,
                  description: l.description,
                })),
                files: card.files?.map((f) => ({
                  id: f.id,
                  name: f.name,
                  size: f.size,
                  url: f.url,
                  type: f.type,
                })),
                time_logs: timeLogs.map((t) => ({
                  id: t.id,
                  user: t.user?.full_name ?? t.user_id,
                  role: t.role?.name,
                  time_spent_minutes: t.time_spent,
                  for_date: t.for_date,
                  comment: t.comment,
                })),
                comments: comments.map((c) => ({
                  id: c.id,
                  author: c.author?.full_name,
                  date: c.created,
                  text: c.text,
                  edited: c.edited,
                })),
                children: children.map((c) => ({
                  id: c.id,
                  title: c.title,
                  state: c.state,
                  column: c.column?.title,
                })),
                parents: card.parents?.map((p) => ({
                  id: p.id,
                  title: p.title,
                })),
                children_count: card.children_count,
                children_done: card.children_done,
                parents_count: card.parents_count,
                location_history: history.map((h) => ({
                  column: h.column_title,
                  board_id: h.board_id,
                  lane_id: h.lane_id,
                  condition: h.condition,
                  date: h.changed ?? h.created,
                  author: h.author?.full_name,
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
      description: "List sprints from Kaiten. Optionally filter by active status.",
      inputSchema: z.object({
        active: z.boolean().optional().describe("Filter: true=active only, false=inactive only"),
        limit: z.number().optional().default(100).describe("Max sprints (max 100)"),
        offset: z.number().optional().default(0).describe("Offset for pagination"),
      }),
    },
    async ({ active, limit, offset }) => {
      const sprints = await kaiten.getSprints({ active, limit, offset });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              sprints.map((s) => ({
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

  // 7. Current user
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

  // 10. Get card blockers (detailed)
  server.registerTool(
    "get-card-blockers",
    {
      title: "Get Card Blockers",
      description:
        "Get detailed blocker info for a card: reason, blocking card, released status, due date.",
      inputSchema: z.object({
        card_id: z.number().describe("Card ID"),
      }),
    },
    async ({ card_id }) => {
      const blockers = await kaiten.getCardBlockers(card_id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              blockers.map((b) => ({
                id: b.id,
                reason: b.reason,
                released: b.released,
                blocker_card_id: b.blocker_card_id,
                blocker_card_title: b.blocker_card_title,
                due_date: b.due_date,
                created: b.created,
                updated: b.updated,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 11. Get card time logs
  server.registerTool(
    "get-card-time-logs",
    {
      title: "Get Card Time Logs",
      description:
        "Get time tracking logs for a card: who spent how much time, on which date, with what role.",
      inputSchema: z.object({
        card_id: z.number().describe("Card ID"),
        for_date: z.string().optional().describe("Filter by date (ISO 8601)"),
      }),
    },
    async ({ card_id, for_date }) => {
      const logs = await kaiten.getCardTimeLogs(card_id, { for_date });
      const totalMinutes = logs.reduce((sum, l) => sum + l.time_spent, 0);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                card_id,
                total_time_spent_minutes: totalMinutes,
                total_time_spent_hours: Math.round((totalMinutes / 60) * 100) / 100,
                logs: logs.map((t) => ({
                  id: t.id,
                  user: t.user?.full_name ?? t.user_id,
                  role: t.role?.name,
                  time_spent_minutes: t.time_spent,
                  for_date: t.for_date,
                  comment: t.comment,
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

  // 12. Get card external links
  server.registerTool(
    "get-card-external-links",
    {
      title: "Get Card External Links",
      description: "Get external links attached to a card (URLs with descriptions).",
      inputSchema: z.object({
        card_id: z.number().describe("Card ID"),
      }),
    },
    async ({ card_id }) => {
      const links = await kaiten.getCardExternalLinks(card_id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              links.map((l) => ({
                id: l.id,
                url: l.url,
                description: l.description,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 13. Search cards across all boards
  server.registerTool(
    "search-cards",
    {
      title: "Search Cards",
      description:
        "Search cards across all boards by text query. Can also filter by overdue, ASAP, date ranges.",
      inputSchema: z.object({
        query: z.string().describe("Search text (matches title and description)"),
        overdue: z.boolean().optional().describe("Only overdue cards"),
        asap: z.boolean().optional().describe("Only ASAP cards"),
        states: z.string().optional().describe("Comma-separated states: 1=queued, 2=inProgress, 3=done"),
        limit: z.number().optional().default(50).describe("Max cards (max 100)"),
      }),
    },
    async ({ query, overdue, asap, states, limit }) => {
      const cards = await kaiten.getCards({ query, overdue, asap, states, limit });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: cards.length,
                cards: cards.map((c) => ({
                  id: c.id,
                  title: c.title,
                  board: c.board?.title ?? c.board_id,
                  column: c.column?.title ?? c.column_id,
                  state: c.state,
                  members: c.members?.map((m) => m.full_name) ?? [],
                  due_date: c.due_date,
                  updated: c.updated,
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

  return server;
}

// --- HTTP Transport setup ---

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// --- Startup validation: fail closed on misconfiguration ---
if (!oauth.ALLOW_UNAUTHENTICATED) {
  if (!process.env.OAUTH_CLIENT_ID || !process.env.OAUTH_CLIENT_SECRET) {
    console.error(
      "FATAL: OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET are required in production. " +
        "Set ALLOW_UNAUTHENTICATED=1 for local dev only."
    );
    process.exit(1);
  }
  if (!process.env.OWNER_PASSWORD) {
    console.error(
      "FATAL: OWNER_PASSWORD is required. It gates who can complete the OAuth authorize step."
    );
    process.exit(1);
  }
  if (!process.env.OAUTH_REDIRECT_URIS) {
    console.error(
      "FATAL: OAUTH_REDIRECT_URIS is required (comma-separated whitelist of allowed redirect URIs)."
    );
    process.exit(1);
  }
  if (!process.env.KAITEN_HOST || !process.env.KAITEN_TOKEN) {
    console.error("FATAL: KAITEN_HOST and KAITEN_TOKEN are required.");
    process.exit(1);
  }
}

const app = express();

// Trust the first reverse proxy (Railway/Render ingress). Prevents clients
// from spoofing X-Forwarded-* headers directly.
app.set("trust proxy", 1);

// Small body limits — OAuth and MCP JSON-RPC payloads are tiny
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

app.use(
  cors({
    exposedHeaders: ["Mcp-Session-Id", "Last-Event-Id", "Mcp-Protocol-Version"],
    origin: process.env.CORS_ORIGIN || "https://claude.ai",
    credentials: true,
  })
);

// --- Simple in-memory rate limiter (per-IP, fixed window) ---

function createRateLimiter(windowMs: number, max: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return function limiter(req: Request, res: Response, next: () => void) {
    const key = req.ip || "unknown";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > max) {
      res
        .status(429)
        .set("Retry-After", String(Math.ceil((entry.reset - now) / 1000)))
        .json({ error: "rate_limited" });
      return;
    }
    next();
  };
}

// OAuth endpoints are unauthenticated and attractive to attackers — tight cap.
const oauthLimiter = createRateLimiter(60_000, 20); // 20 req / min / IP
// MCP endpoint is authenticated but worth limiting to prevent bearer-token abuse.
const mcpLimiter = createRateLimiter(60_000, 120); // 120 req / min / IP

// --- OAuth endpoints (no auth, but rate-limited) ---
app.get(
  "/.well-known/oauth-protected-resource",
  oauth.protectedResourceMetadata
);
app.get("/.well-known/oauth-authorization-server", oauth.authServerMetadata);
app.post("/oauth/register", oauthLimiter, oauth.registerClient);
app.get("/oauth/authorize", oauthLimiter, oauth.authorize);
app.post("/oauth/authorize", oauthLimiter, oauth.authorizeApprove);
app.post("/oauth/token", oauthLimiter, oauth.token);

// Health check (no auth) — minimal info, no internal state
app.get("/health", (_req, res) => {
  const configured = !!process.env.KAITEN_HOST && !!process.env.KAITEN_TOKEN;
  res.json({
    status: configured ? "ok" : "misconfigured",
  });
});

// Session store — capped to prevent unbounded memory growth from stuck sessions.
const MAX_SESSIONS = 256;
const transports: Record<string, StreamableHTTPServerTransport> = {};

// POST /mcp — main MCP endpoint
app.post(
  "/mcp",
  mcpLimiter,
  oauth.requireBearerAuth,
  async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // Cap concurrent sessions — prevents a flood of init requests from
      // exhausting server memory.
      if (Object.keys(transports).length >= MAX_SESSIONS) {
        res.status(503).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Too many sessions" },
          id: null,
        });
        return;
      }

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
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error handling MCP request:", message);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
  }
);

// GET /mcp — SSE stream
app.get(
  "/mcp",
  mcpLimiter,
  oauth.requireBearerAuth,
  async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(404).send("Session not found");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  }
);

// DELETE /mcp — session termination
app.delete(
  "/mcp",
  mcpLimiter,
  oauth.requireBearerAuth,
  async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(404).send("Session not found");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  }
);

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
