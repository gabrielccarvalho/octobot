"use client"

import * as React from "react"

import { useInView } from "@/lib/use-in-view"
import { useMounted } from "@/lib/use-mounted"
import { cn } from "@/lib/utils"

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  as?: "div" | "li" | "section"
}) {
  const { ref, inView } = useInView<HTMLElement>()
  const mounted = useMounted()

  // Before mount (SSR / no-JS): fully visible, no animation classes.
  // After mount: hidden until inView, then run the reveal animation.
  const pending = mounted && !inView
  return (
    <Tag
      ref={ref as never}
      className={cn(pending && "reveal-pending opacity-0", inView && "reveal-run", className)}
      style={inView && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  )
}
