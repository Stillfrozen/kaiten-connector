---
name: kaiten-sprints
description: List sprints and their cards from Kaiten. Use when the user asks about sprints, iterations, or sprint progress.
---

# Kaiten: Sprints

Fetch and display sprint information from Kaiten.

## Prerequisites

- `KAITEN_HOST` and `KAITEN_TOKEN` must be set

## Steps

### 1. Fetch sprints

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/sprints"
```

### 2. If $ARGUMENTS contains a sprint ID, fetch cards for that sprint

Filter cards by sprint:
```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/cards?sprint_id={sprint_id}"
```

### 3. Present results

**Sprint list view** (no arguments):

| Sprint | ID | Start | End | Status |
|--------|----|-------|-----|--------|
| ... | ... | ... | ... | active/completed/planned |

**Sprint detail view** (with sprint ID):

```
Sprint: "Sprint Name"
Period: YYYY-MM-DD to YYYY-MM-DD
Status: active/completed/planned

Cards (N total):
- Done: X cards
- In Progress: Y cards
- To Do: Z cards

Card list:
| ID | Title | Column | Members | Size |
|----|-------|--------|---------|------|
```

Calculate completion percentage based on card states if possible.
