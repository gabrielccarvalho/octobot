import Image from "next/image"

import { Icon } from "@/components/icon"
import type { IconName } from "@/components/icon"
import { Eyebrow } from "@/components/section"
import { FadeUp, Stagger, StaggerItem } from "@/components/motion-primitives"
import { buttonVariants } from "@/components/ui/button"
import { GITHUB_REPO_URL, OPEN_SOURCE, SECURITY } from "@/lib/content"
import { cn } from "@/lib/utils"

export function Trust() {
  return (
    <section id="trust" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20 sm:py-28">
      <FadeUp>
        <div className="overflow-hidden rounded-[2rem] border border-border/70 bg-card/40 ring-1 ring-foreground/5 backdrop-blur-sm">
          <div className="grid gap-10 p-8 sm:p-12 lg:grid-cols-[1fr_0.9fr] lg:gap-16">
            {/* Open source pitch */}
            <div className="flex flex-col items-start">
              <Eyebrow>{OPEN_SOURCE.eyebrow} + security</Eyebrow>
              <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                {OPEN_SOURCE.title}
              </h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground text-pretty">
                {OPEN_SOURCE.body}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {OPEN_SOURCE.points.map((point) => (
                  <span
                    key={point}
                    className="rounded-full border border-biolume/40 bg-biolume/10 px-3 py-1 font-mono text-[11px] text-foreground"
                  >
                    {point}
                  </span>
                ))}
              </div>

              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className={cn(buttonVariants({ variant: "outline" }), "mt-7 gap-2")}
              >
                <Icon name="Github01Icon" className="size-4" strokeWidth={2} />
                {OPEN_SOURCE.cta}
              </a>

              <div className="relative mt-8 hidden w-full max-w-xs lg:block">
                <Image
                  src="/mascot/open-source.png"
                  alt="OctoBot mascot reading source code"
                  width={480}
                  height={480}
                  className="w-full rounded-3xl"
                />
              </div>
            </div>

            {/* Security plaques along the trench wall */}
            <Stagger className="flex flex-col" gap={0.09}>
              {SECURITY.map((point, i) => (
                <StaggerItem key={point.title}>
                  <div className={cn("flex gap-4 py-5", i > 0 && "border-t border-border/60")}>
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/50 text-biolume">
                      <Icon name={point.icon as IconName} className="size-5" strokeWidth={1.8} />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-semibold tracking-tight">
                        {point.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {point.body}
                      </p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </FadeUp>
    </section>
  )
}
