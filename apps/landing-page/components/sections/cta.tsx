import { AddToDiscord } from "@/components/add-to-discord"
import { OctobotMascot } from "@/components/mascot/octobot-mascot"
import { DISCORD_COMMUNITY_URL } from "@/lib/content"

export function Cta() {
  return (
    <section id="add-to-discord" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-16">
      <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/50 px-6 py-16 text-center ring-1 ring-foreground/5 backdrop-blur-sm sm:px-12 sm:py-20">
        <div
          className="pointer-events-none absolute inset-x-0 -top-1/2 -z-[1] mx-auto aspect-square w-[36rem] max-w-full rounded-full bg-primary/15 blur-3xl"
          aria-hidden
        />

        <div className="mx-auto flex justify-center">
          <OctobotMascot pose="peek" title="OctoBot" className="size-20" />
        </div>

        <h2 className="mx-auto mt-6 max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          Stop refreshing the notifications tab
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground text-pretty sm:text-lg">
          Join the community, run <code className="font-mono text-foreground">/link</code>, and
          the next time GitHub needs you, you&apos;ll hear about it where you
          already are.
        </p>

        <div className="mt-8 flex justify-center">
          <AddToDiscord size="hero" href={DISCORD_COMMUNITY_URL}>
            Join the community
          </AddToDiscord>
        </div>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          Join, run /link, done · read-only access · disconnect anytime
        </p>
      </div>
    </section>
  )
}
