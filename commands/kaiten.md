---
name: kaiten
description: Quick access to Kaiten boards, cards, sprints, and analytics. Usage: /kaiten <command> [args]
---

# Kaiten Command Router

Parse `$ARGUMENTS` and route to the appropriate Kaiten skill.

## Available commands

- `boards [search]` — List all spaces and boards. Optional: search by name.
- `board <id>` — Show board structure (columns, lanes, WIP limits).
- `cards <board_id> [--column <id>] [--member <id>] [--limit <n>]` — List cards on a board with optional filters.
- `card <id>` — Show full card details (description, comments, checklists, history).
- `sprints [sprint_id]` — List sprints or show sprint details.
- `users [me|search]` — List users or show current user.
- `backlog <board_id>` — Backlog analytics for a board.

## Routing logic

1. Parse the first word of `$ARGUMENTS` as the command
2. Pass the remaining arguments to the corresponding skill

| Command | Skill to invoke |
|---------|----------------|
| `boards` | `kaiten-connector:kaiten-boards` |
| `board` | `kaiten-connector:kaiten-board-details` |
| `cards` | `kaiten-connector:kaiten-cards` |
| `card` | `kaiten-connector:kaiten-card-details` |
| `sprints` | `kaiten-connector:kaiten-sprints` |
| `users` | `kaiten-connector:kaiten-users` |
| `backlog` | `kaiten-connector:kaiten-backlog` |

## If no command is provided

Show the help text:

```
Kaiten Connector — quick access to your Kaiten boards

Commands:
  /kaiten boards          — List all spaces and boards
  /kaiten board <id>      — Board structure and layout
  /kaiten cards <board_id> — Cards on a board
  /kaiten card <id>       — Full card details
  /kaiten sprints         — Sprint list and progress
  /kaiten users           — Team members
  /kaiten backlog <board_id> — Backlog health analytics

Setup:
  Set KAITEN_HOST and KAITEN_TOKEN environment variables.
  Get your token at https://<your-domain>.kaiten.ru/profile/api-key
```

## Configuration check

Before executing any command, verify that `KAITEN_HOST` and `KAITEN_TOKEN` environment variables are set. If not, show the setup instructions and ask the user to configure them.
