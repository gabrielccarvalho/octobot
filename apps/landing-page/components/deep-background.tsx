"use client"

import * as React from "react"
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react"
import type { MotionValue } from "motion/react"

export function DeepBackground() {
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const eased = useSpring(scrollYProgress, { stiffness: 60, damping: 20 })
  const abyssOpacity = useTransform(eased, [0, 0.3, 1], [0, 0.4, 1])
  const snowOpacity = useTransform(eased, [0.12, 0.45], [0, 1])

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="deep-surface absolute inset-0" />
      <motion.div
        className="deep-abyss absolute inset-0"
        style={{ opacity: reduce ? 0.55 : abyssOpacity }}
      />
      {!reduce && <MarineSnow opacity={snowOpacity} />}
    </div>
  )
}

/** Dark-mode drifting specks. Deterministic layout (no Math.random) and
 *  mounted after a delay so it never affects first paint. */
function MarineSnow({ opacity }: { opacity: MotionValue<number> }) {
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 800)
    return () => window.clearTimeout(t)
  }, [])

  if (!ready) return null

  return (
    <motion.div style={{ opacity }} className="absolute inset-0 hidden dark:block">
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          className="marine-snow-speck"
          style={{
            left: `${(i * 61) % 100}%`,
            width: 1 + ((i * 7) % 3),
            height: 1 + ((i * 7) % 3),
            opacity: 0.25 + ((i * 11) % 50) / 100,
            animationDuration: `${14 + ((i * 13) % 12)}s`,
            animationDelay: `${-((i * 5) % 20)}s`,
          }}
        />
      ))}
    </motion.div>
  )
}
