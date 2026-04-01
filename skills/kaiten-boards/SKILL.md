---
name: kaiten-boards
description: List all spaces and boards from Kaiten. Use when the user asks about their Kaiten boards, spaces, or wants to see available boards.
---

# Kaiten: Spaces and Boards

Fetch and display all spaces and boards from the user's Kaiten instance.

## Prerequisites

Ensure environment variables are set:
- `KAITEN_HOST` — Kaiten domain (e.g. `mycompany.kaiten.ru`)
- `KAITEN_TOKEN` — API bearer token

If either is missing, ask the user to configure them.

## Steps

### 1. Fetch all spaces

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/spaces"
```

### 2. For each space, fetch its boards

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/space/{space_id}/boards"
```

### 3. Present results

Display as a structured table:

| Space | Space ID | Board | Board ID |
|-------|----------|-------|----------|
| ... | ... | ... | ... |

If $ARGUMENTS is provided, filter results by the argument (search by name).

Hint the user that they can use `/kaiten board <id>` to see board details.
