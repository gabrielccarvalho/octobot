import { HowItWorksScene } from "@/components/how-it-works-scene"
import { Section, SectionHeading } from "@/components/section"
import { STEPS } from "@/lib/content"

export function HowItWorks() {
  return (
    <Section id="how">
      <SectionHeading
        eyebrow="From /link to DM"
        title="Four steps, then it runs itself"
        intro="You touch OctoBot exactly once — to connect. After that it works quietly in the background, and the only thing you ever see is the DM."
      />

      <ol className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-border/70 bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="relative flex flex-col gap-4 bg-card/70 p-7 backdrop-blur-sm"
          >
            <HowItWorksScene scene={step.scene} className="h-28 w-full" />
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-sm text-biolume">{step.n}</span>
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>
            <h3 className="font-display text-xl font-semibold tracking-tight">
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
