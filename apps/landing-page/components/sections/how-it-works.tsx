"use client"

import * as React from "react"
import Image from "next/image"
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useMotionValueEvent,
} from "motion/react"

import { SectionHeading } from "@/components/section"
import { Stagger, StaggerItem } from "@/components/motion-primitives"
import { STEPS } from "@/lib/content"
import { cn } from "@/lib/utils"

function SceneImage({ scene, title }: { scene: string; title: string }) {
  return (
    <Image
      src={`/mascot/${scene}.png`}
      alt={title}
      width={640}
      height={640}
      className="size-full rounded-3xl object-cover"
    />
  )
}

/** Static fallback: used on small screens and under reduced motion. */
function StaticSteps() {
  return (
    <Stagger className="mt-12 grid gap-10 sm:grid-cols-2">
      {STEPS.map((step) => (
        <StaggerItem key={step.n}>
          <div className="overflow-hidden rounded-3xl border border-border/70 ring-1 ring-foreground/5">
            <SceneImage scene={step.scene} title={step.title} />
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="font-mono text-sm text-biolume">{step.n}</span>
            <h3 className="font-display text-xl font-semibold tracking-tight">{step.title}</h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        </StaggerItem>
      ))}
    </Stagger>
  )
}

function ScrubSteps() {
  const ref = React.useRef<HTMLDivElement>(null)
  const [step, setStep] = React.useState(0)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  })

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setStep(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length)))
  })

  const active = STEPS[step]

  return (
    <div ref={ref} className="relative mt-4 h-[340vh]">
      <div className="sticky top-0 flex h-screen items-center">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Copy rail */}
          <div className="flex flex-col gap-7">
            {STEPS.map((s, i) => (
              <button
                key={s.n}
                type="button"
                onClick={() => {
                  const el = ref.current
                  if (!el) return
                  const top =
                    el.offsetTop +
                    (el.offsetHeight - window.innerHeight) * (i / (STEPS.length - 1))
                  window.scrollTo({ top, behavior: "smooth" })
                }}
                className={cn(
                  "border-l-2 pl-5 text-left transition-all duration-300",
                  i === step
                    ? "border-biolume opacity-100"
                    : "border-border opacity-40 hover:opacity-70"
                )}
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-sm text-biolume">{s.n}</span>
                  <h3 className="font-display text-xl font-semibold tracking-tight">{s.title}</h3>
                </div>
                <p
                  className={cn(
                    "mt-2 max-w-md text-sm leading-relaxed text-muted-foreground transition-all duration-300",
                    i === step ? "line-clamp-none" : "line-clamp-1"
                  )}
                >
                  {s.body}
                </p>
              </button>
            ))}
          </div>

          {/* Scene theater */}
          <div className="relative aspect-square w-full max-w-xl justify-self-end overflow-hidden rounded-[2rem] border border-border/70 ring-1 ring-foreground/5">
            <AnimatePresence mode="sync" initial={false}>
              <motion.div
                key={active.scene}
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <SceneImage scene={active.scene} title={active.title} />
              </motion.div>
            </AnimatePresence>
            {/* Progress rail */}
            <div className="absolute right-4 bottom-4 flex gap-1.5">
              {STEPS.map((s, i) => (
                <span
                  key={s.n}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    i === step ? "w-6 bg-biolume" : "w-2.5 bg-foreground/25"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function HowItWorks() {
  const reduce = useReducedMotion()

  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20 sm:py-24">
      <SectionHeading
        eyebrow="How it works"
        title="Four steps down"
        intro="From /link to a quiet, useful stream of DMs."
      />
      {reduce ? (
        <StaticSteps />
      ) : (
        <>
          <div className="lg:hidden">
            <StaticSteps />
          </div>
          <div className="hidden lg:block">
            <ScrubSteps />
          </div>
        </>
      )}
    </section>
  )
}
