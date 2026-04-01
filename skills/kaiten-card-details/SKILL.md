---
name: kaiten-card-details
description: Get full details of a Kaiten card — description, comments, checklists, blockers, children, history. Use when the user asks about a specific card or task.
---

# Kaiten: Card Details

Fetch and display comprehensive information about a specific Kaiten card.

## Prerequisites

- `KAITEN_HOST` and `KAITEN_TOKEN` must be set
- Card ID is required (passed as `$ARGUMENTS`)

If no card ID is provided, ask the user for it.

## Steps

### 1. Fetch card data

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/cards/$ARGUMENTS"
```

### 2. Fetch comments

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/cards/$ARGUMENTS/comments"
```

### 3. Fetch child cards

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/cards/$ARGUMENTS/children"
```

### 4. Fetch location history

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/cards/$ARGUMENTS/location-history"
```

### 5. Present results

Display the card in a structured format:

```
Card #ID: "Title"
━━━━━━━━━━━━━━━━━━━━━
Status: Column Name
Members: User1, User2
Tags: tag1, tag2
Size: X
Created: YYYY-MM-DD
Updated: YYYY-MM-DD
Due date: YYYY-MM-DD (if set)

Description:
<card description text>

Checklists:
- [x] Done item
- [ ] Pending item

Blockers:
- Blocker reason (blocker_type)

Comments (N):
- User1 (YYYY-MM-DD): Comment text...
- User2 (YYYY-MM-DD): Comment text...

Child cards (N):
- #ID1: "Child title 1" (status)
- #ID2: "Child title 2" (status)

Location history:
- YYYY-MM-DD: Column A -> Column B
```

Include custom properties if present. Show external links if any.
