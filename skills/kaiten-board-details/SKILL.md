---
name: kaiten-board-details
description: Get detailed structure of a Kaiten board — columns, lanes, WIP limits. Use when the user asks about a specific board's structure or layout.
---

# Kaiten: Board Details

Fetch and display the full structure of a specific Kaiten board including columns, subcolumns, and lanes.

## Prerequisites

- `KAITEN_HOST` and `KAITEN_TOKEN` must be set
- Board ID is required (passed as `$ARGUMENTS`)

If no board ID is provided, ask the user for it or suggest running `kaiten-boards` first.

## Steps

### 1. Fetch board metadata

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/board/$ARGUMENTS"
```

### 2. Fetch columns

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/board/$ARGUMENTS/columns"
```

### 3. Fetch lanes

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/boards/$ARGUMENTS/lanes"
```

### 4. For columns that have subcolumns, fetch them

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/column/{column_id}/subcolumns"
```

### 5. Present results

Display the board structure as a tree:

```
Board: "Board Name" (ID: 123)
├── Column: "To Do" (ID: 1, WIP: 5)
│   ├── Subcolumn: "New" (ID: 10)
│   └── Subcolumn: "Refined" (ID: 11)
├── Column: "In Progress" (ID: 2, WIP: 3)
└── Column: "Done" (ID: 3)

Lanes:
├── Lane: "Team A" (ID: 100)
└── Lane: "Team B" (ID: 101)
```

Include WIP limits where set. Hint the user they can use `kaiten-cards` to see cards on this board.
