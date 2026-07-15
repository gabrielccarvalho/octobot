# Contributing to OctoBot

Thanks for your interest in contributing! This guide covers everything you need to get set up and send a pull request.

## Prerequisites

- **Node.js 20** (the version this monorepo targets)
- **pnpm** via [Corepack](https://nodejs.org/api/corepack.html) — run `corepack enable` and pnpm will pick up the pinned version (`pnpm@10.32.0`) automatically

## Setup

```bash
git clone https://github.com/<your-fork>/octobot.git
cd octobot
pnpm install
```

## Run the apps

Run everything at once via Turborepo:

```bash
pnpm dev
```

Or target a single app:

```bash
pnpm --filter landing-page dev   # Next.js marketing site
pnpm --filter bot dev            # Discord bot (tsx watch)
```

## Project layout

- `apps/landing-page` — the marketing site (Next.js)
- `apps/bot` — the Discord bot
- `packages/*` — shared packages

## Before you open a PR

Make sure the following all pass from the repo root:

```bash
pnpm lint && pnpm typecheck && pnpm build
```

A few other things to keep in mind:

- Match the existing code style — Prettier (with the Tailwind plugin) is already configured, so let it format your code rather than hand-formatting.
- Keep landing-page product claims sourced from `apps/landing-page/lib/content.ts` and the bot's own [README](apps/bot/README.md) — don't introduce marketing copy that isn't backed by the actual product.

## Commits & PRs

- Keep pull requests small and focused on one change.
- Write descriptive commit messages and PR descriptions explaining the *why*, not just the *what*.
- Link related issues in your PR description.

## Questions

Join our [Discord community](https://discord.gg/dfJPuhDGu6) if you have questions or want to discuss an idea before building it.

## Conduct

Be respectful. Harassment of any kind will not be tolerated.
