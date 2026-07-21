import Image from "next/image"

import type { HeroEmbed } from "@/lib/content"
import type { TextEmbed } from "@/lib/demo-script"

/**
 * A pixel-faithful replica of one OctoBot notification as Discord's dark theme
 * renders it — the output of the bot's renderEmbed (apps/bot/src/discord/render.ts).
 * All colors are Discord's, hardcoded on purpose: this must not follow the site
 * theme.
 */
export function DiscordEmbedMessage({ embed }: { embed: HeroEmbed }) {
  return (
    <MessageShell>
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
    </MessageShell>
  )
}

/** Shared message header: avatar column plus the OctoBot / App / timestamp line. */
function MessageShell({ children }: { children: React.ReactNode }) {
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
        {children}
      </div>
    </div>
  )
}

/**
 * The generic renderEmbed() shape (apps/bot/src/discord/render.ts): tone stripe,
 * title, a body of grouped PR sections, mascot thumbnail, OctoBot footer.
 * Used for the welcome summary and the daily digest.
 */
export function DiscordTextEmbed({ embed }: { embed: TextEmbed }) {
  return (
    <MessageShell>
      <div
        className="mt-1 max-w-md rounded-[4px] bg-[#2b2d31] py-3 pr-3 pl-4"
        style={{ borderLeft: `4px solid ${embed.color}` }}
      >
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] leading-snug font-semibold text-[#f2f3f5]">
              {embed.title}
            </div>

            {embed.sections.map((section) => (
              <div key={section.label} className="mt-2.5">
                <div className="text-sm leading-snug font-semibold text-[#f2f3f5]">
                  {section.label} ({section.count})
                </div>
                {section.repos.map((group) => (
                  <div key={group.repo} className="mt-1">
                    <div className="text-sm leading-snug font-semibold text-[#f2f3f5]">
                      {group.repo}
                    </div>
                    {group.prs.map((pr) => (
                      <div
                        key={pr.number}
                        className="text-sm leading-snug text-[#dbdee1] sm:truncate"
                      >
                        <span className="cursor-pointer text-[#00a8fc] hover:underline">
                          #{pr.number} {pr.title}
                        </span>
                        {" · "}
                        <span className="rounded-[3px] bg-[#3f4248] px-0.5">{pr.when}</span>
                        {pr.awaiting && ` · awaiting ${pr.awaiting}`}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}

            <div className="mt-2.5 text-xs font-medium text-[#949ba4]">OctoBot</div>
          </div>

          <Image
            src={`/mascot/${embed.mascot}`}
            alt=""
            width={72}
            height={72}
            className="mt-0.5 hidden size-[72px] shrink-0 rounded-lg object-cover sm:block"
          />
        </div>
      </div>
    </MessageShell>
  )
}

/**
 * An ephemeral command reply — plain text plus Discord's "Only you can see this"
 * footer. This is what /link actually returns (apps/bot/src/discord/handlers.ts).
 */
export function DiscordEphemeralReply({
  intro,
  url,
  note,
}: {
  intro: string
  url: string
  note: string
}) {
  return (
    <MessageShell>
      <div className="mt-1 text-[15px] leading-relaxed text-[#dbdee1]">
        <div>{intro}</div>
        <div className="truncate text-[#00a8fc]">{url}</div>
        <div className="mt-2">{note}</div>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[#949ba4]">
        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 fill-current" aria-hidden>
          <path d="M12 5c-5 0-9 4.5-9 7s4 7 9 7 9-4.5 9-7-4-7-9-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
        </svg>
        <span>Only you can see this ·</span>
        <span className="cursor-pointer text-[#00a8fc] hover:underline">Dismiss message</span>
      </div>
    </MessageShell>
  )
}
