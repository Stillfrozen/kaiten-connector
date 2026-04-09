// Kaiten API response shapes. Pure types — no runtime code.

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
