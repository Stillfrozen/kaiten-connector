import { env } from "./env.js";

function getConfig() {
  const host = env("KAITEN_HOST");
  const token = env("KAITEN_TOKEN");
  if (!host || !token) {
    throw new Error("KAITEN_HOST and KAITEN_TOKEN environment variables are required");
  }
  // Defense in depth: KAITEN_HOST is used as URL host — reject anything that
  // could smuggle a scheme, path, or authority segment.
  if (!/^[a-z0-9.-]+$/i.test(host)) {
    throw new Error("KAITEN_HOST must be a plain hostname (e.g. mycompany.kaiten.ru)");
  }
  return { host, token };
}

// Serialized throttle: max 5 requests per second, globally across all callers.
// A single mutex chain ensures concurrent api() calls don't all read the same
// stale `lastRequestTime` and burst through the limit.
const MIN_INTERVAL_MS = 200; // 200ms between requests = 5 req/s
let throttleChain: Promise<void> = Promise.resolve();

async function throttle(): Promise<void> {
  const next = throttleChain.then(async () => {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS));
  });
  // Chain all future throttle() calls behind this one.
  throttleChain = next.catch(() => {});
  return next;
}

async function api<T = unknown>(path: string): Promise<T> {
  const { host, token } = getConfig();
  const url = `https://${host}/api/latest${path}`;

  await throttle();

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Retry once on 429
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") || "2", 10);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    await throttle();
    const retry = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!retry.ok) {
      throw new Error(`Kaiten API ${retry.status}`);
    }
    return retry.json() as Promise<T>;
  }

  if (!res.ok) {
    throw new Error(`Kaiten API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// --- Types (matching what API returns) ---

export interface Space {
  id: number;
  title: string;
  archived?: boolean;
  access?: number;
  entity_type?: string;
  external_id?: string;
  boards?: Board[];
}

export interface Board {
  id: number;
  title: string;
  description?: string;
  columns?: Column[];
  lanes?: Lane[];
  external_id?: string;
  cell_wip_limits?: boolean;
  default_card_type_id?: number;
  card_properties?: unknown[];
}

export interface Column {
  id: number;
  title: string;
  sort_order: number;
  col_count?: number;
  wip_limit?: number;
  wip_limit_type?: number; // 1=count, 2=size
  type?: number; // 1=queue, 2=in progress, 3=done
  board_id?: number;
  column_id?: number; // parent column id
  external_id?: string;
  subcolumns?: SubColumn[];
}

export interface SubColumn {
  id: number;
  title: string;
  sort_order: number;
}

export interface Lane {
  id: number;
  title: string;
  sort_order?: number;
  row_count?: number;
  wip_limit?: number;
  wip_limit_type?: number;
  board_id?: number;
  condition?: number;
  external_id?: string;
}

export interface Card {
  id: number;
  title: string;
  description?: string;
  column_id?: number;
  board_id?: number;
  lane_id?: number;
  owner_id?: number;
  type_id?: number;
  sprint_id?: number;
  size?: number;
  size_text?: string;
  state?: number; // 1=queued, 2=inProgress, 3=done
  condition?: number; // 1=on board, 2=archived
  asap?: boolean;
  archived?: boolean;
  created: string;
  updated: string;
  due_date?: string;
  planned_start?: string;
  planned_end?: string;
  completed_at?: string;
  completed_on_time?: boolean;
  last_moved_at?: string;
  first_moved_to_in_progress_at?: string;
  last_moved_to_done_at?: string;
  external_id?: string;
  parents_count?: number;
  children_count?: number;
  children_done?: number;
  time_spent_sum?: number;
  time_blocked_sum?: number;
  blocking_card?: boolean;
  blocked?: boolean;
  members?: CardMember[];
  tags?: Tag[];
  checklists?: Checklist[];
  blockers?: Blocker[];
  custom_properties?: Record<string, unknown>[];
  properties?: Record<string, unknown>;
  external_links?: ExternalLink[];
  files?: CardFile[];
  column?: { id?: number; title: string };
  lane?: { id?: number; title: string };
  board?: { id?: number; title?: string };
  owner?: { id?: number; full_name?: string };
  type?: { id?: number; name?: string };
  parents?: Card[];
  children?: Card[];
}

export interface CardMember {
  id: number;
  full_name: string;
  username?: string;
  email?: string;
  type?: number; // 1=member, 2=responsible
}

export interface Tag {
  id: number;
  name: string;
  color?: number;
}

export interface Checklist {
  id: number;
  name?: string;
  title?: string;
  items: ChecklistItem[];
}

export interface ChecklistItem {
  id: number;
  text: string;
  checked: boolean;
}

export interface Blocker {
  id: number;
  reason: string;
  card_id?: number;
  blocker_id?: number;
  blocker_card_id?: number;
  blocker_card_title?: string;
  blocker_type?: string;
  released?: boolean;
  released_by_id?: number;
  due_date?: string;
  due_date_time_present?: boolean;
  created?: string;
  updated?: string;
  blocked_card?: { id?: number; title?: string };
  blocker_card?: { id?: number; title?: string };
}

export interface ExternalLink {
  id: number;
  url: string;
  description?: string;
  card_id?: number;
  created?: string;
  updated?: string;
}

export interface CardFile {
  id: number;
  name: string;
  size?: number;
  url?: string;
  type?: number; // 1=attachment, 2=googleDrive, etc.
  card_cover?: boolean;
  author_id?: number;
  created?: string;
}

export interface Comment {
  id: number;
  text: string;
  type?: number; // 1=markdown, 2=html
  author_id?: number;
  author?: { id?: number; full_name: string };
  created: string;
  updated?: string;
  edited?: boolean;
}

export interface Sprint {
  id: number;
  title: string;
  goal?: string;
  board_id?: number;
  active?: boolean;
  start_date?: string;
  finish_date?: string;
  actual_finish_date?: string;
  committed?: number;
  velocity?: number;
  velocity_details?: Record<string, unknown>;
  status?: string;
  started_at?: string;
  finished_at?: string;
  created?: string;
  updated?: string;
}

export interface User {
  id: number;
  full_name: string;
  email?: string;
  username?: string;
  role?: number; // 1=owner, 2=user, 3=deactivated
  activated?: boolean;
  last_request_date?: string;
}

export interface UserRole {
  id: number;
  uid?: string;
  name: string;
  company_id?: number;
  created?: string;
  updated?: string;
}

export interface TimeLog {
  id: number;
  card_id: number;
  user_id: number;
  role_id?: number;
  author_id?: number;
  time_spent: number; // minutes
  for_date?: string;
  comment?: string;
  created?: string;
  updated?: string;
  role?: { id?: number; name?: string };
  user?: { id?: number; full_name?: string };
  author?: { id?: number; full_name?: string };
}

export interface CustomProperty {
  id: number;
  name: string;
  type?: string;
  show_on_facade?: boolean;
  multiline?: boolean;
  multi_select?: boolean;
  colorful?: boolean;
  condition?: number;
  external_id?: string;
  created?: string;
  updated?: string;
  values?: CustomPropertyValue[];
}

export interface CustomPropertyValue {
  id: number;
  value?: string;
  color?: number;
  sort_order?: number;
}

export interface LocationHistory {
  id: number;
  card_id?: number;
  board_id?: number;
  column_id?: number;
  subcolumn_id?: number;
  lane_id?: number;
  sprint_id?: number;
  author_id?: number;
  column_title?: string;
  condition?: number;
  changed?: string;
  created: string;
  author?: { id?: number; full_name?: string };
}

// --- API functions ---

// Spaces & Boards

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

export async function getBoardLanes(boardId: number, condition?: number): Promise<Lane[]> {
  const qs = condition ? `?condition=${condition}` : "";
  return api<Lane[]>(`/boards/${boardId}/lanes${qs}`);
}

export async function getColumnSubcolumns(columnId: number): Promise<SubColumn[]> {
  return api<SubColumn[]>(`/columns/${columnId}/subcolumns`);
}

// Cards

export async function getCards(params: {
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
}): Promise<Card[]> {
  const qs = new URLSearchParams();
  if (params.board_id) qs.set("board_id", String(params.board_id));
  if (params.sprint_id) qs.set("sprint_id", String(params.sprint_id));
  if (params.column_id) qs.set("column_id", String(params.column_id));
  if (params.lane_id) qs.set("lane_id", String(params.lane_id));
  if (params.member_id) qs.set("member_ids", String(params.member_id));
  if (params.owner_id) qs.set("owner_id", String(params.owner_id));
  if (params.responsible_id) qs.set("responsible_id", String(params.responsible_id));
  if (params.condition) qs.set("condition", String(params.condition));
  if (params.states) qs.set("states", params.states);
  if (params.tag_ids) qs.set("tag_ids", params.tag_ids);
  if (params.type_id) qs.set("type_id", String(params.type_id));
  if (params.due_date_before) qs.set("due_date_before", params.due_date_before);
  if (params.due_date_after) qs.set("due_date_after", params.due_date_after);
  if (params.created_before) qs.set("created_before", params.created_before);
  if (params.created_after) qs.set("created_after", params.created_after);
  if (params.updated_before) qs.set("updated_before", params.updated_before);
  if (params.updated_after) qs.set("updated_after", params.updated_after);
  if (params.overdue !== undefined) qs.set("overdue", String(params.overdue));
  if (params.asap !== undefined) qs.set("asap", String(params.asap));
  if (params.archived !== undefined) qs.set("archived", String(params.archived));
  if (params.query) qs.set("query", params.query);
  if (params.external_id) qs.set("external_id", params.external_id);
  qs.set("limit", String(params.limit ?? 50));
  if (params.offset) qs.set("offset", String(params.offset));
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

export async function getCardExternalLinks(cardId: number): Promise<ExternalLink[]> {
  return api<ExternalLink[]>(`/cards/${cardId}/external-links`);
}

export async function getCardTimeLogs(cardId: number, params?: {
  for_date?: string;
  personal?: boolean;
}): Promise<TimeLog[]> {
  const qs = new URLSearchParams();
  if (params?.for_date) qs.set("for_date", params.for_date);
  if (params?.personal !== undefined) qs.set("personal", String(params.personal));
  const query = qs.toString();
  return api<TimeLog[]>(`/cards/${cardId}/time-logs${query ? `?${query}` : ""}`);
}

export async function getCardLocationHistory(cardId: number): Promise<LocationHistory[]> {
  return api<LocationHistory[]>(`/cards/${cardId}/location-history`);
}

// Sprints

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

// Users & Roles

export async function getUsers(params?: {
  query?: string;
  ids?: string;
  include_inactive?: boolean;
  limit?: number;
  offset?: number;
}): Promise<User[]> {
  const qs = new URLSearchParams();
  if (params?.query) qs.set("query", params.query);
  if (params?.ids) qs.set("ids", params.ids);
  if (params?.include_inactive !== undefined) qs.set("include_inactive", String(params.include_inactive));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return api<User[]>(`/users${query ? `?${query}` : ""}`);
}

export async function getCurrentUser(): Promise<User> {
  return api<User>("/users/current");
}

export async function getUserRoles(): Promise<UserRole[]> {
  return api<UserRole[]>("/user-roles");
}

// Custom Properties

export async function getCustomProperties(params?: {
  include_values?: boolean;
}): Promise<CustomProperty[]> {
  const qs = new URLSearchParams();
  if (params?.include_values !== undefined) qs.set("include_values", String(params.include_values));
  const query = qs.toString();
  return api<CustomProperty[]>(`/company/custom-properties${query ? `?${query}` : ""}`);
}
