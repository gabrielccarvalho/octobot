import Image from "next/image"

import { cn } from "@/lib/utils"

/** The illustrated scene for each How-It-Works step. */
const SCENES = {
  connect: {
    src: "/mascot/connect.png",
    alt: "OctoBot linking a GitHub account to Discord",
  },
  baseline: {
    src: "/mascot/baseline.png",
    alt: "OctoBot summarizing your backlog into one welcome summary",
  },
  notify: {
    src: "/mascot/notify.png",
    alt: "OctoBot delivering a new GitHub notification as a DM",
  },
  digest: {
    src: "/mascot/digest.png",
    alt: "OctoBot holding the once-a-day digest at 6am",
  },
} as const

/**
 * HowItWorksScene — the illustrated artwork for one How-It-Works step. Each is a
 * self-contained square illustration tile; the parent card's Reveal handles the
 * scroll-in animation.
 */
export function HowItWorksScene({
  scene,
  className,
}: {
  scene: keyof typeof SCENES
  className?: string
}) {
  const { src, alt } = SCENES[scene]
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-2xl", className)}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 22vw"
        className="object-cover"
      />
    </div>
  )
}
