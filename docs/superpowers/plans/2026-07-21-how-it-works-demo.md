# How it works — live Discord demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four generated mascot illustrations in the landing page's `How it works` section with a Discord DM window that acts out each step using the bot's real output.

**Architecture:** A new `lib/demo-script.ts` holds four scenes as timed beat arrays. A new `components/how-it-works/demo.tsx` plays the active scene inside the existing `DiscordFrame`, revealing beats on a timeline. The section itself becomes a normal-flow two-column layout — copy rail plus demo — with autoplay that advances steps, replacing today's `340vh` pinned scroll-scrub.

**Tech Stack:** Next 16, React 19, Tailwind v4, `motion` 12.42 (`motion/react`), TypeScript.

## Global Constraints

- All work is inside `apps/landing-page`. Run commands from that directory.
- No new dependencies. `motion`, `next/image`, and `cn` from `@/lib/utils` are all that's needed.
- Discord chrome colors are hardcoded Discord hex values, never site theme tokens — the DM window must look like Discord in both light and dark site themes. Follow the palette already used in `components/discord/frame.tsx` and `components/discord/embed.tsx`.
- Demo copy is real bot output. Do not invent bot strings. Sources: `apps/bot/src/discord/handlers.ts` (`/link` reply), `apps/bot/src/status.ts` (`attentionMessage`, `digestMessage`, `renderSection`, `reviewerSuffix`), `apps/bot/src/messages/tone.ts` (colors + thumbnails).
- The demo GitHub login is `gabrielccarvalho` everywhere.
- `DiscordEmbedMessage` in `components/discord/embed.tsx` must not change shape — `hero.tsx` and `reaches-you.tsx` depend on it.
- Existing section copy in `STEPS` (`lib/content.ts`) — the `n`, `title`, and `body` of all four steps — stays exactly as written. Only the `scene` field is removed.
- Verification per task: `pnpm typecheck` and `pnpm lint` must pass clean. The final task also runs `pnpm build`.

### Deviations from the spec (`docs/superpowers/specs/2026-07-21-how-it-works-demo-design.md`)

Three refinements found while writing the plan. They are improvements, not scope changes:

1. **`TextEmbed.body` is structured, not a markdown string.** The spec had `body: string`. Parsing mini-markdown at render time is fragile; instead `TextEmbed.sections` mirrors `renderSection()` / `groupByRepo()` in `status.ts` one-to-one. More faithful, no parser.
2. **No `autocomplete` beat kind.** The slash popup is derived — it shows whenever the active typing beat's text starts with `/`. One less thing to keep in sync.
3. **Reduced motion keeps the two-column layout** instead of stacking four static cards. The rail stays clickable, the demo renders the selected scene's end state with no typing and no timers. All content stays reachable, and it is far less code than a parallel static tree.

---

### Task 1: The demo script

Pure data and types. Nothing imports it yet, so it lands green on its own.

**Files:**
- Create: `apps/landing-page/lib/demo-script.ts`

**Interfaces:**
- Consumes: `HeroEmbed` and `HERO_EMBEDS` from `@/lib/content`
- Produces:
  - `type PrLine = { number: number; title: string; when: string; awaiting?: string }`
  - `type RepoGroup = { repo: string; prs: PrLine[] }`
  - `type EmbedSection = { label: string; count: number; repos: RepoGroup[] }`
  - `type TextEmbed = { color: string; mascot: string; title: string; sections: EmbedSection[] }`
  - `type Beat` — discriminated union on `kind`: `typing | ephemeral | system | divider | embed | textEmbed | filtered`
  - `type TimedBeat = Beat & { at: number }`
  - `type Scene = { beats: TimedBeat[]; duration: number }`
  - `const SCENES: Scene[]` — length 4, index-aligned with `STEPS`

- [ ] **Step 1: Create the script file**

Create `apps/landing-page/lib/demo-script.ts`:

```ts
/**
 * The script the "How it works" demo performs.
 *
 * Every string here is real bot output — do not invent copy:
 *   /link reply     → apps/bot/src/discord/handlers.ts (handleLink)
 *   welcome summary → apps/bot/src/status.ts (attentionMessage)
 *   daily digest    → apps/bot/src/status.ts (digestMessage)
 *   section shape   → apps/bot/src/status.ts (renderSection, reviewerSuffix)
 *   tone + mascot   → apps/bot/src/messages/tone.ts
 */

import { HERO_EMBEDS } from "./content"
import type { HeroEmbed } from "./content"

/** One PR line inside an embed section — mirrors status.ts renderSection(). */
export type PrLine = {
  number: number
  title: string
  /** Discord renders <t:UNIX:R>; this is the string a reader sees. */
  when: string
  /** reviewerSuffix() — the logins a PR is awaiting, joined. */
  awaiting?: string
}

export type RepoGroup = { repo: string; prs: PrLine[] }

export type EmbedSection = { label: string; count: number; repos: RepoGroup[] }

/** A generic renderEmbed() payload: stripe, title, body, thumbnail, footer. */
export type TextEmbed = {
  /** Tone stripe hex, from tone.ts. */
  color: string
  /** Filename under /public/mascot. */
  mascot: string
  title: string
  sections: EmbedSection[]
}

export type Beat =
  /** Types into the composer over `ms`. Shown only while it is the last beat. */
  | { kind: "typing"; text: string; ms: number }
  /** OctoBot's ephemeral command reply — "Only you can see this." */
  | { kind: "ephemeral"; intro: string; url: string; note: string }
  /** Muted narration line. Deliberately not styled as a Discord message. */
  | { kind: "system"; text: string }
  /** Discord's day divider, e.g. "6:00 AM". */
  | { kind: "divider"; label: string }
  /** A notification card — the same payload the hero feed renders. */
  | { kind: "embed"; embed: HeroEmbed }
  /** A title + body + thumbnail embed (welcome summary, digest). */
  | { kind: "textEmbed"; embed: TextEmbed }
  /** A notification that /listen-to muted, shown as suppressed. */
  | { kind: "filtered"; reason: string }

/** A beat plus when it appears, in ms from the start of its scene. */
export type TimedBeat = Beat & { at: number }

export type Scene = {
  beats: TimedBeat[]
  /** How long the scene holds before autoplay advances, in ms. */
  duration: number
}

const LOGIN = "gabrielccarvalho"

/** tone.ts: celebrate = 0x8957e5, digest = 0x8957e5. */
const TONE_CELEBRATE = "#8957e5"
const TONE_DIGEST = "#8957e5"

const CONNECTED: TextEmbed = {
  color: TONE_CELEBRATE,
  mascot: "celebrate-v1.png",
  title: `✅ Connected as ${LOGIN}`,
  sections: [
    {
      label: "🔍 Awaiting your review",
      count: 2,
      repos: [
        {
          repo: "acme/api",
          prs: [
            { number: 128, title: "Add rate limiting", when: "5 minutes ago" },
            { number: 130, title: "Cache GitHub API responses", when: "2 hours ago" },
          ],
        },
      ],
    },
    {
      label: "📝 Your PRs awaiting review",
      count: 1,
      repos: [
        {
          repo: "acme/web",
          prs: [
            { number: 61, title: "Dark mode", when: "1 hour ago", awaiting: "dfranklin" },
          ],
        },
      ],
    },
  ],
}

const DIGEST: TextEmbed = {
  color: TONE_DIGEST,
  mascot: "digest-v1.png",
  title: `☀️ Daily PR digest for ${LOGIN}`,
  sections: [
    {
      label: "🔍 Awaiting your review",
      count: 3,
      repos: [
        {
          repo: "acme/api",
          prs: [{ number: 128, title: "Add rate limiting", when: "14 hours ago" }],
        },
        {
          repo: "acme/infra",
          prs: [{ number: 133, title: "Flaky deploy on edge runtime", when: "9 hours ago" }],
        },
        {
          repo: "acme/web",
          prs: [{ number: 59, title: "Fix nav overflow on mobile", when: "11 hours ago" }],
        },
      ],
    },
    {
      label: "📝 Your PRs awaiting review",
      count: 1,
      repos: [
        {
          repo: "acme/web",
          prs: [
            { number: 61, title: "Dark mode", when: "12 hours ago", awaiting: "dfranklin" },
          ],
        },
      ],
    },
  ],
}

/** One scene per STEPS entry, in the same order. */
export const SCENES: Scene[] = [
  // 01 Connect
  {
    duration: 7000,
    beats: [
      { at: 0, kind: "typing", text: "/link", ms: 900 },
      {
        at: 1800,
        kind: "ephemeral",
        intro: "🔗 Connect your GitHub account to receive PR notifications:",
        url: "https://github.com/login/oauth/authorize?client_id=Ov23liOctoBot&state=b7f0c2a9",
        note: "This link is personal — don't share it. It expires shortly.",
      },
    ],
  },
  // 02 Baseline
  {
    duration: 8000,
    beats: [
      { at: 0, kind: "system", text: "47 existing notifications baselined as seen — none of them get DM'd." },
      { at: 1400, kind: "textEmbed", embed: CONNECTED },
    ],
  },
  // 03 Notify
  {
    duration: 10000,
    beats: [
      { at: 0, kind: "system", text: "poll · 3 new notifications" },
      { at: 900, kind: "embed", embed: HERO_EMBEDS[0] },
      { at: 2600, kind: "filtered", reason: "💬 New comment — muted by /listen-to" },
      { at: 4200, kind: "embed", embed: HERO_EMBEDS[2] },
      { at: 6200, kind: "embed", embed: HERO_EMBEDS[1] },
    ],
  },
  // 04 Digest
  {
    duration: 9000,
    beats: [
      { at: 0, kind: "divider", label: "6:00 AM" },
      { at: 800, kind: "textEmbed", embed: DIGEST },
    ],
  },
]
```

- [ ] **Step 2: Verify it compiles clean**

Run from `apps/landing-page`:

```bash
pnpm typecheck && pnpm lint
```

Expected: both exit 0, no output beyond ESLint's summary.

- [ ] **Step 3: Commit**

```bash
git add apps/landing-page/lib/demo-script.ts
git commit -m "feat(landing): add How it works demo script"
```

---

### Task 2: Discord chrome for the demo

Two new embed renderers plus the frame props the demo needs. Additive only — existing consumers are untouched.

**Files:**
- Modify: `apps/landing-page/components/discord/embed.tsx` (append; leave `DiscordEmbedMessage` alone)
- Modify: `apps/landing-page/components/discord/frame.tsx:10-67` (`DiscordFrame`)

**Interfaces:**
- Consumes: `TextEmbed` from `@/lib/demo-script`
- Produces:
  - `DiscordTextEmbed({ embed }: { embed: TextEmbed })`
  - `DiscordEphemeralReply({ intro, url, note }: { intro: string; url: string; note: string })`
  - `DiscordFrame` gains two optional props: `composer?: React.ReactNode` (replaces the placeholder composer bar) and `bodyClassName?: string` (extra classes on the message area)

- [ ] **Step 1: Add the two renderers to `embed.tsx`**

Append to `apps/landing-page/components/discord/embed.tsx` (keep the existing import of `Image` and add the type import at the top):

```tsx
import type { TextEmbed } from "@/lib/demo-script"
```

Then append these components to the end of the file:

```tsx
/** Shared message header: avatar column plus the OctoBot / App / timestamp line. */
function MessageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <Image
        src="/logo.png"
        alt=""
        width={40}
        height={40}
        className="mt-0.5 size-10 shrink-0 rounded-full"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-medium text-[#f2f3f5]">OctoBot</span>
          <span className="flex items-center rounded-[3px] bg-[#5865f2] px-[4.4px] py-px text-[10px] font-semibold tracking-[0.02em] text-white uppercase">
            App
          </span>
          <span className="text-xs text-[#949ba4]">Today at 2:41 PM</span>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * The generic renderEmbed() shape (apps/bot/src/discord/render.ts): tone stripe,
 * title, a body of grouped PR sections, mascot thumbnail, OctoBot footer.
 * Used for the welcome summary and the daily digest.
 */
export function DiscordTextEmbed({ embed }: { embed: TextEmbed }) {
  return (
    <MessageShell>
      <div
        className="mt-1 max-w-md rounded-[4px] bg-[#2b2d31] py-3 pr-3 pl-4"
        style={{ borderLeft: `4px solid ${embed.color}` }}
      >
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] leading-snug font-semibold text-[#f2f3f5]">
              {embed.title}
            </div>

            {embed.sections.map((section) => (
              <div key={section.label} className="mt-2.5">
                <div className="text-sm leading-snug font-semibold text-[#f2f3f5]">
                  {section.label} ({section.count})
                </div>
                {section.repos.map((group) => (
                  <div key={group.repo} className="mt-1">
                    <div className="text-sm leading-snug font-semibold text-[#f2f3f5]">
                      {group.repo}
                    </div>
                    {group.prs.map((pr) => (
                      <div
                        key={pr.number}
                        className="truncate text-sm leading-snug text-[#dbdee1]"
                      >
                        <span className="cursor-pointer text-[#00a8fc] hover:underline">
                          #{pr.number} {pr.title}
                        </span>
                        {" · "}
                        <span className="rounded-[3px] bg-[#3f4248] px-0.5">{pr.when}</span>
                        {pr.awaiting && ` · awaiting ${pr.awaiting}`}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}

            <div className="mt-2.5 text-xs font-medium text-[#949ba4]">OctoBot</div>
          </div>

          <Image
            src={`/mascot/${embed.mascot}`}
            alt=""
            width={72}
            height={72}
            className="mt-0.5 hidden size-[72px] shrink-0 rounded-lg object-cover sm:block"
          />
        </div>
      </div>
    </MessageShell>
  )
}

/**
 * An ephemeral command reply — plain text plus Discord's "Only you can see this"
 * footer. This is what /link actually returns (apps/bot/src/discord/handlers.ts).
 */
export function DiscordEphemeralReply({
  intro,
  url,
  note,
}: {
  intro: string
  url: string
  note: string
}) {
  return (
    <MessageShell>
      <div className="mt-1 text-[15px] leading-relaxed text-[#dbdee1]">
        <div>{intro}</div>
        <div className="truncate text-[#00a8fc]">{url}</div>
        <div className="mt-2">{note}</div>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[#949ba4]">
        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 fill-current" aria-hidden>
          <path d="M12 5c-5 0-9 4.5-9 7s4 7 9 7 9-4.5 9-7-4-7-9-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
        </svg>
        <span>Only you can see this ·</span>
        <span className="cursor-pointer text-[#00a8fc] hover:underline">Dismiss message</span>
      </div>
    </MessageShell>
  )
}
```

- [ ] **Step 2: Give `DiscordFrame` a composer slot and a responsive rail**

In `apps/landing-page/components/discord/frame.tsx`, replace the whole `DiscordFrame` function (lines 10-67) with:

```tsx
export function DiscordFrame({
  children,
  composer,
  bodyClassName,
}: {
  children: React.ReactNode
  /** Replaces the decorative composer bar — the demo types into its own. */
  composer?: React.ReactNode
  /** Extra classes on the message area, e.g. a fixed height. */
  bodyClassName?: string
}) {
  return (
    <div
      className="flex overflow-hidden rounded-2xl shadow-2xl shadow-black/40 ring-1 ring-white/10"
      style={{
        fontFamily:
          '"gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      {/* Server rail — hidden on narrow viewports so the DM area keeps its width */}
      <div
        className="hidden w-[52px] shrink-0 flex-col items-center gap-2 bg-[#1e1f22] py-3 sm:flex"
        aria-hidden
      >
        <div className="relative">
          <span className="absolute top-1/2 -left-3 h-8 w-1 -translate-y-1/2 rounded-r-full bg-white" />
          <Image
            src="/logo.png"
            alt=""
            width={36}
            height={36}
            className="size-9 rounded-[12px]"
          />
        </div>
        <div className="h-0.5 w-6 rounded-full bg-[#35363c]" />
        <div className="size-9 rounded-full bg-[#313338]" />
        <div className="size-9 rounded-full bg-[#313338]" />
        <div className="size-9 rounded-full bg-[#313338]" />
        <div className="flex size-9 items-center justify-center rounded-full bg-[#313338] text-lg leading-none text-[#23a55a]">
          +
        </div>
      </div>

      {/* DM window */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#313338]">
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-[#26282c] px-4 shadow-sm">
          <div className="relative" aria-hidden>
            <Image src="/logo.png" alt="" width={24} height={24} className="size-6 rounded-full" />
            <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-[#313338] bg-[#23a55a]" />
          </div>
          <span className="text-[15px] font-semibold text-[#f2f3f5]">OctoBot</span>
        </div>

        <div className={cn("flex flex-col gap-4 overflow-hidden p-4", bodyClassName)}>
          {children}
        </div>

        {composer ?? (
          <div className="px-4 pb-4" aria-hidden>
            <div className="flex items-center gap-3 rounded-lg bg-[#383a40] px-4 py-2.5">
              <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-[#b5bac1]" aria-hidden>
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2Z" />
              </svg>
              <span className="truncate text-[15px] text-[#6d6f78]">Message @OctoBot</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

`cn` is already imported at the top of the file — no import change needed.

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm lint
```

Expected: both exit 0. `hero.tsx` still compiles because both new `DiscordFrame` props are optional.

- [ ] **Step 4: Commit**

```bash
git add apps/landing-page/components/discord/embed.tsx apps/landing-page/components/discord/frame.tsx
git commit -m "feat(landing): add text embed, ephemeral reply, and frame composer slot"
```

---

### Task 3: The scene player

**Files:**
- Create: `apps/landing-page/components/how-it-works/demo.tsx`

**Interfaces:**
- Consumes: `SCENES`, `TimedBeat` from `@/lib/demo-script`; `DiscordFrame` from `@/components/discord/frame`; `DiscordEmbedMessage`, `DiscordTextEmbed`, `DiscordEphemeralReply` from `@/components/discord/embed`
- Produces: `DiscordDemo({ step, playing }: { step: number; playing: boolean })` — renders scene `step`; when `playing` is false it renders the scene's end state immediately with no timers

- [ ] **Step 1: Create the player**

Create `apps/landing-page/components/how-it-works/demo.tsx`:

```tsx
"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"

import {
  DiscordEmbedMessage,
  DiscordEphemeralReply,
  DiscordTextEmbed,
} from "@/components/discord/embed"
import { DiscordFrame } from "@/components/discord/frame"
import { SCENES } from "@/lib/demo-script"
import type { TimedBeat } from "@/lib/demo-script"

/** Types `text` over `ms`. When inactive, returns the full string immediately. */
function useTypewriter(text: string, ms: number, active: boolean) {
  const [count, setCount] = React.useState(active ? 0 : text.length)

  React.useEffect(() => {
    if (!active) {
      setCount(text.length)
      return
    }
    setCount(0)
    const per = Math.max(16, ms / Math.max(1, text.length))
    const id = window.setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          window.clearInterval(id)
          return c
        }
        return c + 1
      })
    }, per)
    return () => window.clearInterval(id)
  }, [text, ms, active])

  return text.slice(0, count)
}

/** The composer, either idle or mid-command with the slash autocomplete open. */
function Composer({ typed, showPopup }: { typed: string; showPopup: boolean }) {
  return (
    <div className="relative px-4 pb-4">
      {showPopup && (
        <div className="absolute right-4 bottom-[4.25rem] left-4 rounded-lg bg-[#2b2d31] p-2 shadow-xl">
          <div className="px-2 pb-1.5 text-[11px] font-semibold tracking-wide text-[#b5bac1] uppercase">
            Commands matching /link
          </div>
          <div className="flex items-center gap-2 rounded bg-[#3f4248] px-2 py-1.5">
            <span className="text-sm font-medium text-[#f2f3f5]">/link</span>
            <span className="truncate text-xs text-[#b5bac1]">
              Get a personal GitHub authorization link
            </span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 rounded-lg bg-[#383a40] px-4 py-2.5">
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-[#b5bac1]" aria-hidden>
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2Z" />
        </svg>
        {typed ? (
          <span className="truncate text-[15px] text-[#dbdee1]">
            {typed}
            <span className="ml-px inline-block h-[1.1em] w-px translate-y-[0.15em] bg-[#dbdee1]" />
          </span>
        ) : (
          <span className="truncate text-[15px] text-[#6d6f78]">Message @OctoBot</span>
        )}
      </div>
    </div>
  )
}

function BeatView({ beat }: { beat: TimedBeat }) {
  switch (beat.kind) {
    case "embed":
      return <DiscordEmbedMessage embed={beat.embed} />
    case "textEmbed":
      return <DiscordTextEmbed embed={beat.embed} />
    case "ephemeral":
      return (
        <DiscordEphemeralReply intro={beat.intro} url={beat.url} note={beat.note} />
      )
    case "system":
      return (
        <p className="text-center text-xs text-[#949ba4] italic">{beat.text}</p>
      )
    case "divider":
      return (
        <div className="flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-[#3f4147]" />
          <span className="text-[11px] font-semibold text-[#949ba4]">{beat.label}</span>
          <span className="h-px flex-1 bg-[#3f4147]" />
        </div>
      )
    case "filtered":
      return (
        <p className="flex items-center justify-center gap-2 text-xs text-[#6d6f78]">
          <span className="h-px w-6 bg-[#3f4147]" />
          <span className="line-through">{beat.reason}</span>
          <span className="h-px w-6 bg-[#3f4147]" />
        </p>
      )
    case "typing":
      // Rendered by the composer, not the message list.
      return null
  }
}

/**
 * Plays one scene of the How it works demo inside a Discord DM window.
 * Beats are revealed on the scene's own timeline; `playing: false` shows the
 * scene's end state with no timers at all (reduced motion, or autoplay paused
 * before the section is in view).
 */
export function DiscordDemo({ step, playing }: { step: number; playing: boolean }) {
  const scene = SCENES[step]
  const [revealed, setRevealed] = React.useState(scene.beats.length)

  React.useEffect(() => {
    if (!playing) {
      setRevealed(scene.beats.length)
      return
    }
    setRevealed(0)
    const timers = scene.beats.map((beat, i) =>
      window.setTimeout(() => setRevealed(i + 1), beat.at)
    )
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [scene, playing])

  const visible = scene.beats.slice(0, revealed)
  const last = visible[visible.length - 1]
  const typingBeat = last?.kind === "typing" ? last : null

  const typed = useTypewriter(
    typingBeat?.text ?? "",
    typingBeat?.ms ?? 0,
    Boolean(typingBeat) && playing
  )

  return (
    <DiscordFrame
      bodyClassName="h-[24rem] justify-end sm:h-[26rem]"
      composer={
        <Composer typed={typed} showPopup={Boolean(typingBeat) && typed.startsWith("/")} />
      }
    >
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map((beat, i) => (
          <motion.div
            key={`${step}-${i}`}
            layout
            initial={playing ? { opacity: 0, y: 16, scale: 0.98 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <BeatView beat={beat} />
          </motion.div>
        ))}
      </AnimatePresence>
    </DiscordFrame>
  )
}
```

Two details that matter and are easy to get wrong:

- `bodyClassName` sets a **fixed height** plus `justify-end`. That is what keeps the window from resizing between scenes and makes messages stack up from the bottom like a real chat. Overflow past the top is clipped by the frame's existing `overflow-hidden`.
- The `typing` beat renders `null` in the message list on purpose — it lives in the composer. Once a later beat appears it is no longer `last`, so the composer clears, exactly as if the command had been sent.

- [ ] **Step 2: Verify**

```bash
pnpm typecheck && pnpm lint
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/landing-page/components/how-it-works/demo.tsx
git commit -m "feat(landing): add How it works scene player"
```

---

### Task 4: Rewrite the section and delete the illustrations

**Files:**
- Modify: `apps/landing-page/lib/content.ts:189-221` (the `Step` type and `STEPS`)
- Modify: `apps/landing-page/components/sections/how-it-works.tsx` (full rewrite)
- Delete: `apps/landing-page/public/mascot/connect.png`, `baseline.png`, `notify.png`, `digest.png`

**Interfaces:**
- Consumes: `DiscordDemo` from `@/components/how-it-works/demo`; `SCENES` from `@/lib/demo-script`; `STEPS` from `@/lib/content`; `SectionHeading` from `@/components/section`
- Produces: `HowItWorks()` — unchanged export name and `id="how"` anchor, so `app/page.tsx` and the hero's "Take the dive" link keep working

- [ ] **Step 1: Drop the `scene` field from the content model**

In `apps/landing-page/lib/content.ts`, change the `Step` type (line 189-194) from:

```ts
export type Step = {
  n: string
  title: string
  body: string
  scene: "connect" | "baseline" | "notify" | "digest"
}
```

to:

```ts
export type Step = {
  n: string
  title: string
  body: string
}
```

Then delete the four `scene: "..."` lines from the `STEPS` entries (lines 201, 206, 213, 219). Leave every `n`, `title`, and `body` exactly as-is, and leave the `// --- How it works (a real ordered sequence) ---` comment on line 187 — it is still accurate.

- [ ] **Step 2: Rewrite the section**

Replace the entire contents of `apps/landing-page/components/sections/how-it-works.tsx` with:

```tsx
"use client"

import * as React from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { DiscordDemo } from "@/components/how-it-works/demo"
import { SectionHeading } from "@/components/section"
import { SCENES } from "@/lib/demo-script"
import { STEPS } from "@/lib/content"
import { cn } from "@/lib/utils"

export function HowItWorks() {
  const reduce = useReducedMotion()
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.35 })

  const [step, setStep] = React.useState(0)
  /** Autoplay stops for good once the visitor picks a step themselves. */
  const [auto, setAuto] = React.useState(true)

  const playing = Boolean(!reduce && inView)

  React.useEffect(() => {
    if (!playing || !auto) return
    const id = window.setTimeout(
      () => setStep((s) => (s + 1) % STEPS.length),
      SCENES[step].duration
    )
    return () => window.clearTimeout(id)
  }, [playing, auto, step])

  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20 sm:py-24">
      <SectionHeading
        eyebrow="How it works"
        title="Four steps down"
        intro="From /link to a quiet, useful stream of DMs."
      />

      <div
        ref={ref}
        className="mt-12 grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12"
      >
        {/* Copy rail */}
        <div className="flex flex-col gap-7">
          {STEPS.map((s, i) => {
            const active = i === step
            return (
              <button
                key={s.n}
                type="button"
                aria-current={active}
                onClick={() => {
                  setStep(i)
                  setAuto(false)
                }}
                className="text-left"
              >
                <div
                  className={cn(
                    "relative border-l-2 pl-5 transition-all duration-300",
                    active ? "border-transparent opacity-100" : "border-border opacity-40 hover:opacity-70"
                  )}
                >
                  {/* Progress rail: fills over the active scene while autoplaying */}
                  <span className="absolute inset-y-0 left-[-2px] w-0.5 overflow-hidden" aria-hidden>
                    {active && (
                      <motion.span
                        key={`${step}-${auto}-${playing}`}
                        className="block w-full bg-biolume"
                        initial={{ height: playing && auto ? "0%" : "100%" }}
                        animate={{ height: "100%" }}
                        transition={
                          playing && auto
                            ? { duration: SCENES[i].duration / 1000, ease: "linear" }
                            : { duration: 0 }
                        }
                      />
                    )}
                  </span>

                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-sm text-biolume">{s.n}</span>
                    <h3 className="font-display text-xl font-semibold tracking-tight">
                      {s.title}
                    </h3>
                  </div>
                  <p
                    className={cn(
                      "mt-2 max-w-md text-sm leading-relaxed text-muted-foreground transition-all duration-300",
                      active ? "line-clamp-none" : "line-clamp-1"
                    )}
                  >
                    {s.body}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        {/* The demo */}
        <div className="relative w-full max-w-xl justify-self-center lg:justify-self-end">
          <div
            className="absolute -inset-5 -z-[1] rounded-[2rem] bg-primary/10 blur-2xl"
            aria-hidden
          />
          <DiscordDemo step={step} playing={playing} />
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Confirm nothing else references the four illustrations**

```bash
grep -rn "mascot/connect\|mascot/baseline\|mascot/notify\|mascot/digest\." apps/landing-page --include=*.tsx --include=*.ts --include=*.css
```

Expected: no output. (The trailing `\.` on `digest` is deliberate — it must not match `digest-v1.png`, which the digest embed still uses.)

- [ ] **Step 4: Delete the four illustrations**

```bash
git rm apps/landing-page/public/mascot/connect.png \
       apps/landing-page/public/mascot/baseline.png \
       apps/landing-page/public/mascot/notify.png \
       apps/landing-page/public/mascot/digest.png
```

- [ ] **Step 5: Verify the build**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Expected: all three exit 0. If `typecheck` reports `Property 'scene' does not exist`, a `scene:` line survived in `STEPS` or in a component — remove it.

- [ ] **Step 6: Visual check**

Run `pnpm dev` and open `http://localhost:3000/#how`. Confirm each of these:

1. The section no longer pins — scrolling past it is a normal, continuous scroll.
2. Autoplay runs `01 → 02 → 03 → 04 → 01` once the section is in view, and the active step's left rail fills as its scene plays.
3. Scene 01 types `/link` with a caret, opens the slash popup, then shows the ephemeral reply with the grey *Only you can see this* line — and the composer clears at that moment.
4. Scene 03 shows the muted `💬 New comment` line struck through between delivered notifications.
5. Scene 04 shows the `6:00 AM` divider then the digest embed.
6. Clicking any step jumps to it and autoplay never resumes.
7. The DM window does **not** change height between steps.
8. At 320px, 768px, and 1440px widths: no horizontal page scrollbar; the server rail is hidden below 640px; embed text stays readable.
9. In devtools, emulate `prefers-reduced-motion: reduce` and reload — no typing, no autoplay, the demo shows step 01's end state, and clicking steps still switches scenes.

- [ ] **Step 7: Commit**

```bash
git add apps/landing-page/lib/content.ts apps/landing-page/components/sections/how-it-works.tsx
git commit -m "feat(landing): replace How it works illustrations with a live Discord demo"
```

---

## Done when

- `pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass in `apps/landing-page`.
- The `How it works` section contains no generated illustration — only the Discord chrome, the bot's real copy, and the 72px thumbnails the bot genuinely attaches.
- `public/mascot/` no longer contains `connect.png`, `baseline.png`, `notify.png`, or `digest.png`.
- The hero and `reaches-you` sections are visually unchanged.
