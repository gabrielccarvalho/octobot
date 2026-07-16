"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"

import { DiscordEmbedMessage } from "@/components/discord/embed"
import { DiscordSurface } from "@/components/discord/frame"
import { Icon } from "@/components/icon"
import type { IconName } from "@/components/icon"
import { SectionHeading } from "@/components/section"
import { Stagger, StaggerItem } from "@/components/motion-primitives"
import { FEATURES, HERO_EMBEDS, REASONS, SUBJECT_TYPES } from "@/lib/content"
import type { HeroEmbed } from "@/lib/content"
import { cn } from "@/lib/utils"

/** Sample embeds mapped to the reason pill that lets them through. */
const SAMPLES: { reason: (typeof REASONS)[number]; embed: HeroEmbed }[] = [
  { reason: "🔔 Review requested", embed: HERO_EMBEDS[0] },
  { reason: "✍️ Activity on your PR", embed: HERO_EMBEDS[1] },
  { reason: "📣 Mentioned", embed: HERO_EMBEDS[5] },
  { reason: "⚙️ CI activity", embed: HERO_EMBEDS[2] },
]

/** Reasons on by default — flipping ⚙️ CI activity on reveals its sample. */
const DEFAULT_ON = new Set<string>([
  "🔔 Review requested",
  "✍️ Activity on your PR",
  "📣 Mentioned",
])

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
            <DiscordSurface className="min-h-28">
              <AnimatePresence initial={false}>
                {visible.map((s) => (
                  <motion.div
                    key={`${s.embed.repo}#${s.embed.number}`}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 18 }}
                    transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  >
                    <DiscordEmbedMessage embed={s.embed} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {visible.length === 0 && (
                <p className="py-6 text-center font-mono text-xs text-[#949ba4]">
                  silence. exactly what you asked for.
                </p>
              )}
            </DiscordSurface>
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
                    name={feature.icon as IconName}
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
