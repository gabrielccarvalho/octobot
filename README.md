# Discord GitHub PR Review Notifier

DMs you on Discord when your review is requested on a GitHub pull request.

## How it works

A single Node service runs a Discord bot (slash commands) and a Fastify webhook
receiver. Add the webhook to a repo or org; when GitHub requests someone's
review, the bot DMs the Discord user linked to that GitHub username.

## Setup

1. **Create a Discord application & bot** at <https://discord.com/developers>.
   Copy the bot token and application (client) ID. Invite the bot to your server
   with the `applications.commands` and `bot` scopes.
2. **Configure environment** — copy `.env.example` to `.env` and fill in:
   - `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`
   - `GITHUB_WEBHOOK_SECRET` (any long random string)
   - `DATABASE_PATH` (e.g. `/data/bot.sqlite` on a persistent volume)
   - `PORT`
   - optional `ALLOWED_OWNERS` (comma-separated orgs/users)
3. **Deploy** to Railway / Fly / Render as a single service with a persistent
   volume mounted at the directory of `DATABASE_PATH`. Note the public HTTPS URL.
4. **Add the GitHub webhook** on each repo (or org), Settings → Webhooks → Add:
   - Payload URL: `https://<your-host>/webhook/github`
   - Content type: `application/json`
   - Secret: the same value as `GITHUB_WEBHOOK_SECRET`
   - Events: "Let me select individual events" → **Pull requests**

## Usage

In Discord:

- `/link <github-username>` — start receiving review DMs
- `/unlink` — stop
- `/status` — see what you're linked to

> Note: global slash commands are registered on startup but can take up to ~1
> hour to appear in Discord the first time. If `/link` isn't visible right after
> your first deploy, give it some time.

## Development

```bash
npm install
npm test          # run the test suite
npm run dev       # run locally (use a tunnel like cloudflared to receive webhooks)
```
