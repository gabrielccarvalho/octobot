# Discord GitHub PR Notifier

Get a Discord DM the moment there's new activity on a GitHub pull request you're
involved in — review requests, re-reviews, comments, and mentions — across
**every repository you can access**, public and private.

You connect your GitHub account once with a single click. No per-repository
webhooks, no manual setup per repo.

---

## Features

- 🔗 **One-time OAuth connect** — `/link` in Discord, authorize on GitHub, done.
- 📬 **PR notifications as DMs** — review requested, re-review requested, new
  comments, pushes that re-surface a thread, and mentions.
- 🌐 **All your repos** — public and private, with no webhook configuration.
- 🔐 **Encrypted at rest** — access tokens are stored with AES-256-GCM.
- 🪶 **Single process** — Discord bot, OAuth callback server, and poller in one
  small Node service backed by SQLite.

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

                          poller (every 60s) ───────▶  GET /notifications
                          new PR notification?  ◀──────  (If-Modified-Since)
DM  ◀──────────────────   format + send DM
```

1. A user runs **`/link`**; the bot replies with a personal GitHub authorization
   URL guarded by a single-use, time-limited `state`.
2. GitHub redirects back to **`/oauth/callback`**, where the bot exchanges the
   code for an access token, reads the GitHub login, and stores the token
   **encrypted**.
3. A background **poller** checks each connected user's GitHub notifications
   about once a minute and DMs them about new pull-request activity. Polls use
   `If-Modified-Since`, so unchanged checks are cheap and don't burn rate limit.

---

## Architecture

```
src/
  index.ts                 composition root — wires everything, starts gateway + HTTP + poller
  config.ts                env loading & validation (fail-fast)
  crypto.ts                AES-256-GCM encrypt/decrypt for tokens
  db.ts                    SQLite layer (users, dedup ledger, OAuth states)
  poller.ts                60s poll loop → dedupe → DM
  notifier.ts              DmSender interface + notification message formatting
  github/
    http.ts                fetch abstraction (injectable for tests)
    oauth.ts               authorize URL, code exchange, viewer login
    notifications.ts       fetch + parse + filter (pull requests only)
  http/
    routes.ts              GET /health, GET /oauth/callback
  discord/
    client.ts              discord.js client, DM sender, interaction adapter
    commands.ts            slash command definitions + registration
    handlers.ts            /link, /unlink, /status logic
```

**Data flow boundaries:** `github/*` and `crypto` never touch Discord; `poller`
and `http/routes` orchestrate them through injected dependencies; `notifier`
only knows how to format and send. Each module is unit-tested in isolation.

---

## Configuration

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
| --- | :---: | --- |
| `DISCORD_TOKEN` | ✅ | Discord bot token. |
| `DISCORD_CLIENT_ID` | ✅ | Discord application (client) ID. |
| `GITHUB_OAUTH_CLIENT_ID` | ✅ | GitHub OAuth App client ID. |
| `GITHUB_OAUTH_CLIENT_SECRET` | ✅ | GitHub OAuth App client secret. |
| `TOKEN_ENCRYPTION_KEY` | ✅ | 64 hex chars (32 bytes). Generate with `openssl rand -hex 32`. |
| `PUBLIC_BASE_URL` | ✅ | Public HTTPS base URL where this service is reachable (host of the OAuth callback). |
| `DATABASE_PATH` | ✅ | Path to the SQLite file (put it on a persistent volume). |
| `PORT` | ✅ | Port for the HTTP server. |

> ⚠️ **`TOKEN_ENCRYPTION_KEY` must stay stable.** If you change it, previously
> stored tokens can no longer be decrypted and every user must re-`/link`.

The service validates all of these on startup and exits immediately if any are
missing or malformed.

---

## Setup

### 1. Create a Discord application & bot
At <https://discord.com/developers/applications>: create an app, copy the
**Application (client) ID** and the **bot token**. Invite the bot to your server
using an OAuth2 URL with the **`bot`** and **`applications.commands`** scopes. No
privileged gateway intents are required.

### 2. Create a GitHub OAuth App
At **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**:

- **Authorization callback URL:** `<PUBLIC_BASE_URL>/oauth/callback` — must match
  exactly.
- Copy the **Client ID** and generate a **Client Secret**.

> The bot requests the **`repo`** OAuth scope — the only classic-OAuth scope that
> exposes private-repository notifications. It grants broad read/write access to
> your repositories, so only connect accounts you trust this host with.

### 3. Configure & deploy
Fill in `.env` (see [Configuration](#configuration)), then deploy as a single
always-on service (Railway / Fly / Render) with a **persistent volume** mounted
at the directory of `DATABASE_PATH`. Make sure `PUBLIC_BASE_URL` matches the
deployed HTTPS URL and the GitHub OAuth App's callback URL.

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
npm run build
npm start
```

---

## Usage

In Discord (any channel where the bot is present, or a DM with the bot):

| Command | What it does |
| --- | --- |
| `/link` | Returns a personal GitHub authorization link — click it to connect. |
| `/unlink` | Disconnects your account and stops notifications. |
| `/status` | Shows your GitHub login plus what needs your attention right now (see below). |

Once connected, you'll receive DMs like:

```
🔔 Review requested · owner/repo · 5 minutes ago
[#42 Fix the widget layout](https://github.com/owner/repo/pull/42)
```

The PR link is a masked link (no bulky embed), and the timestamp is rendered by
Discord as a live, localized relative time. Notification prefixes by reason:
🔔 Review requested · 💬 New comment · 📣 Mentioned · 🔀 State changed ·
✍️ Activity on your PR · 🔔 New activity.

### `/status`

`/status` shows your connected login and two on-demand sections (via the GitHub
Search API):

```
✅ Connected as octocat

🔍 Awaiting your review (2)
• [acme/api #128 Add rate limiting](…)
• [acme/web #54 Fix nav overflow](…)

📝 Your PRs awaiting review (1)
• [acme/web #61 Dark mode](…)
```

- **🔍 Awaiting your review** — every open PR where your review is requested.
- **📝 Your PRs awaiting review** — your open, non-draft PRs that aren't approved
  yet.

Each section lists up to 10 PRs (with "…and N more" beyond that). The reply is
ephemeral and only visible to you.

> Notifications are **read-only** — the bot never marks your GitHub notifications
> as read. Delivery is deduplicated per pull-request thread, so genuine new
> activity re-notifies but redeliveries don't.

---

## Security

- **Tokens encrypted at rest** with AES-256-GCM; the key never leaves the
  environment and is never logged.
- **CSRF-safe OAuth** — the `state` parameter is single-use and expires after 10
  minutes.
- **Least logging** — only IDs, statuses, and errors are logged; never tokens or
  secrets.
- **Token revoked?** If GitHub rejects a stored token (you revoked access), the
  bot DMs you once to re-`/link` and removes the dead token.

---

## Local testing with a tunnel

To test without deploying, expose your local server with a tunnel so GitHub's
OAuth callback can reach it:

```bash
npm run dev                              # starts the bot on localhost:$PORT
cloudflared tunnel --url http://localhost:3000   # or: ngrok http 3000
```

Set `PUBLIC_BASE_URL` to the tunnel's HTTPS URL **and** set the GitHub OAuth
App's callback URL to `<that-url>/oauth/callback`.

> ⚠️ Free ngrok URLs change on every restart. When the tunnel URL changes, update
> **both** `PUBLIC_BASE_URL` (then rebuild) **and** the OAuth App callback URL.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `/link` doesn't appear in Discord | Global slash commands can take up to ~1 hour to propagate on first registration. Ensure the bot was invited with the `applications.commands` scope. |
| Authorized on GitHub but got an error page | The OAuth App callback URL must exactly equal `<PUBLIC_BASE_URL>/oauth/callback`; the link also expires after 10 minutes — run `/link` again. |
| Connected but no DMs | Allow DMs from server members in your Discord privacy settings. Also confirm the PR activity is on a repo your connected account can access. |
| Bot won't start | A required env var is missing/invalid (e.g. `TOKEN_ENCRYPTION_KEY` not 64 hex chars). Check the startup error. |

---

## Development

```bash
npm install
npm test          # run the full test suite (vitest)
npm run test:watch
npm run typecheck # tsc --noEmit
npm run build     # compile to dist/
npm run dev       # run locally (pair with a tunnel for the OAuth callback)
```

**Tech stack:** Node 20 · TypeScript (CommonJS) · discord.js v14 · Fastify v4 ·
better-sqlite3 · vitest.
