import Image from "next/image"

import { cn } from "@/lib/utils"

/**
 * Decorative Discord dark-theme DM window: slim server rail, DM header, message
 * area (children), composer. Colors are Discord's own, hardcoded on purpose —
 * the frame must read as Discord in both site themes.
 */
export function DiscordFrame({
  children,
  composer,
  bodyClassName,
}: {
  children: React.ReactNode
  /** Replaces the decorative composer bar — the demo types into its own. */
  composer?: React.ReactNode
  /** Extra classes on the message area, e.g. a fixed height. */
  bodyClassName?: string
}) {
  return (
    <div
      className="flex overflow-hidden rounded-2xl shadow-2xl shadow-black/40 ring-1 ring-white/10"
      style={{
        fontFamily:
          '"gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      {/* Server rail — hidden on narrow viewports so the DM area keeps its width */}
      <div
        className="hidden w-[52px] shrink-0 flex-col items-center gap-2 bg-[#1e1f22] py-3 sm:flex"
        aria-hidden
      >
        <div className="relative">
          <span className="absolute top-1/2 -left-3 h-8 w-1 -translate-y-1/2 rounded-r-full bg-white" />
          <Image
            src="/logo.png"
            alt=""
            width={36}
            height={36}
            className="size-9 rounded-[12px]"
          />
        </div>
        <div className="h-0.5 w-6 rounded-full bg-[#35363c]" />
        <div className="size-9 rounded-full bg-[#313338]" />
        <div className="size-9 rounded-full bg-[#313338]" />
        <div className="size-9 rounded-full bg-[#313338]" />
        <div className="flex size-9 items-center justify-center rounded-full bg-[#313338] text-lg leading-none text-[#23a55a]">
          +
        </div>
      </div>

      {/* DM window */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#313338]">
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-[#26282c] px-4 shadow-sm">
          <div className="relative" aria-hidden>
            <Image src="/logo.png" alt="" width={24} height={24} className="size-6 rounded-full" />
            <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-[#313338] bg-[#23a55a]" />
          </div>
          <span className="text-[15px] font-semibold text-[#f2f3f5]">OctoBot</span>
        </div>

        <div className={cn("flex flex-col gap-4 overflow-hidden p-4", bodyClassName)}>
          {children}
        </div>

        {composer ?? (
          <div className="px-4 pb-4" aria-hidden>
            <div className="flex items-center gap-3 rounded-lg bg-[#383a40] px-4 py-2.5">
              <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-[#b5bac1]" aria-hidden>
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2Z" />
              </svg>
              <span className="truncate text-[15px] text-[#6d6f78]">Message @OctoBot</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * A bare slice of the Discord DM message area — same hardcoded Discord colors
 * as DiscordFrame, minus the server rail, header, and composer. For sections
 * that show one or two messages without the full window.
 */
export function DiscordSurface({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 overflow-hidden rounded-2xl bg-[#313338] p-4 shadow-2xl shadow-black/40 ring-1 ring-white/10",
        className
      )}
      style={{
        fontFamily:
          '"gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      {children}
    </div>
  )
}
