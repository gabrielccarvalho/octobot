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
