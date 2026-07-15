import Image from "next/image"

import { AddToDiscord } from "@/components/add-to-discord"
import { DmCard } from "@/components/dm-message"
import { Icon } from "@/components/icon"
import { Eyebrow } from "@/components/section"
import {
  HERO_MESSAGES,
  VALUE_POINTS,
  DISCORD_COMMUNITY_URL,
  DISCORD_INVITE_URL,
} from "@/lib/content"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="hero-grid pointer-events-none absolute inset-0 -z-[1]" aria-hidden />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-8 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-16">
        {/* Left: the pitch */}
        <div className="flex flex-col items-start">
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-700">
            <Eyebrow>github → discord</Eyebrow>
          </div>

          <h1 className="animate-in fade-in slide-in-from-bottom-4 mt-5 font-display text-5xl font-semibold tracking-tight text-balance duration-700 sm:text-6xl lg:text-[4.25rem] lg:leading-[1.02]">
            GitHub, in your{" "}
            <span className="relative whitespace-nowrap text-primary">
              DMs
              <span
                className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full bg-gradient-to-r from-primary to-biolume"
                aria-hidden
              />
            </span>
            .
          </h1>

          <p className="animate-in fade-in slide-in-from-bottom-4 mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty delay-100 duration-700">
            OctoBot watches every repository your account can touch — public and
            private — and sends a Discord DM the moment something needs you.
            Review requests, mentions, CI failures, approvals. No per-repo
            webhooks. One click to connect.
          </p>

          <div className="animate-in fade-in slide-in-from-bottom-4 mt-8 flex flex-wrap items-center gap-3 delay-200 duration-700">
            <AddToDiscord size="hero" href={DISCORD_COMMUNITY_URL}>
              Join the community
            </AddToDiscord>
            <a
              href="#how"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-background/40 px-5 text-base font-medium backdrop-blur-sm transition-colors hover:bg-muted"
            >
              See how it works
            </a>
          </div>

          <p className="animate-in fade-in mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground delay-300 duration-700">
            <Icon name="FlashIcon" className="size-3.5 text-biolume" strokeWidth={2} />
            <span>Join, run /link, done · read-only · disconnect anytime</span>
            <span className="hidden text-border sm:inline" aria-hidden>
              ·
            </span>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="text-foreground/70 underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
            >
              or add OctoBot to your own server
            </a>
          </p>
        </div>

        {/* Right: the signature — a live DM stream */}
        <div className="animate-in fade-in slide-in-from-right-6 relative delay-150 duration-1000">
          <div
            className="absolute -inset-6 -z-[1] rounded-[2rem] bg-primary/10 blur-2xl"
            aria-hidden
          />
          <div className="rounded-3xl border border-border/70 bg-card/60 p-2.5 shadow-2xl shadow-primary/10 backdrop-blur-xl ring-1 ring-foreground/5">
            {/* DM window header */}
            <div className="flex items-center gap-3 rounded-2xl bg-background/50 px-4 py-3">
              <div className="relative size-8">
                <Image src="/logo.png" alt="" width={32} height={32} className="rounded-full" />
                <span className="biolume-dot absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card bg-biolume" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">OctoBot</div>
                <div className="font-mono text-[11px] text-biolume">online · watching 14 repos</div>
              </div>
              <span className="ms-auto font-mono text-[11px] text-muted-foreground">
                #direct-messages
              </span>
            </div>

            <div className="flex flex-col gap-2.5 p-2.5">
              {HERO_MESSAGES.map((m, i) => (
                <DmCard
                  key={m.number + m.repo}
                  message={m}
                  className="animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards duration-700"
                  style={{ animationDelay: `${500 + i * 450}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Value strip */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-y border-border/60 py-5 text-center">
          {VALUE_POINTS.map((point, i) => (
            <div key={point} className="flex items-center gap-8">
              {i > 0 && <span className="hidden size-1 rounded-full bg-border sm:block" aria-hidden />}
              <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                {point}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
