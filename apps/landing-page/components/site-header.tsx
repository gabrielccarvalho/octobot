import { Logo } from "@/components/logo"
import { AddToDiscord } from "@/components/add-to-discord"
import { DISCORD_COMMUNITY_URL } from "@/lib/content"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6">
        <div className="flex h-14 items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-3 pe-2 backdrop-blur-xl sm:px-4">
          <Logo />
          <div className="flex items-center gap-1.5">
            <AddToDiscord href={DISCORD_COMMUNITY_URL}>Join community</AddToDiscord>
          </div>
        </div>
      </div>
    </header>
  )
}
