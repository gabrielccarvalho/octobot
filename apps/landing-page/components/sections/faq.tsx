"use client"

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import { Section, SectionHeading } from "@/components/section"
import { FadeUp } from "@/components/motion-primitives"
import { FAQS } from "@/lib/content"

export function Faq() {
  return (
    <Section id="faq" className="max-w-3xl">
      <SectionHeading
        align="center"
        eyebrow="Before you connect"
        title="Questions worth asking"
      />

      <FadeUp className="mt-12 rounded-3xl border border-border/60 bg-card/30 px-6 backdrop-blur-sm sm:px-8">
        <Accordion multiple={false} defaultValue={[0]}>
          {FAQS.map((faq, i) => (
            <AccordionItem key={faq.q} value={i}>
              <AccordionTrigger className="font-display text-base tracking-tight sm:text-lg">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="max-w-prose text-muted-foreground">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </FadeUp>
    </Section>
  )
}
