import { api } from "./client.js";
import type {
  Board,
  Blocker,
  Card,
  CardMember,
  Column,
  Comment,
  ExternalLink,
  Lane,
  LocationHistory,
  Space,
  Sprint,
  SubColumn,
  Tag,
  TimeLog,
  User,
} from "./types.js";

// --- Spaces & Boards ---

export async function getSpaces(): Promise<Space[]> {
  return api<Space[]>("/spaces");
}

export async function getSpaceBoards(spaceId: number): Promise<Board[]> {
  return api<Board[]>(`/spaces/${spaceId}/boards`);
}

export async function getBoard(boardId: number): Promise<Board> {
  return api<Board>(`/boards/${boardId}`);
}

export async function getBoardColumns(boardId: number): Promise<Column[]> {
  return api<Column[]>(`/boards/${boardId}/columns`);
}

export async function getBoardLanes(
  boardId: number,
  condition?: number
): Promise<Lane[]> {
  const qs = condition ? `?condition=${condition}` : "";
  return api<Lane[]>(`/boards/${boardId}/lanes${qs}`);
}

export async function getColumnSubcolumns(
  columnId: number
): Promise<SubColumn[]> {
  return api<SubColumn[]>(`/columns/${columnId}/subcolumns`);
}

// --- Cards ---

export interface GetCardsParams {
  board_id?: number;
  sprint_id?: number;
  column_id?: number;
  lane_id?: number;
  member_id?: number;
  owner_id?: number;
  responsible_id?: number;
  condition?: number;
  states?: string; // comma-separated: 1,2,3
  tag_ids?: string; // comma-separated
  type_id?: number;
  due_date_before?: string;
  due_date_after?: string;
  created_before?: string;
  created_after?: string;
  updated_before?: string;
  updated_after?: string;
  overdue?: boolean;
  asap?: boolean;
  archived?: boolean;
  query?: string;
  external_id?: string;
  limit?: number;
  offset?: number;
}

// Maps the raw Kaiten parameter names. Most of them line up 1:1; member_id is
// the only rename (Kaiten expects `member_ids`).
const CARD_PARAM_NAMES: Record<keyof GetCardsParams, string> = {
  board_id: "board_id",
  sprint_id: "sprint_id",
  column_id: "column_id",
  lane_id: "lane_id",
  member_id: "member_ids",
  owner_id: "owner_id",
  responsible_id: "responsible_id",
  condition: "condition",
  states: "states",
  tag_ids: "tag_ids",
  type_id: "type_id",
  due_date_before: "due_date_before",
  due_date_after: "due_date_after",
  created_before: "created_before",
  created_after: "created_after",
  updated_before: "updated_before",
  updated_after: "updated_after",
  overdue: "overdue",
  asap: "asap",
  archived: "archived",
  query: "query",
  external_id: "external_id",
  limit: "limit",
  offset: "offset",
};

function buildCardsQuery(params: GetCardsParams): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [key, apiKey] of Object.entries(CARD_PARAM_NAMES)) {
    const value = params[key as keyof GetCardsParams];
    if (value === undefined) continue;
    // Skip falsy numeric ids (0 is not a valid Kaiten id), but keep explicit booleans.
    if (typeof value === "number" && value === 0 && key !== "offset") continue;
    qs.set(apiKey, String(value));
  }
  // Default limit if caller omitted it.
  if (!qs.has("limit")) qs.set("limit", "50");
  return qs;
}

export async function getCards(params: GetCardsParams): Promise<Card[]> {
  const qs = buildCardsQuery(params);
  return api<Card[]>(`/cards?${qs.toString()}`);
}

export async function getCard(cardId: number): Promise<Card> {
  return api<Card>(`/cards/${cardId}`);
}

export async function getCardComments(cardId: number): Promise<Comment[]> {
  return api<Comment[]>(`/cards/${cardId}/comments`);
}

export async function getCardChildren(cardId: number): Promise<Card[]> {
  return api<Card[]>(`/cards/${cardId}/children`);
}

export async function getCardBlockers(cardId: number): Promise<Blocker[]> {
  return api<Blocker[]>(`/cards/${cardId}/blockers`);
}

export async function getCardTags(cardId: number): Promise<Tag[]> {
  return api<Tag[]>(`/cards/${cardId}/tags`);
}

export async function getCardMembers(cardId: number): Promise<CardMember[]> {
  return api<CardMember[]>(`/cards/${cardId}/members`);
}

export async function getCardExternalLinks(
  cardId: number
): Promise<ExternalLink[]> {
  return api<ExternalLink[]>(`/cards/${cardId}/external-links`);
}

export async function getCardTimeLogs(
  cardId: number,
  params?: { for_date?: string; personal?: boolean }
): Promise<TimeLog[]> {
  const qs = new URLSearchParams();
  if (params?.for_date) qs.set("for_date", params.for_date);
  if (params?.personal !== undefined)
    qs.set("personal", String(params.personal));
  const query = qs.toString();
  return api<TimeLog[]>(`/cards/${cardId}/time-logs${query ? `?${query}` : ""}`);
}

export async function getCardLocationHistory(
  cardId: number
): Promise<LocationHistory[]> {
  return api<LocationHistory[]>(`/cards/${cardId}/location-history`);
}

// --- Sprints ---

export async function getSprints(params?: {
  active?: boolean;
  limit?: number;
  offset?: number;
}): Promise<Sprint[]> {
  const qs = new URLSearchParams();
  if (params?.active !== undefined) qs.set("active", String(params.active));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return api<Sprint[]>(`/sprints${query ? `?${query}` : ""}`);
}

// --- Users ---

export async function getCurrentUser(): Promise<User> {
  return api<User>("/users/current");
}
