# "The Dive" Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the OctoBot landing page (`apps/landing-page`) as a single scroll-descent narrative from ocean surface to abyss, per the approved spec at `docs/superpowers/specs/2026-07-15-landing-dive-redesign-design.md`.

**Architecture:** All copy stays in `lib/content.ts`. A scroll-linked fixed backdrop (`DeepBackground`) and a fixed depth-gauge nav are global; each page beat is a section component under `components/sections/`. Motion comes from the `motion` package (`motion/react` imports). Sections that animate become client components — they still SSR their copy. Two old-section merges: Features + Notifications → `reaches-you`; Security + Open source → `trust`.

**Tech Stack:** Next 16.2.6 (App Router), React 19.2.4, Tailwind v4 (CSS-first config in `app/globals.css`), `motion` (new dep), next-themes, Hugeicons, pnpm + Turborepo.

## Global Constraints

- Copy and imagery are reused. `lib/content.ts` may gain only connective headline objects (like the existing `OPEN_SOURCE` const) — never invented capabilities (the file's own header rule).
- Every animation must respect `prefers-reduced-motion` — use `useReducedMotion()` from `motion/react` for JS-driven motion; CSS animations are already killed by the global reduce block in `globals.css`.
- Animate `transform`/`opacity` only. No scroll listeners outside `motion`'s hooks.
- Elements that motion hides before hydration must carry `data-motion-fade` so the `@media (scripting: none)` CSS fallback restores them without JS.
- All mascot art via `next/image` with the existing files in `public/mascot/` (`octobot.png`, `open-source.png`, `connect.png`, `baseline.png`, `notify.png`, `digest.png`). No new imagery.
- There is no unit-test infrastructure in this app and none should be added. The verification cycle per task is: `pnpm --filter landing-page typecheck` + `pnpm --filter landing-page lint` (both exit 0), plus visual verification in the final task. Run these from the repo root.
- Commit messages: plain conventional commits, **no** Co-Authored-By or generated-with lines.
- Work on branch `feat/dive-redesign`.
- Existing components you'll reuse unchanged: `DmCard` (`components/dm-message.tsx`), `AddToDiscord`, `Icon`, `Logo`, `ThemeToggle`, `Section`/`Eyebrow`/`SectionHeading` (`components/section.tsx`), the shadcn `Accordion` and `Button`.

---

### Task 1: Branch, dependency, dark default

**Files:**
- Modify: `apps/landing-page/package.json` (via pnpm add)
- Modify: `apps/landing-page/components/theme-provider.tsx:6-22`

**Interfaces:**
- Produces: `motion` package available for `motion/react` imports in all later tasks. Site defaults to dark theme.

- [ ] **Step 1: Create branch**

```bash
git checkout -b feat/dive-redesign
```

- [ ] **Step 2: Install motion**

Run from repo root:

```bash
pnpm --filter landing-page add motion
```

Expected: `motion` appears in `apps/landing-page/package.json` dependencies (v12.x).

- [ ] **Step 3: Flip default theme to dark**

In `components/theme-provider.tsx`, change the `NextThemesProvider` props: `defaultTheme="system"` → `defaultTheme="dark"` and delete the `enableSystem` line. Result:

```tsx
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
      {...props}
    >
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page pnpm-lock.yaml
git commit -m "feat(site): add motion dependency, default to dark theme"
```

---

### Task 2: Beats registry + motion primitives

**Files:**
- Create: `apps/landing-page/lib/beats.ts`
- Create: `apps/landing-page/components/motion-primitives.tsx`
- Modify: `apps/landing-page/app/globals.css` (append no-JS fallback)

**Interfaces:**
- Produces: `BEATS: Beat[]` (`{ id, label, depth }`) — section ids/depths used by DepthGauge and all section components. `FadeUp` and `Stagger`/`StaggerItem` client components — the standard entrance wrappers replacing `Reveal`.

- [ ] **Step 1: Create the beats registry**

`apps/landing-page/lib/beats.ts`:

```ts
/** The page's narrative beats, in scroll order. depth is meters below surface. */
export type Beat = { id: string; label: string; depth: number }

export const BEATS: Beat[] = [
  { id: "hero", label: "Surface", depth: 0 },
  { id: "noise", label: "The noise", depth: 150 },
  { id: "how", label: "How it works", depth: 400 },
  { id: "reaches-you", label: "What reaches you", depth: 600 },
  { id: "commands", label: "Commands", depth: 700 },
  { id: "trust", label: "Trust trench", depth: 800 },
  { id: "faq", label: "FAQ", depth: 900 },
  { id: "abyss", label: "The abyss", depth: 1000 },
]

export const MAX_DEPTH = BEATS[BEATS.length - 1].depth
```

- [ ] **Step 2: Create motion primitives**

`apps/landing-page/components/motion-primitives.tsx`:

```tsx
"use client"

import { motion, useReducedMotion } from "motion/react"
import type { Variants } from "motion/react"

const spring = { type: "spring", stiffness: 120, damping: 20 } as const

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: spring },
}

const fadeOnlyVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
}

/** Single element that fades/slides up when scrolled into view. */
export function FadeUp({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      data-motion-fade
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={reduce ? fadeOnlyVariants : fadeUpVariants}
    >
      {children}
    </motion.div>
  )
}

/** Parent that staggers its StaggerItem children when scrolled into view. */
export function Stagger({
  children,
  className,
  gap = 0.08,
}: {
  children: React.ReactNode
  className?: string
  gap?: number
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      transition={{ staggerChildren: gap }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      data-motion-fade
      className={className}
      variants={reduce ? fadeOnlyVariants : fadeUpVariants}
    >
      {children}
    </motion.div>
  )
}
```

- [ ] **Step 3: Append the no-JS fallback to globals.css**

At the end of `app/globals.css`:

```css
/* When scripting is unavailable, motion never runs — force-show anything it
   would have revealed. */
@media (scripting: none) {
  [data-motion-fade] {
    opacity: 1 !important;
    transform: none !important;
  }
}
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page
git commit -m "feat(site): add beats registry and motion entrance primitives"
```

---

### Task 3: Deep background (scroll-linked depth backdrop)

**Files:**
- Create: `apps/landing-page/components/deep-background.tsx`
- Modify: `apps/landing-page/app/globals.css` (replace `.atmosphere` block with depth layers + marine snow)
- Modify: `apps/landing-page/app/layout.tsx:74` (swap atmosphere div for `<DeepBackground />`)

**Interfaces:**
- Produces: `DeepBackground` client component, mounted once in the root layout. Depends on nothing from other tasks.

- [ ] **Step 1: Replace atmosphere CSS with depth layers**

In `app/globals.css`, delete the entire `/* ---- OctoBot: deep-sea cosmos atmosphere ---- */` block (the `.atmosphere`, `.atmosphere::before`, `.dark .atmosphere::before`, `.atmosphere::after`, `.dark .atmosphere::after` rules) and add in its place:

```css
/* ---- The Dive: scroll-linked depth backdrop ------------------------------- */
/* Surface layer: what you see at the top of the page. */
.deep-surface {
  background:
    radial-gradient(70% 55% at 50% 0%, color-mix(in oklch, var(--biolume) 16%, transparent), transparent 70%),
    radial-gradient(45% 40% at 12% 12%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 72%),
    linear-gradient(to bottom, color-mix(in oklch, var(--primary) 6%, var(--background)), var(--background) 60%);
}
.dark .deep-surface {
  background:
    radial-gradient(70% 55% at 50% 0%, color-mix(in oklch, var(--biolume) 12%, transparent), transparent 70%),
    radial-gradient(45% 40% at 12% 12%, color-mix(in oklch, var(--primary) 24%, transparent), transparent 72%),
    linear-gradient(to bottom, oklch(0.2 0.04 265), var(--background) 65%);
}
/* Abyss layer: crossfaded over the surface as the user scrolls deeper. */
.deep-abyss {
  background: linear-gradient(to bottom, oklch(0.55 0.08 220), oklch(0.32 0.07 215));
}
.dark .deep-abyss {
  background: linear-gradient(to bottom, oklch(0.13 0.03 255), oklch(0.08 0.02 250));
}

/* Marine snow: drifting specks, mounted in dark mode as depth increases. */
.marine-snow-speck {
  position: absolute;
  top: -2%;
  border-radius: 9999px;
  background: color-mix(in oklch, var(--biolume) 65%, transparent);
  animation-name: snow-fall;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
@keyframes snow-fall {
  from { transform: translateY(0) translateX(0); }
  50% { transform: translateY(52vh) translateX(10px); }
  to { transform: translateY(105vh) translateX(-6px); }
}
```

- [ ] **Step 2: Create the DeepBackground component**

`apps/landing-page/components/deep-background.tsx`:

```tsx
"use client"

import * as React from "react"
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react"
import type { MotionValue } from "motion/react"

export function DeepBackground() {
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const eased = useSpring(scrollYProgress, { stiffness: 60, damping: 20 })
  const abyssOpacity = useTransform(eased, [0, 0.3, 1], [0, 0.4, 1])
  const snowOpacity = useTransform(eased, [0.12, 0.45], [0, 1])

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="deep-surface absolute inset-0" />
      <motion.div
        className="deep-abyss absolute inset-0"
        style={{ opacity: reduce ? 0.55 : abyssOpacity }}
      />
      {!reduce && <MarineSnow opacity={snowOpacity} />}
    </div>
  )
}

/** Dark-mode drifting specks. Deterministic layout (no Math.random) and
 *  mounted after a delay so it never affects first paint. */
function MarineSnow({ opacity }: { opacity: MotionValue<number> }) {
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 800)
    return () => window.clearTimeout(t)
  }, [])

  if (!ready) return null

  return (
    <motion.div style={{ opacity }} className="absolute inset-0 hidden dark:block">
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          className="marine-snow-speck"
          style={{
            left: `${(i * 61) % 100}%`,
            width: 1 + ((i * 7) % 3),
            height: 1 + ((i * 7) % 3),
            opacity: 0.25 + ((i * 11) % 50) / 100,
            animationDuration: `${14 + ((i * 13) % 12)}s`,
            animationDelay: `${-((i * 5) % 20)}s`,
          }}
        />
      ))}
    </motion.div>
  )
}
```

- [ ] **Step 3: Swap it into the layout**

In `app/layout.tsx`: add `import { DeepBackground } from "@/components/deep-background"` and replace `<div className="atmosphere" aria-hidden="true" />` with `<DeepBackground />`.

- [ ] **Step 4: Verify**

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint
```

Expected: both exit 0. Then quick visual sanity check:

```bash
pnpm --filter landing-page dev
```

Load http://localhost:3000 — backdrop darkens as you scroll (dark mode), specks drift after ~1s. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page
git commit -m "feat(site): replace static atmosphere with scroll-linked depth backdrop"
```

---

### Task 4: Waterline divider

**Files:**
- Create: `apps/landing-page/components/waterline.tsx`
- Modify: `apps/landing-page/app/globals.css` (append wave keyframes)

**Interfaces:**
- Produces: `Waterline` component (`{ className?: string }`) — animated SVG wave divider used at the end of the hero (Task 6).

- [ ] **Step 1: Append wave CSS**

At the end of `app/globals.css` (before the `scripting: none` block is fine):

```css
/* Waterline: two drifting wave layers. Width is 200%; drifting -50% loops seamlessly. */
@keyframes wave-drift {
  to { transform: translateX(-50%); }
}
.waterline-wave {
  animation: wave-drift 14s linear infinite;
}
.waterline-wave-slow {
  animation: wave-drift 22s linear infinite;
}
```

- [ ] **Step 2: Create the component**

`apps/landing-page/components/waterline.tsx`:

```tsx
import { cn } from "@/lib/utils"

const WAVE_PATH =
  "M0,48 C240,80 480,16 720,48 C960,80 1200,16 1440,48 C1680,80 1920,16 2160,48 C2400,80 2640,16 2880,48 L2880,96 L0,96 Z"

export function Waterline({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-14 overflow-hidden", className)} aria-hidden>
      <svg
        className="waterline-wave-slow absolute bottom-1 left-0 h-full w-[200%]"
        viewBox="0 0 2880 96"
        preserveAspectRatio="none"
      >
        <path d={WAVE_PATH} fill="color-mix(in oklch, var(--biolume) 10%, transparent)" />
      </svg>
      <svg
        className="waterline-wave absolute bottom-0 left-0 h-full w-[200%]"
        viewBox="0 0 2880 96"
        preserveAspectRatio="none"
      >
        <path d={WAVE_PATH} fill="color-mix(in oklch, var(--biolume) 18%, transparent)" />
      </svg>
    </div>
  )
}
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint
```

Expected: both exit 0 (component is not yet mounted anywhere — that's fine).

- [ ] **Step 4: Commit**

```bash
git add apps/landing-page
git commit -m "feat(site): add animated waterline divider"
```

---

### Task 5: Depth gauge + simplified header

**Files:**
- Create: `apps/landing-page/components/depth-gauge.tsx`
- Modify: `apps/landing-page/components/site-header.tsx` (remove anchor nav + mobile sheet)

**Interfaces:**
- Consumes: `BEATS`, `MAX_DEPTH` from `lib/beats.ts` (Task 2).
- Produces: `DepthGauge` client component — fixed right-edge nav, mounted on the home page (Task 13). Header keeps only Logo, ThemeToggle, AddToDiscord.

- [ ] **Step 1: Create the depth gauge**

`apps/landing-page/components/depth-gauge.tsx`:

```tsx
"use client"

import * as React from "react"
import { useScroll, useMotionValueEvent } from "motion/react"

import { BEATS, MAX_DEPTH } from "@/lib/beats"
import { cn } from "@/lib/utils"

export function DepthGauge() {
  const { scrollYProgress } = useScroll()
  const readoutRef = React.useRef<HTMLSpanElement>(null)
  const [active, setActive] = React.useState<string>(BEATS[0].id)

  // Text readout updates via direct DOM write — no re-render per scroll frame.
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    if (readoutRef.current) {
      readoutRef.current.textContent = `-${Math.round(p * MAX_DEPTH)}m`
    }
  })

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: "-45% 0px -45% 0px" }
    )
    for (const beat of BEATS) {
      const el = document.getElementById(beat.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  return (
    <nav
      aria-label="Depth navigation"
      className="fixed top-1/2 right-5 z-40 hidden -translate-y-1/2 flex-col items-end gap-2.5 xl:flex"
    >
      <span
        ref={readoutRef}
        className="mb-1 font-mono text-[11px] tabular-nums text-biolume"
      >
        -0m
      </span>
      {BEATS.map((beat) => {
        const isActive = active === beat.id
        return (
          <button
            key={beat.id}
            type="button"
            aria-current={isActive ? "true" : undefined}
            onClick={() =>
              document.getElementById(beat.id)?.scrollIntoView({ behavior: "smooth" })
            }
            className={cn(
              "group flex items-center gap-2 py-0.5 font-mono text-[10px] tracking-wider uppercase transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground/70 hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "transition-opacity",
                isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              )}
            >
              {beat.label}
            </span>
            <span
              className={cn(
                "h-px bg-current transition-all",
                isActive ? "w-6 text-biolume" : "w-3.5"
              )}
            />
          </button>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Simplify the header**

Rewrite `components/site-header.tsx` — the depth gauge replaces anchor navigation, so the header drops `NAV_LINKS`, the mobile sheet, and its open/close state entirely:

```tsx
import { Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { AddToDiscord } from "@/components/add-to-discord"
import { DISCORD_COMMUNITY_URL } from "@/lib/content"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6">
        <div className="flex h-14 items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-3 pe-2 backdrop-blur-xl sm:px-4">
          <Logo />
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <AddToDiscord href={DISCORD_COMMUNITY_URL}>Join community</AddToDiscord>
          </div>
        </div>
      </div>
    </header>
  )
}
```

Note: this file no longer needs `"use client"`, React state, `Button`, `Icon`, or `cn` — remove all of those imports.

- [ ] **Step 3: Verify**

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/landing-page
git commit -m "feat(site): add depth gauge nav, simplify header"
```

---

### Task 6: Hero rewrite — living DM feed + waterline

**Files:**
- Modify: `apps/landing-page/components/sections/hero.tsx` (full rewrite)

**Interfaces:**
- Consumes: `Waterline` (Task 4), `DmCard`, `AddToDiscord`, `Icon`, `Eyebrow`, content constants.
- Produces: `Hero` with `id="hero"` on its `<section>`.

- [ ] **Step 1: Rewrite the hero**

Replace `components/sections/hero.tsx` entirely. The left pitch keeps its current markup but entrances move from `tw-animate-css` classes to a motion stagger. The DM window becomes a living loop: every 2.8s the next `HERO_MESSAGES` entry springs in at the bottom, the oldest fades out the top (max 3 visible). Reduced motion: static list of the first three, no loop.

```tsx
"use client"

import * as React from "react"
import Image from "next/image"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { AddToDiscord } from "@/components/add-to-discord"
import { DmCard } from "@/components/dm-message"
import { Icon } from "@/components/icon"
import { Eyebrow } from "@/components/section"
import { Waterline } from "@/components/waterline"
import {
  HERO_MESSAGES,
  VALUE_POINTS,
  DISCORD_COMMUNITY_URL,
  DISCORD_INVITE_URL,
} from "@/lib/content"
import type { DmMessage } from "@/lib/content"

type FeedItem = { key: number; msg: DmMessage }

function useLiveFeed(enabled: boolean) {
  const [feed, setFeed] = React.useState<FeedItem[]>(() =>
    HERO_MESSAGES.slice(0, 3).map((msg, i) => ({ key: i, msg }))
  )
  const counter = React.useRef(3)

  React.useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => {
      setFeed((prev) => {
        const msg = HERO_MESSAGES[counter.current % HERO_MESSAGES.length]
        const next = [...prev, { key: counter.current, msg }]
        counter.current += 1
        return next.slice(-3)
      })
    }, 2800)
    return () => window.clearInterval(id)
  }, [enabled])

  return feed
}

const pitchItem = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 20 } },
} as const

export function Hero() {
  const reduce = useReducedMotion()
  const feed = useLiveFeed(!reduce)

  return (
    <section id="hero" className="relative overflow-hidden">
      <div className="hero-grid pointer-events-none absolute inset-0 -z-[1]" aria-hidden />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-8 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-12">
        {/* Left: the pitch */}
        <motion.div
          className="flex flex-col items-start"
          initial="hidden"
          animate="visible"
          transition={{ staggerChildren: 0.1 }}
        >
          <motion.div variants={pitchItem} data-motion-fade>
            <Eyebrow>github → discord</Eyebrow>
          </motion.div>

          <motion.h1
            variants={pitchItem}
            data-motion-fade
            className="mt-5 font-display text-5xl font-semibold tracking-tight text-balance sm:text-6xl lg:text-[4.25rem] lg:leading-[1.02]"
          >
            GitHub, in your{" "}
            <span className="relative whitespace-nowrap text-primary">
              DMs
              <span
                className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full bg-gradient-to-r from-primary to-biolume"
                aria-hidden
              />
            </span>
            .
          </motion.h1>

          <motion.p
            variants={pitchItem}
            data-motion-fade
            className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty"
          >
            OctoBot watches every repository your account can touch — public and
            private — and sends a Discord DM the moment something needs you.
            Review requests, mentions, CI failures, approvals. No per-repo
            webhooks. One click to connect.
          </motion.p>

          <motion.div
            variants={pitchItem}
            data-motion-fade
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <AddToDiscord size="hero" href={DISCORD_COMMUNITY_URL}>
              Join the community
            </AddToDiscord>
            <a
              href="#how"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-background/40 px-5 text-base font-medium backdrop-blur-sm transition-colors hover:bg-muted"
            >
              Take the dive
            </a>
          </motion.div>

          <motion.p
            variants={pitchItem}
            data-motion-fade
            className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground"
          >
            <Icon name="FlashIcon" className="size-3.5 text-biolume" strokeWidth={2} />
            <span>Join, run /link, done · read-only · disconnect anytime</span>
            <span className="hidden text-border sm:inline" aria-hidden>
              ·
            </span>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="text-foreground/70 underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
            >
              or add OctoBot to your own server
            </a>
          </motion.p>
        </motion.div>

        {/* Right: the living DM stream */}
        <motion.div
          className="relative"
          data-motion-fade
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 80, damping: 18, delay: 0.15 }}
        >
          <div
            className="absolute -inset-6 -z-[1] rounded-[2rem] bg-primary/10 blur-2xl"
            aria-hidden
          />
          <div className="rounded-3xl border border-border/70 bg-card/60 p-2.5 shadow-2xl shadow-primary/10 ring-1 ring-foreground/5 backdrop-blur-xl">
            <div className="flex items-center gap-3 rounded-2xl bg-background/50 px-4 py-3">
              <div className="relative size-8">
                <Image src="/logo.png" alt="" width={32} height={32} className="rounded-full" />
                <span className="biolume-dot absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card bg-biolume" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">OctoBot</div>
                <div className="font-mono text-[11px] text-biolume">online · watching 14 repos</div>
              </div>
              <span className="ms-auto font-mono text-[11px] text-muted-foreground">
                #direct-messages
              </span>
            </div>

            <div className="flex flex-col gap-2.5 p-2.5">
              <AnimatePresence initial={false} mode="popLayout">
                {feed.map((item) => (
                  <motion.div
                    key={item.key}
                    layout
                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  >
                    <DmCard message={item.msg} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Value strip */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-border/60 pt-5 pb-2 text-center">
          {VALUE_POINTS.map((point, i) => (
            <div key={point} className="flex items-center gap-8">
              {i > 0 && <span className="hidden size-1 rounded-full bg-border sm:block" aria-hidden />}
              <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                {point}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Going under */}
      <Waterline className="mt-6" />
    </section>
  )
}
```

- [ ] **Step 2: Verify**

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint
```

Expected: both exit 0. Visual check with `pnpm --filter landing-page dev`: pitch staggers in, DM feed cycles every ~3s with spring physics, waterline waves drift. Stop server.

- [ ] **Step 3: Commit**

```bash
git add apps/landing-page
git commit -m "feat(site): hero with living DM feed and waterline"
```

---

### Task 7: "The Noise" section (new beat)

**Files:**
- Modify: `apps/landing-page/lib/content.ts` (append `NOISE` copy const)
- Create: `apps/landing-page/components/sections/noise.tsx`

**Interfaces:**
- Consumes: `REASONS`, `HERO_MESSAGES`, `DmCard`, `SectionHeading`.
- Produces: `Noise` section with `id="noise"`. Scroll-scrubbed: scattered notification pills sink away while one clean DM settles in.

- [ ] **Step 1: Add connective copy to content.ts**

Append after the `REASONS` const in `lib/content.ts` (connective headline only — states the existing filtering facts):

```ts
// --- The Noise (narrative beat) ----------------------------------------------

export const NOISE = {
  eyebrow: "The problem",
  title: "GitHub never shuts up",
  body: "Every repo, every thread, every ping. Scroll: the noise sinks. What needs you surfaces as a single DM.",
} as const
```

- [ ] **Step 2: Create the section**

`apps/landing-page/components/sections/noise.tsx`:

```tsx
"use client"

import * as React from "react"
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import type { MotionValue } from "motion/react"

import { DmCard } from "@/components/dm-message"
import { SectionHeading } from "@/components/section"
import { HERO_MESSAGES, NOISE, REASONS } from "@/lib/content"

/** Deterministic scatter for the 11 REASONS pills (percent offsets). */
const SCATTER = [
  { left: "4%", top: "16%", rotate: -7 },
  { left: "24%", top: "4%", rotate: 4 },
  { left: "46%", top: "12%", rotate: -3 },
  { left: "66%", top: "2%", rotate: 6 },
  { left: "82%", top: "18%", rotate: -5 },
  { left: "10%", top: "38%", rotate: 3 },
  { left: "72%", top: "40%", rotate: -8 },
  { left: "30%", top: "30%", rotate: 7 },
  { left: "54%", top: "34%", rotate: -2 },
  { left: "16%", top: "58%", rotate: 5 },
  { left: "62%", top: "60%", rotate: -4 },
] as const

function NoisePill({
  progress,
  index,
  children,
}: {
  progress: MotionValue<number>
  index: number
  children: React.ReactNode
}) {
  const start = 0.08 + (index % 5) * 0.05
  const y = useTransform(progress, [start, start + 0.4], [0, 240])
  const opacity = useTransform(progress, [start, start + 0.32], [1, 0])
  const pos = SCATTER[index % SCATTER.length]

  return (
    <motion.span
      style={{ y, opacity, left: pos.left, top: pos.top, rotate: pos.rotate }}
      className="absolute rounded-full border border-border/70 bg-card/70 px-3 py-1.5 font-mono text-[11px] whitespace-nowrap text-muted-foreground backdrop-blur-sm"
    >
      {children}
    </motion.span>
  )
}

export function Noise() {
  const ref = React.useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  })
  const cardOpacity = useTransform(scrollYProgress, [0.32, 0.5], [0, 1])
  const cardY = useTransform(scrollYProgress, [0.32, 0.5], [24, 0])

  if (reduce) {
    // Static fallback: pills as a muted cloud above one clean DM.
    return (
      <section id="noise" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
        <SectionHeading align="center" eyebrow={NOISE.eyebrow} title={NOISE.title} intro={NOISE.body} />
        <div className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2 opacity-50">
          {REASONS.map((reason) => (
            <span
              key={reason}
              className="rounded-full border border-border/70 bg-card/70 px-3 py-1.5 font-mono text-[11px] text-muted-foreground"
            >
              {reason}
            </span>
          ))}
        </div>
        <div className="mx-auto mt-8 max-w-md">
          <DmCard message={HERO_MESSAGES[0]} />
        </div>
      </section>
    )
  }

  return (
    <section id="noise" ref={ref} className="relative h-[170vh]">
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden px-6">
        <SectionHeading align="center" eyebrow={NOISE.eyebrow} title={NOISE.title} intro={NOISE.body} />

        {/* The scattered noise */}
        <div className="relative mt-8 h-72 w-full max-w-4xl" aria-hidden>
          {REASONS.map((reason, i) => (
            <NoisePill key={reason} progress={scrollYProgress} index={i}>
              {reason}
            </NoisePill>
          ))}

          {/* What surfaces */}
          <motion.div
            data-motion-fade
            style={{ opacity: cardOpacity, y: cardY }}
            className="absolute top-1/2 left-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2"
          >
            <div className="absolute -inset-4 -z-[1] rounded-3xl bg-biolume/10 blur-xl" aria-hidden />
            <DmCard message={HERO_MESSAGES[0]} />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint
```

Expected: both exit 0 (section wired into the page in Task 13).

- [ ] **Step 4: Commit**

```bash
git add apps/landing-page
git commit -m "feat(site): add The Noise scroll beat"
```

---

### Task 8: How it works — pinned scroll-scrub theater

**Files:**
- Modify: `apps/landing-page/components/sections/how-it-works.tsx` (full rewrite)

**Interfaces:**
- Consumes: `STEPS` (each `{ n, title, body, scene }`), scene images at `/mascot/${scene}.png`, `SectionHeading`, `Stagger`/`StaggerItem` (Task 2).
- Produces: `HowItWorks` with `id="how"`. Desktop: pinned scrub through 4 scenes. Mobile & reduced motion: static stacked list.

- [ ] **Step 1: Rewrite the section**

Replace `components/sections/how-it-works.tsx`:

```tsx
"use client"

import * as React from "react"
import Image from "next/image"
import { AnimatePresence, motion, useReducedMotion, useScroll, useMotionValueEvent } from "motion/react"

import { SectionHeading } from "@/components/section"
import { Stagger, StaggerItem } from "@/components/motion-primitives"
import { STEPS } from "@/lib/content"
import { cn } from "@/lib/utils"

function SceneImage({ scene, title }: { scene: string; title: string }) {
  return (
    <Image
      src={`/mascot/${scene}.png`}
      alt={title}
      width={640}
      height={640}
      className="size-full rounded-3xl object-cover"
    />
  )
}

/** Static fallback: used on small screens and under reduced motion. */
function StaticSteps() {
  return (
    <Stagger className="mt-12 grid gap-10 sm:grid-cols-2">
      {STEPS.map((step) => (
        <StaggerItem key={step.n}>
          <div className="overflow-hidden rounded-3xl border border-border/70 ring-1 ring-foreground/5">
            <SceneImage scene={step.scene} title={step.title} />
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="font-mono text-sm text-biolume">{step.n}</span>
            <h3 className="font-display text-xl font-semibold tracking-tight">{step.title}</h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        </StaggerItem>
      ))}
    </Stagger>
  )
}

function ScrubSteps() {
  const ref = React.useRef<HTMLDivElement>(null)
  const [step, setStep] = React.useState(0)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  })

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setStep(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length)))
  })

  const active = STEPS[step]

  return (
    <div ref={ref} className="relative mt-4 h-[340vh]">
      <div className="sticky top-0 flex h-screen items-center">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Copy rail */}
          <div className="flex flex-col gap-7">
            {STEPS.map((s, i) => (
              <button
                key={s.n}
                type="button"
                onClick={() => {
                  const el = ref.current
                  if (!el) return
                  const top = el.offsetTop + (el.offsetHeight - window.innerHeight) * (i / (STEPS.length - 1))
                  window.scrollTo({ top, behavior: "smooth" })
                }}
                className={cn(
                  "border-l-2 pl-5 text-left transition-all duration-300",
                  i === step ? "border-biolume opacity-100" : "border-border opacity-40 hover:opacity-70"
                )}
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-sm text-biolume">{s.n}</span>
                  <h3 className="font-display text-xl font-semibold tracking-tight">{s.title}</h3>
                </div>
                <p
                  className={cn(
                    "mt-2 max-w-md text-sm leading-relaxed text-muted-foreground transition-all duration-300",
                    i === step ? "line-clamp-none" : "line-clamp-1"
                  )}
                >
                  {s.body}
                </p>
              </button>
            ))}
          </div>

          {/* Scene theater */}
          <div className="relative aspect-square w-full max-w-xl justify-self-end overflow-hidden rounded-[2rem] border border-border/70 ring-1 ring-foreground/5">
            <AnimatePresence mode="sync" initial={false}>
              <motion.div
                key={active.scene}
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <SceneImage scene={active.scene} title={active.title} />
              </motion.div>
            </AnimatePresence>
            {/* Progress rail */}
            <div className="absolute right-4 bottom-4 flex gap-1.5">
              {STEPS.map((s, i) => (
                <span
                  key={s.n}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    i === step ? "w-6 bg-biolume" : "w-2.5 bg-foreground/25"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function HowItWorks() {
  const reduce = useReducedMotion()

  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20 sm:py-24">
      <SectionHeading
        eyebrow="How it works"
        title="Four steps down"
        intro="From /link to a quiet, useful stream of DMs."
      />
      {reduce ? (
        <StaticSteps />
      ) : (
        <>
          <div className="lg:hidden">
            <StaticSteps />
          </div>
          <div className="hidden lg:block">
            <ScrubSteps />
          </div>
        </>
      )}
    </section>
  )
}
```

Note: the existing `components/how-it-works-scene.tsx` becomes unused — it is deleted in Task 13.

- [ ] **Step 2: Verify**

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint
```

Expected: both exit 0. Visual check with dev server: on desktop the section pins while scenes crossfade in step with scroll; step copy is clickable; on a narrow window it's a static 2-col grid.

- [ ] **Step 3: Commit**

```bash
git add apps/landing-page
git commit -m "feat(site): pinned scroll-scrub how-it-works theater"
```

---

### Task 9: "What reaches you" — merged Features + Notifications

**Files:**
- Create: `apps/landing-page/components/sections/reaches-you.tsx`

**Interfaces:**
- Consumes: `FEATURES`, `REASONS`, `SUBJECT_TYPES`, `HERO_MESSAGES`, `DmCard`, `SectionHeading`, `Stagger`/`StaggerItem`, `Icon`.
- Produces: `ReachesYou` section with `id="reaches-you"`. Interactive: toggling reason pills live-filters a preview DM list; features render as editorial stanzas.

- [ ] **Step 1: Create the section**

`apps/landing-page/components/sections/reaches-you.tsx`:

```tsx
"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"

import { DmCard } from "@/components/dm-message"
import { Icon } from "@/components/icon"
import { SectionHeading } from "@/components/section"
import { Stagger, StaggerItem } from "@/components/motion-primitives"
import { FEATURES, HERO_MESSAGES, REASONS, SUBJECT_TYPES } from "@/lib/content"
import type { DmMessage } from "@/lib/content"
import { cn } from "@/lib/utils"

/** Sample DMs mapped to the reason pill that lets them through. */
const SAMPLES: { reason: (typeof REASONS)[number]; msg: DmMessage }[] = [
  { reason: "🔔 Review requested", msg: HERO_MESSAGES[0] },
  { reason: "✍️ Activity on your PR", msg: HERO_MESSAGES[1] },
  { reason: "📣 Mentioned", msg: HERO_MESSAGES[2] },
  { reason: "✍️ Activity on your PR", msg: HERO_MESSAGES[3] },
]

/** Reasons that have a sample DM wired up (interactive); the rest still toggle. */
const DEFAULT_ON = new Set<string>(["🔔 Review requested", "✍️ Activity on your PR", "📣 Mentioned"])

export function ReachesYou() {
  const [enabled, setEnabled] = React.useState<Set<string>>(new Set(DEFAULT_ON))

  function toggle(reason: string) {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(reason)) next.delete(reason)
      else next.add(reason)
      return next
    })
  }

  const visible = SAMPLES.filter((s) => enabled.has(s.reason))

  return (
    <section id="reaches-you" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20 sm:py-28">
      <SectionHeading
        eyebrow="Features"
        title="Hear only what matters"
        intro="Flip the filters. The preview is exactly how /listen-to works — mute a reason and that noise never arrives."
      />

      <div className="mt-12 grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Filter playground */}
        <div className="rounded-3xl border border-border/70 bg-card/50 p-6 ring-1 ring-foreground/5 backdrop-blur-sm">
          <div className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
            /listen-to · reasons
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {REASONS.map((reason) => {
              const on = enabled.has(reason)
              return (
                <button
                  key={reason}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(reason)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 font-mono text-[11px] transition-all",
                    on
                      ? "border-biolume/50 bg-biolume/10 text-foreground"
                      : "border-border/70 bg-card/40 text-muted-foreground/60 line-through decoration-border"
                  )}
                >
                  {reason}
                </button>
              )
            })}
          </div>

          <div className="mt-5 font-mono text-xs tracking-wide text-muted-foreground uppercase">
            subjects it can watch
          </div>
          <div className="mt-3 flex flex-wrap gap-2" aria-hidden>
            {SUBJECT_TYPES.map((s) => (
              <span
                key={s.label}
                className="rounded-full border border-border/50 px-3 py-1.5 font-mono text-[11px] text-muted-foreground"
              >
                {s.emoji} {s.label}
              </span>
            ))}
          </div>

          {/* Live preview */}
          <div className="mt-6 border-t border-border/60 pt-5">
            <div className="mb-3 font-mono text-xs tracking-wide text-muted-foreground uppercase">
              your DMs would show
            </div>
            <div className="flex min-h-24 flex-col gap-2.5">
              <AnimatePresence initial={false}>
                {visible.map((s) => (
                  <motion.div
                    key={s.msg.number + s.msg.repo}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 18 }}
                    transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  >
                    <DmCard message={s.msg} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {visible.length === 0 && (
                <p className="py-6 text-center font-mono text-xs text-muted-foreground">
                  silence. exactly what you asked for.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Feature stanzas */}
        <Stagger className="flex flex-col gap-7" gap={0.07}>
          {FEATURES.map((feature) => (
            <StaggerItem key={feature.title}>
              <div
                className={cn(
                  "border-l-2 pl-5",
                  feature.accent ? "border-biolume" : "border-border"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    name={feature.icon}
                    className={cn("size-4.5", feature.accent ? "text-biolume" : "text-primary")}
                    strokeWidth={1.8}
                  />
                  <h3 className="font-display text-lg font-semibold tracking-tight">
                    {feature.title}
                  </h3>
                </div>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify**

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/landing-page
git commit -m "feat(site): merge features and notifications into interactive reaches-you section"
```

---

### Task 10: Commands — slash-command autocomplete mock

**Files:**
- Create: `apps/landing-page/components/sections/commands-menu.tsx` (replaces `commands.tsx`, which is deleted in Task 13)

**Interfaces:**
- Consumes: `COMMANDS` (`{ name, body }`), `SectionHeading`, `FadeUp`.
- Produces: `CommandsMenu` section with `id="commands"` (exported name differs from old `Commands` so both compile until Task 13 rewires the page).

- [ ] **Step 1: Create the section**

`apps/landing-page/components/sections/commands-menu.tsx`:

```tsx
"use client"

import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { SectionHeading } from "@/components/section"
import { FadeUp } from "@/components/motion-primitives"
import { COMMANDS } from "@/lib/content"
import { cn } from "@/lib/utils"

export function CommandsMenu() {
  const reduce = useReducedMotion()
  const [active, setActive] = React.useState(0)
  const [paused, setPaused] = React.useState(false)

  React.useEffect(() => {
    if (paused || reduce) return
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % COMMANDS.length)
    }, 2600)
    return () => window.clearInterval(id)
  }, [paused, reduce])

  const current = COMMANDS[active]

  return (
    <section id="commands" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20 sm:py-28">
      <SectionHeading
        align="center"
        eyebrow="Commands"
        title="Six commands. That's the whole manual."
        intro="Everything is a slash command in your DM with OctoBot."
      />

      <FadeUp className="mx-auto mt-12 max-w-2xl">
        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="rounded-3xl border border-border/70 bg-card/60 p-2.5 ring-1 ring-foreground/5 backdrop-blur-xl"
        >
          {/* Autocomplete popup */}
          <div className="rounded-2xl bg-background/60 p-2">
            <div className="px-3 pt-2 pb-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Commands matching /
            </div>
            <div role="listbox" aria-label="OctoBot commands" className="flex flex-col">
              {COMMANDS.map((command, i) => (
                <button
                  key={command.name}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onClick={() => setActive(i)}
                  onMouseEnter={() => setActive(i)}
                  className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                >
                  {i === active && (
                    <motion.span
                      layoutId="command-highlight"
                      className="absolute inset-0 rounded-xl bg-primary/12 ring-1 ring-primary/25"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <code
                    className={cn(
                      "relative font-mono text-sm",
                      i === active ? "text-primary" : "text-foreground/80"
                    )}
                  >
                    {command.name}
                  </code>
                </button>
              ))}
            </div>
          </div>

          {/* Composer bar showing the active command + its description */}
          <div className="mt-2 flex items-center gap-3 rounded-2xl bg-background/60 px-4 py-3">
            <code className="shrink-0 rounded bg-primary/15 px-2 py-1 font-mono text-sm text-primary">
              {current.name}
            </code>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={current.name}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="min-w-0 truncate text-sm text-muted-foreground sm:whitespace-normal"
              >
                {current.body}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </FadeUp>
    </section>
  )
}
```

- [ ] **Step 2: Verify**

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/landing-page
git commit -m "feat(site): commands as animated slash-command autocomplete"
```

---

### Task 11: Trust Trench — merged Security + Open source

**Files:**
- Create: `apps/landing-page/components/sections/trust.tsx`

**Interfaces:**
- Consumes: `SECURITY`, `OPEN_SOURCE`, `GITHUB_REPO_URL`, `Icon`, `Eyebrow`, `Stagger`/`StaggerItem`, `FadeUp`, `buttonVariants`.
- Produces: `Trust` section with `id="trust"`.

- [ ] **Step 1: Create the section**

`apps/landing-page/components/sections/trust.tsx`:

```tsx
import Image from "next/image"

import { Icon } from "@/components/icon"
import { Eyebrow } from "@/components/section"
import { FadeUp, Stagger, StaggerItem } from "@/components/motion-primitives"
import { buttonVariants } from "@/components/ui/button"
import { GITHUB_REPO_URL, OPEN_SOURCE, SECURITY } from "@/lib/content"
import { cn } from "@/lib/utils"

export function Trust() {
  return (
    <section id="trust" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20 sm:py-28">
      <FadeUp>
        <div className="overflow-hidden rounded-[2rem] border border-border/70 bg-card/40 ring-1 ring-foreground/5 backdrop-blur-sm">
          <div className="grid gap-10 p-8 sm:p-12 lg:grid-cols-[1fr_0.9fr] lg:gap-16">
            {/* Open source pitch */}
            <div className="flex flex-col items-start">
              <Eyebrow>{OPEN_SOURCE.eyebrow} + security</Eyebrow>
              <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                {OPEN_SOURCE.title}
              </h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground text-pretty">
                {OPEN_SOURCE.body}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {OPEN_SOURCE.points.map((point) => (
                  <span
                    key={point}
                    className="rounded-full border border-biolume/40 bg-biolume/10 px-3 py-1 font-mono text-[11px] text-foreground"
                  >
                    {point}
                  </span>
                ))}
              </div>

              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className={cn(buttonVariants({ variant: "outline" }), "mt-7 gap-2")}
              >
                <Icon name="Github01Icon" className="size-4" strokeWidth={2} />
                {OPEN_SOURCE.cta}
              </a>

              <div className="relative mt-8 hidden w-full max-w-xs lg:block">
                <Image
                  src="/mascot/open-source.png"
                  alt="OctoBot mascot reading source code"
                  width={480}
                  height={480}
                  className="w-full rounded-3xl"
                />
              </div>
            </div>

            {/* Security plaques along the trench wall */}
            <Stagger className="flex flex-col" gap={0.09}>
              {SECURITY.map((point, i) => (
                <StaggerItem key={point.title}>
                  <div
                    className={cn(
                      "flex gap-4 py-5",
                      i > 0 && "border-t border-border/60"
                    )}
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/50 text-biolume">
                      <Icon name={point.icon} className="size-5" strokeWidth={1.8} />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-semibold tracking-tight">
                        {point.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {point.body}
                      </p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </FadeUp>
    </section>
  )
}
```

- [ ] **Step 2: Verify**

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/landing-page
git commit -m "feat(site): merge security and open-source into trust trench"
```

---

### Task 12: FAQ restyle + Abyss CTA

**Files:**
- Modify: `apps/landing-page/components/sections/faq.tsx` (wrap in FadeUp, depth styling)
- Modify: `apps/landing-page/components/sections/cta.tsx` (full rewrite as Abyss)
- Modify: `apps/landing-page/app/globals.css` (append abyss panel + mascot bob)

**Interfaces:**
- Consumes: `FadeUp`, `AddToDiscord`, existing Accordion, `DISCORD_COMMUNITY_URL`.
- Produces: `Faq` (id stays `faq`), `Cta` renamed export stays `Cta` with `id="abyss"`.

- [ ] **Step 1: Append abyss CSS**

At the end of `app/globals.css`:

```css
/* Abyss CTA panel: deliberately deep in both themes. */
.abyss-panel {
  background:
    radial-gradient(60% 55% at 50% 28%, color-mix(in oklch, var(--biolume) 12%, transparent), transparent 70%),
    linear-gradient(to bottom, oklch(0.18 0.05 250), oklch(0.1 0.03 250));
}

/* Idle mascot bob. */
@keyframes mascot-bob {
  0%, 100% { transform: translateY(0) rotate(-1deg); }
  50% { transform: translateY(-8px) rotate(1deg); }
}
.mascot-bob {
  animation: mascot-bob 6s ease-in-out infinite;
}
```

- [ ] **Step 2: Restyle FAQ**

In `components/sections/faq.tsx`, wrap the accordion in `FadeUp` and give it a subtle panel. Full new file:

```tsx
"use client"

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import { Section, SectionHeading } from "@/components/section"
import { FadeUp } from "@/components/motion-primitives"
import { FAQS } from "@/lib/content"

export function Faq() {
  return (
    <Section id="faq" className="max-w-3xl">
      <SectionHeading
        align="center"
        eyebrow="Before you connect"
        title="Questions worth asking"
      />

      <FadeUp className="mt-12 rounded-3xl border border-border/60 bg-card/30 px-6 backdrop-blur-sm sm:px-8">
        <Accordion multiple={false} defaultValue={[0]}>
          {FAQS.map((faq, i) => (
            <AccordionItem key={faq.q} value={i}>
              <AccordionTrigger className="font-display text-base tracking-tight sm:text-lg">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="max-w-prose text-muted-foreground">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </FadeUp>
    </Section>
  )
}
```

- [ ] **Step 3: Rewrite the CTA as the Abyss**

Replace `components/sections/cta.tsx`:

```tsx
"use client"

import Image from "next/image"
import { motion, useReducedMotion } from "motion/react"

import { AddToDiscord } from "@/components/add-to-discord"
import { DISCORD_COMMUNITY_URL } from "@/lib/content"

/** Deterministic glowing biolume dots inside the abyss panel. */
const GLOW_DOTS = [
  { left: "12%", top: "22%", size: 5, delay: 0 },
  { left: "85%", top: "18%", size: 4, delay: 0.8 },
  { left: "22%", top: "72%", size: 3, delay: 1.6 },
  { left: "72%", top: "78%", size: 5, delay: 0.4 },
  { left: "48%", top: "12%", size: 3, delay: 2.0 },
  { left: "92%", top: "55%", size: 4, delay: 1.2 },
  { left: "6%", top: "50%", size: 4, delay: 2.4 },
] as const

export function Cta() {
  const reduce = useReducedMotion()

  return (
    <section id="abyss" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-16">
      <div className="abyss-panel relative overflow-hidden rounded-[2.5rem] border border-border/40 px-6 py-16 text-center ring-1 ring-biolume/10 sm:px-12 sm:py-20">
        {!reduce && (
          <div aria-hidden>
            {GLOW_DOTS.map((dot, i) => (
              <motion.span
                key={i}
                className="absolute rounded-full bg-biolume/70 blur-[1px]"
                style={{ left: dot.left, top: dot.top, width: dot.size, height: dot.size }}
                animate={{ opacity: [0.15, 0.7, 0.15], y: [0, -10, 0] }}
                transition={{ duration: 5, repeat: Infinity, delay: dot.delay, ease: "easeInOut" }}
              />
            ))}
          </div>
        )}

        <div className="mx-auto flex justify-center">
          <Image
            src="/mascot/octobot.png"
            alt="OctoBot"
            width={256}
            height={256}
            className={
              "size-44 rounded-3xl drop-shadow-[0_0_56px_color-mix(in_oklch,var(--biolume)_50%,transparent)] sm:size-52" +
              (reduce ? "" : " mascot-bob")
            }
          />
        </div>

        <h2 className="mx-auto mt-6 max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance text-white sm:text-5xl">
          Stop refreshing the notifications tab
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-pretty text-white/70 sm:text-lg">
          Join the community, run <code className="font-mono text-white">/link</code>, and
          the next time GitHub needs you, you&apos;ll hear about it where you
          already are.
        </p>

        <div className="mt-8 flex justify-center">
          <AddToDiscord size="hero" href={DISCORD_COMMUNITY_URL}>
            Join the community
          </AddToDiscord>
        </div>
        <p className="mt-4 font-mono text-xs text-white/50">
          Join, run /link, done · read-only access · disconnect anytime
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page
git commit -m "feat(site): abyss CTA with glow dots and idle mascot, FAQ panel restyle"
```

---

### Task 13: Wire the page, delete the old sections

**Files:**
- Modify: `apps/landing-page/app/page.tsx` (new beat order + DepthGauge)
- Modify: `apps/landing-page/lib/content.ts` (delete `NAV_LINKS`)
- Delete: `apps/landing-page/components/sections/features.tsx`, `notifications.tsx`, `security.tsx`, `open-source.tsx`, `commands.tsx`
- Delete: `apps/landing-page/components/reveal.tsx`, `apps/landing-page/lib/use-in-view.ts`, `apps/landing-page/components/how-it-works-scene.tsx`
- Modify: `apps/landing-page/app/globals.css` (delete `reveal-in` keyframes, `.reveal-run` rule, and the `.reveal-pending`/`.reveal-run` lines in the reduced-motion block)

**Interfaces:**
- Consumes: every section built in Tasks 6–12, `DepthGauge` (Task 5).

- [ ] **Step 1: Rewire page.tsx**

Replace `app/page.tsx`:

```tsx
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { DepthGauge } from "@/components/depth-gauge"
import { Hero } from "@/components/sections/hero"
import { Noise } from "@/components/sections/noise"
import { HowItWorks } from "@/components/sections/how-it-works"
import { ReachesYou } from "@/components/sections/reaches-you"
import { CommandsMenu } from "@/components/sections/commands-menu"
import { Trust } from "@/components/sections/trust"
import { Faq } from "@/components/sections/faq"
import { Cta } from "@/components/sections/cta"

export default function Page() {
  return (
    <>
      <SiteHeader />
      <DepthGauge />
      <main>
        <Hero />
        <Noise />
        <HowItWorks />
        <ReachesYou />
        <CommandsMenu />
        <Trust />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </>
  )
}
```

- [ ] **Step 2: Delete dead files**

```bash
git rm apps/landing-page/components/sections/features.tsx \
       apps/landing-page/components/sections/notifications.tsx \
       apps/landing-page/components/sections/security.tsx \
       apps/landing-page/components/sections/open-source.tsx \
       apps/landing-page/components/sections/commands.tsx \
       apps/landing-page/components/reveal.tsx \
       apps/landing-page/components/how-it-works-scene.tsx \
       apps/landing-page/lib/use-in-view.ts
```

- [ ] **Step 3: Remove NAV_LINKS and reveal CSS**

In `lib/content.ts`, delete the `NAV_LINKS` const (lines 46–51). Search the app for `NAV_LINKS` usages first:

```bash
grep -rn "NAV_LINKS\|use-in-view\|Reveal\|how-it-works-scene" apps/landing-page --include="*.tsx" --include="*.ts"
```

Expected: no remaining imports (site-header was rewritten in Task 5). If the site-footer references any deleted anchors (e.g. `#features`), update them to the nearest new beat id (`#reaches-you`).

In `app/globals.css`, delete the `@keyframes reveal-in` block and the `.reveal-run { ... }` rule, and inside the `prefers-reduced-motion` block delete the `.reveal-pending` and `.reveal-run` lines.

- [ ] **Step 4: Verify with a full build**

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint && pnpm --filter landing-page build
```

Expected: all exit 0; build lists `/`, `/privacy`, `/terms` routes.

- [ ] **Step 5: Commit**

```bash
git add -A apps/landing-page
git commit -m "feat(site): wire The Dive beats, remove superseded sections"
```

---

### Task 14: Full verification pass

**Files:** none (verification only; fix-forward commits allowed)

- [ ] **Step 1: Build + start dev server**

```bash
pnpm --filter landing-page build && pnpm --filter landing-page dev
```

- [ ] **Step 2: Desktop visual pass (Chrome, ~1440px)**

Check on http://localhost:3000, dark theme (default):
- Backdrop deepens smoothly from navy to near-black over the full scroll.
- Depth gauge visible at xl width, readout counts to -1000m, labels highlight per section, clicks jump correctly.
- Hero: pitch staggers in, DM feed loops, waterline drifts.
- Noise: pills sink and fade, clean DM surfaces mid-scroll.
- How it works: pins for ~3 screens, scenes crossfade in order 01→04, copy rail highlights, clicking a step scrolls to it.
- Reaches-you: toggling a reason pill animates its DM out (sinks) and back in; empty state message appears when all wired reasons are off.
- Commands: highlight cycles; hover pauses; click selects.
- Trust: plaques stagger in; GitHub link works.
- Abyss: glow dots pulse, mascot bobs, CTA buttons work.

- [ ] **Step 3: Light theme pass**

Toggle theme (press `d`). Verify: surface reads as daylight ocean (no washed-out text), abyss panel still deep, all text meets contrast against the deepened backdrop at the bottom of the page.

- [ ] **Step 4: Mobile pass (~390px)**

- No horizontal overflow anywhere (scroll fully, check `document.documentElement.scrollWidth === innerWidth`).
- How-it-works renders the static 2-col/1-col grid, not the pinned scrub.
- Depth gauge hidden; header shows Logo + toggle + CTA without overflow.
- Noise pills stay within the viewport (SCATTER positions are percentage-based).

- [ ] **Step 5: Reduced-motion pass**

DevTools → Rendering → emulate `prefers-reduced-motion: reduce`. Reload. Verify: no pinned scrub (static how-it-works), no marine snow, no DM loop cycling, no waterline drift, Noise renders its static fallback, all content readable.

- [ ] **Step 6: Fix anything found, then final commit**

Fix-forward with small commits (`fix(site): ...`). When clean:

```bash
pnpm --filter landing-page typecheck && pnpm --filter landing-page lint && pnpm --filter landing-page build
```

Expected: all exit 0.
