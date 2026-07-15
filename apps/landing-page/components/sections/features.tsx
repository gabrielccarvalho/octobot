import { Section, SectionHeading } from "@/components/section"
import { Icon, type IconName } from "@/components/icon"
import { Reveal } from "@/components/reveal"
import { FEATURES } from "@/lib/content"
import { cn } from "@/lib/utils"

export function Features() {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="Signal, not noise"
        title="Tuned to interrupt you only when it should"
        intro="OctoBot starts as a focused PR notifier and opens up exactly as far as you want — sensible defaults out of the box, nothing to wire up."
      />

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal
            key={f.title}
            delay={i * 60}
            className={cn(
              "group relative flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/60 p-6 backdrop-blur-sm transition-colors",
              f.accent
                ? "ring-1 ring-biolume/30 hover:border-biolume/50"
                : "ring-1 ring-foreground/5 hover:border-primary/40"
            )}
          >
            <div
              className={cn(
                "inline-flex size-11 items-center justify-center rounded-xl",
                f.accent
                  ? "bg-biolume/15 text-biolume"
                  : "bg-primary/12 text-primary"
              )}
            >
              <Icon name={f.icon as IconName} className="size-5" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-display text-lg font-medium tracking-tight">
                {f.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                {f.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
