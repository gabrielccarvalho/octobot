# Deploying the bot (Fly.io)

The bot lives in a pnpm monorepo. Its Docker build context is the **repo root**,
so deploy from the repo root with a trailing `.` (the positional build-context
arg). Use `flyctl`, not `fly` (on some machines `fly` is shadowed by an unrelated
node CLI):

```bash
# from the monorepo root
flyctl deploy . --config apps/bot/fly.toml
```

The `.` sets the build context to the repo root; the `dockerfile = "Dockerfile"`
in `fly.toml` is resolved relative to `apps/bot/`. Without the `.`, flyctl uses
`apps/bot/` as the context and the root `COPY pnpm-lock.yaml …` fails.

- App: `pr-assistant` (region `iad`), SQLite on the `/data` volume — unchanged.
- Secrets stay in Fly (`fly secrets list`); nothing was migrated into the repo.

## Runtime configuration

All runtime config is managed as **Fly secrets** (already set — `fly secrets list`),
so it persists across deploys and stays out of the repo. The full set:

`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_ID`,
`GITHUB_OAUTH_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `PORT` (`8080`, matches
`http_service.internal_port`), `DATABASE_PATH` (`/data/bot.sqlite`), and
`PUBLIC_BASE_URL` (the OAuth callback host).

To set or rotate one:

```bash
fly secrets set KEY=value --config apps/bot/fly.toml
```

`TOKEN_ENCRYPTION_KEY` must be 64 hex chars (`openssl rand -hex 32`). Never
rotate it while users are linked — it decrypts their stored GitHub tokens.

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
