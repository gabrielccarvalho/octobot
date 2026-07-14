import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Hero } from "@/components/sections/hero"
import { Features } from "@/components/sections/features"
import { HowItWorks } from "@/components/sections/how-it-works"
import { Commands } from "@/components/sections/commands"
import { Notifications } from "@/components/sections/notifications"
import { Security } from "@/components/sections/security"
import { Faq } from "@/components/sections/faq"
import { Cta } from "@/components/sections/cta"

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Commands />
        <Notifications />
        <Security />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </>
  )
}
