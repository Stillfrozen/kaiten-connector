import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as kaiten from "../../kaiten-api.js";
import { textResult } from "../shape.js";

const PAGE_SIZE = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fetch all active cards on a board, paginating until the page is short. */
async function fetchAllActiveCards(board_id: number): Promise<kaiten.Card[]> {
  const all: kaiten.Card[] = [];
  let offset = 0;
  for (;;) {
    const page = await kaiten.getCards({
      board_id,
      condition: 1,
      limit: PAGE_SIZE,
      offset,
    });
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

function distributionByColumn(columns: kaiten.Column[], cards: kaiten.Card[]) {
  return columns.map((col) => {
    const count = cards.filter((c) => c.column_id === col.id).length;
    return {
      column: col.title,
      column_id: col.id,
      cards: count,
      wip_limit: col.wip_limit,
      over_limit: col.wip_limit ? count > col.wip_limit : false,
    };
  });
}

interface BlockedCardRow {
  card_id: number;
  title: string;
  blockers: string[];
}

function collectBlocked(cards: kaiten.Card[]): BlockedCardRow[] {
  return cards.flatMap((c) => {
    const blockers = c.blockers;
    if (!blockers || blockers.length === 0) return [];
    return [
      { card_id: c.id, title: c.title, blockers: blockers.map((b) => b.reason) },
    ];
  });
}

interface WorkloadReport {
  members: { member_id: number; cards: number; overloaded: boolean }[];
  unassigned: number;
}

// PRIVACY: aggregated by stable member_id, never by full_name. The model
// sees workload distribution and overloaded assignees without learning
// their identities.
function computeWorkload(cards: kaiten.Card[]): WorkloadReport {
  const memberMap = new Map<number, number>();
  let unassigned = 0;
  for (const card of cards) {
    if (!card.members || card.members.length === 0) {
      unassigned++;
      continue;
    }
    for (const m of card.members) {
      memberMap.set(m.id, (memberMap.get(m.id) ?? 0) + 1);
    }
  }
  const members = [...memberMap.entries()]
    .map(([id, count]) => ({
      member_id: id,
      cards: count,
      overloaded: count > 10,
    }))
    .sort((a, b) => b.cards - a.cards);
  return { members, unassigned };
}

function computeAging(cards: kaiten.Card[], now: Date) {
  const nowTs = now.getTime();
  let stale7 = 0;
  let stale30 = 0;
  for (const c of cards) {
    const diff = nowTs - new Date(c.updated).getTime();
    if (diff > 30 * DAY_MS) stale30++;
    if (diff > 7 * DAY_MS) stale7++;
  }
  return { stale_7_days: stale7, stale_30_days: stale30 };
}

function computeDueDates(cards: kaiten.Card[], now: Date) {
  const weekFromNow = new Date(now.getTime() + 7 * DAY_MS);
  let overdue = 0;
  let dueThisWeek = 0;
  let noDueDate = 0;
  for (const c of cards) {
    if (!c.due_date) {
      noDueDate++;
      continue;
    }
    const due = new Date(c.due_date);
    if (due < now) overdue++;
    else if (due <= weekFromNow) dueThisWeek++;
  }
  return { overdue, due_this_week: dueThisWeek, no_due_date: noDueDate };
}

export function registerAnalyticsTools(server: McpServer): void {
  server.registerTool(
    "backlog-analytics",
    {
      title: "Backlog Analytics",
      description:
        "Analyze backlog on a board: card distribution by column, blockers, workload by member, aging, due dates.",
      inputSchema: z.object({
        board_id: z.coerce.number().int().positive().describe("Board ID"),
      }),
    },
    async ({ board_id }) => {
      const [columns, allCards] = await Promise.all([
        kaiten.getBoardColumns(board_id),
        fetchAllActiveCards(board_id),
      ]);
      const now = new Date();
      const blocked = collectBlocked(allCards);

      return textResult({
        total_active_cards: allCards.length,
        distribution_by_column: distributionByColumn(columns, allCards),
        blockers: { count: blocked.length, items: blocked },
        workload: computeWorkload(allCards),
        aging: computeAging(allCards, now),
        due_dates: computeDueDates(allCards, now),
      });
    }
  );
}
