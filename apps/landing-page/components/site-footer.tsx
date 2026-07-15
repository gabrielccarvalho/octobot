import Link from "next/link"

import { Logo } from "@/components/logo"
import {
  COMPANY_NAME,
  LAST_UPDATED,
  DISCORD_COMMUNITY_URL,
  DISCORD_INVITE_URL,
  GITHUB_REPO_URL,
  GITHUB_ISSUES_URL,
  GITHUB_CONTRIBUTING_URL,
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
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
            <FooterCol title="Product">
              <FooterLink href="#reaches-you">Features</FooterLink>
              <FooterLink href="#how">How it works</FooterLink>
              <FooterLink href="#commands">Commands</FooterLink>
              <FooterLink href="#faq">FAQ</FooterLink>
            </FooterCol>
            <FooterCol title="Legal">
              <FooterLink href="/terms">Terms of Service</FooterLink>
              <FooterLink href="/privacy">Privacy Policy</FooterLink>
            </FooterCol>
            <FooterCol title="Get started">
              <FooterLink href={DISCORD_COMMUNITY_URL}>Join the community</FooterLink>
              <FooterLink href={DISCORD_INVITE_URL}>Add to your server</FooterLink>
              <FooterLink href="#how">How it works</FooterLink>
            </FooterCol>
            <FooterCol title="Source">
              <FooterLink href={GITHUB_REPO_URL}>GitHub</FooterLink>
              <FooterLink href={GITHUB_ISSUES_URL}>Issues</FooterLink>
              <FooterLink href={GITHUB_CONTRIBUTING_URL}>Contributing</FooterLink>
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
  const external = href.startsWith("http")
  const className =
    "text-sm text-muted-foreground transition-colors hover:text-foreground"

  return (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
          {children}
        </a>
      ) : (
        <Link href={href} className={className}>
          {children}
        </Link>
      )}
    </li>
  )
}
