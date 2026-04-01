---
name: kaiten-backlog
description: Analyze backlog on a Kaiten board — card counts by column, blockers, workload by member, overdue items. Use when the user asks about backlog health, workload, bottlenecks, or board analytics.
---

# Kaiten: Backlog Analytics

Aggregate and analyze data from a Kaiten board to provide backlog health metrics.

## Prerequisites

- `KAITEN_HOST` and `KAITEN_TOKEN` must be set
- Board ID is required (passed as `$ARGUMENTS`)

If no board ID is provided, ask the user or suggest running `kaiten-boards` first.

## Steps

### 1. Fetch board structure

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/board/$ARGUMENTS/columns"
```

### 2. Fetch all cards on the board

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/cards?board_id=$ARGUMENTS&limit=200&condition=1"
```

Paginate if needed to get all active cards.

### 3. Analyze and aggregate

Calculate the following metrics:

**Distribution by column:**
- Count cards in each column
- Compare against WIP limits
- Flag columns exceeding WIP limits

**Blockers:**
- Count blocked cards
- List top blockers with reasons

**Workload by member:**
- Count cards assigned to each member
- Identify overloaded members (>10 cards)
- Identify unassigned cards

**Aging:**
- Cards without updates for >7 days
- Cards without updates for >30 days
- Oldest cards in "In Progress" equivalent columns

**Due dates:**
- Overdue cards (due date in the past)
- Cards due this week
- Cards without due dates

### 4. Present results

```
Backlog Analytics: "Board Name"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total active cards: N

Distribution by column:
| Column | Cards | WIP Limit | Status |
|--------|-------|-----------|--------|
| To Do | 15 | - | OK |
| In Progress | 8 | 5 | OVER LIMIT |
| Review | 3 | 4 | OK |
| Done | 12 | - | OK |

Blockers (N):
- Card #123: "Title" — reason
- Card #456: "Title" — reason

Workload:
| Member | Cards | Status |
|--------|-------|--------|
| User1 | 12 | Overloaded |
| User2 | 5 | OK |
| Unassigned | 3 | Needs attention |

Aging alerts:
- N cards stale >7 days
- N cards stale >30 days
- Oldest in-progress: Card #ID (X days)

Due dates:
- N overdue
- N due this week
- N without due date
```

Provide actionable recommendations based on the analysis.
