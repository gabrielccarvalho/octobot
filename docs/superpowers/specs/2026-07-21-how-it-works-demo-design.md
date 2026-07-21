# How it works — replace mascot illustrations with a live Discord demo

**Date:** 2026-07-21
**Status:** Approved for planning
**Scope:** `apps/landing-page` — the `#how` section only

## Problem

External feedback on the landing page: *"look very AI gen!! Esp the mascot."*

The `How it works` section (`components/sections/how-it-works.tsx`) is the worst
offender. It pins for `340vh` and scroll-scrubs between four steps, each
illustrated by a full-bleed 640×640 generated image
(`/public/mascot/{connect,baseline,notify,digest}.png`). Those illustrations are
decorative — they depict nothing the product actually does — and read as
stock AI art. The pinned scroll-scrub is a secondary tell.

## Goal

Replace the illustration panel with something **true to what the section
claims**: a Discord DM window that acts out each step using the bot's real
output. Nothing invented — every string is sourced from the bot.

Out of scope (explicitly decided): the mascot elsewhere on the site stays.
`trust.tsx` (`open-source.png`), `cta.tsx` (`octobot.png`), and the 72px embed
thumbnails are untouched.

## Source of truth for demo copy

These are the real bot outputs the demo reproduces. Keep in sync if the bot
changes.

| Beat | Source | Output |
|---|---|---|
| `/link` reply | `apps/bot/src/discord/handlers.ts:119` | Ephemeral text: `🔗 Connect your GitHub account to receive PR notifications:\n<url>\n\nThis link is personal — don't share it. It expires shortly.` |
| Welcome summary | `apps/bot/src/status.ts:98` `attentionMessage()` | Embed, tone `celebrate`. Title `✅ Connected as <login>`. Body = `renderBody()` |
| Notification | `apps/bot/src/notifier.ts` → already mirrored by `HERO_EMBEDS` in `lib/content.ts` | Notification card embed |
| Digest | `apps/bot/src/status.ts:117` `digestMessage()` | Embed, tone `digest`. Title `☀️ Daily PR digest for <login>` |

`renderBody()` shape (`status.ts:77`):

```
🔍 Awaiting your review (2)
**acme/api**
#128 Add rate limiting · 5 minutes ago
#130 Cache GitHub API responses · 2 hours ago

📝 Your PRs awaiting review (1)
**acme/web**
#61 Dark mode · 1 hour ago · awaiting @dfranklin
```

Tone colors and thumbnails come from `apps/bot/src/messages/tone.ts`:
`celebrate` = `#8957e5` / `celebrate-v1.png`, `digest` = `#8957e5` /
`digest-v1.png`. Every embed carries the footer `OctoBot`.

## The four scenes

**01 Connect.** Cursor in the composer. `/link` types out character by
character. The slash-autocomplete popup appears above the composer with `/link`
highlighted. Enter → the composer clears and OctoBot's ephemeral reply appears,
marked with Discord's grey *"Only you can see this."* bar.

**02 Baseline.** A muted system line — *marked 47 existing notifications as
seen* — then the `celebrate` embed lands: **✅ Connected as gabrielccarvalho**
with the awaiting-review / your-PRs body.

**03 Notify.** A poll tick, then notification embeds arrive one at a time.
One beat shows a reason being filtered out rather than delivered, so the
"filters it against your subscription" claim is visible rather than asserted.

**04 Digest.** A `6:00 AM` day divider, then the `digest` embed:
**☀️ Daily PR digest for gabrielccarvalho**.

## Interaction

Normal document flow. No pinning, no scroll-scrub, no `340vh` spacer.

- `useInView` (from `motion/react`) on the section starts autoplay.
- Each scene declares a duration. The active step's rail entry shows a progress
  bar filling over that duration, then advances to the next step; wraps at 04.
- Clicking a rail entry jumps to that step and **permanently** stops autoplay
  (the visitor has taken control).
- Within a scene, beats advance on their own timeline. Re-entering a step
  restarts its scene from beat zero.

### Layout

- `lg` and up: two columns, `[0.9fr_1.1fr]` — copy rail left, DM window right
  (same proportions as today).
- Below `lg`: rail on top, DM window beneath, same autoplay behavior.
- The DM window's message area is bottom-anchored (`flex-col justify-end`) with
  a fixed `min-h`, so scenes of different lengths don't resize the window
  between steps. This also matches how a real chat behaves.

### Reduced motion

`useReducedMotion()` → no timers, no typing, no autoplay. All four steps render
stacked as static cards, each showing its scene's **end state** (fully typed
command, all messages present). No hidden content.

## Components

| File | Change |
|---|---|
| `lib/demo-script.ts` | **new** — the four scenes as typed beat arrays. Kept out of `content.ts`, which stays prose-only. |
| `lib/content.ts` | drop `scene` from the `Step` type and from the four `STEPS` entries. Titles and bodies unchanged. |
| `components/discord/embed.tsx` | add `DiscordTextEmbed` and `DiscordEphemeralReply`. `DiscordEmbedMessage` untouched. |
| `components/discord/frame.tsx` | server rail becomes `hidden sm:flex` so the frame survives a 320px viewport |
| `components/how-it-works/demo.tsx` | **new** — the scene player |
| `components/sections/how-it-works.tsx` | rewritten around the rail + demo |
| `public/mascot/{connect,baseline,notify,digest}.png` | **deleted** — nothing else references them |

### `lib/demo-script.ts`

Exports `SCENES: Scene[]`, one per step, index-aligned with `STEPS`. It also
owns and exports `TextEmbed` — the payload for a generic `renderEmbed()`-shaped
embed, which has no equivalent in `content.ts` today:

```ts
export type TextEmbed = {
  color: string      // tone stripe hex, from tone.ts
  mascot: string     // filename under /public/mascot
  title: string
  body: string       // markdown-ish, rendered by DiscordTextEmbed
}
```

```ts
type Beat =
  | { kind: "typing"; text: string; ms: number }      // types into the composer
  | { kind: "autocomplete"; command: string }         // slash popup
  | { kind: "ephemeral"; text: string }               // "Only you can see this"
  | { kind: "system"; text: string }                  // muted status line
  | { kind: "divider"; label: string }                // "6:00 AM"
  | { kind: "embed"; embed: HeroEmbed }               // notification card
  | { kind: "textEmbed"; embed: TextEmbed }           // title + body + thumbnail
  | { kind: "filtered"; reason: string }              // shown as suppressed

type Scene = { beats: (Beat & { at: number })[]; duration: number }
```

`at` is milliseconds from scene start; `duration` is when the scene hands off.

### `components/discord/embed.tsx` additions

- `DiscordTextEmbed` — the generic `renderEmbed()` shape: colored left stripe,
  title, body (bold repo lines, blue PR links, muted relative-time chips),
  mascot thumbnail top-right, `OctoBot` footer.
- `DiscordEphemeralReply` — plain bot message plus Discord's grey
  *"Only you can see this."* line.

Both take the same hardcoded Discord palette the existing components use — they
must not follow the site theme.

### `components/how-it-works/demo.tsx`

Props: `{ step: number; playing: boolean }`. On `step` change it resets to beat
zero and schedules the scene's beats. Renders beats `0..current` inside
`DiscordFrame`, each entering with the existing spring
(`stiffness: 260, damping: 26`). The composer renders the current typing beat's
partial text with a blinking caret. Cleans up all timers on unmount and on step
change.

## Testing

The landing page has no test runner today, so verification is manual plus the
existing type/lint gates:

1. `pnpm --filter landing-page build` — types and build pass.
2. Visual check at 320 / 768 / 1440 widths: no horizontal overflow, DM window
   readable, window does not resize between steps.
3. Autoplay advances 01→02→03→04→01; clicking a step jumps and stops autoplay.
4. `prefers-reduced-motion: reduce` renders four static end-state cards.
5. `grep -r "mascot/connect\|mascot/baseline\|mascot/notify\|mascot/digest"`
   returns nothing before deleting the four PNGs.

## Risks

**Repetition.** The hero already shows a `DiscordFrame` and `reaches-you` shows
a `DiscordSurface`. Mitigation: this is the only place showing the *user's* side
— typing, slash autocomplete, ephemeral replies — and it's a scripted sequence
rather than an ambient feed. If it still reads as repetitive once built, the
fallback is to drop the server rail here and show a bare `DiscordSurface`.

**Drift.** The demo hardcodes bot copy. Mitigation: the source-of-truth table
above, plus a file-header comment in `demo-script.ts` pointing at the bot files,
matching the convention already in `lib/content.ts`.
