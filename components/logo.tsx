import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"

export function Logo({
  className,
  showWordmark = true,
  size = 32,
  href = "/",
}: {
  className?: string
  showWordmark?: boolean
  size?: number
  href?: string | null
}) {
  const mark = (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src="/logo.png"
        alt="OctoBot"
        width={size}
        height={size}
        priority
        className="drop-shadow-[0_0_12px_color-mix(in_oklch,var(--primary)_45%,transparent)]"
      />
      {showWordmark && (
        <span className="font-display text-lg font-semibold tracking-tight">
          OctoBot
        </span>
      )}
    </span>
  )

  if (href === null) {
    return <span className={cn("select-none", className)}>{mark}</span>
  }

  return (
    <Link href={href} className={cn("select-none", className)} aria-label="OctoBot home">
      {mark}
    </Link>
  )
}
