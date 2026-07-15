# OctoBot Open-Source Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch OctoBot as a credible open-source project — add root README/LICENSE/CONTRIBUTING, surface "open source" as a trust signal across the landing page, and add a themeable octopus-mascot SVG system with illustrated, scroll-animated connect steps.

**Architecture:** Three sequenced workstreams. (A) Root docs — pure content, no site risk. (B) Open-source copy/links woven into existing site sections, driven by `lib/content.ts`. (C) A reusable flat SVG mascot component (spike-gated on visual quality), an IntersectionObserver reveal system, and illustrated How-It-Works scenes. Everything honors `prefers-reduced-motion` and degrades to visible-without-JS.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript 5, Tailwind v4 (CSS-configured, no config file), shadcn/base-nova, Hugeicons, `next-themes`, `tw-animate-css`. pnpm + Turborepo. No new runtime dependencies.

## Global Constraints

- **No new npm dependencies.** Animation stays CSS + a hand-written IntersectionObserver hook. SVG is hand-authored.
- **Product facts are sourced from `apps/landing-page/lib/content.ts` and the bot service README — never invent capabilities.**
- **Repo URL:** `https://github.com/gabrielccarvalho/octobot`. **Live site:** `https://octobot.dev`.
- **License:** MIT, `Copyright (c) 2026 Gabriel Carvalho`.
- **Trust + contributors only — no self-hosting docs or self-host site path.**
- **Design tokens:** primary = violet (`--primary`), signature accent = `--biolume` cyan (`bg-biolume`/`text-biolume`). Fonts: `font-display` (Space Grotesk) for headings, `font-mono` (Geist Mono) for eyebrows/code, Figtree body. Container = `mx-auto max-w-6xl px-6`.
- **Every animation must be disabled/neutralized under `prefers-reduced-motion: reduce` and content must be visible if JS never runs (progressive enhancement).**
- **Not affiliated with or endorsed by GitHub, Inc. or Discord Inc.** — keep this disclaimer anywhere the two brands are named.
- **Verification commands** run from repo root unless noted: `pnpm --filter landing-page typecheck`, `pnpm --filter landing-page lint`, `pnpm --filter landing-page build`. Visual checks: `pnpm --filter landing-page dev` then screenshot via the Chrome browser tools (or the `/run` skill).
- Commit after every task. Plain commit messages, no attribution/co-author trailers.

---

## File Structure

**Create:**
- `README.md` (root) — project README
- `LICENSE` (root) — MIT
- `CONTRIBUTING.md` (root) — contributor guide
- `apps/landing-page/components/mascot/octobot-mascot.tsx` — themeable flat octopus SVG + pose/expression props
- `apps/landing-page/lib/use-in-view.ts` — IntersectionObserver hook
- `apps/landing-page/components/reveal.tsx` — progressive-enhancement reveal wrapper
- `apps/landing-page/components/sections/open-source.tsx` — the open-source trust strip
- `apps/landing-page/components/how-it-works-scene.tsx` — per-step SVG scene renderer

**Modify:**
- `apps/landing-page/lib/content.ts` — add OSS constants, an OSS security point, footer source links, per-step scene keys
- `apps/landing-page/components/site-header.tsx` — GitHub link (desktop + mobile)
- `apps/landing-page/components/site-footer.tsx` — "Source" column
- `apps/landing-page/components/sections/how-it-works.tsx` — render scenes + scroll draw
- `apps/landing-page/components/sections/cta.tsx` — swap logo for mascot (optional pose)
- `apps/landing-page/app/page.tsx` — mount `<OpenSource />`
- `apps/landing-page/app/globals.css` — mascot/idle/reveal/draw keyframes + reduced-motion additions

---

# PART A — README, LICENSE, CONTRIBUTING

### Task A1: MIT LICENSE

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Write the license**

Create `LICENSE` with the standard MIT text:

```
MIT License

Copyright (c) 2026 Gabriel Carvalho

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Verify**

Run: `head -3 LICENSE`
Expected: shows "MIT License" and the 2026 Gabriel Carvalho copyright line.

- [ ] **Step 3: Commit**

```bash
git add LICENSE
git commit -m "docs: add MIT license"
```

---

### Task A2: CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`
- Read first (to keep commands accurate): root `package.json`, `apps/landing-page/package.json`, `apps/bot` package scripts, `turbo.json`, `pnpm-workspace.yaml`.

**Interfaces:**
- Produces: contributor onboarding referenced by README's Contributing section.

- [ ] **Step 1: Verify the real dev commands**

Run: `cat package.json apps/landing-page/package.json apps/bot/package.json turbo.json pnpm-workspace.yaml`
Expected: confirm scripts — root has `dev`/`build`/`lint`/`typecheck`/`test` via turbo; landing-page has `dev`/`build`/`lint`/`typecheck`. Note the actual bot scripts; do not guess them.

- [ ] **Step 2: Write CONTRIBUTING.md**

Write a concise, welcoming guide using ONLY commands verified in Step 1. Required sections:
- **Prerequisites** — Node (match the version the repo targets), `pnpm` (`corepack enable`; the repo pins `pnpm@10.32.0`).
- **Setup** — clone, `pnpm install`.
- **Run the apps** — `pnpm dev` (all via turbo) or per-app `pnpm --filter landing-page dev` / the verified bot dev command.
- **Project layout** — one line each: `apps/landing-page` (marketing site), `apps/bot` (Discord bot), `packages/*`.
- **Before you open a PR** — `pnpm lint && pnpm typecheck && pnpm build` must pass; match existing code style (Prettier + the Tailwind plugin already configured); keep landing-page product claims sourced from `lib/content.ts` / the bot README.
- **Commits & PRs** — small focused PRs, descriptive messages, link related issues.
- **Questions** — link the Discord community (`https://discord.gg/dfJPuhDGu6`).
- **Conduct** — one line: be respectful; harassment is not tolerated.

Do not include any self-hosting/deploy instructions.

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm typecheck` (from repo root)
Expected: PASS (a markdown-only change must not break lint/typecheck).

- [ ] **Step 4: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add contributing guide"
```

---

### Task A3: README.md (root)

**Files:**
- Create: `README.md`
- Read first: `apps/landing-page/lib/content.ts` (source of product copy), `apps/bot` README/source for the "how it works" facts, `apps/landing-page/public/og.png` (hero image).

**Interfaces:**
- Consumes: `LICENSE` (A1), `CONTRIBUTING.md` (A2).

- [ ] **Step 1: Gather accurate facts**

Run: `sed -n '1,40p' apps/landing-page/lib/content.ts && ls apps/bot`
Expected: confirm tagline, activation model (join Discord community → `/link`), polling cadence (~1 min), security facts (AES-256-GCM, CSRF-safe OAuth, read-only, least logging), and the actual bot structure. Use these verbatim — do not invent.

- [ ] **Step 2: Write README.md**

Sections, in order:
1. **Header** — centered: `<img src="apps/landing-page/public/og.png">` (or logo), `# OctoBot`, tagline **"GitHub, in your DMs."**, and a badge row (shields.io static badges, no new deps):
   - `![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6.svg)` → `LICENSE`
   - `![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)` → `CONTRIBUTING.md`
   - `![Discord](https://img.shields.io/badge/Discord-join-5865F2.svg)` → `https://discord.gg/dfJPuhDGu6`
   - `![Website](https://img.shields.io/badge/site-octobot.dev-06b6d4.svg)` → `https://octobot.dev`
2. **What is OctoBot** — 2–3 sentences from content.ts (DMs you the moment GitHub needs you, across every repo your account can reach, one click to connect).
3. **Why you can trust it** — bulleted: read-only in practice; token AES-256-GCM encrypted at rest; CSRF-safe single-use OAuth state; least logging; **"and it's open source — every line is public, audit it yourself."**
4. **Get started** — join the Discord community (mutual guild lets the bot DM you) → run `/link`. No self-host path.
5. **Commands** — the six from `COMMANDS` in content.ts (`/link`, `/status`, `/listen-to`, `/digest`, `/connect-token`, `/unlink`) as a short table.
6. **Architecture** — monorepo layout tree (`apps/bot`, `apps/landing-page`, `packages/*`), tech stack per app, and a 2–3 sentence "how it works" (background poller checks GitHub ~once a minute with conditional requests → filters against your subscription → DMs you, deduplicated).
7. **Contributing** — 1 paragraph + link to `CONTRIBUTING.md`; show the quickstart trio (`pnpm install`, `pnpm dev`).
8. **Community · License · Disclaimer** — Discord link; "Licensed under [MIT](LICENSE)."; "Not affiliated with or endorsed by GitHub, Inc. or Discord Inc."

- [ ] **Step 3: Verify links and facts**

Run: `grep -n "octobot.dev\|discord.gg/dfJPuhDGu6\|MIT\|AES-256-GCM" README.md`
Expected: all four present; no self-host/deploy instructions in the file (`grep -ni "self-host\|fly deploy\|docker run" README.md` returns nothing).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add root README for open-source launch"
```

---

# PART B — Open source on the landing page

### Task B1: Open-source content + constants in content.ts

**Files:**
- Modify: `apps/landing-page/lib/content.ts`

**Interfaces:**
- Produces: `GITHUB_REPO_URL`, `GITHUB_ISSUES_URL`, `GITHUB_CONTRIBUTING_URL`, `OPEN_SOURCE` object; extends `SECURITY` with an open-source point; `STEPS` gains a `scene` key (used in Task C4).

- [ ] **Step 1: Add OSS constants**

In `lib/content.ts`, after the `DISCORD_COMMUNITY_URL`/`CONTACT_EMAIL` block (around line 18), add:

```ts
// --- Open source -------------------------------------------------------------

/** Public source repository. OctoBot is MIT-licensed and open source. */
export const GITHUB_REPO_URL = "https://github.com/gabrielccarvalho/octobot"
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`
export const GITHUB_CONTRIBUTING_URL = `${GITHUB_REPO_URL}/blob/main/CONTRIBUTING.md`

export const OPEN_SOURCE = {
  eyebrow: "Open source",
  title: "Don't trust it — read it",
  body: "OctoBot holds a token that can read your repositories. So every line that touches that token is public. Read it, audit it, or send a patch.",
  points: ["MIT-licensed", "Read-only access", "Self-auditable"],
  cta: "Star on GitHub",
} as const
```

- [ ] **Step 2: Add the open-source security point**

Append to the `SECURITY` array (after the "Least logging" entry, ~line 235):

```ts
  {
    icon: "Github01Icon",
    title: "Open source",
    body: "Every line is public and MIT-licensed. Don't take the read-only promise on faith — read the code that keeps it.",
  },
```

(`Github01Icon` is already registered in `components/icon.tsx`. `SECURITY` now has 5 entries; the 2-col grid in `security.tsx` reflows automatically — the last row will hold a single item, which is fine.)

- [ ] **Step 3: Add a `scene` key to each STEP (for Task C4)**

Change the `Step` type (around line 135) to:

```ts
export type Step = {
  n: string
  title: string
  body: string
  scene: "connect" | "baseline" | "notify" | "digest"
}
```

Then add the matching `scene` field to each of the 4 `STEPS` entries in order: `"connect"`, `"baseline"`, `"notify"`, `"digest"`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter landing-page typecheck`
Expected: PASS (all `STEPS` entries have `scene`; the new exports type-check).

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/lib/content.ts
git commit -m "feat(site): add open-source content, constants, and step scene keys"
```

---

### Task B2: GitHub link in the header

**Files:**
- Modify: `apps/landing-page/components/site-header.tsx`

**Interfaces:**
- Consumes: `GITHUB_REPO_URL` (B1), existing `Icon` component, `Github01Icon`.

- [ ] **Step 1: Import the repo URL**

In `site-header.tsx`, change the content import (line 10) to include the repo URL:

```tsx
import { NAV_LINKS, DISCORD_COMMUNITY_URL, GITHUB_REPO_URL } from "@/lib/content"
```

- [ ] **Step 2: Add the desktop GitHub icon link**

In the right-side control cluster (the `<div className="flex items-center gap-1.5">` block), immediately before `<ThemeToggle />`, add:

```tsx
<a
  href={GITHUB_REPO_URL}
  target="_blank"
  rel="noreferrer noopener"
  aria-label="OctoBot on GitHub"
  className="hidden size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
>
  <Icon name="Github01Icon" className="size-5" />
</a>
```

- [ ] **Step 3: Add the GitHub link to the mobile sheet**

In the mobile sheet's inner `<div>` (after the `NAV_LINKS.map(...)`, before the `AddToDiscord` wrapper), add a link styled like the nav links:

```tsx
<a
  href={GITHUB_REPO_URL}
  target="_blank"
  rel="noreferrer noopener"
  onClick={() => setOpen(false)}
  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
>
  <Icon name="Github01Icon" className="size-4" />
  GitHub
</a>
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter landing-page typecheck && pnpm --filter landing-page lint`
Expected: PASS.

- [ ] **Step 5: Visual check**

Start `pnpm --filter landing-page dev`, open the site, confirm the GitHub icon appears in the header (desktop) and in the mobile menu, links to the repo, and looks right in both themes.

- [ ] **Step 6: Commit**

```bash
git add apps/landing-page/components/site-header.tsx
git commit -m "feat(site): add GitHub link to header"
```

---

### Task B3: "Source" column in the footer

**Files:**
- Modify: `apps/landing-page/components/site-footer.tsx`

**Interfaces:**
- Consumes: `GITHUB_REPO_URL`, `GITHUB_ISSUES_URL`, `GITHUB_CONTRIBUTING_URL` (B1).

- [ ] **Step 1: Import the constants**

Extend the content import block (lines 4–10):

```tsx
import {
  NAV_LINKS,
  COMPANY_NAME,
  LAST_UPDATED,
  DISCORD_COMMUNITY_URL,
  DISCORD_INVITE_URL,
  GITHUB_REPO_URL,
  GITHUB_ISSUES_URL,
  GITHUB_CONTRIBUTING_URL,
} from "@/lib/content"
```

- [ ] **Step 2: Add the Source column**

The link grid is `grid grid-cols-2 gap-10 sm:grid-cols-3` (line 25). Change `sm:grid-cols-3` to `sm:grid-cols-4` and add a fourth `FooterCol` after the "Get started" column:

```tsx
<FooterCol title="Source">
  <FooterLink href={GITHUB_REPO_URL}>GitHub</FooterLink>
  <FooterLink href={GITHUB_ISSUES_URL}>Issues</FooterLink>
  <FooterLink href={GITHUB_CONTRIBUTING_URL}>Contributing</FooterLink>
</FooterCol>
```

(`FooterLink` already opens `http`-prefixed hrefs in a new tab with `rel="noreferrer noopener"` — no change needed there.)

- [ ] **Step 3: Verify**

Run: `pnpm --filter landing-page typecheck && pnpm --filter landing-page lint`
Expected: PASS.

- [ ] **Step 4: Visual check**

In the running dev site, scroll to the footer: confirm a "Source" column with three working GitHub links, and that the 4-column grid still wraps cleanly on mobile (2 cols) and desktop.

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/components/site-footer.tsx
git commit -m "feat(site): add Source links column to footer"
```

---

### Task B4: Open-source trust strip (no mascot yet)

**Files:**
- Create: `apps/landing-page/components/sections/open-source.tsx`
- Modify: `apps/landing-page/app/page.tsx`

**Interfaces:**
- Consumes: `OPEN_SOURCE`, `GITHUB_REPO_URL` (B1), `Section`/`SectionHeading` primitives, `Icon`.
- Produces: `<OpenSource />` component, mounted above `<Cta />`. Leaves a labeled slot for the mascot (filled in Task C6).

- [ ] **Step 1: Create the section**

Create `components/sections/open-source.tsx`. Build it from the existing primitives and tokens (glassmorphic card, biolume accent, mono microcopy). Include a clearly-commented placeholder where the mascot will go in C6:

```tsx
import { Section } from "@/components/section"
import { Icon } from "@/components/icon"
import { OPEN_SOURCE, GITHUB_REPO_URL } from "@/lib/content"

export function OpenSource() {
  return (
    <Section id="open-source">
      <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/50 p-8 ring-1 ring-foreground/5 backdrop-blur-sm sm:p-12">
        <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl space-y-4">
            <span className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.2em] text-biolume uppercase">
              <Icon name="Github01Icon" className="size-4" />
              {OPEN_SOURCE.eyebrow}
            </span>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {OPEN_SOURCE.title}
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground text-pretty">
              {OPEN_SOURCE.body}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {OPEN_SOURCE.points.map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-border/70 bg-background/50 px-3 py-1 font-mono text-xs text-muted-foreground"
                >
                  {p}
                </span>
              ))}
            </div>
            <div className="pt-2">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                <Icon name="Github01Icon" className="size-4" />
                {OPEN_SOURCE.cta}
              </a>
            </div>
          </div>

          {/* MASCOT SLOT — filled in Task C6 with <OctobotMascot pose="wave" /> */}
          <div className="shrink-0" aria-hidden />
        </div>
      </div>
    </Section>
  )
}
```

- [ ] **Step 2: Mount it in the page**

In `app/page.tsx`, import and place `<OpenSource />` immediately before `<Cta />`:

```tsx
import { OpenSource } from "@/components/sections/open-source"
// ...
        <Faq />
        <OpenSource />
        <Cta />
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter landing-page typecheck && pnpm --filter landing-page lint && pnpm --filter landing-page build`
Expected: PASS.

- [ ] **Step 4: Visual check**

In the dev site, confirm the open-source strip renders above the final CTA, the "Star on GitHub" button works, and it looks right in light and dark.

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/components/sections/open-source.tsx apps/landing-page/app/page.tsx
git commit -m "feat(site): add open-source trust section"
```

---

# PART C — Visual / illustration / animation

### Task C1: Mascot SVG spike (GATE)

> This task is a hard gate. Its deliverable is a themeable flat octopus that visibly looks good and on-brand. If pure-SVG quality is inadequate after a reasonable effort, STOP and raise it with the user before continuing to C4/C6 (fallback: simplified motif or abstract diagrammatic scenes). Do not silently ship weak art.

**Files:**
- Create: `apps/landing-page/components/mascot/octobot-mascot.tsx`
- Modify: `apps/landing-page/app/globals.css` (idle/blink keyframes)
- Reference: `apps/landing-page/public/logo.png` (the on-model character: violet body, Discord-Clyde head silhouette with two "ears", glowing biolume eyes, friendly smile, tentacles with biolume spots).

**Interfaces:**
- Produces: `OctobotMascot` component —
  ```ts
  type MascotPose = "idle" | "wave" | "peek" | "hold-dm"
  function OctobotMascot(props: {
    pose?: MascotPose        // default "idle"
    className?: string       // sizing via width/height utilities
    animate?: boolean        // default true; when false, no idle motion
    title?: string           // accessible label; if omitted, aria-hidden
  }): JSX.Element
  ```
  Colors come from CSS variables (`var(--primary)`, `var(--biolume)`, `var(--background)`, `currentColor`) so it themes automatically. The SVG uses a `viewBox` and scales to its container.

- [ ] **Step 1: Look at the reference**

Read `apps/landing-page/public/logo.png`. Note the key on-model traits to reproduce in flat form: rounded head with two soft ear-horns (Discord Clyde vibe), two large glowing biolume eyes, a small friendly smile, a rounded body, and a few (4–6) curling tentacles with small biolume dots.

- [ ] **Step 2: Build the base `idle` mascot**

Create `components/mascot/octobot-mascot.tsx`. Author a flat SVG (single `viewBox`, e.g. `0 0 160 160`) built from geometric primitives — `path`/`ellipse`/`circle` — for: head+ears silhouette (fill `var(--primary)`), body, 4–6 tentacles (fill `var(--primary)` with slightly varied opacity for depth), two eyes (fill `var(--biolume)` with a soft `var(--background)` glint), and a smile stroke. Expose the `pose`/`className`/`animate`/`title` props from the interface. Keep it flat — no gradients required, though a single subtle token-based gradient is allowed. Poses other than `idle` can start as the same art in Step 2 and be differentiated in Step 5.

Accessibility: when `title` is provided, render `<svg role="img" aria-label={title}>`; otherwise `<svg aria-hidden="true">`.

- [ ] **Step 3: Add idle motion keyframes**

In `app/globals.css`, add (outside any media query):

```css
@keyframes mascot-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes mascot-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.1); }
}
.mascot-float { animation: mascot-float 5s ease-in-out infinite; }
.mascot-blink { transform-box: fill-box; transform-origin: center; animation: mascot-blink 6s ease-in-out infinite; }
```

Then in the existing `@media (prefers-reduced-motion: reduce)` block, disable them:

```css
  .mascot-float, .mascot-blink { animation: none !important; }
```

Wire `.mascot-float` onto the root `<g>`/`<svg>` and `.mascot-blink` onto the eyes group, applied only when `animate !== false`.

- [ ] **Step 4: Render a preview harness and visually verify (GATE)**

Temporarily render the mascot for inspection — e.g. drop `<OctobotMascot className="size-40" title="OctoBot" />` into `app/page.tsx` above `<main>` (or a scratch route). Run `pnpm --filter landing-page dev` and screenshot via the Chrome browser tools in BOTH light and dark themes.

Expected: a recognizable, friendly, on-brand octopus; biolume eyes read against the violet body; nothing clips the viewBox; idle float + blink are subtle; colors invert correctly with the theme.

**GATE:** If it does not look good after reasonable iteration, STOP and report to the user with the screenshots and a recommendation (simplify pose set, or fall back to diagrammatic scenes) before proceeding. Remove the temporary preview harness once satisfied.

- [ ] **Step 5: Differentiate the poses**

Give `wave` (one tentacle raised in a wave), `peek` (mascot lower in the frame as if peeking up), and `hold-dm` (a small biolume DM bubble held by a tentacle) distinct art via conditional SVG fragments keyed on `pose`. Re-screenshot each pose in both themes; confirm each reads clearly.

- [ ] **Step 6: Verify**

Run: `pnpm --filter landing-page typecheck && pnpm --filter landing-page lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/landing-page/components/mascot/octobot-mascot.tsx apps/landing-page/app/globals.css
git commit -m "feat(site): add themeable OctoBot mascot SVG with poses"
```

---

### Task C2: IntersectionObserver reveal hook

**Files:**
- Create: `apps/landing-page/lib/use-in-view.ts`

**Interfaces:**
- Produces:
  ```ts
  function useInView<T extends Element>(options?: {
    once?: boolean          // default true — stop observing after first entry
    rootMargin?: string     // default "0px 0px -10% 0px"
    threshold?: number      // default 0.15
  }): { ref: React.RefObject<T | null>; inView: boolean }
  ```
  SSR/no-JS safe: `inView` starts `false`; consumers must render content visible-by-default and only *enhance* when `inView` becomes true (never hide content that depends on JS).

- [ ] **Step 1: Write the hook**

Create `lib/use-in-view.ts`:

```ts
"use client"

import * as React from "react"

export function useInView<T extends Element>(options?: {
  once?: boolean
  rootMargin?: string
  threshold?: number
}) {
  const { once = true, rootMargin = "0px 0px -10% 0px", threshold = 0.15 } =
    options ?? {}
  const ref = React.useRef<T | null>(null)
  const [inView, setInView] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true) // no observer support → just show it
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) observer.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { rootMargin, threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [once, rootMargin, threshold])

  return { ref, inView }
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter landing-page typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/landing-page/lib/use-in-view.ts
git commit -m "feat(site): add useInView intersection-observer hook"
```

---

### Task C3: Reveal wrapper (progressive enhancement)

**Files:**
- Create: `apps/landing-page/components/reveal.tsx`
- Modify: `apps/landing-page/app/globals.css` (reveal keyframe + reduced-motion)

**Interfaces:**
- Consumes: `useInView` (C2).
- Produces:
  ```ts
  function Reveal(props: {
    children: React.ReactNode
    className?: string
    delay?: number          // ms, default 0
    as?: "div" | "li" | "section"  // default "div"
  }): JSX.Element
  ```
  Content is visible by default (opacity-100). Only when JS runs and the element is out of view does it start hidden and animate in — implemented by applying the "hidden" state only after mount.

- [ ] **Step 1: Add reveal CSS**

In `app/globals.css` add:

```css
@keyframes reveal-in {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: none; }
}
.reveal-run { animation: reveal-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
```

And inside the `@media (prefers-reduced-motion: reduce)` block:

```css
  .reveal-pending { opacity: 1 !important; }
  .reveal-run { animation: none !important; }
```

- [ ] **Step 2: Write the component**

Create `components/reveal.tsx`:

```tsx
"use client"

import * as React from "react"

import { useInView } from "@/lib/use-in-view"
import { cn } from "@/lib/utils"

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  as?: "div" | "li" | "section"
}) {
  const { ref, inView } = useInView<HTMLElement>()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  // Before mount (SSR / no-JS): fully visible, no animation classes.
  // After mount: hidden until inView, then run the reveal animation.
  const pending = mounted && !inView
  return (
    <Tag
      ref={ref as never}
      className={cn(pending && "reveal-pending opacity-0", inView && "reveal-run", className)}
      style={inView && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  )
}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter landing-page typecheck && pnpm --filter landing-page lint && pnpm --filter landing-page build`
Expected: PASS.

- [ ] **Step 4: Visual check (no-JS safety)**

In the dev site, confirm normal scrolling reveals wrapped content smoothly. Then verify progressive enhancement: in DevTools set "Disable JavaScript" and reload — content must be fully visible (nothing stuck at opacity 0). Also toggle OS reduced-motion / emulate `prefers-reduced-motion: reduce` and confirm content is visible with no animation.

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/components/reveal.tsx apps/landing-page/app/globals.css
git commit -m "feat(site): add progressive-enhancement Reveal wrapper"
```

---

### Task C4: Illustrated How-It-Works scenes

**Files:**
- Create: `apps/landing-page/components/how-it-works-scene.tsx`
- Modify: `apps/landing-page/components/sections/how-it-works.tsx`, `apps/landing-page/app/globals.css` (line-draw keyframe)
- Reference: `apps/landing-page/lib/content.ts` (`STEPS` now carry `scene`, from B1).

**Interfaces:**
- Consumes: `OctobotMascot` (C1), `useInView` (C2), `STEPS[].scene` (B1).
- Produces: `HowItWorksScene` —
  ```ts
  function HowItWorksScene(props: {
    scene: "connect" | "baseline" | "notify" | "digest"
    className?: string
  }): JSX.Element
  ```
  Each scene is a compact SVG combining a diagrammatic connection (a GitHub node → OAuth/handshake → Discord DM → digest, per scene) with the mascot, drawn from design tokens.

- [ ] **Step 1: Add the line-draw keyframe**

In `app/globals.css`:

```css
@keyframes draw-line {
  to { stroke-dashoffset: 0; }
}
.draw-line {
  stroke-dasharray: var(--len, 200);
  stroke-dashoffset: var(--len, 200);
  animation: draw-line 1s ease forwards;
}
```

And in the reduced-motion block:

```css
  .draw-line { animation: none !important; stroke-dashoffset: 0 !important; }
```

- [ ] **Step 2: Build the scene component**

Create `components/how-it-works-scene.tsx`. A `"use client"` component that renders one of four SVG scenes keyed by `scene`, each using `var(--primary)`/`var(--biolume)`/`currentColor`, a shared `viewBox`, and a connecting stroke path with class `draw-line`. Use `useInView` so the `.draw-line` class (and any mascot reaction) is applied only when the scene enters the viewport (fall back to drawn/visible if not yet in view is fine since the keyframe ends at offset 0). Reuse `<OctobotMascot>` where a scene benefits from the character (e.g. `hold-dm` in "notify", `wave` in "connect"). Keep each scene simple and legible at small sizes.

Scene intents:
- `connect` — GitHub node linked to Discord node via a drawn line; mascot `wave`.
- `baseline` — a stack of items being marked "seen"/greyed, one welcome DM bubble highlighted.
- `notify` — GitHub activity → a biolume DM bubble arriving; mascot `hold-dm`.
- `digest` — a single summary card with a few PR lines and a clock/6am accent.

- [ ] **Step 3: Wire scenes into How It Works**

Modify `components/sections/how-it-works.tsx` to render a scene per step above its number/title. Keep the existing copy and grid. Example per-`<li>`:

```tsx
import { HowItWorksScene } from "@/components/how-it-works-scene"
// ...
<li key={step.n} className="relative flex flex-col gap-4 bg-card/70 p-7 backdrop-blur-sm">
  <HowItWorksScene scene={step.scene} className="h-28 w-full" />
  <div className="flex items-baseline gap-3">
    <span className="font-mono text-sm text-biolume">{step.n}</span>
    <span className="h-px flex-1 bg-border" aria-hidden />
  </div>
  <h3 className="font-display text-xl font-semibold tracking-tight">{step.title}</h3>
  <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{step.body}</p>
</li>
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter landing-page typecheck && pnpm --filter landing-page lint && pnpm --filter landing-page build`
Expected: PASS.

- [ ] **Step 5: Visual check**

In the dev site, scroll to How It Works: confirm all four scenes render, connection lines draw as each step scrolls into view, scenes read clearly at the card size, and both themes look right. Confirm reduced-motion shows fully-drawn static scenes.

- [ ] **Step 6: Commit**

```bash
git add apps/landing-page/components/how-it-works-scene.tsx apps/landing-page/components/sections/how-it-works.tsx apps/landing-page/app/globals.css
git commit -m "feat(site): illustrate How It Works steps with animated mascot scenes"
```

---

### Task C5: Migrate section entrances to scroll reveals

**Files:**
- Modify: section components that currently animate on load (e.g. `components/sections/features.tsx`, `commands.tsx`, `notifications.tsx`, `security.tsx`) — apply the `<Reveal>` wrapper to card grids/items.

**Interfaces:**
- Consumes: `Reveal` (C3).

- [ ] **Step 1: Identify load-time animations**

Run: `grep -rn "animate-in\|slide-in-from\|fade-in\|delay-\[" apps/landing-page/components/sections`
Expected: a list of elements currently animating on load. These are the migration targets.

- [ ] **Step 2: Wrap grid items with Reveal**

For each target section, wrap the repeated cards/items in `<Reveal>` (use `as="li"` where the item is a list item), passing a staggered `delay` by index (e.g. `delay={i * 60}`). Remove the now-redundant `animate-in ...` load-time utility classes from those items so animation is driven by scroll, not page load. Do NOT wrap section headings in a way that could hide above-the-fold hero content — leave the Hero as-is.

- [ ] **Step 3: Verify**

Run: `pnpm --filter landing-page typecheck && pnpm --filter landing-page lint && pnpm --filter landing-page build`
Expected: PASS.

- [ ] **Step 4: Visual check**

Scroll the full page: sections animate in as they enter the viewport (not all at once on load). Disable JS → everything visible. Reduced-motion → everything visible, no motion.

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/components/sections
git commit -m "feat(site): reveal section content on scroll instead of on load"
```

---

### Task C6: Mascot in the open-source strip and CTA

**Files:**
- Modify: `apps/landing-page/components/sections/open-source.tsx` (fill the mascot slot), `apps/landing-page/components/sections/cta.tsx` (swap logo image for mascot).

**Interfaces:**
- Consumes: `OctobotMascot` (C1).

- [ ] **Step 1: Fill the open-source mascot slot**

In `open-source.tsx`, replace the `{/* MASCOT SLOT ... */}` placeholder div with:

```tsx
<div className="shrink-0">
  <OctobotMascot pose="wave" title="OctoBot waving" className="size-40 sm:size-48" />
</div>
```

Add the import: `import { OctobotMascot } from "@/components/mascot/octobot-mascot"`.

- [ ] **Step 2: Use the mascot in the CTA**

In `cta.tsx`, replace the `<Image src="/logo.png" ... />` block with the mascot:

```tsx
<div className="mx-auto flex justify-center">
  <OctobotMascot pose="peek" title="OctoBot" className="size-20" />
</div>
```

Add `import { OctobotMascot } from "@/components/mascot/octobot-mascot"` and remove the now-unused `next/image` import if nothing else in the file uses it.

- [ ] **Step 3: Verify**

Run: `pnpm --filter landing-page typecheck && pnpm --filter landing-page lint && pnpm --filter landing-page build`
Expected: PASS (no unused-import lint errors).

- [ ] **Step 4: Visual check**

Confirm the waving mascot appears in the open-source strip and the mascot replaces the logo in the final CTA, both themes, with subtle idle motion and reduced-motion respected.

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/components/sections/open-source.tsx apps/landing-page/components/sections/cta.tsx
git commit -m "feat(site): place mascot in open-source strip and CTA"
```

---

## Final verification (whole effort)

- [ ] **Full build + lint + typecheck**

Run from repo root: `pnpm lint && pnpm typecheck && pnpm build`
Expected: all PASS.

- [ ] **Full-page visual pass**

`pnpm --filter landing-page dev`, then screenshot the whole page top-to-bottom in light and dark via the Chrome browser tools. Confirm: header GitHub link; illustrated How-It-Works scenes drawing on scroll; open-source strip with waving mascot; footer Source column; CTA mascot; sections revealing on scroll.

- [ ] **Accessibility / motion pass**

Emulate `prefers-reduced-motion: reduce` → no motion, all content visible. Disable JavaScript → all content visible (no elements stuck hidden). Mascot SVGs expose `role="img"` + label where meaningful, `aria-hidden` where decorative.

- [ ] **Docs pass**

`README.md`, `LICENSE`, `CONTRIBUTING.md` exist at root; README links resolve; no self-host instructions present.

---

## Self-Review Notes (author)

- **Spec coverage:** A1–A3 cover Part A (README/LICENSE/CONTRIBUTING). B1–B4 cover Part B (header link, security point, footer column, open-source strip). C1–C6 cover Part C (mascot spike-gate, reveal system, illustrated How-It-Works, scroll-reveal migration, mascot placement). C1 is the explicit mascot gate from the spec; C5.5 fallback is called out in C1's gate.
- **Sequencing dependency:** B4 leaves a labeled mascot slot filled by C6 — B ships without waiting on the mascot, matching the spec's "ship non-illustration parts, slot mascot in after C1."
- **Type consistency:** `OctobotMascot` prop shape (C1) is reused verbatim in C4/C6; `useInView` return shape (C2) reused in C3/C4; `STEPS[].scene` union (B1) matches `HowItWorksScene`'s `scene` param (C4).
- **Progressive enhancement:** reveal + scenes default to visible/drawn; reduced-motion and no-JS paths verified in C3.4, C4.5, C5.4, and the final pass.
