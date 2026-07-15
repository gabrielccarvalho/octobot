"use client"

import * as React from "react"

export function useInView<T extends Element>(options?: {
  once?: boolean
  rootMargin?: string
  threshold?: number
}) {
  const { once = true, rootMargin = "0px 0px -10% 0px", threshold = 0.15 } =
    options ?? {}
  const ref = React.useRef<T | null>(null)
  const [inView, setInView] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined") {
      // No observer support → reveal on the next microtask. This is async, so
      // it is NOT a synchronous setState-in-effect (satisfies the
      // react-hooks/set-state-in-effect lint rule; keep it this way).
      queueMicrotask(() => setInView(true))
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) observer.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { rootMargin, threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [once, rootMargin, threshold])

  return { ref, inView }
}
