"use client"

import { useReducedMotion } from "motion/react"

const COUNT = 40

/**
 * Deterministic bubble plume for the underwater span of the page.
 * Tight around the mascot at the bottom (the source), dispersing as it
 * rises; the layer's top edge sits at the waterline, so bubbles vanish
 * exactly at the surface.
 */
function bubbleAt(i: number) {
  const depth = 1 - i / (COUNT - 1) // 1 = bottom (mascot), 0 = top (waterline)
  const spread = 6 + (1 - depth) * 34 // plume widens on the way up
  const jitter = ((i * 137) % 100) / 100 - 0.5
  return {
    top: 6 + depth * 92,
    left: 50 + jitter * 2 * spread,
    size: 4 + ((i * 53) % 9),
    duration: 9 + ((i * 71) % 8),
    delay: -((i * 43) % 12),
  }
}

export function Bubbles() {
  const reduce = useReducedMotion()
  if (reduce) return null

  return (
    <div className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden" aria-hidden>
      {Array.from({ length: COUNT }, (_, i) => {
        const b = bubbleAt(i)
        return (
          <span
            key={i}
            className="bubble"
            style={{
              top: `${b.top}%`,
              left: `${b.left}%`,
              width: b.size,
              height: b.size,
              animationDuration: `${b.duration}s`,
              animationDelay: `${b.delay}s`,
            }}
          />
        )
      })}
    </div>
  )
}
