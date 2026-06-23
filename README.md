# Discord GitHub PR Notifier

A small Node service that DMs you on Discord the moment something on GitHub needs
your attention — a review request, a comment, a mention, a CI failure, a security
alert — across **every repository your account can access**, public and private.

Connect your GitHub account once with a single click (`/link`). No per-repository
webhooks, no manual setup. Tune exactly what you hear about with `/listen-to`, and
get an optional once-a-day summary of open PRs with `/digest`.

```
🔔 Review requested · acme/api · 5 minutes ago
#128 Add rate limiting
✅ Your PR was approved · acme/web · 2 minutes ago
#61 Dark mode
```

---

## Table of contents

- [How it works](#how-it-works)
- [Commands](#commands)
- [What you get notified about](#what-you-get-notified-about)
- [Configuration](#configuration)
- [Setup](#setup)
- [Running](#running)
- [Local testing with a tunnel](#local-testing-with-a-tunnel)
- [Architecture](#architecture)
- [Development](#development)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## How it works

```
Discord                      This service                       GitHub
───────                      ────────────                       ──────
/link  ───────────────▶  generate state, store ─────▶  authorize (OAuth, repo scope)
                                                              │
                          /oauth/callback  ◀──────────────────┘  (code + state)
                          exchange code → token
                          encrypt + store token
                          baseline + welcome DM

                          poller (every 60s) ───────▶  GET /notifications
                          new activity?        ◀──────  (If-Modified-Since)
DM  ◀──────────────────   filter → enrich → send

                          scheduler (06:00 BRT) ────▶  Search API: open PRs
DM  ◀──────────────────   daily digest (if enabled)
```

1. **Connect.** `/link` returns a personal GitHub authorization URL guarded by a
   single-use, time-limited `state`. GitHub redirects to `/oauth/callback`, where
   the service exchanges the code for a token, reads your login, and stores the
   token **encrypted** (AES-256-GCM).
2. **Baseline (no flood).** On first connect, the service marks your current
   notifications as already-seen and sets a watermark, then sends one welcome DM
   summarizing what already needs your attention — so you don't get blasted with
   history.
3. **Poll & notify.** A background **poller** checks each connected user's GitHub
   notifications about once a minute. Polls use `If-Modified-Since`, so unchanged
   checks are cheap and don't burn rate limit. New items are filtered against your
   subscription, enriched (PR review verdicts), deduplicated per thread, and DMed.
4. **Daily digest.** A **scheduler** sends an optional once-per-day summary of the
   PRs awaiting your review at **06:00 BRT** (`America/Sao_Paulo`).

---

## Commands

Use these in any channel where the bot is present, or in a DM with the bot. All
replies are **ephemeral** (only you see them).

| Command | What it does |
| --- | --- |
| `/link` | Returns a personal GitHub authorization link — click it to connect. |
| `/unlink` | Disconnects your account and stops all notifications. |
| `/status` | Shows your connected login plus what needs your attention right now. |
| `/listen-to` | Pick which notification **types** and **reasons** you receive (interactive menus, saved automatically). |
| `/digest` | Turn the daily PR digest on/off, or **Preview now**. |

### `/status`

Connected login plus two on-demand sections, fetched live from the GitHub Search
API:

```
✅ Connected as octocat

🔍 Awaiting your review (3)
**acme/api**
#128 [Add rate limiting](…) · 5 minutes ago
#130 [Fix pagination](…) · 2 hours ago
**acme/web**
#54 [Fix nav overflow](…) · yesterday

📝 Your PRs awaiting review (1)
**acme/web**
#61 [Dark mode](…) · 3 days ago
```

- **🔍 Awaiting your review** — every open PR where your review is requested.
- **📝 Your PRs awaiting review** — your open, non-draft PRs that aren't approved yet.

PRs are grouped by repository; each line is `#<number> [<title>](<url>) · <relative
time>` (title is a masked link, time renders live in Discord). Each section lists up
to 10 PRs, with "…and N more" beyond that.

### `/listen-to`

Opens two multi-select menus — **subject types** and **reasons** — pre-checked with
your current choices. Selections save the instant you change them.

- **Default** (before you ever touch `/listen-to`): **pull requests only, all
  reasons** — identical to the original PR-notifier behavior.
- Select more subject types to also hear about issues, releases, CI, security
  alerts, etc. Narrow the reasons to mute the noise you don't want.
- Deselecting everything in the subjects menu mutes notifications entirely (the
  digest still works independently).

### `/digest`

The daily digest is **on by default** for connected users. `/digest` shows its
current state with two buttons:

- **Turn on / Turn off** — toggle the 06:00 BRT daily summary.
- **Preview now** — DM yourself the digest immediately, as it would arrive.

The digest reuses the exact `/status` content and is **only sent when something
needs your attention** — never an empty message.

---

## What you get notified about

Each DM is a masked link (no bulky embed) with a Discord live-relative timestamp:

```
🔔 Review requested · owner/repo · 5 minutes ago
[#42 Fix the widget layout](https://github.com/owner/repo/pull/42)
```

**Subject types** (`/listen-to`):

| Emoji | Type |
| :---: | --- |
| 🔀 | Pull requests |
| 🐛 | Issues |
| 💬 | Discussions |
| 🚀 | Releases |
| 📝 | Commits |
| ✅ | CI / checks |
| 🛡️ | Security alerts |

**Reasons** (the prefix on each DM):

🔔 Review requested · 💬 New comment · 📣 Mentioned · 🔀 State changed ·
✍️ Activity on your PR · 👥 Team mentioned · 📌 Assigned · ⚙️ CI activity ·
🔖 Subscribed thread · ✋ Manually subscribed · 📨 Invitation · 🛡️ Security alert ·
🪞 Your activity · ⬆️ New commits pushed.

**PR review verdicts.** When a pull-request notification fires because someone just
reviewed your PR, the bot replaces the generic prefix with the outcome:

- ✅ **Your PR was approved**
- 🔧 **Changes requested on your PR**
- 💬 **New review on your PR**

> Notifications are **read-only** — the bot never marks your GitHub notifications as
> read. Delivery is deduplicated per thread, so genuine new activity re-notifies but
> redeliveries don't.

---

## Configuration

Copy `.env.example` to `.env` and fill in every variable (all are required; the
service validates them on startup and exits immediately if any is missing or
malformed):

| Variable | Description |
| --- | --- |
| `DISCORD_TOKEN` | Discord bot token. |
| `DISCORD_CLIENT_ID` | Discord application (client) ID. |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App client ID. |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App client secret. |
| `TOKEN_ENCRYPTION_KEY` | 64 hex chars (32 bytes). Generate with `openssl rand -hex 32`. |
| `PUBLIC_BASE_URL` | Public HTTPS base URL where this service is reachable (host of the OAuth callback). |
| `DATABASE_PATH` | Path to the SQLite file (put it on a persistent volume). |
| `PORT` | Port for the HTTP server. |

> ⚠️ **`TOKEN_ENCRYPTION_KEY` must stay stable.** If you change it, previously stored
> tokens can no longer be decrypted and every user must re-`/link`.

---

## Setup

### 1. Create a Discord application & bot

At <https://discord.com/developers/applications>: create an app, copy the
**Application (client) ID** and the **bot token**. Invite the bot using an OAuth2 URL
with the **`bot`** and **`applications.commands`** scopes. No privileged gateway
intents are required.

### 2. Create a GitHub OAuth App

At **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**:

- **Authorization callback URL:** `<PUBLIC_BASE_URL>/oauth/callback` — must match
  exactly.
- Copy the **Client ID** and generate a **Client Secret**.

> The bot requests the **`repo`** OAuth scope — the only classic-OAuth scope that
> exposes private-repository notifications. It grants broad read/write access to your
> repositories, so only connect accounts you trust this host with.

### 3. Configure & deploy

Fill in `.env` (see [Configuration](#configuration)), then deploy as a single
always-on service (Railway / Fly / Render) with a **persistent volume** mounted at
the directory of `DATABASE_PATH`. Make sure `PUBLIC_BASE_URL` matches the deployed
HTTPS URL and the GitHub OAuth App's callback URL.

---

## Running

### With Docker (recommended)

```bash
docker compose up -d --build
```

`docker-compose.yml` builds the image, loads `.env`, exposes `PORT`, and persists
SQLite in a named volume (`botdata` → `/app/data`).

### From source

```bash
npm install
npm start        # prestart compiles to dist/, then runs node dist/index.js
```

---

## Local testing with a tunnel

To test without deploying, expose your local server with a tunnel so GitHub's OAuth
callback can reach it:

```bash
npm run dev                                       # bot on localhost:$PORT (tsx watch)
cloudflared tunnel --url http://localhost:3000    # or: ngrok http 3000
```

Set `PUBLIC_BASE_URL` to the tunnel's HTTPS URL **and** set the GitHub OAuth App's
callback URL to `<that-url>/oauth/callback`.

> ⚠️ Free ngrok URLs change on every restart. When the tunnel URL changes, update
> **both** `PUBLIC_BASE_URL` **and** the OAuth App callback URL.

---

## Architecture

A single Node process runs the Discord gateway, the OAuth HTTP server, the poller,
and the digest scheduler — all backed by one SQLite file.

```
src/
  index.ts            composition root — wires deps, starts gateway + HTTP + poller + scheduler
  config.ts           env loading & validation (fail-fast)
  crypto.ts           AES-256-GCM encrypt/decrypt for tokens
  db.ts               SQLite layer (users + subscriptions + digest flag, dedup ledger, OAuth states, meta)
  onboarding.ts       one-time baseline on connect (no flood) + welcome summary DM
  poller.ts           60s loop → filter by subscription → enrich PRs with verdict → DM
  scheduler.ts        at-most-once-per-day trigger for the 06:00 BRT digest
  digest.ts           builds & sends each user's daily PR digest
  notifier.ts         DmSender interface + DM formatting + review-verdict resolution
  status.ts           shared formatting for /status, onboarding, and digest
  github/
    http.ts           fetch abstraction (injectable for tests)
    oauth.ts          authorize URL, code exchange, viewer login
    notifications.ts  fetch + parse GitHub notifications (all subject types)
    taxonomy.ts       subject-type & reason catalog (emoji/label) + subscription defaults
    reviews.ts        latest-review lookup for PR approval/changes verdicts
    search.ts         Search API queries for /status and the digest
  http/
    routes.ts         GET /health, GET /oauth/callback
  discord/
    client.ts         discord.js client, DM sender, slash + menu/button router
    commands.ts       slash command definitions + registration
    handlers.ts       /link, /unlink, /status, /listen-to, /digest logic
```

**Data-flow boundaries:** `github/*` and `crypto` never touch Discord; `poller`,
`scheduler`, and `http/routes` orchestrate them through injected dependencies;
`notifier` and `status` only format. Every module is unit-tested in isolation.

The SQLite schema migrates itself idempotently on startup (subscription columns are
added if absent), so upgrading an existing deployment needs no manual migration.

---

## Development

```bash
npm install
npm test           # full test suite (vitest)
npm run test:watch
npm run typecheck  # tsc --noEmit
npm run build      # compile to dist/
npm run dev        # run locally (pair with a tunnel for the OAuth callback)
```

**Tech stack:** Node · TypeScript (CommonJS) · discord.js v14 · Fastify v4 ·
better-sqlite3 · vitest.

---

## Security

- **Tokens encrypted at rest** with AES-256-GCM; the key never leaves the
  environment and is never logged.
- **CSRF-safe OAuth** — the `state` parameter is single-use and expires after 10
  minutes.
- **Least logging** — only IDs, statuses, and errors are logged; never tokens or
  secrets.
- **Token revoked?** If GitHub rejects a stored token, the bot DMs you once to
  re-`/link` and removes the dead token.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Commands don't appear in Discord | Global slash commands can take up to ~1 hour to propagate on first registration. Ensure the bot was invited with the `applications.commands` scope, then hard-reload Discord (⌘R). |
| Authorized on GitHub but got an error page | The OAuth App callback URL must exactly equal `<PUBLIC_BASE_URL>/oauth/callback`; the link also expires after 10 minutes — run `/link` again. |
| Connected but no DMs | Allow DMs from server members in your Discord privacy settings. Confirm the activity is on a repo your account can access, and that its subject type is enabled in `/listen-to`. |
| No daily digest | It's only sent when something actually needs your review, and only if enabled — check `/digest` and try **Preview now**. |
| Bot won't start | A required env var is missing/invalid (e.g. `TOKEN_ENCRYPTION_KEY` not 64 hex chars). Check the startup error. |
