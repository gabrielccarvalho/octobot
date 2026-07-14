import { cn } from "@/lib/utils"

export function Section({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={cn("mx-auto max-w-6xl scroll-mt-24 px-6 py-20 sm:py-28", className)}
    >
      {children}
    </section>
  )
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.2em] text-primary uppercase">
      <span className="h-px w-6 bg-primary/50" />
      {children}
    </span>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "start",
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  intro?: React.ReactNode
  align?: "start" | "center"
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" && "items-center text-center",
        className
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {intro && (
        <p
          className={cn(
            "max-w-2xl text-base leading-relaxed text-muted-foreground text-pretty",
            align === "center" && "mx-auto"
          )}
        >
          {intro}
        </p>
      )}
    </div>
  )
}
