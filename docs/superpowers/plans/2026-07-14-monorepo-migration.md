# Monorepo Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the OctoBot landing page and the `discord-github-pr` bot into a single pnpm + Turborepo monorepo, preserving git history and keeping both deployables buildable.

**Architecture:** This repo (`octobot`) becomes the monorepo root. The site moves to `apps/landing-page` via `git mv`; the bot is imported to `apps/bot` via `git subtree` (history preserved). pnpm workspaces + Turborepo orchestrate builds. The bot's Docker build is reworked to the pnpm-monorepo pattern (root build context, `pnpm deploy`) so Fly deploys keep working. No shared package yet — structural move only.

**Tech Stack:** pnpm 10.32.0 workspaces, Turborepo 2, Next.js 16 (site), TypeScript + discord.js + fastify + better-sqlite3 (bot), Docker, Fly.io.

## Global Constraints

- Package manager: **pnpm 10.32.0**; root `packageManager` field = `pnpm@10.32.0`. Never introduce npm/yarn lockfiles.
- Workspace globs: `apps/*` and `packages/*`.
- App package names: site → **`landing-page`**, bot → **`bot`** (used by `pnpm --filter`).
- Bot's source repo default branch is **`master`** (used in the `subtree` command).
- Bot runtime image: **`node:20-bookworm-slim`** (unchanged from current prod).
- Fly app **`pr-assistant`**, region `iad`, SQLite volume at `/data` — configuration unchanged; the running app and its volume are **NOT** migrated or redeployed by this plan.
- Native module **`better-sqlite3`** must be allowed to build under pnpm.
- All work on branch **`chore/monorepo`**. Do **NOT** run `fly deploy`, and do **NOT** change any Vercel/Fly dashboard settings — those are documented handoffs.
- Preserve history: site via `git mv`, bot via `git subtree add`.

---

### Task 1: Root workspace scaffold + relocate the landing page

**Files:**
- Create: `package.json` (root), `turbo.json`, `.dockerignore` (root), `packages/.gitkeep`
- Modify: `pnpm-workspace.yaml`
- Move: all current root site files → `apps/landing-page/`
- Modify: `apps/landing-page/package.json` (rename `name`)

**Interfaces:**
- Produces: workspace `landing-page` buildable via `pnpm --filter landing-page build`; root scripts `build/dev/lint/typecheck/test` via Turbo.

- [ ] **Step 1: Confirm branch and clean tree**

Run: `git branch --show-current && git status --short`
Expected: `chore/monorepo` and no uncommitted changes (the spec commit is already in).

- [ ] **Step 2: Create the app directory and move the site into it**

```bash
mkdir -p apps/landing-page packages
touch packages/.gitkeep
# Move every tracked root entry EXCEPT git/monorepo-level files into apps/landing-page
for item in app components lib public package.json pnpm-lock.yaml tsconfig.json next.config.ts next.config.js next.config.mjs postcss.config.mjs postcss.config.js tailwind.config.ts components.json next-env.d.ts .gitignore README.md eslint.config.mjs .prettierrc .prettierignore; do
  [ -e "$item" ] && git mv "$item" apps/landing-page/ 2>/dev/null || true
done
```
Note: the glob list is defensive — only existing files move. `docs/`, `.git/`, and `pnpm-workspace.yaml` intentionally stay at root.

- [ ] **Step 3: Verify the move and that nothing site-related is left at root**

Run: `ls -A && echo '---' && ls apps/landing-page`
Expected: root shows `apps/`, `packages/`, `docs/`, `pnpm-workspace.yaml`, `.git/` (and soon the new root files). `apps/landing-page` shows `app/`, `components/`, `lib/`, `public/`, `package.json`, etc.

- [ ] **Step 4: Rename the site package**

In `apps/landing-page/package.json`, change `"name": "octobot"` to `"name": "landing-page"`.

- [ ] **Step 5: Write `pnpm-workspace.yaml` (root)**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'

allowBuilds:
  sharp: true
  unrs-resolver: true
  msw: false
  better-sqlite3: true
```

- [ ] **Step 6: Write root `package.json`**

```json
{
  "name": "octobot-monorepo",
  "private": true,
  "packageManager": "pnpm@10.32.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "^2"
  }
}
```

- [ ] **Step 7: Write root `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": {},
    "test": { "dependsOn": ["^build"] }
  }
}
```

- [ ] **Step 8: Write root `.dockerignore`** (used later by the bot's root-context build)

```
**/node_modules
**/.next
**/dist
**/.turbo
.git
**/.env
**/.env.*
**/*.sqlite
**/*.db
**/data
```

- [ ] **Step 9: Install and build the site from its new home**

Run: `pnpm install && pnpm --filter landing-page build`
Expected: install completes writing a single root `pnpm-lock.yaml`; Next.js build prints `✓ Compiled successfully` and prerenders `/`, `/terms`, `/privacy`.
If install errors that the lockfile is out of date, run `pnpm install --no-frozen-lockfile` once to regenerate it at root.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm+turbo workspace, move site to apps/landing-page"
```

---

### Task 2: Import the bot with history and convert it to pnpm

**Files:**
- Create (via subtree): `apps/bot/**` (entire bot repo)
- Delete: `apps/bot/package-lock.json`
- Modify: `apps/bot/package.json` (rename `name`)

**Interfaces:**
- Consumes: root workspace from Task 1.
- Produces: workspace `bot` buildable via `pnpm --filter bot build`, testable via `pnpm --filter bot test`.

- [ ] **Step 1: Verify both trees are clean**

Run: `git status --short && git -C ../discord-github-pr status --short`
Expected: both empty. A dirty tree makes `git subtree add` refuse.

- [ ] **Step 2: Import the bot with full history under `apps/bot`**

```bash
git subtree add --prefix=apps/bot ../discord-github-pr master
```
Expected: output like `Added dir 'apps/bot'`; a merge commit is created.

- [ ] **Step 3: Verify history came across**

Run: `git log --oneline -- apps/bot | head -5`
Expected: several bot commits (e.g. the `feat/specific-pr-notifications` merge), not a single squashed commit.

- [ ] **Step 4: Convert the bot from npm to pnpm**

```bash
git rm apps/bot/package-lock.json
```
In `apps/bot/package.json`, change `"name": "discord-github-pr"` to `"name": "bot"`.

- [ ] **Step 5: Install so the bot resolves under the workspace**

Run: `pnpm install`
Expected: install succeeds; `better-sqlite3` builds (approved via `allowBuilds`). If pnpm reports an ignored build script for `better-sqlite3`, confirm it is present in `pnpm-workspace.yaml` `allowBuilds` and re-run `pnpm install`.

- [ ] **Step 6: Build, typecheck, and test the bot**

Run: `pnpm --filter bot build && pnpm --filter bot typecheck && pnpm --filter bot test`
Expected: `tsc` emits `apps/bot/dist`; typecheck exits 0; vitest suite passes. A `better-sqlite3` native-binding error here means Step 5's build approval did not take — fix and re-run.

- [ ] **Step 7: Commit the pnpm conversion**

```bash
git add -A
git commit -m "chore: import bot into apps/bot and convert to pnpm workspace"
```

---

### Task 3: Rework the bot Docker/Fly deploy for the pnpm monorepo

**Files:**
- Modify: `apps/bot/Dockerfile` (full rewrite)
- Modify: `apps/bot/fly.toml` (add `[build]` dockerfile)
- Delete: `apps/bot/.dockerignore` (superseded by root `.dockerignore`)

**Interfaces:**
- Consumes: workspace `bot` from Task 2, root `.dockerignore` from Task 1.
- Produces: a locally-verified bot image; `fly deploy --config apps/bot/fly.toml` (run from repo root) builds it.

- [ ] **Step 1: Rewrite `apps/bot/Dockerfile`** (root build context, pnpm deploy)

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
# Manifests first for install-layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/bot/package.json ./apps/bot/package.json
RUN pnpm install --filter bot... --frozen-lockfile
# Bot source, then build
COPY apps/bot ./apps/bot
RUN pnpm --filter bot build
# Emit a self-contained production bundle
RUN pnpm deploy --filter=bot --prod /out

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Remove the now-redundant per-app `.dockerignore`**

```bash
git rm apps/bot/.dockerignore
```
The root `.dockerignore` (Task 1, Step 8) governs the root build context.

- [ ] **Step 3: Point `fly.toml` at the Dockerfile**

In `apps/bot/fly.toml`, replace the empty `[build]` block with:
```toml
[build]
  dockerfile = "apps/bot/Dockerfile"
```
Leave `app`, `primary_region`, `[processes]`, `[[mounts]]`, `[http_service]`, and `[[vm]]` unchanged. The path is relative to the repo root (the deploy build context).

- [ ] **Step 4: Build the image locally from the repo root** (this is the deploy proof)

Run: `docker build -f apps/bot/Dockerfile -t octobot-bot:test .`
Expected: build succeeds through all stages, ending `naming to docker.io/library/octobot-bot:test`.
Common first-failure and fix:
- `pnpm deploy` errors about an existing target → the bundle path `/out` is fresh in a clean build; if iterating, the layer is rebuilt, so no action.
- `better-sqlite3` binding not found at deploy → ensure `allowBuilds` includes it (Task 1 Step 5) and rebuild with `--no-cache`.

- [ ] **Step 5: Smoke-check the image starts** (fails fast without secrets — that is expected)

Run: `docker run --rm -e NODE_ENV=production octobot-bot:test node -e "require('better-sqlite3'); console.log('native module OK')"`
Expected: prints `native module OK` (proves the compiled binding shipped in the bundle). The full app would need `.env` secrets, which we deliberately do not provide.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: rework bot Docker build for pnpm monorepo (root context + pnpm deploy)"
```

---

### Task 4: Deploy handoff docs + full verification

**Files:**
- Create: `apps/bot/DEPLOY.md`
- Modify: `docs/superpowers/specs/2026-07-14-monorepo-migration-design.md` (mark status Done) — optional

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write `apps/bot/DEPLOY.md`**

```markdown
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
```

- [ ] **Step 2: Run the full verification checklist**

Run:
```bash
pnpm install \
  && pnpm --filter landing-page build \
  && pnpm --filter bot build \
  && pnpm --filter bot typecheck \
  && pnpm --filter bot test \
  && git log --oneline -- apps/bot | head -3 \
  && git log --follow --oneline -- apps/landing-page/lib/content.ts | head -3
```
Expected: both builds pass, bot tests pass, bot history present, and the site's `content.ts` shows history surviving the move (`--follow`).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: bot deploy instructions for the monorepo"
```

- [ ] **Step 4: Report status and next steps (do not push or merge without user go-ahead)**

Summarize: branch `chore/monorepo` ready; the two dashboard handoffs (Vercel Root Directory, Fly deploy command) are in `apps/bot/DEPLOY.md`; the old `discord-github-pr` repo can be archived after merge; `packages/shared` extraction is the follow-up.

---

## Self-Review

**Spec coverage:** Every spec section maps to a task — structure & workspace tooling (Task 1), history-preserving bot import + pnpm conversion (Task 2), Docker/Fly rework (Task 3), deploy handoff docs + verification (Task 4). "Out of scope" items (no `fly deploy`, no dashboard changes, no shared package) are encoded in Global Constraints and Task 4 Step 4. ✅

**Placeholder scan:** No TBD/TODO; all configs, the Dockerfile, and commands are complete and literal. ✅

**Type/name consistency:** Package names `landing-page` and `bot` are used consistently in every `pnpm --filter`. Branch `master` (source) vs `chore/monorepo` (target) used correctly. Fly app `pr-assistant` unchanged throughout. ✅
