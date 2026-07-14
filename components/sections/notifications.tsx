import { Section, SectionHeading } from "@/components/section"
import { SUBJECT_TYPES, REASONS } from "@/lib/content"

export function Notifications() {
  return (
    <Section>
      <SectionHeading
        eyebrow="What reaches you"
        title="Every kind of GitHub activity, filtered to yours"
        intro="Pick the subject types you care about, then narrow the reasons within them. Each DM arrives tagged with why it fired — so you always know at a glance what it wants."
      />

      <div className="mt-14 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        {/* Subject types */}
        <div>
          <h3 className="font-mono text-xs tracking-[0.2em] text-foreground/70 uppercase">
            Subject types
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
            {SUBJECT_TYPES.map((t) => (
              <div
                key={t.label}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3.5 ring-1 ring-foreground/5 backdrop-blur-sm"
              >
                <span className="text-xl leading-none" aria-hidden>
                  {t.emoji}
                </span>
                <span className="text-sm font-medium">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reasons */}
        <div>
          <h3 className="font-mono text-xs tracking-[0.2em] text-foreground/70 uppercase">
            Reasons — the prefix on every DM
          </h3>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {REASONS.map((r) => (
              <span
                key={r}
                className="rounded-full border border-border/70 bg-card/50 px-3.5 py-2 font-mono text-xs text-foreground/80 backdrop-blur-sm"
              >
                {r}
              </span>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-biolume/25 bg-biolume/[0.06] p-5 ring-1 ring-biolume/10">
            <p className="text-sm leading-relaxed text-pretty">
              <span className="font-medium text-biolume">PR review verdicts.</span>{" "}
              <span className="text-muted-foreground">
                When someone reviews your pull request, OctoBot replaces the
                generic prefix with the outcome — ✅ approved, 🔧 changes
                requested, or 💬 commented. You read the result, not a riddle.
              </span>
            </p>
          </div>
        </div>
      </div>
    </Section>
  )
}
