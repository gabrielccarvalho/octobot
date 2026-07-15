"use client"

import { motion, useReducedMotion } from "motion/react"
import type { Variants } from "motion/react"

const spring = { type: "spring", stiffness: 120, damping: 20 } as const

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: spring },
}

const fadeOnlyVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
}

/** Single element that fades/slides up when scrolled into view. */
export function FadeUp({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      data-motion-fade
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={reduce ? fadeOnlyVariants : fadeUpVariants}
    >
      {children}
    </motion.div>
  )
}

/** Parent that staggers its StaggerItem children when scrolled into view. */
export function Stagger({
  children,
  className,
  gap = 0.08,
}: {
  children: React.ReactNode
  className?: string
  gap?: number
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      transition={{ staggerChildren: gap }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      data-motion-fade
      className={className}
      variants={reduce ? fadeOnlyVariants : fadeUpVariants}
    >
      {children}
    </motion.div>
  )
}
