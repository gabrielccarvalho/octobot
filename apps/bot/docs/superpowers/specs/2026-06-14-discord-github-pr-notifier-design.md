# Discord GitHub PR Review Notifier — Design

**Date:** 2026-06-14
**Status:** Approved

## Overview

A single Node/TypeScript service that notifies people on Discord (via direct
message) when a GitHub pull request is opened for them to review. It runs two
things in one process: a Discord gateway connection (for slash commands) and a
Fastify HTTP server (for receiving GitHub webhooks). When GitHub reports that a
review has been requested, the bot looks up the reviewer's linked Discord
account and DMs them.

**Audience:** "Me + a few friends" — a small, trusted group.
**Hosting:** A cloud platform (Railway / Fly / Render) — always-on, automatic
HTTPS, stable public URL for the webhook.
**Storage:** SQLite (`better-sqlite3`) on a small persistent volume.

## Goals

- DM a linked Discord user the moment their review is requested on a PR.
- Let friends link/unlink their own GitHub username via slash commands.
- Be trivial to deploy and operate (single process, single service, no external
  database).

## Non-Goals (v1)

- Team review requests (DMing everyone on a requested team).
- OAuth / verified account ownership when linking.
- A web dashboard or admin UI.
- Per-user notification preferences (quiet hours, filtering, etc.).

These are intentionally deferred to keep v1 focused; the design leaves room to
add them later.

## Architecture

A single process (Option A) hosting both surfaces, sharing one SQLite store.

```
src/
  config.ts        env loading + validation (fail fast on missing vars)
  db.ts            SQLite layer — the ONLY module touching the database
  discord/
    client.ts      discord.js client setup + login
    commands.ts    slash command definitions + registration
    handlers.ts    /link, /unlink, /status logic
  github/
    webhook.ts     Fastify route, HMAC verification, payload -> normalized event
    events.ts      types + parsing for the actions we care about
  notifier.ts      normalized event -> resolve recipients -> send DMs
  index.ts         wires everything together, starts gateway + HTTP server
```

### Module responsibilities & boundaries

- **`config.ts`** — Reads and validates environment variables at startup. Throws
  (fail fast) if a required var is missing. Exports a typed config object.
- **`db.ts`** — The only module that touches SQLite. Exposes functions for
  managing links (`upsertLink`, `removeLink`, `getLinkByDiscordId`,
  `getDiscordIdsByGithubLogin`) and dedup (`wasSent`, `markSent`). No other
  module imports the SQLite driver.
- **`discord/client.ts`** — Constructs and logs in the discord.js client.
- **`discord/commands.ts`** — Slash command definitions and registration with
  Discord's API.
- **`discord/handlers.ts`** — Implements `/link`, `/unlink`, `/status`. Depends
  on `db`.
- **`github/webhook.ts`** — Registers the Fastify `POST /webhook/github` route,
  verifies the HMAC signature, and converts a raw payload into a normalized
  event. Knows nothing about Discord.
- **`github/events.ts`** — Types and parsing logic for the supported actions.
- **`notifier.ts`** — Given a normalized event, resolves recipients via `db` and
  sends DMs via the discord client. Knows nothing about HTTP or HMAC.
- **`index.ts`** — Wires modules together; starts both the gateway connection
  and the HTTP server.

The key boundaries: `webhook.ts` emits a normalized event object and never
touches Discord; `notifier.ts` consumes that object and never touches HTTP or
signature verification. This keeps each half independently testable.

## Data Flow

1. A friend runs `/link octocat` in Discord. The bot stores a row mapping their
   Discord ID -> `octocat`.
2. A repo or org admin adds the bot's webhook URL (`/webhook/github`) with the
   shared secret, subscribed to **Pull requests** events.
3. GitHub fires a `pull_request` event to the Fastify endpoint.
4. The endpoint verifies the `X-Hub-Signature-256` HMAC using a timing-safe
   comparison. Bad or missing signature -> `401`, no processing.
5. The endpoint parses the action:
   - `review_requested` -> recipient is `requested_reviewer.login`.
   - `ready_for_review` -> recipients are all current `requested_reviewers`.
   - A re-review is the same `review_requested` action firing again as a new
     delivery (see Dedup below).
   - Any other action -> `200`, ignored.
6. For each GitHub login, resolve the linked Discord user(s) (case-insensitive).
   Not linked -> skip silently.
7. Run the dedup check, then DM the user: PR title, repository, author, and a
   link to the PR.

## Storage (SQLite)

```sql
CREATE TABLE links (
  discord_id   TEXT NOT NULL,
  github_login TEXT NOT NULL COLLATE NOCASE,
  guild_id     TEXT,
  created_at   TEXT NOT NULL,
  UNIQUE (github_login)
);

CREATE TABLE sent (
  delivery_id  TEXT NOT NULL,
  github_login TEXT NOT NULL,
  sent_at      TEXT NOT NULL,
  UNIQUE (delivery_id, github_login)
);
```

- `links` maps a Discord user to a GitHub login. `github_login` is unique and
  case-insensitive (`COLLATE NOCASE`), so a login can be claimed by only one
  Discord user.
- `sent` records that a DM was sent for a given GitHub delivery + reviewer, used
  to avoid duplicate pings.

### Dedup

A notification is deduped on `(delivery_id, github_login)`, where `delivery_id`
is the `X-GitHub-Delivery` header (a unique GUID per webhook event). The flow:

1. Before DMing a recipient, check `wasSent(delivery_id, github_login)`. If true,
   skip that recipient.
2. After a successful DM, call `markSent(delivery_id, github_login)`.

This makes the two cases behave correctly:

- **Automatic redelivery / our own `500` retry:** GitHub retries the *same*
  delivery, so `delivery_id` is unchanged. Recipients already DMed are skipped;
  only the ones that hadn't succeeded yet get sent. No double-pings, and a
  partial failure can still complete on retry.
- **Legitimate re-review request:** This is a brand-new `review_requested` event
  with a *new* `delivery_id`, so it is not deduped and the user is notified
  again — which is the desired behavior.

## Discord Commands

- `/link <github-username>` — store or replace the caller's mapping. Ephemeral
  reply.
- `/unlink` — remove the caller's mapping. Ephemeral reply.
- `/status` — show what the caller is currently linked to (and a hint if DMs
  appear to be closed). Ephemeral reply.

## Error Handling

- Invalid or missing HMAC signature -> `401`, no processing.
- Unhandled action or unlinked reviewer -> `200`, silently ignored (GitHub
  should not retry).
- DM send fails (e.g. the user has DMs closed) -> log a warning and continue;
  surface a hint in `/status`.
- Database error during processing -> `500` so GitHub retries delivery.

## Security

- HMAC signature verification on every webhook request using
  `GITHUB_WEBHOOK_SECRET` (timing-safe comparison).
- Optional `ALLOWED_OWNERS` env allowlist — reject events whose repository owner
  is not in the list, guarding against unexpected senders.
- Slash command replies are ephemeral (visible only to the invoker).
- Trust-based linking: there is no proof of GitHub account ownership in v1. This
  is an accepted risk for a small trusted group; OAuth verification is the
  upgrade path if the audience grows.

## Configuration (environment variables)

| Var | Required | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | Bot token for the gateway connection. |
| `DISCORD_CLIENT_ID` | yes | Application ID for registering slash commands. |
| `GITHUB_WEBHOOK_SECRET` | yes | Shared secret for HMAC verification. |
| `DATABASE_PATH` | yes | Path to the SQLite file (on the persistent volume). |
| `PORT` | yes | Port for the Fastify HTTP server. |
| `ALLOWED_OWNERS` | no | Comma-separated allowlist of repo owners. |

`config.ts` validates these at startup and fails fast if a required one is
missing.

## Testing

- **Unit tests:**
  - HMAC verification: valid signature, invalid signature, missing header.
  - Event parsing against fixture payloads for each supported action.
  - Recipient resolution (case-insensitive match, unlinked login).
  - Dedup logic.
- **Integration test:** POST a signed fixture payload to the Fastify route and
  assert the DM call fires, with a mocked discord client.

## Deployment

- Single service on a cloud platform (Railway / Fly / Render).
- Persistent volume mounted for the SQLite file (`DATABASE_PATH`).
- Public HTTPS URL provided by the platform; `/webhook/github` is the path
  configured in each GitHub repo/org webhook.

## Webhook Setup (operator notes)

The bot exposes a single webhook URL. To connect a repository (or an entire
org), an admin adds a webhook in GitHub settings:

- **Payload URL:** `https://<deployed-host>/webhook/github`
- **Content type:** `application/json`
- **Secret:** the same value as `GITHUB_WEBHOOK_SECRET`
- **Events:** "Let me select individual events" -> **Pull requests**

No pre-registration of repositories is required in the bot; it reacts to any
correctly-signed event it receives (optionally filtered by `ALLOWED_OWNERS`).
