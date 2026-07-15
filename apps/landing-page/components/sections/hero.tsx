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
