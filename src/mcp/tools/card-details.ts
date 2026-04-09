import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as kaiten from "../../kaiten-api.js";
import { textResult } from "../shape.js";

function shapeCoreCard(card: kaiten.Card) {
  return {
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
  };
}

function shapeCardTimes(card: kaiten.Card) {
  return {
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
  };
}

function shapeCardMembersTagsProps(card: kaiten.Card) {
  return {
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
  };
}

function shapeBlockerList(blockers: kaiten.Blocker[]) {
  return blockers.map((b) => ({
    id: b.id,
    reason: b.reason,
    released: b.released,
    blocker_card_id: b.blocker_card_id,
    blocker_card_title: b.blocker_card_title,
    due_date: b.due_date,
    created: b.created,
  }));
}

function shapeExternalLinks(links: kaiten.ExternalLink[]) {
  return links.map((l) => ({
    id: l.id,
    url: l.url,
    description: l.description,
  }));
}

function shapeTimeLogs(logs: kaiten.TimeLog[]) {
  return logs.map((t) => ({
    id: t.id,
    user: t.user?.full_name ?? t.user_id,
    role: t.role?.name,
    time_spent_minutes: t.time_spent,
    for_date: t.for_date,
    comment: t.comment,
  }));
}

function shapeCardRelations(card: kaiten.Card, children: kaiten.Card[]) {
  return {
    files: card.files?.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      url: f.url,
      type: f.type,
    })),
    children: children.map((c) => ({
      id: c.id,
      title: c.title,
      state: c.state,
      column: c.column?.title,
    })),
    parents: card.parents?.map((p) => ({ id: p.id, title: p.title })),
    children_count: card.children_count,
    children_done: card.children_done,
    parents_count: card.parents_count,
  };
}

function shapeComments(comments: kaiten.Comment[]) {
  return comments.map((c) => ({
    id: c.id,
    author: c.author?.full_name,
    date: c.created,
    text: c.text,
    edited: c.edited,
  }));
}

function shapeLocationHistory(history: kaiten.LocationHistory[]) {
  return history.map((h) => ({
    column: h.column_title,
    board_id: h.board_id,
    lane_id: h.lane_id,
    condition: h.condition,
    date: h.changed ?? h.created,
    author: h.author?.full_name,
  }));
}

interface CardDetailInputs {
  card: kaiten.Card;
  comments: kaiten.Comment[];
  children: kaiten.Card[];
  blockers: kaiten.Blocker[];
  externalLinks: kaiten.ExternalLink[];
  timeLogs: kaiten.TimeLog[];
  history: kaiten.LocationHistory[];
}

function assembleCardDetail(x: CardDetailInputs) {
  return {
    ...shapeCoreCard(x.card),
    ...shapeCardTimes(x.card),
    ...shapeCardMembersTagsProps(x.card),
    blockers: shapeBlockerList(x.blockers),
    external_links: shapeExternalLinks(x.externalLinks),
    time_logs: shapeTimeLogs(x.timeLogs),
    comments: shapeComments(x.comments),
    ...shapeCardRelations(x.card, x.children),
    location_history: shapeLocationHistory(x.history),
  };
}

function registerGetCard(server: McpServer): void {
  server.registerTool(
    "get-card",
    {
      title: "Get Card Details",
      description:
        "Get full card details: description, comments, checklists, blockers, children, parents, external links, files, time logs, custom properties, location history.",
      inputSchema: z.object({
        card_id: z.coerce.number().int().positive().describe("Card ID"),
      }),
    },
    async ({ card_id }) => {
      const [card, comments, children, blockers, externalLinks, timeLogs, history] =
        await Promise.all([
          kaiten.getCard(card_id),
          kaiten.getCardComments(card_id).catch(() => [] as kaiten.Comment[]),
          kaiten.getCardChildren(card_id).catch(() => [] as kaiten.Card[]),
          kaiten.getCardBlockers(card_id).catch(() => [] as kaiten.Blocker[]),
          kaiten
            .getCardExternalLinks(card_id)
            .catch(() => [] as kaiten.ExternalLink[]),
          kaiten.getCardTimeLogs(card_id).catch(() => [] as kaiten.TimeLog[]),
          kaiten
            .getCardLocationHistory(card_id)
            .catch(() => [] as kaiten.LocationHistory[]),
        ]);

      return textResult(
        assembleCardDetail({
          card,
          comments,
          children,
          blockers,
          externalLinks,
          timeLogs,
          history,
        })
      );
    }
  );
}

function registerGetCardBlockers(server: McpServer): void {
  server.registerTool(
    "get-card-blockers",
    {
      title: "Get Card Blockers",
      description:
        "Get detailed blocker info for a card: reason, blocking card, released status, due date.",
      inputSchema: z.object({
        card_id: z.coerce.number().int().positive().describe("Card ID"),
      }),
    },
    async ({ card_id }) => {
      const blockers = await kaiten.getCardBlockers(card_id);
      return textResult(
        blockers.map((b) => ({
          id: b.id,
          reason: b.reason,
          released: b.released,
          blocker_card_id: b.blocker_card_id,
          blocker_card_title: b.blocker_card_title,
          due_date: b.due_date,
          created: b.created,
          updated: b.updated,
        }))
      );
    }
  );
}

function registerGetCardTimeLogs(server: McpServer): void {
  server.registerTool(
    "get-card-time-logs",
    {
      title: "Get Card Time Logs",
      description:
        "Get time tracking logs for a card: who spent how much time, on which date, with what role.",
      inputSchema: z.object({
        card_id: z.coerce.number().int().positive().describe("Card ID"),
        for_date: z.string().max(64).optional().describe("Filter by date (ISO 8601)"),
      }),
    },
    async ({ card_id, for_date }) => {
      const logs = await kaiten.getCardTimeLogs(card_id, { for_date });
      const totalMinutes = logs.reduce((sum, l) => sum + l.time_spent, 0);
      return textResult({
        card_id,
        total_time_spent_minutes: totalMinutes,
        total_time_spent_hours: Math.round((totalMinutes / 60) * 100) / 100,
        logs: shapeTimeLogs(logs),
      });
    }
  );
}

function registerGetCardExternalLinks(server: McpServer): void {
  server.registerTool(
    "get-card-external-links",
    {
      title: "Get Card External Links",
      description: "Get external links attached to a card (URLs with descriptions).",
      inputSchema: z.object({
        card_id: z.coerce.number().int().positive().describe("Card ID"),
      }),
    },
    async ({ card_id }) => {
      const links = await kaiten.getCardExternalLinks(card_id);
      return textResult(shapeExternalLinks(links));
    }
  );
}

export function registerCardDetailTools(server: McpServer): void {
  registerGetCard(server);
  registerGetCardBlockers(server);
  registerGetCardTimeLogs(server);
  registerGetCardExternalLinks(server);
}
