"use client"

import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { SectionHeading } from "@/components/section"
import { FadeUp } from "@/components/motion-primitives"
import { COMMANDS } from "@/lib/content"
import { cn } from "@/lib/utils"

export function CommandsMenu() {
  const reduce = useReducedMotion()
  const [active, setActive] = React.useState(0)
  const [paused, setPaused] = React.useState(false)

  React.useEffect(() => {
    if (paused || reduce) return
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % COMMANDS.length)
    }, 2600)
    return () => window.clearInterval(id)
  }, [paused, reduce])

  const current = COMMANDS[active]

  return (
    <section id="commands" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20 sm:py-28">
      <SectionHeading
        align="center"
        eyebrow="Commands"
        title="Six commands. That's the whole manual."
        intro="Everything is a slash command in your DM with OctoBot."
      />

      <FadeUp className="mx-auto mt-12 max-w-2xl">
        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="rounded-3xl border border-border/70 bg-card/60 p-2.5 ring-1 ring-foreground/5 backdrop-blur-xl"
        >
          {/* Autocomplete popup */}
          <div className="rounded-2xl bg-background/60 p-2">
            <div className="px-3 pt-2 pb-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Commands matching /
            </div>
            <div role="listbox" aria-label="OctoBot commands" className="flex flex-col">
              {COMMANDS.map((command, i) => (
                <button
                  key={command.name}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onClick={() => setActive(i)}
                  onMouseEnter={() => setActive(i)}
                  className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                >
                  {i === active && (
                    <motion.span
                      layoutId="command-highlight"
                      className="absolute inset-0 rounded-xl bg-primary/12 ring-1 ring-primary/25"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <code
                    className={cn(
                      "relative font-mono text-sm",
                      i === active ? "text-primary" : "text-foreground/80"
                    )}
                  >
                    {command.name}
                  </code>
                </button>
              ))}
            </div>
          </div>

          {/* Composer bar showing the active command + its description */}
          <div className="mt-2 flex items-center gap-3 rounded-2xl bg-background/60 px-4 py-3">
            <code className="shrink-0 rounded bg-primary/15 px-2 py-1 font-mono text-sm text-primary">
              {current.name}
            </code>
            {/* Fixed two-line slot so one- vs two-line descriptions don't resize the bar */}
            <div className="min-w-0 flex-1 sm:flex sm:min-h-10 sm:items-center">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={current.name}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="min-w-0 truncate text-sm text-muted-foreground sm:whitespace-normal"
                >
                  {current.body}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </FadeUp>
    </section>
  )
}
