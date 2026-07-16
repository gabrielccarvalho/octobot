"use client"

import * as React from "react"
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import type { MotionValue } from "motion/react"

import { DiscordEmbedMessage } from "@/components/discord/embed"
import { DiscordSurface } from "@/components/discord/frame"
import { SectionHeading } from "@/components/section"
import { HERO_EMBEDS, NOISE, REASONS } from "@/lib/content"

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
          <DiscordSurface>
            <DiscordEmbedMessage embed={HERO_EMBEDS[0]} />
          </DiscordSurface>
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
          <div className="absolute top-1/2 left-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2">
            <motion.div data-motion-fade style={{ opacity: cardOpacity, y: cardY }} className="relative">
              <div className="absolute -inset-4 -z-[1] rounded-3xl bg-biolume/10 blur-xl" aria-hidden />
              <DiscordSurface>
                <DiscordEmbedMessage embed={HERO_EMBEDS[0]} />
              </DiscordSurface>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}
