import { Section } from "@/components/section"
import { Icon } from "@/components/icon"
import { OctobotMascot } from "@/components/mascot/octobot-mascot"
import { OPEN_SOURCE, GITHUB_REPO_URL } from "@/lib/content"

export function OpenSource() {
  return (
    <Section id="open-source">
      <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/50 p-8 ring-1 ring-foreground/5 backdrop-blur-sm sm:p-12">
        <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl space-y-4">
            <span className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.2em] text-biolume uppercase">
              <Icon name="Github01Icon" className="size-4" />
              {OPEN_SOURCE.eyebrow}
            </span>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {OPEN_SOURCE.title}
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground text-pretty">
              {OPEN_SOURCE.body}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {OPEN_SOURCE.points.map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-border/70 bg-background/50 px-3 py-1 font-mono text-xs text-muted-foreground"
                >
                  {p}
                </span>
              ))}
            </div>
            <div className="pt-2">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                <Icon name="Github01Icon" className="size-4" />
                {OPEN_SOURCE.cta}
              </a>
            </div>
          </div>

          <div className="shrink-0">
            <OctobotMascot pose="wave" title="OctoBot waving" className="size-40 sm:size-48" />
          </div>
        </div>
      </div>
    </Section>
  )
}
