# Discord GitHub PR Review Notifier

DMs you on Discord when your review is requested on a GitHub pull request.

## How it works

A single Node service runs a Discord bot (slash commands) plus a small web
server. Each user runs `/link` and authorizes the bot via GitHub OAuth; the bot
then polls their GitHub notifications and DMs them about pull-request activity
(review requests, re-reviews, comments, mentions) across every repo they can
access — no per-repo webhook setup.

## Setup

1. **Create a Discord application & bot** at <https://discord.com/developers>.
   Copy the bot token and application (client) ID. Invite the bot with the
   `applications.commands` and `bot` scopes.
2. **Create a GitHub OAuth App** at GitHub → Settings → Developer settings →
   OAuth Apps. Set the Authorization callback URL to
   `<PUBLIC_BASE_URL>/oauth/callback`. Copy the client id and secret.
3. **Configure environment** — copy `.env.example` to `.env` and fill in the
   Discord and GitHub OAuth values, a `TOKEN_ENCRYPTION_KEY`
   (`openssl rand -hex 32`), and `PUBLIC_BASE_URL` (the public HTTPS URL of the
   service).
4. **Deploy** to Railway / Fly / Render as a single service with a persistent
   volume for `DATABASE_PATH`. Ensure `PUBLIC_BASE_URL` matches the deployed URL.

> The bot requests the `repo` OAuth scope, which is required to read private-repo
> notifications. This grants broad access to your repositories; only connect
> accounts you trust the host with.

## Usage

In Discord:

- `/link` — get a personal GitHub authorization link; click it to connect
- `/unlink` — disconnect and stop notifications
- `/status` — show which GitHub account you're connected as

> Note: global slash commands are registered on startup but can take up to ~1
> hour to appear in Discord the first time. If `/link` isn't visible right after
> your first deploy, give it some time.

## Development

```bash
npm install
npm test          # run the test suite
npm run dev       # run locally (use a tunnel like cloudflared to receive webhooks)
```
