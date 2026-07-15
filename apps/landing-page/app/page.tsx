import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Bubbles } from "@/components/bubbles"
import { DepthGauge } from "@/components/depth-gauge"
import { Waterline } from "@/components/waterline"
import { Hero } from "@/components/sections/hero"
import { Noise } from "@/components/sections/noise"
import { HowItWorks } from "@/components/sections/how-it-works"
import { ReachesYou } from "@/components/sections/reaches-you"
import { CommandsMenu } from "@/components/sections/commands-menu"
import { Trust } from "@/components/sections/trust"
import { Faq } from "@/components/sections/faq"
import { Cta } from "@/components/sections/cta"

export default function Page() {
  return (
    <>
      <SiteHeader />
      <DepthGauge />
      <main>
        <Hero />
        <Waterline className="mt-6" />
        {/* Everything below the waterline is underwater: bubbles rise from
            the mascot in the abyss and pop at the surface above. */}
        <div className="relative">
          <Bubbles />
          <Noise />
          <HowItWorks />
          <ReachesYou />
          <CommandsMenu />
          <Trust />
          <Faq />
          <Cta />
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
