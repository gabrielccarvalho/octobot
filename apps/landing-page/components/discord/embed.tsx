import Image from "next/image"

import type { HeroEmbed } from "@/lib/content"

/**
 * A pixel-faithful replica of one OctoBot notification as Discord's dark theme
 * renders it — the output of the bot's renderEmbed (apps/bot/src/discord/render.ts).
 * All colors are Discord's, hardcoded on purpose: this must not follow the site
 * theme.
 */
export function DiscordEmbedMessage({ embed }: { embed: HeroEmbed }) {
  return (
    <div className="flex gap-4">
      <Image
        src="/logo.png"
        alt=""
        width={40}
        height={40}
        className="mt-0.5 size-10 shrink-0 rounded-full"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-medium text-[#f2f3f5]">OctoBot</span>
          <span className="flex items-center rounded-[3px] bg-[#5865f2] px-[4.4px] py-px text-[10px] font-semibold tracking-[0.02em] text-white uppercase">
            App
          </span>
          <span className="text-xs text-[#949ba4]">Today at 2:41 PM</span>
        </div>

        <div
          className="mt-1 max-w-md rounded-[4px] bg-[#2b2d31] py-3 pr-3 pl-4"
          style={{ borderLeft: `4px solid ${embed.color}` }}
        >
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] leading-snug font-semibold text-[#f2f3f5]">
                {embed.emoji} {embed.label}
              </div>
              <div className="mt-1.5 truncate text-sm leading-snug">
                <span className="cursor-pointer text-[#00a8fc] hover:underline">
                  #{embed.number} {embed.title}
                </span>
              </div>
              <div className="mt-0.5 text-sm leading-snug text-[#dbdee1]">
                {embed.repo}
                {" · "}
                <span className="rounded-[3px] bg-[#3f4248] px-0.5 text-[#dbdee1]">
                  {embed.relativeTime}
                </span>
              </div>
              <div className="mt-2 text-xs font-medium text-[#949ba4]">OctoBot</div>
            </div>

            <Image
              src={`/mascot/${embed.mascot}`}
              alt=""
              width={72}
              height={72}
              className="mt-0.5 size-[72px] shrink-0 rounded-lg object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
