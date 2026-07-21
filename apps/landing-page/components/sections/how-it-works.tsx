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
        <div className="flex min-w-0 flex-col gap-7">
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
        <div
          className="relative w-full min-w-0 max-w-xl justify-self-center lg:justify-self-end"
          aria-hidden="true"
        >
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
