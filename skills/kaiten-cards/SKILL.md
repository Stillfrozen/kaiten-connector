---
name: kaiten-cards
description: List and search cards on a Kaiten board with filtering. Use when the user asks about cards, tasks, or items on a board.
---

# Kaiten: Cards

Fetch and display cards from a Kaiten board with optional filtering.

## Prerequisites

- `KAITEN_HOST` and `KAITEN_TOKEN` must be set
- `$ARGUMENTS` should contain board_id and optionally filters

## Argument parsing

Parse `$ARGUMENTS` for:
- Board ID (required, first argument)
- Optional filters: `--column <id>`, `--member <id>`, `--tag <name>`, `--type <id>`, `--limit <n>` (default 50)

## Steps

### 1. Fetch cards

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/cards?board_id={board_id}&limit={limit}&offset={offset}"
```

Additional query parameters based on filters:
- `column_id` — filter by column
- `member_id` — filter by assigned member
- `condition` — filter by card state (1=active, 2=archived, 3=draft)

### 2. Handle pagination

If there are more cards than the limit, fetch additional pages using `offset` parameter.

### 3. Present results

Display as a table:

| ID | Title | Column | Members | Tags | Size | Created |
|----|-------|--------|---------|------|------|---------|
| ... | ... | ... | ... | ... | ... | ... |

Show total count. If results are truncated, mention how many more cards exist.

Hint the user they can use `kaiten-card-details <id>` to see full card details.
