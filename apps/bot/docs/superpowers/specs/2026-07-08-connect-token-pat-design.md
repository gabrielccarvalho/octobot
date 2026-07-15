# `/connect-token` — Personal Access Token connection

**Date:** 2026-07-08
**Status:** Approved design

## Problem

The bot authenticates users via a classic GitHub **OAuth App** (`/link` → OAuth
authorize → code exchange). When a user belongs to an organization that has
**OAuth App access restrictions** enabled, the OAuth App receives no access to
that org's private data until an org owner approves the app — even though the
user granted the token `repo` scope. Users see GitHub's "Request approval from
owners" dialog and cannot get PR status for those repos.

## Solution

Add a **supplementary** `/connect-token` command that lets a user connect with a
**classic Personal Access Token** instead of OAuth. Classic PATs are not subject
to OAuth App access restrictions — they act as the user directly and reach any
private repo the user can already see. This bypasses the org-owner approval wall.

`/link` (OAuth) remains the default, one-click happy path for the majority who
are not in restricted orgs. `/connect-token` is the escape hatch. Both write to
the same `users` row; connecting via one replaces the other.

## User flow

```
User: /connect-token
  ↓
Bot (ephemeral) replies with:
  • Short instructions
  • [🔗 Create token on GitHub]  ← Link button (pre-filled URL)
  • [📋 Paste my token]          ← Primary button
  ↓
User clicks "Create token" → GitHub token page opens with scopes repo +
  notifications already checked and note pre-filled. User picks an expiration,
  clicks Generate, copies the ghp_… token.
  ↓
User clicks "Paste my token" → Discord modal opens (private text input)
  ↓
User pastes token, submits
  ↓
Bot validates → stores → "✅ Connected as `@login`"
```

Token-creation URL (pre-fills scopes and note):

```
https://github.com/settings/tokens/new?scopes=repo,notifications&description=discord-pr-bot
```

### Why message-then-modal

A slash-command string argument echoes the token into the channel — a secret
leak. A Discord modal text input is only visible to the submitting user. A modal
cannot contain a clickable link, so the link is shown in the initial ephemeral
message and the button opens the modal. This is the only secure shape in Discord.

## Validation & storage

On modal submit:

1. `GET https://api.github.com/user` with `Authorization: Bearer <token>`.
2. `401`/`403` → reject: *"That token is invalid or expired — create a new one
   and try again."*
3. Read the `X-OAuth-Scopes` response header. If it lacks `repo` **or**
   `notifications`, reject and name the missing scope:
   *"That token is missing the `repo` scope. Regenerate it with `repo` and
   `notifications` checked."*
4. Valid → encrypt via existing `crypto.ts`, upsert into `users` using the same
   token columns OAuth uses, set `github_login` from the `/user` response, set
   `auth_source = 'pat'`.

Connecting via `/connect-token` replaces any existing OAuth connection for that
user, and connecting via `/link` replaces a PAT connection — it is the same
`users` row keyed by Discord ID.

## Schema change

One idempotent migration adds a column to `users`:

```sql
ALTER TABLE users ADD COLUMN auth_source TEXT NOT NULL DEFAULT 'oauth';
```

- `'oauth'` — connection made via `/link`.
- `'pat'` — connection made via `/connect-token`.

The `DEFAULT 'oauth'` keeps every existing row valid with no backfill. The
migration must be guarded so re-running it (column already present) is a no-op,
consistent with the existing migration pattern.

## Reconnect messaging (source-aware)

Today the 401 path always says *"run `/link` to reconnect."* That is wrong for
PAT users. Anywhere a 401 is surfaced, the reconnect hint becomes source-aware:

- `auth_source = 'oauth'` → *"run `/link` to reconnect."*
- `auth_source = 'pat'`   → *"your token expired — run `/connect-token` with a
  fresh token."*

Applies to `/status` and to the poller's token-death (401) cleanup path.

## Files touched

| File | Change |
|---|---|
| `src/discord/commands.ts` | Register `/connect-token` |
| `src/discord/handlers.ts` | `handleConnectToken` (renders the button message) + `handleTokenSubmit` (validate + store); pure, deps-injected like the existing handlers |
| `src/discord/client.ts` | Handle the new button `customId` (→ `showModal`), handle the modal-submit interaction, and wire source-aware 401 text into `/status` |
| `src/github/oauth.ts` | Add `validateToken(token)` → `{ login, scopes }`, reusing the `/user` call pattern from `fetchViewerLogin` |
| `src/db.ts` | Migration + `auth_source` in the `User` type and the upsert/read paths |
| `src/poller.ts` | Source-aware wording when a token dies (401 cleanup) |

No changes to encryption, the notifications API, digest, or subscriptions — a PAT
is a bearer token identical to the OAuth token downstream.

## Testing (TDD)

- `validateToken`: valid token → `{ login, scopes }`; `401` → throws/typed
  error; missing `repo` and missing `notifications` via mocked `X-OAuth-Scopes`.
- `handleTokenSubmit`: each rejection branch (invalid, missing-scope) and the
  success path (encrypts, upserts with `auth_source = 'pat'`, replies with login).
- `handleConnectToken`: renders the instruction message with both buttons and the
  pre-filled URL.
- DB: migration idempotency; `auth_source` round-trips through upsert/read and
  defaults to `'oauth'` for existing rows.
- Source-aware 401 messaging in `/status` and the poller.

## Out of scope

- Fine-grained PATs (they are subject to org approval, so they do not solve the
  problem).
- Migrating the app from an OAuth App to a GitHub App.
- Tracking or proactively warning about PAT expiration dates (the existing 401
  cleanup handles expiry reactively).
