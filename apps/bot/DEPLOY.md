# Deploying the bot (Fly.io)

The bot lives in a pnpm monorepo. Its Docker build context is the **repo root**,
so deploy from the repo root, not from this directory:

```bash
# from the monorepo root
fly deploy --config apps/bot/fly.toml
```

- App: `pr-assistant` (region `iad`), SQLite on the `/data` volume — unchanged.
- Secrets stay in Fly (`fly secrets list`); nothing was migrated into the repo.

## Landing page (Vercel)

Set the Vercel project **Root Directory** to `apps/landing-page`. Build command
and output are auto-detected (Next.js). No `vercel.json` required.
