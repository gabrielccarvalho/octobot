import Link from "next/link"

import { Logo } from "@/components/logo"
import { Icon } from "@/components/icon"
import {
  NAV_LINKS,
  GITHUB_REPO_URL,
  COMPANY_NAME,
  LAST_UPDATED,
} from "@/lib/content"

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              GitHub activity, delivered to your Discord DMs the moment it needs
              you. Across every repo you can reach.
            </p>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon name="Github01Icon" className="size-4" strokeWidth={2} />
              Source on GitHub
            </a>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <FooterCol title="Product">
              {NAV_LINKS.map((l) => (
                <FooterLink key={l.href} href={l.href}>
                  {l.label}
                </FooterLink>
              ))}
            </FooterCol>
            <FooterCol title="Legal">
              <FooterLink href="/terms">Terms of Service</FooterLink>
              <FooterLink href="/privacy">Privacy Policy</FooterLink>
            </FooterCol>
            <FooterCol title="Get started">
              <FooterLink href="#add-to-discord">Add to Discord</FooterLink>
              <FooterLink href="#how">How it works</FooterLink>
            </FooterCol>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © 2026 {COMPANY_NAME}. All rights reserved.
          </p>
          <p>
            Not affiliated with or endorsed by GitHub, Inc. or Discord Inc. ·
            Updated {LAST_UPDATED}
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-mono text-xs tracking-widest text-foreground/70 uppercase">
        {title}
      </h3>
      <ul className="mt-4 flex flex-col gap-2.5">{children}</ul>
    </div>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
      </Link>
    </li>
  )
}
