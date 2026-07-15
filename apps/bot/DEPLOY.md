# Deploying the bot (Fly.io)

The bot lives in a pnpm monorepo. Its Docker build context is the **repo root**,
so deploy from the repo root, not from this directory:

```bash
# from the monorepo root
fly deploy --config apps/bot/fly.toml
```

- App: `pr-assistant` (region `iad`), SQLite on the `/data` volume — unchanged.
- Secrets stay in Fly (`fly secrets list`); nothing was migrated into the repo.

## Runtime configuration

Non-secret config lives in `fly.toml` `[env]`: `PORT=8080` (matches
`http_service.internal_port`), `DATABASE_PATH=/data/bot.sqlite` (on the volume),
and `PUBLIC_BASE_URL=https://api.octobot.dev` (OAuth callback host).

The 5 secrets are set out-of-band and persist across deploys:

```bash
fly secrets set \
  DISCORD_TOKEN=... \
  DISCORD_CLIENT_ID=1526667638455926794 \
  GITHUB_OAUTH_CLIENT_ID=... \
  GITHUB_OAUTH_CLIENT_SECRET=... \
  TOKEN_ENCRYPTION_KEY=... \
  --config apps/bot/fly.toml
```

`TOKEN_ENCRYPTION_KEY` must be 64 hex chars (`openssl rand -hex 32`). Reuse the
existing key if one is already set — rotating it invalidates every linked user's
stored GitHub token.

## Custom domain (api.octobot.dev)

The bot is served at `https://api.octobot.dev` (apex `octobot.dev` is the Vercel
landing site). To wire it:

```bash
fly certs add api.octobot.dev --config apps/bot/fly.toml
```

Then at the `octobot.dev` DNS provider add a `CNAME api → pr-assistant.fly.dev`
(plus the `_acme-challenge` record Fly prints). Finally set the GitHub OAuth App
**Authorization callback URL** to `https://api.octobot.dev/oauth/callback` — it
must exactly match `PUBLIC_BASE_URL` + `/oauth/callback` or `/link` fails.

## Landing page (Vercel)

Set the Vercel project **Root Directory** to `apps/landing-page`. Build command
and output are auto-detected (Next.js). No `vercel.json` required.
