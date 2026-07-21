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

  // Reset the count during render (not in an effect) whenever this beat's
  // identity changes, per React's "adjusting state when a prop changes"
  // pattern — avoids a synchronous setState call inside the effect body.
  const runKey = `${text}:${ms}:${active}`
  const [prevRunKey, setPrevRunKey] = React.useState(runKey)
  if (runKey !== prevRunKey) {
    setPrevRunKey(runKey)
    setCount(active ? 0 : text.length)
  }

  React.useEffect(() => {
    if (!active) return
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
  const [revealed, setRevealed] = React.useState(playing ? 0 : scene.beats.length)

  // Reset the reveal count during render (not in an effect) whenever the
  // scene or play state changes — see useTypewriter above for why.
  const runKey = `${step}:${playing}`
  const [prevRunKey, setPrevRunKey] = React.useState(runKey)
  if (runKey !== prevRunKey) {
    setPrevRunKey(runKey)
    setRevealed(playing ? 0 : scene.beats.length)
  }

  React.useEffect(() => {
    if (!playing) return
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
      bodyClassName="h-[36rem] justify-end sm:h-[26rem]"
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
