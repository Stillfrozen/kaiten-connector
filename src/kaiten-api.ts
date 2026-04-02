function getConfig() {
  const host = process.env.KAITEN_HOST;
  const token = process.env.KAITEN_TOKEN;
  if (!host || !token) {
    throw new Error("KAITEN_HOST and KAITEN_TOKEN environment variables are required");
  }
  return { host, token };
}

async function api<T = unknown>(path: string): Promise<T> {
  const { host, token } = getConfig();
  const res = await fetch(`https://${host}/api/latest${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kaiten API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// --- Types (minimal, matching what API returns) ---

export interface Space {
  id: number;
  title: string;
  boards?: Board[];
}

export interface Board {
  id: number;
  title: string;
  columns?: Column[];
}

export interface Column {
  id: number;
  title: string;
  sort_order: number;
  wip_limit?: number;
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
}

export interface Card {
  id: number;
  title: string;
  description?: string;
  column_id?: number;
  board_id?: number;
  size?: number;
  created: string;
  updated: string;
  due_date?: string;
  members?: CardMember[];
  tags?: Tag[];
  checklists?: Checklist[];
  blockers?: Blocker[];
  custom_properties?: Record<string, unknown>[];
  external_links?: unknown[];
  condition?: number;
  sprint_id?: number;
  column?: { title: string };
}

export interface CardMember {
  id: number;
  full_name: string;
  username?: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface Checklist {
  id: number;
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
  blocker_type?: string;
}

export interface Comment {
  id: number;
  text: string;
  author?: { full_name: string };
  created: string;
}

export interface Sprint {
  id: number;
  title: string;
  started_at?: string;
  finished_at?: string;
  status?: string;
}

export interface User {
  id: number;
  full_name: string;
  email?: string;
  username?: string;
  role?: string;
}

export interface LocationHistory {
  id: number;
  column_title?: string;
  created: string;
}

// --- API functions ---

export async function getSpaces(): Promise<Space[]> {
  return api<Space[]>("/spaces");
}

export async function getSpaceBoards(spaceId: number): Promise<Board[]> {
  return api<Board[]>(`/spaces/${spaceId}/boards`);
}

export async function getBoard(boardId: number): Promise<Board> {
  return api<Board>(`/board/${boardId}`);
}

export async function getBoardColumns(boardId: number): Promise<Column[]> {
  return api<Column[]>(`/board/${boardId}/columns`);
}

export async function getBoardLanes(boardId: number): Promise<Lane[]> {
  return api<Lane[]>(`/boards/${boardId}/lanes`);
}

export async function getColumnSubcolumns(columnId: number): Promise<SubColumn[]> {
  return api<SubColumn[]>(`/column/${columnId}/subcolumns`);
}

export async function getCards(params: {
  board_id?: number;
  sprint_id?: number;
  column_id?: number;
  member_id?: number;
  condition?: number;
  limit?: number;
  offset?: number;
}): Promise<Card[]> {
  const qs = new URLSearchParams();
  if (params.board_id) qs.set("board_id", String(params.board_id));
  if (params.sprint_id) qs.set("sprint_id", String(params.sprint_id));
  if (params.column_id) qs.set("column_id", String(params.column_id));
  if (params.member_id) qs.set("member_id", String(params.member_id));
  if (params.condition) qs.set("condition", String(params.condition));
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

export async function getCardLocationHistory(cardId: number): Promise<LocationHistory[]> {
  return api<LocationHistory[]>(`/cards/${cardId}/location-history`);
}

export async function getSprints(): Promise<Sprint[]> {
  return api<Sprint[]>("/sprints");
}

export async function getUsers(): Promise<User[]> {
  return api<User[]>("/users");
}

export async function getCurrentUser(): Promise<User> {
  return api<User>("/users/current");
}
