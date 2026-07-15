"use client"

import * as React from "react"

import { Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { AddToDiscord } from "@/components/add-to-discord"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon"
import { NAV_LINKS, DISCORD_COMMUNITY_URL } from "@/lib/content"
import { cn } from "@/lib/utils"

export function SiteHeader() {
  const [open, setOpen] = React.useState(false)

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6">
        <div className="flex h-14 items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-3 pe-2 backdrop-blur-xl sm:px-4">
          <Logo />

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <div className="hidden sm:block">
              <AddToDiscord href={DISCORD_COMMUNITY_URL}>Join community</AddToDiscord>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <Icon name={open ? "Cancel01Icon" : "Menu01Icon"} className="size-5" />
            </Button>
          </div>
        </div>

        {/* Mobile sheet */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-300 md:hidden",
            open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="mt-2 flex flex-col gap-1 rounded-2xl border border-border/70 bg-background/90 p-3 backdrop-blur-xl">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-1 px-1">
              <AddToDiscord href={DISCORD_COMMUNITY_URL} className="w-full">
                Join community
              </AddToDiscord>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
