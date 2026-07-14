import { Section, SectionHeading } from "@/components/section"
import { COMMANDS } from "@/lib/content"

export function Commands() {
  return (
    <Section id="commands">
      <SectionHeading
        eyebrow="Six slash commands"
        title="The whole interface fits in a slash menu"
        intro="No dashboard, no settings site. Everything OctoBot does is a slash command you run right inside Discord — and every reply is ephemeral, so only you see it."
      />

      <div className="mt-14 grid gap-3 sm:grid-cols-2">
        {COMMANDS.map((cmd) => (
          <div
            key={cmd.name}
            className="group flex items-start gap-4 rounded-2xl border border-border/70 bg-card/60 p-5 ring-1 ring-foreground/5 backdrop-blur-sm transition-colors hover:border-primary/40"
          >
            <code className="shrink-0 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 font-mono text-sm font-medium text-primary">
              {cmd.name}
            </code>
            <p className="pt-0.5 text-sm leading-relaxed text-muted-foreground text-pretty">
              {cmd.body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  )
}
