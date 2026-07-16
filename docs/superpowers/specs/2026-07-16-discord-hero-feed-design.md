# Discord-faithful hero feed

**Date:** 2026-07-16
**Status:** Approved
**Scope:** `apps/landing-page` only. No bot code changes.

## Goal

The hero's right column currently shows a generic glassy card stack (`DmCard`) that
does not resemble what OctoBot actually sends. Since the embed messaging feature
merged (bot commit `99eb9d8`), real notifications are Discord **embeds**: tone-colored
stripe, emoji title, linked subject, repo + relative time, mascot thumbnail, "OctoBot"
footer. Rebuild the hero feed as a pixel-faithful replica of those embeds, animated
inside a Discord-style DM window skeleton.

## Decisions (made with user)

1. **Fidelity:** pixel-faithful Discord dark theme — real Discord greys, real embed
   anatomy. The frame intentionally contrasts with the site's biolume theme and must
   look identical in the site's light mode (colors are hardcoded literals, not theme
   tokens).
2. **Skeleton scope:** DM window + slim server rail. Rail sliver (abstract avatar
   dots), DM header (`@ OctoBot` + online dot), message area, decorative composer.
   No full app window, no DM-list sidebar.
3. **Animation:** live inbox. New embed springs in at the bottom every ~3s, older
   ones push up and exit; last 3 visible. `prefers-reduced-motion` → static stack.

## Components

### `components/discord/embed.tsx` — `DiscordEmbedMessage`

Replicates the output of the bot's `renderEmbed` (`apps/bot/src/discord/render.ts`)
as it appears in Discord's dark theme. One message = avatar row + embed card.

Message row:
- Round OctoBot avatar, 40px, `/logo.png`.
- Username **OctoBot** (white, semibold) + `APP` badge (blurple `#5865f2`, white
  caps text, rounded).
- Timestamp `Today at 2:41 PM` in muted grey.

Embed card (indented under the avatar column, like real Discord):
- Background `#2b2d31`, border-radius 4px, 4px left stripe in the message's tone color.
- **Title:** `{emoji} {label}` — white `#f2f3f5`, semibold, ~15px.
- **Description line 1:** `#{number} {title}` as a link — Discord blue `#00a8fc`,
  underline on hover, truncates on overflow.
- **Description line 2:** `{repo} · {relativeTime}` — body grey `#dbdee1`; the
  relative time sits in a timestamp pill (background `#3f4248`, small radius),
  matching how Discord renders `<t:unix:R>`.
- **Thumbnail:** mascot image top-right, ~72px, rounded 8px, from
  `/mascot/{mascot}` — the same files the bot serves in production.
- **Footer:** `OctoBot` — small (~12px) muted grey.

### `components/discord/frame.tsx` — `DiscordFrame`

The skeleton wrapping the feed. Purely decorative chrome (`aria-hidden` where text
is fake), children = message area content.

- Outer: rounded corners, subtle shadow; keeps the existing hero glow/blur backdrop
  behind it.
- Server rail: ~48px wide, `#1e1f22`. Discord-ish home pill at top, divider, 3–4
  abstract circular avatar placeholders, muted `+` circle. No real imagery needed.
- DM header: `#313338` with bottom hairline `#26282c`; `@` icon + **OctoBot** +
  green online dot (`#23a55a`).
- Message area: `#313338`, vertical stack, clips overflow (embeds animate within).
- Composer: pill input `#383a40` with `⊕` icon and muted placeholder
  `Message @OctoBot`. Non-interactive.
- Font: `"gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif`
  inside the frame.

## Content — `lib/content.ts`

New type + array (old `HERO_MESSAGES`/`DmMessage` stay; other sections use them):

```ts
export type HeroEmbed = {
  emoji: string
  label: string      // e.g. "Your PR was approved"
  color: string      // tone hex from the bot's meta registries
  mascot: string     // filename in /public/mascot
  number: number
  title: string
  repo: string
  relativeTime: string // e.g. "2 minutes ago"
}
```

`HERO_EMBEDS`: 7 entries, values copied from the bot's `PR_EVENT_META` /
`CHECKS_META` / `TONE` registries so shape and feel match production exactly:

| Event | Emoji + label | Color | Mascot |
|---|---|---|---|
| review_requested | 🔔 Review requested | `#58a6ff` | `summoned-v1.png` |
| approved | ✅ Your PR was approved | `#3fb950` | `celebrate-v1.png` |
| CI failed | ❌ CI failed on your PR | `#f85149` | `alarm-v1.png` |
| merged | 🎉 Your PR was merged | `#8957e5` | `celebrate-v1.png` |
| changes_requested | 🔧 Changes requested on your PR | `#d29922` | `needs-work-v1.png` |
| mentioned | 📣 Mentioned | `#d29922` | `summoned-v1.png` |
| CI passed | ✅ CI passed on your PR | `#3fb950` | `all-good-v1.png` |

Repos/titles/numbers: keep the fictional `acme/*` universe from `HERO_MESSAGES`.

## Animation

Reuse the existing hero pattern (`useLiveFeed` + `AnimatePresence mode="popLayout"`
from `motion/react`), retargeted at `HERO_EMBEDS`:

- Interval ~3000ms; append next message (cycling through all 7), keep last 3.
- Enter: spring, `opacity 0 → 1`, `y 16 → 0`, `scale 0.98 → 1` — Discord-like pop.
- Exit: `opacity → 0`, `y → -16`; `layout` handles the push-up.
- `useReducedMotion()` → no interval, static first 3.

## Hero integration — `components/sections/hero.tsx`

- Replace the right column's glassy card shell + mini-header + `DmCard` list with
  `<DiscordFrame>` containing the animated embed list.
- Left pitch column, CTAs, value strip: unchanged.
- `DmCard` / `dm-message.tsx`: unchanged (still used by `reaches-you.tsx`,
  `noise.tsx`).

## Error handling / edge cases

- Long PR titles truncate with ellipsis (single line), never wrap under the thumbnail.
- Mascot images use `next/image` with fixed dimensions; missing file would be a
  build-visible 404 in dev — filenames are copied verbatim from `public/mascot/`.
- Mobile (<lg): frame is full-width below the pitch, same as current layout; rail
  stays (it's only ~48px).

## Testing / verification

1. `pnpm typecheck` and `pnpm lint` (or the repo's turbo equivalents) pass.
2. Visual check in dev server: dark site theme, light site theme (frame must look
   identical), reduced-motion (static stack), mobile width.
3. Side-by-side sanity check against a real OctoBot DM screenshot: stripe, title,
   link line, timestamp pill, thumbnail, footer all match.
