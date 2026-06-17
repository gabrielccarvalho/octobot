# OAuth + Notification Poller — Design

**Date:** 2026-06-17
**Status:** Approved
**Supersedes the webhook half of:** `2026-06-14-discord-github-pr-notifier-design.md`

## Overview

Replace the GitHub **webhook receiver** with an **OAuth connect + notification
poller**. Each person authorizes the bot once via a GitHub OAuth App; the bot
stores an encrypted `repo`-scoped access token and polls their GitHub
notifications (`GET /notifications`) on a timer, sending a Discord DM for each
new or updated **pull-request** notification.

This removes all per-repository/org webhook setup: a single one-time
authorization covers every repository the user can access (public and private).
It also eliminates the manual-username-entry error class — identity comes from
GitHub itself via `GET /user`.

The Discord side (gateway client, DM sending, the `/link` `/unlink` `/status`
commands, and the SQLite store) is reused; only the GitHub-facing half changes.

## Goals

- One-time per-user OAuth authorization; no webhooks, no per-repo admin setup.
- Forward **pull-request** notifications (review requested, re-review, comments,
  pushes that re-surface the thread, mentions) to the linked Discord user as DMs.
- Cover public **and** private repositories.
- Store the powerful `repo`-scoped tokens encrypted at rest.

## Non-Goals (v1)

- Actor enrichment ("who" triggered the notification) — the Notifications API
  does not carry the actor, and fetching it costs an extra API call per item.
- Issues, CI, releases, discussions (PR-only filter).
- Per-reason mute/notification preferences.
- Token refresh — classic OAuth App user tokens do not expire (valid until
  revoked).

## Decisions (locked during brainstorming)

1. **Replace webhooks entirely** — single codepath; remove the webhook receiver
   and HMAC handling.
2. **Classic OAuth App** (not a GitHub App) — long-lived tokens, simplest flow.
3. **Notifications API** (not Search) — the user wants a PR-notifications bridge
   (review requests *and* subsequent comments/pushes/mentions), which the
   Notifications API models naturally via thread re-surfacing.
4. **PR-only scope** — forward only `subject.type === "PullRequest"`
   notifications.
5. **Tokens encrypted at rest** — AES-256-GCM with a key from env.
6. **Read-only** — never mark the user's GitHub notifications as read.
7. **Reason-based messages** — no actor lookup in v1.

## Architecture

A single process hosting (a) the Discord gateway client, (b) a small Fastify
HTTP server for the OAuth callback + health check, and (c) a background poller —
all sharing one SQLite store.

### Module changes under `src/`

**Removed:**
- `github/webhook.ts` (HMAC verification + webhook route)
- `github/events.ts` (webhook payload parsing)

**Added / changed:**

```
config.ts                env loading: add OAuth creds, encryption key, base URL;
                         remove webhook vars
crypto.ts                AES-256-GCM encrypt(plaintext) / decrypt(parts)
db.ts                    new schema (users+tokens, dedup, oauth_states)
github/oauth.ts          buildAuthorizeUrl(state), exchangeCode(code),
                         fetchViewerLogin(token)
github/notifications.ts  fetchNotifications(token, lastModified)
                           -> { items, lastModified, pollInterval };
                         parse + filter to PR-only NotificationItem
http/routes.ts           Fastify routes: GET /health, GET /oauth/callback
poller.ts                timer loop: for each user -> fetch -> dedup -> notifier
notifier.ts              formatMessage(item) (reason-based) + reuse DmSender
discord/handlers.ts      /link -> ephemeral authorize URL; /unlink; /status
discord/commands.ts      unchanged (same three commands)
discord/client.ts        unchanged (client, DM sender, interaction adapter)
index.ts                 wire config, db, discord, http routes; start poller
```

### Module responsibilities & boundaries

- **`crypto.ts`** — Pure encrypt/decrypt over a 32-byte key. No other module
  performs crypto.
- **`db.ts`** — The only module touching SQLite. Stores users (with encrypted
  token parts), the dedup ledger, and in-flight OAuth states.
- **`github/oauth.ts`** — Builds the authorize URL, exchanges the code for a
  token, and fetches the authenticated login. Knows nothing about Discord or
  storage.
- **`github/notifications.ts`** — Fetches and normalizes notifications into
  `NotificationItem`s, filtering to pull requests. Knows nothing about Discord
  or storage.
- **`http/routes.ts`** — Registers `/health` and `/oauth/callback`. The callback
  orchestrates oauth + db but contains no business logic itself.
- **`poller.ts`** — Owns the timer loop and dedup orchestration; depends on `db`,
  `github/notifications`, and `notifier`. Knows nothing about HTTP.
- **`notifier.ts`** — `formatMessage(item)` + sending via the injected
  `DmSender`. Knows nothing about HTTP, polling, or GitHub.

## Data Types

```ts
// github/notifications.ts
interface NotificationItem {
  threadId: string;       // notification thread id (stable across updates)
  reason: string;         // review_requested | comment | mention | ...
  updatedAt: string;      // ISO; bumps on each new activity
  repoFullName: string;   // owner/repo
  prTitle: string;        // subject.title
  prUrl: string;          // html PR url derived from subject.url
}
```

## OAuth Connect Flow

1. A user runs `/link` in Discord. The bot generates a random single-use
   `state`, stores `state -> discordId` (with a short TTL, e.g. 10 minutes), and replies
   (ephemeral) with a GitHub authorize URL:
   `https://github.com/login/oauth/authorize?client_id=...&scope=repo&state=<state>&redirect_uri=<PUBLIC_BASE_URL>/oauth/callback`.
2. The user authorizes on GitHub. GitHub redirects to
   `GET /oauth/callback?code=<code>&state=<state>`.
3. The callback:
   - Validates `state` (exists, not older than the 10-minute TTL); deletes it
     (single use).
   - Exchanges `code` for an access token
     (`POST https://github.com/login/oauth/access_token`).
   - Calls `GET /user` to read the authenticated `login`.
   - Encrypts the token and upserts the user row keyed by `discord_id`.
   - Returns a simple HTML page: "Connected as `<login>` — you can return to
     Discord."

## Polling & Dedup

- A single timer iterates all connected users. For each user, call
  `GET /notifications?all=false` with the user's token and an
  `If-Modified-Since` header set to the user's stored `Last-Modified`. A `304 Not
  Modified` response is free (does not count against the rate limit) and means
  "nothing new."
- On a `200`, store the new `Last-Modified`, then for each notification with
  `subject.type === "PullRequest"`:
  - Compute the dedup key **`(discord_id, thread_id, updated_at)`**.
  - If not already in `notified`, send the DM, then record it.
- Each new comment / push / re-review request bumps the thread's `updated_at`,
  so genuine new activity re-notifies while redeliveries/no-ops do not.
- Honor GitHub's `X-Poll-Interval` response header (minimum 60s) as the floor
  for the loop cadence.
- **Read-only:** the bot never marks notifications as read on GitHub.

## Storage (SQLite, new schema)

```sql
CREATE TABLE users (
  discord_id       TEXT PRIMARY KEY,
  github_login     TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  token_iv         TEXT NOT NULL,
  token_tag        TEXT NOT NULL,
  last_modified    TEXT,            -- for If-Modified-Since
  created_at       TEXT NOT NULL
);

CREATE TABLE notified (
  discord_id  TEXT NOT NULL,
  thread_id   TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  sent_at     TEXT NOT NULL,
  UNIQUE (discord_id, thread_id, updated_at)
);

CREATE TABLE oauth_states (
  state      TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

The previous `links` and `sent` tables are obsolete; everyone re-connects via
OAuth. (For a clean cut, the new schema simply creates these tables; the old
ones can be left or dropped — they are unused.)

## Message Format

Reason-mapped, e.g.:

```
🔔 Review requested on owner/repo
Fix the widget layout
https://github.com/owner/repo/pull/42
```

Reason mapping:

| reason | prefix |
| --- | --- |
| `review_requested` | 🔔 Review requested |
| `comment` | 💬 New comment |
| `mention` | 📣 Mentioned |
| `state_change` | 🔀 State changed |
| `author` | ✍️ Activity on your PR |
| anything else | 🔔 New activity |

The PR `html_url` is derived from the notification subject URL
(`https://api.github.com/repos/{owner}/{repo}/pulls/{n}` ->
`https://github.com/{owner}/{repo}/pull/{n}`).

## Configuration (environment variables)

**Add:**

| Var | Purpose |
| --- | --- |
| `GITHUB_OAUTH_CLIENT_ID` | OAuth App client id. |
| `GITHUB_OAUTH_CLIENT_SECRET` | OAuth App client secret. |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM key as 64 hex characters (= 32 bytes). |
| `PUBLIC_BASE_URL` | Public base URL for the OAuth callback. |

**Remove:** `GITHUB_WEBHOOK_SECRET`, `ALLOWED_OWNERS`.
**Keep:** `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_PATH`, `PORT`.

`config.ts` validates required vars at startup (fail fast) and validates that
`TOKEN_ENCRYPTION_KEY` decodes to exactly 32 bytes.

## Error Handling

- **Revoked/expired token** (`401` from GitHub): DM the user once asking them to
  re-`/link`, then delete their `users` row. Deleting the row both stops polling
  and guarantees the prompt is sent only once (the user re-appears only after a
  fresh OAuth connect).
- **Rate limited** (`403` with `X-RateLimit-Remaining: 0`): back off until the
  `X-RateLimit-Reset` time.
- **Callback errors** (missing/expired `state`, code-exchange failure): return a
  friendly error page; store nothing.
- **DM failure**: logged and NOT recorded in `notified`, so it retries on the
  next poll (same behavior as the webhook version).
- **Per-user isolation**: one user's fetch error must not stop the loop for
  others.

## Security

- Tokens encrypted at rest with AES-256-GCM; key supplied via
  `TOKEN_ENCRYPTION_KEY` and never logged.
- OAuth `state` is single-use with a TTL (CSRF protection on the callback).
- The `repo` scope is broad (read/write access to private repository code, the
  only classic-OAuth scope that exposes private-repo notifications). This is
  documented in the README as the access the user grants.
- Slash command replies remain ephemeral.

## Testing

- **Unit:**
  - `crypto`: encrypt -> decrypt round-trip; tampered ciphertext fails.
  - `github/notifications`: parsing + PR-only filter; reason mapping; `html_url`
    derivation; handling of `304`/`Last-Modified`/`X-Poll-Interval` (mocked HTTP).
  - `github/oauth`: authorize URL construction; code exchange (mocked HTTP);
    `state` validation.
  - dedup logic in the poller (real `:memory:` db + fake fetch + fake sender).
- **Integration:**
  - `GET /oauth/callback` happy path (mocked GitHub) stores an encrypted token
    that decrypts back to the original.
  - Poller path: a fetched PR notification becomes a DM via a mocked `DmSender`;
    a second poll with the same `updated_at` does not re-DM; a bumped
    `updated_at` does.

## Deployment

- Still a single service. The OAuth callback requires the public HTTPS URL
  (`PUBLIC_BASE_URL`) to be reachable — the same cloud host already provides one.
- A GitHub **OAuth App** must be registered (Authorization callback URL =
  `<PUBLIC_BASE_URL>/oauth/callback`), and its client id/secret supplied via env.
- SQLite persists on the same volume as before.
```
