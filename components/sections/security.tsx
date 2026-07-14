import { Section, SectionHeading } from "@/components/section"
import { Icon, type IconName } from "@/components/icon"
import { SECURITY } from "@/lib/content"

export function Security() {
  return (
    <Section>
      <div className="rounded-3xl border border-border/70 bg-card/40 p-8 ring-1 ring-foreground/5 backdrop-blur-sm sm:p-12">
        <SectionHeading
          eyebrow="Trust the host with a token"
          title="It holds a GitHub token — so it's built to earn that"
          intro="Connecting OctoBot means handing it a token that can read your repositories. Here's exactly how that token is treated."
        />

        <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {SECURITY.map((s) => (
            <div key={s.title} className="flex gap-4">
              <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Icon name={s.icon as IconName} className="size-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-base font-medium tracking-tight">
                  {s.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}
