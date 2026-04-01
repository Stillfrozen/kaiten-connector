---
name: kaiten-users
description: List users from Kaiten or show current user info. Use when the user asks about team members, users, or their own Kaiten profile.
---

# Kaiten: Users

Fetch and display user information from Kaiten.

## Prerequisites

- `KAITEN_HOST` and `KAITEN_TOKEN` must be set

## Steps

### 1. If $ARGUMENTS is "me" or empty, fetch current user

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/users/current"
```

### 2. Otherwise, fetch all users

```bash
curl -s -H "Authorization: Bearer $KAITEN_TOKEN" \
  "https://$KAITEN_HOST/api/latest/users"
```

If $ARGUMENTS contains a search term, filter users by name.

### 3. Present results

**Current user view:**

```
Current user: Full Name
Email: email@example.com
ID: 123
Role: admin/member
```

**All users view:**

| Name | ID | Email | Role |
|------|----|-------|------|
| ... | ... | ... | ... |

If searching, show only matching users.
