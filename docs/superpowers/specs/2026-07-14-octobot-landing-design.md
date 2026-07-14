# OctoBot Landing + Legal — Design Spec

**Date:** 2026-07-14
**Status:** Approved

## Goal

Build the public marketing site for **OctoBot** — the product front-end for the
`discord-github-pr` service (a Discord bot that DMs a user the moment something on
GitHub needs their attention). Deliver three things:

1. A rich, single-page landing at `/`
2. A Terms of Service page at `/terms`
3. A Privacy Policy page at `/privacy`

OctoBot is a **commercial product operated by the maintainer's software company**.
Legal pages use a company voice with clearly-marked placeholders for the legal
entity name and governing jurisdiction. Contact email: `gabrielccarvalhopro@gmail.com`.

## Context / constraints

- Repo is a pre-scaffolded **Next.js 16.2.6 + React 19 + Tailwind v4 + shadcn
  (base-nova) + hugeicons** app (app router, `pnpm`).
- `AGENTS.md` warns this Next.js is non-standard — its APIs/conventions may differ
  from training data. **Read `node_modules/next/dist/docs/01-app/*` (metadata, fonts,
  Image, linking/routing) before writing code.**
- Theme already ships a **violet `--primary`** with full light/dark support and a `d`
  hotkey toggle (`next-themes`). We build on this, not around it.
- Fonts already wired: **Figtree** (`--font-sans`) + **Geist Mono** (`--font-mono`).
- Product facts are sourced from `../discord-github-pr/README.md` — do not invent
  features or data practices.

## Visual direction

"Deep-sea cosmos", dark-first, matching the octopus logo:
- Near-black background with a subtle star/nebula wash; violet glow accents echoing
  the logo halo; glassy bordered cards.
- Light mode fully supported (theme is already there).
- Figtree for headings/body; **Geist Mono for notification/DM snippets**, rendered as
  a believable Discord-style DM panel using the README's real examples.

## Logo handling

Source: `/Users/gabe/Downloads/Gemini_Generated_Image_crdk4icrdk4icrdk.png` (circular
badge, purple octopus, soft purple halo, white background).

- Knock out the white background → transparent PNG, keeping the badge + glow.
- Place processed assets in `public/` (e.g. `logo.png`, plus a favicon and OG image).
- Use in navbar, hero, footer, favicon, and OpenGraph/Twitter card.

## Page structure

### `/` — single scrolling landing
1. **Navbar** (sticky) — logo + "OctoBot" wordmark, anchor links (Features · How it
   works · Commands · FAQ), theme toggle, **Add to Discord** CTA (placeholder `#`).
2. **Hero** — headline *"GitHub, in your DMs."*, subhead, primary + secondary CTA, and
   a mock Discord DM panel with real example notifications.
3. **Value strip** — "Every repo you can access · public & private · zero per-repo setup".
4. **Features grid** — one-click `/link`; all subject types; granular `/listen-to`;
   daily digest; PR review verdicts; read-only & encrypted.
5. **How it works** — Connect → Baseline (no flood) → Poll & notify → Daily digest.
6. **Commands** — the 6 slash commands (`/link`, `/connect-token`, `/unlink`,
   `/status`, `/listen-to`, `/digest`) as cards.
7. **Notification catalog** — subject-type emoji grid + reason chips (from README).
8. **Security** — AES-256-GCM encrypted tokens, CSRF-safe OAuth, read-only, least logging.
9. **FAQ** — accordion (propagation delay, private repos, OAuth scope, cost, deletion).
10. **Final CTA band + footer** — Terms · Privacy · GitHub, company copyright.

### `/terms` — Terms of Service
Company voice. Sections: acceptance; description of service; the bot acts on the
user's GitHub account **read-only**; account/eligibility; acceptable use; third-party
services (Discord, GitHub); disclaimers & "as-is"; limitation of liability;
termination (user via `/unlink`); changes to terms; governing law
`[jurisdiction placeholder]`; contact. `[Company legal name]` placeholder throughout.
Last updated 2026-07-14.

### `/privacy` — Privacy Policy
Grounded in what the service actually stores (README): Discord user ID; **encrypted**
GitHub token (AES-256-GCM); notification watermark + per-thread dedup ledger;
subscription preferences; digest on/off flag; transient single-use OAuth `state`.
Sections: data collected & why; how used; retention; **deletion (`/unlink` wipes all
stored data)**; security; sub-processors (Discord, GitHub, hosting provider); no sale
of data; children; changes; contact `gabrielccarvalhopro@gmail.com`. Company
controller placeholder. Last updated 2026-07-14.

Both legal pages share a clean prose layout with back-to-home and last-updated.

## Tech approach

- Build on existing app router. Add shadcn primitives via pnpm: `card`, `accordion`,
  `badge`, `separator` (accordion drives the FAQ).
- Mostly static server components; reuse the existing client `ThemeProvider`.
- Shared components: `Logo`, `SiteHeader` (navbar), `SiteFooter`, section components
  under `components/`.
- Centralize copyable product facts (commands, subject types, reasons, features, FAQ)
  in a small `lib/content.ts` so sections stay declarative.
- Set page `metadata` (title, description, OpenGraph, icons) per Next 16 conventions.

## Out of scope (YAGNI)

- No auth, no backend, no real Discord OAuth wiring (CTA is a placeholder).
- No blog/docs/pricing pages.
- No i18n (despite `rtl: true` in components.json — single English locale).
- No analytics.

## Verification

- `pnpm typecheck` and `pnpm build` pass.
- Run `pnpm dev`, load `/`, `/terms`, `/privacy`; screenshot in both light & dark.
- Confirm logo renders with transparent background; no horizontal overflow on mobile.
