"use client"

import * as React from "react"
import { useScroll, useMotionValueEvent } from "motion/react"

import { BEATS, MAX_DEPTH } from "@/lib/beats"
import { cn } from "@/lib/utils"

export function DepthGauge() {
  const { scrollYProgress } = useScroll()
  const readoutRef = React.useRef<HTMLSpanElement>(null)
  const [active, setActive] = React.useState<string>(BEATS[0].id)

  // Text readout updates via direct DOM write — no re-render per scroll frame.
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    if (readoutRef.current) {
      readoutRef.current.textContent = `-${Math.round(p * MAX_DEPTH)}m`
    }
    // At the very bottom the observer band sits on the footer — force the last beat.
    if (p > 0.98) {
      setActive(BEATS[BEATS.length - 1].id)
    }
  })

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: "-45% 0px -45% 0px" }
    )
    for (const beat of BEATS) {
      const el = document.getElementById(beat.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  return (
    <nav
      aria-label="Depth navigation"
      className="fixed top-1/2 right-5 z-40 hidden -translate-y-1/2 flex-col items-end gap-2.5 xl:flex"
    >
      <span
        ref={readoutRef}
        className="mb-1 font-mono text-[11px] tabular-nums text-biolume"
      >
        -0m
      </span>
      {BEATS.map((beat) => {
        const isActive = active === beat.id
        return (
          <button
            key={beat.id}
            type="button"
            aria-current={isActive ? "true" : undefined}
            onClick={() =>
              document.getElementById(beat.id)?.scrollIntoView({ behavior: "smooth" })
            }
            className={cn(
              "group flex items-center gap-2 py-0.5 font-mono text-[10px] tracking-wider uppercase transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground/70 hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "transition-opacity",
                isActive
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              )}
            >
              {beat.label}
            </span>
            <span
              className={cn(
                "h-px bg-current transition-all",
                isActive ? "w-6 text-biolume" : "w-3.5"
              )}
            />
          </button>
        )
      })}
    </nav>
  )
}
