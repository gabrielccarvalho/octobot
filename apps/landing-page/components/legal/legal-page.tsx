import Link from "next/link"

import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Icon } from "@/components/icon"
import { LAST_UPDATED } from "@/lib/content"

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string
  intro: string
  children: React.ReactNode
}) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pt-16 pb-8 sm:pt-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon name="ArrowRight01Icon" className="size-3.5 rotate-180" strokeWidth={2} />
          Back to OctoBot
        </Link>

        <header className="mt-8 border-b border-border/60 pb-8">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground text-pretty">
            {intro}
          </p>
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            Last updated {LAST_UPDATED}
          </p>
        </header>

        <div
          className="mt-10 pb-10 text-[0.95rem] leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-medium [&_h3]:text-foreground [&_li]:my-1.5 [&_p]:my-3 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:my-3 [&_ul]:list-disc [&_ul]:ps-5"
        >
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
