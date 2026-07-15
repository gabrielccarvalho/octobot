# OctoBot — Go Open Source Launch (Design)

**Date:** 2026-07-15
**Status:** Approved
**Repo:** `github.com/gabrielccarvalho/octobot`
**Live site:** `octobot.dev`

## Goal

Prepare OctoBot for a public open-source launch. Three workstreams:

1. **README** — a polished, trust-forward root README (plus `LICENSE` and `CONTRIBUTING.md`).
2. **Open-source trust on the landing page** — make it visibly, credibly open source to build developer trust.
3. **Visual/illustration/animation overhaul** — custom octopus-mascot SVG scenes for the connect flow and community, plus richer scroll-triggered animation.

### Primary intent (decided)

**Trust + contributors.** Everyone uses the single hosted community bot (`octobot-dev` on Fly, `api.octobot.dev`). Open-sourcing is about (a) transparency/trust — people can read the code and confirm it is read-only and safe — and (b) welcoming contributors and stars. **No self-hosting flow** on the site or in the README.

## Non-goals

- No self-host / deploy-your-own documentation or landing-page path.
- No new bot capabilities; product facts stay sourced from the bot service README (do not invent features).
- No rewrite of the hero DM-stream mockup — it stays the page anchor.
- No unrelated refactors of existing sections beyond what these three workstreams require.

## Context (current state)

- **Monorepo:** pnpm + Turborepo. `apps/landing-page` (Next.js 16, App Router, Tailwind v4, shadcn/base-nova, Hugeicons, `next-themes`), `apps/bot` (Discord bot, Fly), `packages/`.
- **Landing design system** (`apps/landing-page/app/globals.css`): oklch tokens; **primary = violet** (`oklch(0.432 0.232 292.759)` dark); signature **`--biolume`** cyan (`oklch(0.85 0.13 200)`) exposed as `bg-biolume`/`text-biolume`. Fonts: Figtree (sans), Space Grotesk (`font-display`), Geist Mono (eyebrows/code). Glassmorphic sections, `.atmosphere` starfield background, generous radii.
- **Animation today:** CSS only via `tw-animate-css` (`animate-in fade-in slide-in-from-*`) with static `delay-*`. Everything fires **on load**, not on scroll. Full `prefers-reduced-motion` block already exists.
- **Content source of truth:** `apps/landing-page/lib/content.ts` (all copy, links, legal). Section components in `apps/landing-page/components/sections/*`.
- **Assets:** `public/logo.png` (raster violet octopus with Discord-Clyde head + biolume eyes + starfield badge), `public/og.png`. No SVG illustrations exist yet.
- **"Open source" appears nowhere** on the site currently. Only outbound links are the two Discord URLs.
- **No root README / LICENSE / CONTRIBUTING** (the `README.md`/`AGENTS.md` inside `apps/landing-page` are framework/agent templates, not product docs).

---

## Part A — README + LICENSE + CONTRIBUTING

Root-level files: `README.md`, `LICENSE`, `CONTRIBUTING.md`.

### `README.md` structure

1. **Header** — logo, tagline ("GitHub, in your DMs"), badge row: License (MIT), PRs welcome, Discord community, live site (`octobot.dev`). Hero visual (reuse `apps/landing-page/public/og.png` or a DM screenshot).
2. **What is OctoBot** — 2–3 sentences (Discord bot that DMs you when GitHub needs you, across every repo your account can reach, one click to connect).
3. **Why you can trust it** — the security story *and* the open-source angle: read-only GitHub access; token AES-256-GCM encrypted at rest; CSRF-safe OAuth; least logging; **and "every line is public — audit it yourself."** This is where OSS becomes the trust lever.
4. **Get started (users)** — join the Discord community (mutual guild lets the bot DM you) → run `/link`. No self-host path.
5. **Architecture** — monorepo layout (`apps/bot`, `apps/landing-page`, `packages/*`), tech stack per app, short "how it works" (polls GitHub notifications → DMs you; ~1 min latency).
6. **Contributing** — points to `CONTRIBUTING.md`; local dev quickstart (`pnpm install`, `pnpm dev` / turbo), how to run each app, where to file issues, PR flow.
7. **Community · License · Disclaimer** — Discord link; MIT; "Not affiliated with or endorsed by GitHub, Inc. or Discord Inc."

**Accuracy constraint:** all product facts drawn from existing `lib/content.ts` and the bot service README — do not invent capabilities. Verify the dev commands against root `package.json` / `turbo.json` / each app's scripts before writing them.

### `LICENSE`

**MIT** (decided). Copyright holder: Gabriel Carvalho, 2026.

### `CONTRIBUTING.md`

Short and welcoming: prerequisites (Node, pnpm), setup, running the apps, project structure pointer, coding conventions (match existing style), commit/PR expectations, code of conduct note, link to Discord for questions.

---

## Part B — Open source on the landing page

Woven into the existing structure, not bolted on. All copy added to `lib/content.ts`.

1. **Header** (`components/site-header.tsx`) — a GitHub icon link → repo, beside the theme toggle (desktop) and in the mobile sheet. Add a `github` entry to the icon registry (`components/icon.tsx`) if not present (Hugeicons ships a GitHub glyph).
2. **Security section** (`components/sections/security.tsx`, data in `lib/content.ts`) — add an **"Open source — read every line"** point. Its natural home; ties transparency to the existing trust story.
3. **Open-source strip** — a new slim band/section directly above the final CTA: mascot illustration (Part C) + headline + "MIT-licensed · read-only · self-auditable" + a **"Star on GitHub"** button (and a "Read the code" link). New component `components/sections/open-source.tsx`, added to `app/page.tsx`.
4. **Footer** (`components/site-footer.tsx`) — a **"Source"** group: GitHub repo, Issues, Contributing.

New shared constants in `lib/content.ts`: `GITHUB_REPO_URL = https://github.com/gabrielccarvalho/octobot`, plus issues/contributing URLs.

---

## Part C — Visual / illustration / animation overhaul

### C1. Mascot SVG system (spike first)

- New component `components/mascot/octobot.tsx` (+ supporting parts) — a **flat, geometric, themeable** octopus: violet body (`--primary`), biolume eyes/accents (`--biolume`), Discord-ear head silhouette echoing `logo.png`.
- Built from geometric primitives; fills use `currentColor` / CSS variables so it recolors correctly in light and dark.
- Props for a small set of **poses/expressions** (e.g. `wave`, `peek`, `hold-dm`, `idle`) — implemented as variant shapes/limb positions, not separate art files.
- Subtle idle motion: gentle float + occasional blink, CSS-driven, **disabled under `prefers-reduced-motion`**.
- **This is the first implementation step and a gate:** produce and visually verify the mascot looks good and on-brand before building scenes on top of it. If pure-SVG quality is inadequate, stop and reconsider before proceeding with C2–C4.

### C2. How It Works → illustrated connect flow

- `components/sections/how-it-works.tsx` — each of the 4 steps (01 Connect · 02 Baseline · 03 Notify · 04 Digest) gets a **custom SVG scene**: mascot + diagrammatic connection (GitHub node → OAuth → DM → digest).
- Connection lines **draw on scroll** (SVG stroke-dash animation triggered when the step enters the viewport).
- Keeps existing step copy/data from `lib/content.ts`.

### C3. Scroll-triggered reveal system

- A lightweight, dependency-free **IntersectionObserver** hook (e.g. `lib/use-in-view.ts` or a small `components/reveal.tsx` wrapper) that toggles a `data-*`/class when an element enters the viewport.
- Migrate section/card entrance animations from load-time (`tw-animate-css` static delays) to **in-view** triggering, so content animates as the user scrolls.
- Must respect `prefers-reduced-motion` (no motion, content simply visible) and must not cause layout shift or hide content if JS fails (progressive enhancement: default-visible, enhance to animate).

### C4. Community CTA scene

- Mascot "welcoming you in" pose on the new open-source strip (Part B.3) and/or the final CTA (`components/sections/cta.tsx`).

### C5. Hero

- Keep the DM-stream mockup as the anchor. Optionally add a subtle mascot presence. No rewrite.

---

## Sequencing

1. **A** — README, LICENSE, CONTRIBUTING (independent, no site risk).
2. **B** — Open-source copy/links on the site (header, security point, footer, constants). The open-source *strip* (B.3) depends on the mascot, so ship its non-illustration parts and slot the mascot in after C1.
3. **C** — **C1 mascot spike (gate)** → C2 connect-flow scenes → C3 scroll reveals → C4 community scene. C5 optional/last.

## Risks & mitigations

- **Pure-SVG mascot quality** (biggest risk). Mitigation: keep it flat/geometric/simple; spike and verify before building scenes (C1 gate). Fallback if inadequate: simplified mascot motif / abstract diagrammatic scenes.
- **Scroll animation regressions** (content hidden if JS/observer fails, layout shift, motion-sensitivity). Mitigation: progressive enhancement (default-visible), strict `prefers-reduced-motion` handling, no reserved-space collapse.
- **README inaccuracy.** Mitigation: verify all commands and product facts against the actual repo before writing.

## Success criteria

- Root `README.md`, `LICENSE` (MIT), `CONTRIBUTING.md` exist and are accurate.
- The landing page visibly communicates "open source" in header, security, a dedicated strip, and footer, with working links to the repo.
- A reusable, themeable octopus mascot SVG renders correctly in light and dark and passes a visual check.
- How It Works shows illustrated, scroll-animated connect steps.
- Section content animates on scroll; `prefers-reduced-motion` fully honored; no content hidden without JS.
