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
          <div className="relative">
            {/* Bubbles coming off the mascot, rising toward the panel top */}
            {!reduce && (
              <div aria-hidden>
                {[
                  { left: "22%", size: 6, duration: 3.8, delay: 0 },
                  { left: "48%", size: 9, duration: 4.6, delay: 1.2 },
                  { left: "70%", size: 5, duration: 3.4, delay: 2.2 },
                  { left: "36%", size: 6, duration: 5, delay: 2.8 },
                  { left: "60%", size: 8, duration: 4.2, delay: 0.6 },
                  { left: "82%", size: 5, duration: 4.8, delay: 1.8 },
                ].map((b, i) => (
                  <span
                    key={i}
                    className="bubble bubble-sm top-6"
                    style={{
                      left: b.left,
                      width: b.size,
                      height: b.size,
                      animationDuration: `${b.duration}s`,
                      animationDelay: `${b.delay}s`,
                    }}
                  />
                ))}
              </div>
            )}
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
