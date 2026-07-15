# Monorepo Migration Design — OctoBot

**Date:** 2026-07-14
**Status:** Approved (design), pending spec review
**Branch:** `chore/monorepo`

## Goal

Consolidate the two OctoBot repositories into a single pnpm + Turborepo monorepo,
so the landing page and the bot live together and can later share a single
source of truth for product facts (commands, notification catalog). This first
migration is a **structural move only** — no shared-package extraction yet.

## Context (current reality, verified)

| | Landing page (this repo) | Bot (`../discord-github-pr`) |
|---|---|---|
| Package manager | **pnpm** (`pnpm-lock.yaml`, `pnpm-workspace.yaml` present) | **npm** (`package-lock.json`) |
| Stack | Next.js 16 (Turbopack), static export | TypeScript, `discord.js` + `fastify` + `better-sqlite3` (native) |
| Runtime | Stateless static site | Long-running poller, **stateful** |
| State | none | SQLite on a Fly volume mounted at `/data` |
| Deploy | Vercel (git integration; no `vercel.json`, no CI) | Fly.io app `pr-assistant`, region `iad`, via Dockerfile |
| Secrets | none | `.env` (gitignored), encrypted GitHub tokens |
| CI | none | none |

## Decisions (locked during brainstorming)

1. **Repo strategy:** `octobot` (this repo) becomes the monorepo root and keeps
   its remote. The old `discord-github-pr` GitHub repo is archived after import.
2. **History:** The bot is imported **with full git history** via `git subtree`.
   The site's files move via `git mv` (tracked as renames).
3. **Scope:** Structural move only. Extracting `packages/shared` (commands +
   notification catalog) is a **separate follow-up**, not part of this migration.
4. **Tooling:** pnpm workspaces + Turborepo.

## Target structure

```
octobot/                    (this repo — keeps its remote)
├── apps/
│   ├── landing-page/       ← everything currently at repo root, moved here
│   └── bot/                ← discord-github-pr imported with history
├── packages/               (empty placeholder; shared pkg is the follow-up)
├── package.json            (new: private root, workspace scripts)
├── pnpm-workspace.yaml     (edit: packages: ['apps/*', 'packages/*'])
├── turbo.json              (new: build/lint/typecheck/test pipelines)
├── .gitignore              (merged from both repos)
└── docs/                   (retained at root)
```

## Migration approach

### A. Branch
All work on `chore/monorepo`. `main` and both live deploys are untouched until
the branch is merged and the dashboard settings (below) are flipped.

### B. Move the site into `apps/landing-page`
- `git mv` all site source and config into `apps/landing-page/`: `app/`,
  `components/`, `lib/`, `public/`, `package.json`, `tsconfig.json`,
  Next/PostCSS/Tailwind configs, `components.json`, `pnpm-lock.yaml`, etc.
- Keep at root only: `.git`, `pnpm-workspace.yaml` (edited), a merged root
  `.gitignore`, `docs/`, and the new root `package.json` + `turbo.json`.
- The site's `package.json` `name` becomes `landing-page` (was `octobot`).

### C. Import the bot into `apps/bot` with history
- `git subtree add --prefix=apps/bot ../discord-github-pr main` — replays the
  bot's entire history under `apps/bot/`.
- Only committed source comes across; `.env`, `*.sqlite`, and `data/` are
  gitignored in the bot, so **no secrets or DB state migrate**.
- Convert the bot from npm to pnpm: delete `apps/bot/package-lock.json`; deps
  resolve from the root `pnpm-lock.yaml` after a root `pnpm install`.

### D. Root workspace tooling
- Root `package.json` (private) with scripts delegating to Turbo, e.g.
  `build`, `dev`, `lint`, `typecheck`, `test`, each `turbo run <task>`.
- `pnpm-workspace.yaml` → `packages: ['apps/*', 'packages/*']` (retain existing
  `allowBuilds` for `sharp`, `unrs-resolver`, `msw`; add `better-sqlite3`).
- `turbo.json` pipelines for `build` (dependsOn `^build`), `lint`, `typecheck`,
  `test`; mark `landing-page` build outputs (`.next/**`) appropriately.
- `pnpm install` at root to regenerate a single lockfile covering all workspaces.

### E. Rework the bot Docker/Fly deploy (the one high-risk piece)
The bot's Dockerfile currently runs `npm ci` from its own `package-lock.json`,
which does not exist under a pnpm workspace. Rewrite to the standard
pnpm-monorepo Docker pattern:
- **Build context = repo root** (so the root lockfile + workspace manifests are
  available).
- Enable `corepack`, `pnpm install --filter bot...` (with
  `--frozen-lockfile`), `pnpm --filter bot build`, then
  `pnpm deploy --filter=bot --prod /out` to produce a self-contained runtime
  bundle. Keep the `python3 make g++` build deps for `better-sqlite3`.
- Runtime stage copies `/out` and runs `node dist/index.js` (unchanged CMD).
- Update `apps/bot/fly.toml` so `fly deploy --config apps/bot/fly.toml` (run
  from repo root) builds with the correct Dockerfile + context. The app name
  (`pr-assistant`), region, volume mount, and process command are unchanged.
- `.dockerignore` updated for the monorepo root context.

## What is explicitly out of scope / not touched

- No `fly deploy` is run; the live bot and its `/data` volume are not migrated
  or restarted. The user redeploys from the new path when ready.
- No changes to Vercel or Fly **dashboard** settings (not accessible). Two
  manual handoff actions for the user:
  1. **Vercel:** set project **Root Directory** to `apps/landing-page`.
  2. **Fly:** deploy via `fly deploy --config apps/bot/fly.toml` from repo root.
- No `packages/shared` extraction (separate follow-up).
- No CI pipeline added (neither repo had one; can be a follow-up).

## Verification (done before the work is called complete)

1. `pnpm install` at root resolves all workspaces with one lockfile.
2. `pnpm --filter landing-page build` succeeds (Next.js production build).
3. `pnpm --filter bot build`, `pnpm --filter bot typecheck`, and
   `pnpm --filter bot test` all pass.
4. `docker build` of the bot image (root context) succeeds locally — proof the
   Fly deploy will work before any push.
5. `git log --oneline apps/bot/` shows the bot's preserved history.
6. `pnpm --filter landing-page dev` renders the site locally without regression.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Bot Docker build breaks under pnpm | Rework to `pnpm deploy` pattern; verify with local `docker build` before handoff |
| Site history lost in the move | Use `git mv` (rename tracking), verify `git log --follow` on a sample file |
| Bot history lost | `git subtree add` preserves it; verify with `git log apps/bot/` |
| Live bot disrupted | We never run `fly deploy`; branch-only until user flips deploys |
| Vercel builds wrong dir | Documented handoff: set Root Directory = `apps/landing-page` |
| Secrets/DB leak into repo | Bot `.env`/`*.sqlite`/`data/` are gitignored; only committed source imported |

## Rollback

Everything is on `chore/monorepo`. If the migration is wrong, do not merge;
`main` and both live deploys remain unaffected.

## Follow-ups (post-merge, separate work)

1. Extract `packages/shared` — single source of truth for commands and the
   notification catalog; rewire bot + landing page to consume it.
2. Optionally add CI (typecheck/build/test on PR) now that both live together.
3. Archive the old `discord-github-pr` GitHub repo.
