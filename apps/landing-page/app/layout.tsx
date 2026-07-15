import type { Metadata } from "next"
import { Geist_Mono, Figtree, Space_Grotesk } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" })

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://octobot.dev"),
  title: {
    default: "OctoBot — GitHub notifications that reach you on Discord",
    template: "%s · OctoBot",
  },
  description:
    "A Discord bot that DMs you the moment something on GitHub needs you — review requests, mentions, CI failures, approvals. Open source, one click to connect.",
  keywords: [
    "OctoBot",
    "Discord GitHub bot",
    "GitHub notifications Discord",
    "PR review notifications",
    "GitHub Discord DM",
  ],
  authors: [{ name: "OctoBot" }],
  openGraph: {
    type: "website",
    title: "OctoBot — GitHub, in your DMs",
    description:
      "Get a Discord DM the moment a GitHub review, mention, or CI failure needs you. Open source, one click to connect.",
    siteName: "OctoBot",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "OctoBot" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "OctoBot — GitHub, in your DMs",
    description:
      "Get a Discord DM the moment a GitHub review, mention, or CI failure needs you. One click to connect.",
    images: ["/og.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        figtree.variable,
        spaceGrotesk.variable
      )}
    >
      <body>
        <ThemeProvider>
          <div className="atmosphere" aria-hidden="true" />
          {children}
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
