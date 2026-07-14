import Image from "next/image"

import { cn } from "@/lib/utils"
import type { DmMessage } from "@/lib/content"

const toneStyles: Record<NonNullable<DmMessage["tone"]>, string> = {
  default: "text-foreground",
  approved: "text-biolume",
  changes: "text-primary",
}

export function DmCard({
  message,
  className,
  style,
}: {
  message: DmMessage
  className?: string
  style?: React.CSSProperties
}) {
  const tone = message.tone ?? "default"
  return (
    <div
      style={style}
      className={cn(
        "flex gap-3 rounded-2xl border border-border/70 bg-card/80 p-3.5 backdrop-blur-sm",
        "ring-1 ring-foreground/5",
        className
      )}
    >
      <div className="relative mt-0.5 size-9 shrink-0">
        <Image src="/logo.png" alt="" width={36} height={36} className="rounded-full" />
        <span className="biolume-dot absolute -end-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card bg-biolume" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">OctoBot</span>
          <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-primary uppercase">
            App
          </span>
        </div>

        <div className="mt-1.5 font-mono text-xs leading-relaxed">
          <div className={cn("font-medium", toneStyles[tone])}>
            {message.reason}
            <span className="text-muted-foreground">
              {" · "}
              {message.repo}
              {" · "}
              {message.time}
            </span>
          </div>
          <div className="mt-1 truncate">
            <span className="text-muted-foreground">{message.number}</span>{" "}
            <span className="text-primary underline decoration-primary/40 underline-offset-2">
              {message.title}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
